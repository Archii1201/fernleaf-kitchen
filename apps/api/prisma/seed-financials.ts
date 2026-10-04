import type { Prisma } from '@prisma/client';
import { BILLABLE_STATUSES } from '../src/billing/billing.service.js';
import { applyCredits, creditCapacity } from '../src/billing/domain/invoice-money.js';
import { OrderPricer } from '../src/orders/domain/order-pricer.js';
import { PricingResolver } from '../src/pricing/domain/pricing-resolver.js';
import { ExplicitPriceStrategy } from '../src/pricing/domain/strategies/explicit-price.strategy.js';
import { CostMultiplierStrategy } from '../src/pricing/domain/strategies/cost-multiplier.strategy.js';
import { BaseTierPercentageStrategy } from '../src/pricing/domain/strategies/base-tier-percentage.strategy.js';
import { Money } from '../src/pricing/domain/money.js';
import { PricingContextLoader } from '../src/pricing/pricing-context.loader.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { SeedClient } from './seed.js';

const resolver = new PricingResolver(
  new ExplicitPriceStrategy(), new CostMultiplierStrategy(), new BaseTierPercentageStrategy(),
);
const pricer = new OrderPricer(resolver);
export const DEMO_CREDIT_REASON = 'P0-7 demo: refund for one meal';

