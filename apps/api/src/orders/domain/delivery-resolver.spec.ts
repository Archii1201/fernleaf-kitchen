import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOCK, FixedClock } from '../../kitchen/time/clock.js';
import { KitchenTime } from '../../kitchen/time/kitchen-time.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmployeeNotFoundError } from '../../employees/employees.errors.js';
import { DeliveryNotAllowedError } from '../orders.errors.js';
import { DeliveryResolver } from './delivery-resolver.js';

const ADDRESS = {
  id: 'addr-1',
  label: 'HQ',
  line1: '1 Road',
  line2: null,
  city: 'Bengaluru',
  state: null,
  postalCode: '560025',
  country: 'IN',
  active: true,
};

function employeeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'emp-1',
    fullName: 'Alice',
    email: 'alice@northwind.com',
    active: true,
    companyId: 'co-1',
    canChooseAddress: false,
    canChooseDeliveryTime: false,
    canChoosePackaging: false,
    defaultAddressId: 'addr-1',
    defaultAddress: ADDRESS,
    company: {
      id: 'co-1',
      name: 'Northwind',
      active: true,
      leaveKitchenMinutes: 60,
      defaultDeliveryTime: new Date('1970-01-01T12:30:00Z'),
      defaultAddressId: 'addr-1',
      defaultPackagingTypeId: null,
      defaultDriverStaffId: null,
      defaultAddress: ADDRESS,
      defaultPackaging: null,
      workingDays: [
        { weekday: 'MONDAY' },
        { weekday: 'WEDNESDAY' },
      ],
      holidays: [{ date: new Date('2031-03-05T00:00:00Z') }],
    },
    ...overrides,
  };
}

describe('DeliveryResolver', () => {
  let resolver: DeliveryResolver;
  let prisma: { customerEmployee: { findUnique: ReturnType<typeof vi.fn> }; companyAddress: { findUnique: ReturnType<typeof vi.fn> } };

  beforeEach(async () => {
    prisma = {
      customerEmployee: { findUnique: vi.fn() },
      companyAddress: { findUnique: vi.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DeliveryResolver,
        KitchenTime,
        { provide: CLOCK, useValue: new FixedClock(new Date('2026-10-07T06:00:00Z')) },
        { provide: ConfigService, useValue: { get: () => 'Asia/Kolkata' } },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    resolver = moduleRef.get(DeliveryResolver);
  });

  it('rejects an unknown employee', async () => {
    prisma.customerEmployee.findUnique.mockResolvedValue(null);

    await expect(
      resolver.resolve({
        customerEmployeeId: 'missing',
        deliveryDate: '2031-03-03',
      }),
    ).rejects.toBeInstanceOf(EmployeeNotFoundError);
  });

  it('rejects a company holiday and a non-working weekday', async () => {
    prisma.customerEmployee.findUnique.mockResolvedValue(employeeRow());

    await expect(
      resolver.resolve({
        customerEmployeeId: 'emp-1',
        deliveryDate: '2031-03-05',
      }),
    ).rejects.toBeInstanceOf(DeliveryNotAllowedError);

    await expect(
      resolver.resolve({
        customerEmployeeId: 'emp-1',
        deliveryDate: '2031-03-04',
      }),
    ).rejects.toBeInstanceOf(DeliveryNotAllowedError);
  });

  it('uses company defaults when the employee cannot choose', async () => {
    const row = employeeRow();
    row.company.holidays = [];
    prisma.customerEmployee.findUnique.mockResolvedValue(row);

    const resolved = await resolver.resolve({
      customerEmployeeId: 'emp-1',
      deliveryDate: '2031-03-03',
      deliveryAddressId: 'someone-else',
      deliveryTime: '18:00',
    });

    expect(resolved.deliveryAddressId).toBe('addr-1');
    expect(resolved.deliveryTime).toBe('12:30');
    expect(resolved.leaveKitchenMinutes).toBe(60);
  });

  it('rejects an address that is not the company\'s', async () => {
    const row = employeeRow({ canChooseAddress: true });
    row.company.holidays = [];
    prisma.customerEmployee.findUnique.mockResolvedValue(row);
    prisma.companyAddress.findUnique.mockResolvedValue({
      ...ADDRESS,
      id: 'other',
      companyId: 'co-other',
    });

    await expect(
      resolver.resolve({
        customerEmployeeId: 'emp-1',
        deliveryDate: '2031-03-03',
        deliveryAddressId: 'other',
      }),
    ).rejects.toBeInstanceOf(DeliveryNotAllowedError);
  });
});
