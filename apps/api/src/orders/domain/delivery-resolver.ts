import { Injectable } from '@nestjs/common';
import { CompanyNotFoundError } from '../../companies/companies.errors.js';
import { EmployeeNotFoundError } from '../../employees/employees.errors.js';
import { KitchenTime } from '../../kitchen/time/kitchen-time.js';
import type { Weekday } from '../../kitchen/time/weekday.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  DeliveryNotAllowedError,
  InactiveCompanyError,
  InactiveEmployeeError,
  InvalidDeliveryDateError,
} from '../orders.errors.js';
import type { BuiltDelivery } from './order-types.js';

export interface DeliveryInput {
  customerEmployeeId: string;
  deliveryDate: string;
  deliveryTime?: string;
  deliveryAddressId?: string;
  packagingTypeId?: string;
}

@Injectable()
export class DeliveryResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kitchenTime: KitchenTime,
  ) {}

  async resolve(input: DeliveryInput): Promise<BuiltDelivery> {
    let deliveryDate: string;

    try {
      deliveryDate = this.kitchenTime.assertDateString(input.deliveryDate);
    } catch {
      throw new InvalidDeliveryDateError(
        input.deliveryDate,
        'deliveryDate must be a real YYYY-MM-DD date.',
      );
    }

    const employee = await this.prisma.customerEmployee.findUnique({
      where: { id: input.customerEmployeeId },
      select: {
        id: true,
        fullName: true,
        email: true,
        active: true,
        companyId: true,
        canChooseAddress: true,
        canChooseDeliveryTime: true,
        canChoosePackaging: true,
        defaultAddressId: true,
        company: {
          select: {
            id: true,
            name: true,
            active: true,
            leaveKitchenMinutes: true,
            defaultDeliveryTime: true,
            defaultAddressId: true,
            defaultPackagingTypeId: true,
            defaultDriverStaffId: true,
            defaultAddress: {
              select: addressSelect,
            },
            defaultPackaging: {
              select: { id: true, code: true, name: true, active: true },
            },
            workingDays: { select: { weekday: true } },
            holidays: { select: { date: true } },
          },
        },
        defaultAddress: { select: addressSelect },
      },
    });

    if (!employee) {
      throw new EmployeeNotFoundError(input.customerEmployeeId);
    }

    if (!employee.active) {
      throw new InactiveEmployeeError(employee.id);
    }

    const company = employee.company;

    if (!company) {
      throw new CompanyNotFoundError(employee.companyId);
    }

    if (!company.active) {
      throw new InactiveCompanyError(company.id);
    }

    this.assertReceivingDay(deliveryDate, company);

    const address = await this.resolveAddress(input, employee, company);
    const deliveryTime = this.resolveTime(input, employee, company);
    const packaging = await this.resolvePackaging(input, employee, company);

    return {
      companyId: company.id,
      companyName: company.name,
      customerEmployeeId: employee.id,
      employeeName: employee.fullName,
      employeeEmail: employee.email,
      deliveryDate,
      deliveryTime,
      deliveryAddressId: address.id,
      deliveryAddressLabel: address.label,
      deliveryAddressLine1: address.line1,
      deliveryAddressLine2: address.line2,
      deliveryAddressCity: address.city,
      deliveryAddressState: address.state,
      deliveryAddressPostalCode: address.postalCode,
      deliveryAddressCountry: address.country,
      packagingTypeId: packaging?.id ?? null,
      packagingTypeName: packaging?.name ?? null,
      leaveKitchenMinutes: company.leaveKitchenMinutes,
      defaultDriverStaffId: company.defaultDriverStaffId,
    };
  }

  private assertReceivingDay(
    deliveryDate: string,
    company: {
      workingDays: { weekday: string }[];
      holidays: { date: Date }[];
    },
  ): void {
    const weekday = this.kitchenTime.weekdayOf(deliveryDate);
    const working = new Set(
      company.workingDays.map((row) => row.weekday as Weekday),
    );

    if (!working.has(weekday)) {
      throw new DeliveryNotAllowedError(
        'The company does not receive deliveries on that weekday.',
        { deliveryDate, weekday },
      );
    }

    const holidays = new Set(
      company.holidays.map((row) => this.kitchenTime.toDateString(row.date)),
    );

    if (holidays.has(deliveryDate)) {
      throw new DeliveryNotAllowedError(
        'The company is closed on that date.',
        { deliveryDate },
      );
    }
  }

  private async resolveAddress(
    input: DeliveryInput,
    employee: {
      canChooseAddress: boolean;
      defaultAddress: AddressRow | null;
    },
    company: { id: string; defaultAddress: AddressRow | null },
  ): Promise<AddressRow> {
    if (employee.canChooseAddress && input.deliveryAddressId) {
      const address = await this.prisma.companyAddress.findUnique({
        where: { id: input.deliveryAddressId },
        select: { ...addressSelect, companyId: true },
      });

      if (!address || address.companyId !== company.id || !address.active) {
        throw new DeliveryNotAllowedError(
          'That address does not belong to the employee company.',
          { deliveryAddressId: input.deliveryAddressId },
        );
      }

      return address;
    }

    const fallback = employee.defaultAddress ?? company.defaultAddress;

    if (!fallback || !fallback.active) {
      throw new DeliveryNotAllowedError(
        'No default delivery address is configured for this employee.',
      );
    }

    return fallback;
  }

  private resolveTime(
    input: DeliveryInput,
    employee: { canChooseDeliveryTime: boolean },
    company: { defaultDeliveryTime: Date | null },
  ): string {
    if (employee.canChooseDeliveryTime && input.deliveryTime) {
      return input.deliveryTime;
    }

    if (!company.defaultDeliveryTime) {
      throw new DeliveryNotAllowedError(
        'No default delivery time is configured for this company.',
      );
    }

    return this.kitchenTime.toTimeString(company.defaultDeliveryTime);
  }

  private async resolvePackaging(
    input: DeliveryInput,
    employee: { canChoosePackaging: boolean },
    company: {
      defaultPackaging: {
        id: string;
        code: string;
        name: string;
        active: boolean;
      } | null;
    },
  ) {
    if (employee.canChoosePackaging && input.packagingTypeId) {
      const packaging = await this.prisma.packagingType.findUnique({
        where: { id: input.packagingTypeId },
        select: { id: true, name: true, active: true },
      });

      if (!packaging || !packaging.active) {
        throw new DeliveryNotAllowedError(
          'That packaging type is not available.',
          { packagingTypeId: input.packagingTypeId },
        );
      }

      return packaging;
    }

    return company.defaultPackaging?.active ? company.defaultPackaging : null;
  }
}

const addressSelect = {
  id: true,
  label: true,
  line1: true,
  line2: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  active: true,
} as const;

type AddressRow = {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postalCode: string;
  country: string;
  active: boolean;
};