/** New snapshots use production pricing; existing snapshots are not repriced. */
export async function upsertFinancialDemoOrder(
  prisma: SeedClient,
  header: Omit<Prisma.OrderUncheckedCreateInput, 'subtotalCents' | 'totalCents' | 'lines'>,
  dishId: string,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    let order = await tx.order.findUnique({ where: { orderNumber: header.orderNumber } });
    if (order) {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`;
      order = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
    }
    const existingLines = order ? await tx.orderLine.findMany({
      where: { orderId: order.id }, include: { combinations: { include: { options: true } } },
    }) : [];

    if (existingLines.length === 0) {
      if (order?.invoiceId) throw new Error(`Cannot reconstruct invoiced demo order ${header.orderNumber}`);
      const tierId = order?.priceTierId ?? header.priceTierId;
      // The loader uses only the transaction's Prisma delegates.
      const context = await new PricingContextLoader(tx as unknown as PrismaService).loadForTier(tierId);
      const dish = await tx.dish.findUniqueOrThrow({ where: { id: dishId }, include: { kitchenStation: true } });
      const price = resolver.resolve(context, { id: dish.id, type: 'dish', costCents: dish.costCents });
      if (price.status !== 'PRICED') throw new Error(`Demo dish ${dish.sku} has no price on ${tierId}`);
      const combination = pricer.priceCombination(Money.fromCents(price.priceCents).cents, 2, 'no-options', []);
      const totals = pricer.lineTotals([combination]);
      order ??= await tx.order.create({ data: {
        ...header, priceTierName: context.targetTier().name,
        // These provisional values are never committed: persist the financial
        // lines below, then derive the authoritative header from those rows.
        subtotalCents: 0, totalCents: 0,
      } });
      const line = await tx.orderLine.create({ data: {
        orderId: order.id, dishId: dish.id, dishName: dish.name, dishSku: dish.sku,
        dishTemperature: dish.temperature, kitchenStationId: dish.kitchenStation.id,
        kitchenStationCode: dish.kitchenStation.code, kitchenStationName: dish.kitchenStation.name,
        quantity: combination.quantity, ...totals,
        combinations: { create: {
          signature: combination.signature, quantity: combination.quantity,
          unitPriceCents: combination.unitPriceCents, optionsPriceCents: combination.optionsPriceCents,
          totalCents: combination.totalCents,
        } },
      }, include: { combinations: true } });
      // Cancelled/rejected history still needs financial lines, but no kitchen work.
      if (order.status !== 'CANCELLED' && order.status !== 'REJECTED') {
        await tx.prepUnit.create({ data: {
          orderId: order.id, orderCombinationId: line.combinations[0]!.id,
          kitchenStationId: dish.kitchenStation.id, kitchenStationCode: dish.kitchenStation.code,
          kitchenStationName: dish.kitchenStation.name, dishName: dish.name, quantity: 2,
          status: order.status === 'DELIVERED' ? 'READY' : 'PENDING',
        } });
      }
    } else {
      // Historical option prices are authoritative, not today's catalogue prices.
      for (const line of existingLines) {
        if (line.combinations.length === 0 ||
          line.quantity !== line.combinations.reduce((sum, combo) => sum + combo.quantity, 0) ||
          line.lineTotalCents !== line.combinations.reduce((sum, combo) => sum + combo.totalCents, 0) ||
          line.unitPriceCents !== Math.trunc(line.lineTotalCents / line.quantity)) {
          throw new Error(`Contradictory demo line ${line.id}; refusing to replace historical snapshots`);
        }
        for (const combo of line.combinations) {
          if (combo.optionsPriceCents !== combo.options.reduce((sum, option) => sum + option.optionPriceCents, 0) ||
            combo.totalCents !== Money.fromCents(combo.unitPriceCents).times(combo.quantity).cents) {
            throw new Error(`Contradictory demo combination ${combo.id}`);
          }
        }
      }
    }
    const aggregate = await tx.orderLine.aggregate({ where: { orderId: order!.id }, _sum: { lineTotalCents: true } });
    const totalCents = Money.fromCents(aggregate._sum.lineTotalCents ?? 0).cents;
    if (order!.subtotalCents !== totalCents || order!.totalCents !== totalCents) {
      if (order!.invoiceId) throw new Error(`Cannot repair invoiced demo total ${header.orderNumber}`);
      await tx.order.update({ where: { id: order!.id }, data: { subtotalCents: totalCents, totalCents } });
    }
    return order!.id;
  });
}

/** Retain the useful legacy invoice identities, replacing their empty fake money. */
export async function upsertFinancialDemoInvoice(
  prisma: SeedClient,
  invoiceNumber: string,
  orderId: string,
  status: 'ISSUED' | 'PAID' | 'VOID',
  withCredit = false,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: {
      lines: { include: { combinations: true } },
    } });
    const existing = await tx.invoice.findUnique({ where: { invoiceNumber }, include: { lines: true, orders: true } });
    // Do not rewrite invoices that already have real historical billing data.
    if (existing?.lines.length) {
      const subtotal = existing.lines.filter((line) => line.type === 'ORDER')
        .reduce((sum, line) => sum + line.amountCents, 0);
      const credits = -existing.lines.filter((line) => line.type === 'CREDIT')
        .reduce((sum, line) => sum + line.amountCents, 0);
      if (existing.companyId !== order.companyId || existing.subtotalCents !== subtotal ||
        existing.creditCents !== credits || existing.totalCents !== subtotal - credits) {
        throw new Error(`Contradictory historical demo invoice ${invoiceNumber}; refusing to rewrite billing data`);
      }
      return;
    }
    if (existing && (existing.companyId !== order.companyId || existing.orders.length)) {
      throw new Error(`Demo invoice ${invoiceNumber} contains non-demo billing data`);
    }
    if ((order.invoiceId && order.invoiceId !== existing?.id) ||
      !BILLABLE_STATUSES.includes(order.status as (typeof BILLABLE_STATUSES)[number])) {
      throw new Error(`Demo order ${order.orderNumber} is not available for ${invoiceNumber}`);
    }

    if (withCredit) {
      const actor = await tx.user.findUniqueOrThrow({ where: { email: 'admin@test.com' }, select: { id: true } });
      const credit = await tx.orderCredit.findFirst({ where: { orderId, reason: DEMO_CREDIT_REASON } });
      if (!credit) {
        const amountCents = Money.fromCents(order.lines[0]!.combinations[0]!.unitPriceCents).cents;
        const used = await tx.orderCredit.aggregate({ where: { orderId }, _sum: { amountCents: true } });
        if (amountCents <= 0 || amountCents > creditCapacity(order.totalCents, used._sum.amountCents ?? 0)) {
          throw new Error(`Demo credit exceeds remaining capacity for ${order.orderNumber}`);
        }
        await tx.orderCredit.create({ data: {
          companyId: order.companyId, orderId, amountCents, reason: DEMO_CREDIT_REASON, createdByUserId: actor.id,
        } });
      }
    }
    const credits = await tx.orderCredit.findMany({ where: {
      companyId: order.companyId, invoiceId: null, OR: [{ orderId }, { orderId: null }],
    }, orderBy: { createdAt: 'asc' }, select: { id: true, amountCents: true, reason: true } });
    if (credits.some((credit) => credit.reason !== DEMO_CREDIT_REASON)) {
      throw new Error(`Refusing to consume non-demo credits for ${invoiceNumber}`);
    }
    // Same all-or-nothing credit calculation as BillingService.createInvoice.
    const money = applyCredits(order.totalCents, credits);
    const data = { subtotalCents: order.totalCents, creditCents: money.creditCents, totalCents: money.totalCents };
    const invoice = existing
      ? await tx.invoice.update({ where: { id: existing.id }, data: { ...data, status } })
      : await tx.invoice.create({ data: { companyId: order.companyId, invoiceNumber, status, ...data } });
    await tx.invoiceLine.create({ data: {
      invoiceId: invoice.id, orderId, type: 'ORDER', description: `Order ${order.orderNumber}`, amountCents: order.totalCents,
    } });
    for (const credit of credits.filter((entry) => money.appliedIds.includes(entry.id))) {
      await tx.invoiceLine.create({ data: {
        invoiceId: invoice.id, orderCreditId: credit.id, type: 'CREDIT', description: 'Order credit', amountCents: -credit.amountCents,
      } });
      if (status !== 'VOID') await tx.orderCredit.update({ where: { id: credit.id }, data: { invoiceId: invoice.id } });
    }
    // Production voiding keeps the invoice lines but releases the order/credits.
    if (status !== 'VOID') await tx.order.update({ where: { id: orderId }, data: { invoiceId: invoice.id } });
  });
}
