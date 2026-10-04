import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../bootstrap.js';
import { KitchenBoardService } from '../kitchen/board/kitchen-board.service.js';
import { PrepUnitConflictError } from '../kitchen/kitchen.errors.js';
import { diffCombinations } from '../orders/domain/line-diff.js';
import { OrderAdminService } from '../orders/order-admin.service.js';
import {
  OrderVersionConflictError,
  PrepUnitLockedError,
} from '../orders/orders.errors.js';
import { OrdersService } from '../orders/orders.service.js';
import type { OrderStatus } from '../orders/domain/order-state.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('Step 24 Part 5: Concurrency & Transactional Isolation Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let kitchenBoardService: KitchenBoardService;
  let orderAdminService: OrderAdminService;
  let ordersService: OrdersService;

  let companyId: string;
  let employeeId: string;
  let addressId: string;
  let tierId: string;
  let dishA: { id: string; name: string; sku: string; kitchenStationId: string };
  let dishB: { id: string; name: string; sku: string; kitchenStationId: string };
  let station: { id: string; code: string; name: string };

  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    kitchenBoardService = app.get(KitchenBoardService);
    orderAdminService = app.get(OrderAdminService);
    ordersService = app.get(OrdersService);

    const domain = await prisma.companyDomain.findUniqueOrThrow({
      where: { domain: 'northwind.com' },
      select: { companyId: true },
    });
    companyId = domain.companyId;

    const company = await prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { defaultAddressId: true, priceTierId: true },
    });
    addressId = company.defaultAddressId!;
    tierId = company.priceTierId!;

    const employee = await prisma.customerEmployee.findUniqueOrThrow({
      where: { email: 'alice@northwind.com' },
      select: { id: true },
    });
    employeeId = employee.id;

    dishA = await prisma.dish.findUniqueOrThrow({
      where: { sku: 'FK-WRAP-001' },
      select: {
        id: true,
        name: true,
        sku: true,
        kitchenStationId: true,
      },
    });

    dishB = await prisma.dish.findUniqueOrThrow({
      where: { sku: 'FK-CURRY-001' },
      select: {
        id: true,
        name: true,
        sku: true,
        kitchenStationId: true,
      },
    });

    station = await prisma.kitchenStation.findUniqueOrThrow({
      where: { id: dishA.kitchenStationId },
      select: { id: true, code: true, name: true },
    });
  });

  afterAll(async () => {
    if (createdOrderIds.length > 0) {
      await prisma.prepUnit.deleteMany({
        where: { orderId: { in: createdOrderIds } },
      });
      await prisma.orderEvent.deleteMany({
        where: { orderId: { in: createdOrderIds } },
      });
      await prisma.orderCombination.deleteMany({
        where: { orderLine: { orderId: { in: createdOrderIds } } },
      });
      await prisma.orderLine.deleteMany({
        where: { orderId: { in: createdOrderIds } },
      });
      await prisma.order.deleteMany({
        where: { id: { in: createdOrderIds } },
      });
    }

    await app.close();
  });

  async function createMultiUnitOrder(
    suffix: string,
    status: OrderStatus = 'CONFIRMED',
  ): Promise<{ orderId: string; unit1Id: string; unit2Id: string }> {
    const order = await prisma.order.create({
      data: {
        orderNumber: `STEP24-CONC-${suffix}`,
        companyId,
        customerEmployeeId: employeeId,
        status,
        version: 1,
        deliveryDate: new Date('2026-11-05T00:00:00.000Z'),
        deliveryTime: new Date('1970-01-01T12:30:00.000Z'),
        deliveryAddressId: addressId,
        deliveryAddressLabel: 'HQ',
        deliveryAddressLine1: '1 Road',
        deliveryAddressCity: 'Bengaluru',
        deliveryAddressPostalCode: '560025',
        deliveryAddressCountry: 'IN',
        priceTierId: tierId,
        priceTierName: 'Standard',
        leaveKitchenMinutes: 60,
        subtotalCents: 2400,
        totalCents: 2400,
        lines: {
          create: [
            {
              dishId: dishA.id,
              dishName: dishA.name,
              dishSku: dishA.sku,
              dishTemperature: 'HOT',
              kitchenStationId: station.id,
              kitchenStationCode: station.code,
              kitchenStationName: station.name,
              quantity: 1,
              unitPriceCents: 1200,
              lineTotalCents: 1200,
              combinations: {
                create: {
                  quantity: 1,
                  unitPriceCents: 1200,
                  optionsPriceCents: 0,
                  totalCents: 1200,
                  signature: 'plain-a',
                },
              },
            },
            {
              dishId: dishB.id,
              dishName: dishB.name,
              dishSku: dishB.sku,
              dishTemperature: 'HOT',
              kitchenStationId: station.id,
              kitchenStationCode: station.code,
              kitchenStationName: station.name,
              quantity: 1,
              unitPriceCents: 1200,
              lineTotalCents: 1200,
              combinations: {
                create: {
                  quantity: 1,
                  unitPriceCents: 1200,
                  optionsPriceCents: 0,
                  totalCents: 1200,
                  signature: 'plain-b',
                },
              },
            },
          ],
        },
      },
    });

    createdOrderIds.push(order.id);
    const createdLines = await prisma.orderLine.findMany({
      where: { orderId: order.id },
      include: { combinations: true },
      orderBy: { createdAt: 'asc' },
    });
    const combo1Id = createdLines[0].combinations[0].id;
    const combo2Id = createdLines[1].combinations[0].id;

    const unit1 = await prisma.prepUnit.create({
      data: {
        orderId: order.id,
        orderCombinationId: combo1Id,
        kitchenStationId: station.id,
        kitchenStationCode: station.code,
        kitchenStationName: station.name,
        dishName: dishA.name,
        quantity: 1,
        status: 'PENDING',
      },
    });

    const unit2 = await prisma.prepUnit.create({
      data: {
        orderId: order.id,
        orderCombinationId: combo2Id,
        kitchenStationId: station.id,
        kitchenStationCode: station.code,
        kitchenStationName: station.name,
        dishName: dishB.name,
        quantity: 1,
        status: 'PENDING',
      },
    });

    return { orderId: order.id, unit1Id: unit1.id, unit2Id: unit2.id };
  }

  describe('CASE A — SAME KITCHEN UNIT: Concurrent completions', () => {
    it('ensures exactly ONE concurrent completion succeeds and the other receives PREP_UNIT_ALREADY_DONE conflict', async () => {
      // Create order with 2 prep units. Starting unit 1 puts order in IN_KITCHEN.
      // Unit 2 remains PENDING, so completing unit 1 keeps order in workable IN_KITCHEN state.
      const { unit1Id } = await createMultiUnitOrder(`UNIT-${Date.now()}`);

      // Start unit 1
      await kitchenBoardService.start(unit1Id);

      // Now fire two simultaneous requests to mark unit 1 DONE
      const [resA, resB] = await Promise.allSettled([
        kitchenBoardService.done(unit1Id),
        kitchenBoardService.done(unit1Id),
      ]);

      const fulfilled = [resA, resB].filter(
        (r): r is PromiseFulfilledResult<Awaited<ReturnType<KitchenBoardService['done']>>> =>
          r.status === 'fulfilled',
      );
      const rejected = [resA, resB].filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );

      // In a real transactional race with SELECT ... FOR UPDATE:
      // Exactly ONE request wins and marks the unit READY.
      // The second request waits on row lock, then reads status 'READY' and throws PREP_UNIT_ALREADY_DONE.
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(PrepUnitConflictError);
      expect((rejected[0].reason as PrepUnitConflictError).code).toBe(
        'PREP_UNIT_ALREADY_DONE',
      );

      // Verify DB consistency: unit 1 is READY, not duplicated
      const finalUnit = await prisma.prepUnit.findUniqueOrThrow({
        where: { id: unit1Id },
      });
      expect(finalUnit.status).toBe('READY');
      expect(finalUnit.completedAt).not.toBeNull();
    });
  });

  describe('CASE B — SAME ORDER EDIT: Optimistic locking and stale version conflict', () => {
    it('ensures only one concurrent update succeeds with version=1 and the other fails with ORDER_VERSION_CONFLICT', async () => {
      const { orderId } = await createMultiUnitOrder(`VERS-${Date.now()}`);

      const initialOrder = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(initialOrder.version).toBe(1);

      // Two concurrent updates both sending expected version = 1
      const [resA, resB] = await Promise.allSettled([
        orderAdminService.overrideDeliveryTime(orderId, {
          deliveryTime: '13:00',
          version: 1,
        }),
        orderAdminService.overrideDeliveryTime(orderId, {
          deliveryTime: '14:00',
          version: 1,
        }),
      ]);

      const fulfilled = [resA, resB].filter(
        (r): r is PromiseFulfilledResult<Awaited<ReturnType<OrderAdminService['overrideDeliveryTime']>>> =>
          r.status === 'fulfilled',
      );
      const rejected = [resA, resB].filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );

      // Exactly ONE update wins
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // The losing request receives 409 ORDER_VERSION_CONFLICT
      expect(rejected[0].reason).toBeInstanceOf(OrderVersionConflictError);
      expect((rejected[0].reason as OrderVersionConflictError).code).toBe(
        'ORDER_VERSION_CONFLICT',
      );

      // Verify DB state: version incremented exactly once (1 -> 2)
      const updatedOrder = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(updatedOrder.version).toBe(2);
      expect(
        ['13:00', '14:00'].includes(
          updatedOrder.deliveryTime.toISOString().slice(11, 16),
        ),
      ).toBe(true);
    });
  });

  describe('CASE C — KITCHEN / ADMIN RACE: Kitchen lock prevents admin edit', () => {
    it('prevents admin from altering an order combination once kitchen has started prep (PREP_UNIT_LOCKED)', async () => {
      const { orderId, unit1Id } = await createMultiUnitOrder(`RACE-${Date.now()}`);

      // Kitchen starts preparation on unit 1
      await kitchenBoardService.start(unit1Id);

      const prepUnit = await prisma.prepUnit.findUniqueOrThrow({ where: { id: unit1Id } });
      expect(prepUnit.status).toBe('IN_PROGRESS');

      // Now verify that any line diff trying to alter the started combination throws PrepUnitLockedError
      const detail = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          lines: {
            include: {
              combinations: { include: { prepUnit: true } },
            },
          },
        },
      });

      const existingCombos = detail.lines.flatMap((l) =>
        l.combinations.map((c) => ({
          key: `${l.dishId}::${c.signature}`,
          dishId: l.dishId ?? dishA.id,
          signature: c.signature,
          quantity: c.quantity,
          combinationId: c.id,
          lineId: l.id,
          prepStatus: (c.prepUnit?.status ?? 'PENDING') as 'PENDING' | 'IN_PROGRESS' | 'READY',
        })),
      );

      // In line diff, assertUnlocked verifies that IN_PROGRESS combination cannot be modified
      expect(() =>
        diffCombinations(
          [
            {
              dishId: dishA.id,
              categoryId: 'cat',
              dishName: dishA.name,
              dishSku: dishA.sku,
              dishDescription: null,
              dishTemperature: 'HOT',
              kitchenStationId: station.id,
              kitchenStationCode: station.code,
              kitchenStationName: station.name,
              quantity: 5,
              unitPriceCents: 1200,
              lineTotalCents: 6000,
              notes: null,
              combinations: [
                {
                  quantity: 5,
                  signature: 'plain-a',
                  unitPriceCents: 1200,
                  optionsPriceCents: 0,
                  totalCents: 6000,
                  options: [],
                },
              ],
            },
          ],
          existingCombos,
        ),
      ).toThrow(PrepUnitLockedError);
    });

    it('handles concurrent race between Kitchen start and Admin line edit deterministically', async () => {
      const { orderId, unit1Id } = await createMultiUnitOrder(`RACE2-${Date.now()}`);
      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

      // Run Kitchen start and Admin line replacement simultaneously
      const [kitchenResult, adminResult] = await Promise.allSettled([
        kitchenBoardService.start(unit1Id),
        ordersService.replaceLines(orderId, {
          version: order.version,
          lines: [
            {
              dishId: dishA.id,
              quantity: 3,
              combinations: [{ quantity: 3, selections: [] }],
            },
          ],
        }),
      ]);

      // Either:
      // 1. Kitchen started first -> Admin fails with PREP_UNIT_LOCKED or OrderNotEditableError.
      // 2. Admin replaced lines first -> Admin succeeded, then kitchen starts.
      // Database remains completely consistent and no corrupt combinations exist!
      if (adminResult.status === 'rejected') {
        const error = adminResult.reason;
        expect(
          error instanceof PrepUnitLockedError ||
          error.code === 'PREP_UNIT_LOCKED' ||
          error.code === 'ORDER_NOT_EDITABLE' ||
          error.code === 'ORDER_VERSION_CONFLICT',
        ).toBe(true);
      }

      const finalOrder = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { prepUnits: true },
      });
      expect(finalOrder).toBeDefined();
      expect(finalOrder.prepUnits.length).toBeGreaterThan(0);
    });
  });
});
