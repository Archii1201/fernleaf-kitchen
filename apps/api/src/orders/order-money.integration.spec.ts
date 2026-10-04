import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../config/env.schema.js';
import { BillingService } from '../billing/billing.service.js';
import { SystemClock } from '../kitchen/time/clock.js';
import { KitchenTime } from '../kitchen/time/kitchen-time.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { diffCombinations } from './domain/line-diff.js';
import type { BuiltCombination, BuiltOrder } from './domain/order-types.js';
import { OrderRepository } from './order.repository.js';
import { OrderInvoicedError } from './orders.errors.js';

// Uses existing reference records, but creates and removes only its own orders/invoices.
describe('P0-2 persisted monetary consistency', () => {
  const config = new ConfigService<Env, true>({
    DATABASE_URL: process.env.DATABASE_URL,
    TIMEZONE: process.env.TIMEZONE ?? 'Asia/Kolkata',
  });
  const prisma = new PrismaService(
    new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }),
  );
  const time = new KitchenTime(config, new SystemClock());
  const repository = new OrderRepository(prisma, time);
  const orderIds: string[] = [];
  const invoiceIds: string[] = [];
  let template: BuiltOrder;

  beforeAll(async () => {
    await prisma.$connect();
    const source = await prisma.order.findFirstOrThrow({
      where: { lines: { some: { dishId: { not: null } } } },
      include: {
        company: true,
        customerEmployee: true,
        lines: { where: { dishId: { not: null } }, take: 1 },
      },
    });
    const line = source.lines[0]!;
    const dish = await prisma.dish.findUniqueOrThrow({
      where: { id: line.dishId! },
    });
    const category = await prisma.menuCategory.findFirstOrThrow();
    template = {
      delivery: {
        companyId: source.companyId,
        companyName: source.company.name,
        customerEmployeeId: source.customerEmployeeId,
        employeeName: source.customerEmployee.fullName,
        employeeEmail: source.customerEmployee.email,
        deliveryDate: '2099-03-05',
        deliveryTime: '12:30',
        deliveryAddressId: source.deliveryAddressId,
        deliveryAddressLabel: source.deliveryAddressLabel,
        deliveryAddressLine1: source.deliveryAddressLine1,
        deliveryAddressLine2: source.deliveryAddressLine2,
        deliveryAddressCity: source.deliveryAddressCity,
        deliveryAddressState: source.deliveryAddressState,
        deliveryAddressPostalCode: source.deliveryAddressPostalCode,
        deliveryAddressCountry: source.deliveryAddressCountry,
        packagingTypeId: null,
        packagingTypeName: null,
        leaveKitchenMinutes: 60,
        defaultDriverStaffId: null,
      },
      priceTierId: source.priceTierId,
      priceTierName: source.priceTierName,
      customerNotes: null,
      subtotalCents: 100,
      totalCents: 100,
      lines: [
        {
          dishId: dish.id,
          categoryId: category.id,
          dishName: line.dishName,
          dishSku: line.dishSku,
          dishDescription: line.dishDescription,
          dishTemperature: line.dishTemperature,
          kitchenStationId: line.kitchenStationId!,
          kitchenStationCode: line.kitchenStationCode,
          kitchenStationName: line.kitchenStationName,
          quantity: 1,
          unitPriceCents: 100,
          lineTotalCents: 100,
          notes: null,
          combinations: [combo('plain', 1, 100)],
        },
      ],
    };
  });

  afterAll(async () => {
    await prisma.order.updateMany({
      where: { id: { in: orderIds } },
      data: { invoiceId: null },
    });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.$disconnect();
  });

  function combo(
    signature: string,
    quantity: number,
    price: number,
  ): BuiltCombination {
    return {
      signature,
      quantity,
      unitPriceCents: price,
      optionsPriceCents: 0,
      totalCents: quantity * price,
      options: [],
    };
  }

  function incoming(combinations: BuiltCombination[]): BuiltOrder {
    const quantity = combinations.reduce((sum, c) => sum + c.quantity, 0);
    const total = combinations.reduce((sum, c) => sum + c.totalCents, 0);
    return {
      ...template,
      subtotalCents: total,
      totalCents: total,
      lines:
        combinations.length === 0
          ? []
          : [
              {
                ...template.lines[0]!,
                quantity,
                unitPriceCents: Math.trunc(total / quantity),
                lineTotalCents: total,
                combinations,
              },
            ],
    };
  }

  async function create(combinations = [combo('plain', 1, 100)]) {
    const id = await repository.create(incoming(combinations), null);
    orderIds.push(id);
    return id;
  }

  async function edit(id: string, built: BuiltOrder) {
    const before = await repository.findById(id);
    const existing = repository.existingCombinations(before);
    await repository.applyLineDiff({
      orderId: id,
      expectedVersion: before.version,
      incoming: built,
      existing,
      diffs: diffCombinations(built.lines, existing),
    });
    const after = await repository.findById(id);
    expect(after.version).toBe(before.version + 1);
    const lineSum = after.lines.reduce((sum, line) => {
      expect(line.lineTotalCents).toBe(
        line.combinations.reduce((s, c) => s + c.totalCents, 0),
      );
      expect(line.quantity).toBe(
        line.combinations.reduce((s, c) => s + c.quantity, 0),
      );
      return sum + line.lineTotalCents;
    }, 0);
    expect(after.subtotalCents).toBe(lineSum);
    expect(after.totalCents).toBe(lineSum);
    return after;
  }

  it('retains unchanged snapshots and original money despite a changed catalogue quote', async () => {
    const id = await create();
    const before = await repository.findById(id);
    const after = await edit(id, incoming([combo('plain', 1, 200)]));
    expect(after.totalCents).toBe(100);
    expect(after.lines[0]!.combinations).toEqual(before.lines[0]!.combinations);
  });

  it('reprices a changed quantity, leaving an unchanged combination at its original price', async () => {
    const id = await create([combo('plain', 1, 100), combo('second', 1, 100)]);
    const after = await edit(
      id,
      incoming([combo('plain', 1, 200), combo('second', 3, 200)]),
    );
    expect(after.totalCents).toBe(700);
    expect(after.lines[0]!.quantity).toBe(4);
    expect(after.lines[0]!.unitPriceCents).toBe(175);
    expect(after.prepUnits.map((u) => u.quantity).sort()).toEqual([1, 3]);
  });

  it('replaces a changed selection with a new priced combination', async () => {
    const id = await create();
    const after = await edit(id, incoming([combo('new-selection', 2, 250)]));
    expect(after.totalCents).toBe(500);
    expect(after.lines[0]!.combinations[0]!.signature).toBe('new-selection');
    expect(after.prepUnits).toHaveLength(1);
  });

  it('refreshes changed option snapshots together with their monetary values', async () => {
    const option = await prisma.option.findFirstOrThrow();
    const group = await prisma.optionGroup.findFirstOrThrow();
    const original: BuiltCombination = {
      ...combo('option', 1, 125),
      optionsPriceCents: 25,
      options: [
        {
          optionId: option.id,
          optionGroupId: group.id,
          optionGroupName: 'Original group',
          optionName: 'Original option',
          optionPriceCents: 25,
        },
      ],
    };
    const id = await create([original]);
    const changed: BuiltCombination = {
      ...combo('option', 2, 250),
      optionsPriceCents: 50,
      options: [
        {
          ...original.options[0]!,
          optionGroupName: 'Updated group',
          optionName: 'Updated option',
          optionPriceCents: 50,
        },
      ],
    };
    const after = await edit(id, incoming([changed]));
    expect(after.totalCents).toBe(500);
    expect(after.lines[0]!.combinations[0]).toMatchObject({
      unitPriceCents: 250,
      optionsPriceCents: 50,
      options: [
        {
          optionName: 'Updated option',
          optionGroupName: 'Updated group',
          optionPriceCents: 50,
        },
      ],
    });
  });

  it('removes contributions of removed combinations', async () => {
    const id = await create([combo('plain', 1, 100), combo('second', 2, 150)]);
    const after = await edit(id, incoming([combo('plain', 1, 200)]));
    expect(after.totalCents).toBe(100);
    expect(after.prepUnits).toHaveLength(1);
  });

  it('removes empty lines instead of retaining ghost totals', async () => {
    const id = await create();
    const after = await edit(id, incoming([]));
    expect(after.lines).toEqual([]);
    expect(after.prepUnits).toEqual([]);
    expect(after.totalCents).toBe(0);
  });

  it.each(['ISSUED', 'PAID'] as const)(
    'rejects both edit paths for a %s invoice without changing rows',
    async (status) => {
      const id = await create();
      const invoice = await prisma.invoice.create({
        data: {
          companyId: template.delivery.companyId,
          invoiceNumber: `P0-2-${randomUUID()}`,
          status,
          subtotalCents: 100,
          totalCents: 100,
          lines: {
            create: {
              type: 'ORDER',
              orderId: id,
              description: 'P0-2 test',
              amountCents: 100,
            },
          },
        },
      });
      invoiceIds.push(invoice.id);
      await prisma.order.update({
        where: { id },
        data: { invoiceId: invoice.id, status: 'CONFIRMED' },
      });
      const before = await repository.findById(id);
      await expect(
        edit(id, incoming([combo('plain', 2, 200)])),
      ).rejects.toThrow(OrderInvoicedError);
      await expect(
        repository.replaceAllLines(
          id,
          incoming([combo('plain', 2, 200)]).lines,
        ),
      ).rejects.toThrow(OrderInvoicedError);
      expect(await repository.findById(id)).toEqual(before);
      expect(
        await prisma.invoice.findUnique({
          where: { id: invoice.id },
          include: { lines: true },
        }),
      ).toMatchObject({
        status,
        totalCents: 100,
        lines: [{ amountCents: 100 }],
      });
    },
  );

  it('permits line edits again after the current invoice pointer is cleared', async () => {
    const id = await create();
    const invoice = await prisma.invoice.create({
      data: {
        companyId: template.delivery.companyId,
        invoiceNumber: `P0-2-${randomUUID()}`,
        status: 'ISSUED',
        subtotalCents: 100,
        totalCents: 100,
        lines: {
          create: {
            type: 'ORDER',
            orderId: id,
            description: 'P0-2 test',
            amountCents: 100,
          },
        },
      },
    });
    invoiceIds.push(invoice.id);
    await prisma.order.update({
      where: { id },
      data: { invoiceId: invoice.id, status: 'CONFIRMED' },
    });
    await new BillingService(prisma, time).voidInvoice(invoice.id);
    const after = await edit(id, incoming([combo('plain', 2, 200)]));
    expect(after.invoiceId).toBeNull();
    expect(after.totalCents).toBe(400);
    expect(
      await prisma.invoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: { lines: true },
      }),
    ).toMatchObject({
      status: 'VOID',
      totalCents: 100,
      lines: [{ amountCents: 100 }],
    });
  });
});
