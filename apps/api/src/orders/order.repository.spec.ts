import { describe, expect, it, vi } from 'vitest';
import { KitchenTime } from '../kitchen/time/kitchen-time.js';
import { OrderRepository } from './order.repository.js';
import type { BuiltOrder } from './domain/order-types.js';

describe('OrderRepository', () => {
  it('rolls the whole create transaction back when a later write fails', async () => {
    const tx = {
      order: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'ord-1' }),
      },
      orderLine: { create: vi.fn().mockRejectedValue(new Error('boom')) },
      orderCombination: { create: vi.fn() },
      prepUnit: { create: vi.fn() },
      orderEvent: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const kitchenTime = {
      fromDateString: vi.fn().mockReturnValue(new Date()),
      fromTimeString: vi.fn().mockReturnValue(new Date()),
    };

    const repository = new OrderRepository(
      prisma as never,
      kitchenTime as unknown as KitchenTime,
    );

    const built: BuiltOrder = {
      delivery: {
        companyId: 'c',
        companyName: 'C',
        customerEmployeeId: 'e',
        employeeName: 'E',
        employeeEmail: 'e@x.com',
        deliveryDate: '2031-03-05',
        deliveryTime: '12:30',
        deliveryAddressId: 'a',
        deliveryAddressLabel: 'L',
        deliveryAddressLine1: '1',
        deliveryAddressLine2: null,
        deliveryAddressCity: 'X',
        deliveryAddressState: null,
        deliveryAddressPostalCode: '1',
        deliveryAddressCountry: 'IN',
        packagingTypeId: null,
        packagingTypeName: null,
        leaveKitchenMinutes: 60,
        defaultDriverStaffId: null,
      },
      priceTierId: 't',
      priceTierName: 'Standard',
      customerNotes: null,
      subtotalCents: 100,
      totalCents: 100,
      lines: [
        {
          dishId: 'd',
          categoryId: 'cat',
          dishName: 'Wrap',
          dishSku: 'W',
          dishDescription: null,
          dishTemperature: 'HOT',
          kitchenStationId: 's',
          kitchenStationCode: 'HOT_LINE',
          kitchenStationName: 'Hot',
          quantity: 1,
          unitPriceCents: 100,
          lineTotalCents: 100,
          notes: null,
          combinations: [
            {
              quantity: 1,
              signature: 'no-options',
              unitPriceCents: 100,
              optionsPriceCents: 0,
              totalCents: 100,
              options: [],
            },
          ],
        },
      ],
    };

    await expect(repository.create(built, 'user-1')).rejects.toThrow('boom');
    expect(tx.orderEvent.create).not.toHaveBeenCalled();
    expect(tx.prepUnit.create).not.toHaveBeenCalled();
  });
});
