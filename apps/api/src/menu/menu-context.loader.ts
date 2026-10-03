import { Injectable } from '@nestjs/common';
import { CompanyNotFoundError } from '../companies/companies.errors.js';
import { EmployeeNotFoundError } from '../employees/employees.errors.js';
import { PriceTierService } from '../pricing/price-tier.service.js';
import { PricingContextLoader } from '../pricing/pricing-context.loader.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { MenuContext } from './domain/menu-context.js';
import type { MenuDishFacts } from './domain/menu.types.js';
import {
  MenuContextRequiredError,
  MenuEmployeeCompanyMismatchError,
} from './menu.errors.js';

/**
 * Builds a `MenuContext` in a bounded number of queries:
 * company (+ optional employee), hidden sets, the category/dish graph,
 * then one PricingContext for the company's tier.
 *
 * Nothing here is per dish.
 */
@Injectable()
export class MenuContextLoader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly priceTierService: PriceTierService,
    private readonly pricingLoader: PricingContextLoader,
  ) {}

  async load(input: {
    companyId?: string;
    employeeId?: string;
  }): Promise<MenuContext> {
    if (!input.companyId && !input.employeeId) {
      throw new MenuContextRequiredError();
    }

    const employee = input.employeeId
      ? await this.prisma.customerEmployee.findUnique({
          where: { id: input.employeeId },
          select: {
            id: true,
            fullName: true,
            email: true,
            companyId: true,
          },
        })
      : null;

    if (input.employeeId && !employee) {
      throw new EmployeeNotFoundError(input.employeeId);
    }

    const companyId = input.companyId ?? employee!.companyId;

    if (employee && employee.companyId !== companyId) {
      throw new MenuEmployeeCompanyMismatchError(employee.id, companyId);
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        priceTierId: true,
        priceTier: { select: { id: true, code: true, name: true } },
      },
    });

    if (!company) {
      throw new CompanyNotFoundError(companyId);
    }

    const [hiddenCategories, hiddenDishes, categoryRows] = await Promise.all([
      this.prisma.companyHiddenCategory.findMany({
        where: { companyId },
        select: { menuCategoryId: true },
      }),
      this.prisma.companyHiddenDish.findMany({
        where: { companyId },
        select: { dishId: true },
      }),
      this.prisma.menuCategory.findMany({
        orderBy: { displayOrder: 'asc' },
        select: {
          id: true,
          slug: true,
          name: true,
          displayOrder: true,
          isSecret: true,
          active: true,
          dishes: {
            orderBy: { displayOrder: 'asc' },
            select: {
              dishId: true,
              displayOrder: true,
              active: true,
              dish: {
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  description: true,
                  costCents: true,
                  active: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const dishes = new Map<string, MenuDishFacts>();
    const memberships = [];

    for (const category of categoryRows) {
      for (const link of category.dishes) {
        dishes.set(link.dish.id, link.dish);
        memberships.push({
          categoryId: category.id,
          dishId: link.dishId,
          displayOrder: link.displayOrder,
          active: link.active,
        });
      }
    }

    const priceTierId = await this.priceTierService.resolveEffectiveTierId(
      company.priceTierId,
    );
    const pricing = await this.pricingLoader.loadForTier(priceTierId, ['dish']);
    const priceTier =
      company.priceTier ??
      (await this.prisma.priceTier.findUniqueOrThrow({
        where: { id: priceTierId },
        select: { id: true, code: true, name: true },
      }));

    return {
      company: {
        id: company.id,
        name: company.name,
        priceTierId,
      },
      employee: employee
        ? {
            id: employee.id,
            fullName: employee.fullName,
            email: employee.email,
          }
        : null,
      priceTier,
      hiddenCategoryIds: new Set(
        hiddenCategories.map((entry) => entry.menuCategoryId),
      ),
      hiddenDishIds: new Set(hiddenDishes.map((entry) => entry.dishId)),
      categories: categoryRows.map(
        ({ dishes: _dishes, ...category }) => category,
      ),
      dishes,
      memberships,
      pricing,
    };
  }
}
