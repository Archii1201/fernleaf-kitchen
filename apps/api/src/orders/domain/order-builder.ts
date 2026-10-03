import { Injectable } from '@nestjs/common';
import { CombinationValidator } from '../../catalogue/combinations/combination-validator.js';
import type { CombinationDishDefinition } from '../../catalogue/combinations/combination.types.js';
import type { DishTemperature } from '../../catalogue/dishes/dish.dto.js';
import { DishNotFoundError } from '../../catalogue/catalogue.errors.js';
import { MenuResolver } from '../../menu/menu.resolver.js';
import { MenuContextLoader } from '../../menu/menu-context.loader.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateOrderDto, OrderLineInputDto } from '../dto/order.dto.js';
import type { BuiltLine, BuiltOrder } from './order-types.js';
import { CutoffPolicy } from './cutoff-policy.js';
import { DeliveryResolver } from './delivery-resolver.js';
import { OrderPricer, type PricedOptionInput } from './order-pricer.js';

export interface BuildOrderOptions {
  /** Quote may report cutoff.hasPassed without failing. */
  enforceCutoff?: boolean;
}

export interface BuiltOrderResult {
  order: BuiltOrder;
  cutoff: Awaited<ReturnType<CutoffPolicy['evaluate']>>;
}

@Injectable()
export class OrderBuilder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: DeliveryResolver,
    private readonly menuLoader: MenuContextLoader,
    private readonly menuResolver: MenuResolver,
    private readonly combinations: CombinationValidator,
    private readonly pricer: OrderPricer,
    private readonly cutoff: CutoffPolicy,
  ) {}

  async build(
    dto: CreateOrderDto,
    options: BuildOrderOptions = {},
  ): Promise<BuiltOrderResult> {
    const delivery = await this.delivery.resolve({
      customerEmployeeId: dto.customerEmployeeId,
      deliveryDate: dto.deliveryDate,
      deliveryTime: dto.deliveryTime,
      deliveryAddressId: dto.deliveryAddressId,
      packagingTypeId: dto.packagingTypeId,
    });

    const cutoff =
      options.enforceCutoff === false
        ? await this.cutoff.evaluate(delivery.deliveryDate)
        : await this.cutoff.assertBeforeCutoff(delivery.deliveryDate);

    const menu = await this.menuLoader.load({
      companyId: delivery.companyId,
      employeeId: delivery.customerEmployeeId,
    });

    const lines: BuiltLine[] = [];

    for (const input of dto.lines) {
      const available = this.menuResolver.assertDishOrderable(
        menu,
        input.dishId,
        input.categoryId,
      );
      if (available.priceCents === null) {
  throw new Error('Available menu item must have a price');
}
      const dish = await this.loadDish(input.dishId);
      const validated = this.combinations.validate({
        dish: toCombinationDish(dish),
        lineQuantity: input.quantity,
        combinations: input.combinations.map((combination) => ({
          quantity: combination.quantity,
          selections: combination.selections ?? [],
        })),
      });

      const pricedCombinations = validated.map((combination) => {
        const options = combination.selections.flatMap((selection) => {
          const group = dish.groups.get(selection.optionGroupId);

          return selection.optionIds.map((optionId) => {
            const option = group?.options.get(optionId);

            if (!group || !option) {
              return this.pricer.priceOption(menu.pricing, {
                optionId,
                optionGroupId: selection.optionGroupId,
                optionGroupName: 'Unknown',
                optionName: 'Unknown',
                costCents: 0,
              });
            }

            const priced: PricedOptionInput = {
              optionId: option.id,
              optionGroupId: group.id,
              optionGroupName: group.name,
              optionName: option.name,
              costCents: option.costCents,
            };

            return this.pricer.priceOption(menu.pricing, priced);
          });
        });

        return this.pricer.priceCombination(
          available.priceCents,
          combination.quantity,
          combination.signature,
          options,
        );
      });

      const totals = this.pricer.lineTotals(pricedCombinations);

      lines.push({
        dishId: dish.id,
        categoryId: available.categoryId,
        dishName: dish.name,
        dishSku: dish.sku,
        dishDescription: dish.description,
        dishTemperature: dish.temperature,
        kitchenStationId: dish.station.id,
        kitchenStationCode: dish.station.code,
        kitchenStationName: dish.station.name,
        quantity: input.quantity,
        unitPriceCents: available.priceCents,
        lineTotalCents: totals.lineTotalCents,
        notes: input.notes ?? null,
        combinations: pricedCombinations,
      });
    }

    const subtotalCents = lines.reduce(
      (sum, line) => sum + line.lineTotalCents,
      0,
    );

    return {
      cutoff,
      order: {
        delivery,
        priceTierId: menu.priceTier.id,
        priceTierName: menu.priceTier.name,
        customerNotes: dto.customerNotes ?? null,
        lines,
        subtotalCents,
        totalCents: subtotalCents,
      },
    };
  }

  private async loadDish(id: string): Promise<LoadedDish> {
    const dish = await this.prisma.dish.findUnique({
      where: { id },
      select: {
        id: true,
        sku: true,
        name: true,
        description: true,
        temperature: true,
        costCents: true,
        moq: true,
        active: true,
        kitchenStation: { select: { id: true, code: true, name: true } },
        optionGroups: {
          where: { active: true },
          select: {
            required: true,
            optionGroup: {
              select: {
                id: true,
                name: true,
                required: true,
                maxSelections: true,
                active: true,
                options: {
                  select: {
                    option: {
                      select: {
                        id: true,
                        name: true,
                        active: true,
                        costCents: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!dish) {
      throw new DishNotFoundError(id);
    }

    const groups = new Map<string, LoadedGroup>();

    for (const link of dish.optionGroups) {
      if (!link.optionGroup.active) {
        continue;
      }

      groups.set(link.optionGroup.id, {
        id: link.optionGroup.id,
        name: link.optionGroup.name,
        required: link.required ?? link.optionGroup.required,
        maxSelections: link.optionGroup.maxSelections,
        options: new Map(
          link.optionGroup.options.map((entry) => [
            entry.option.id,
            entry.option,
          ]),
        ),
      });
    }

    return {
      id: dish.id,
      sku: dish.sku,
      name: dish.name,
      description: dish.description,
      temperature: dish.temperature as DishTemperature,
      costCents: dish.costCents,
      moq: dish.moq,
      active: dish.active,
      station: dish.kitchenStation,
      groups,
    };
  }
}

interface LoadedGroup {
  id: string;
  name: string;
  required: boolean;
  maxSelections: number | null;
  options: Map<
    string,
    { id: string; name: string; active: boolean; costCents: number }
  >;
}

interface LoadedDish {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  temperature: DishTemperature;
  costCents: number;
  moq: number | null;
  active: boolean;
  station: { id: string; code: string; name: string };
  groups: Map<string, LoadedGroup>;
}

function toCombinationDish(dish: LoadedDish): CombinationDishDefinition {
  return {
    id: dish.id,
    name: dish.name,
    active: dish.active,
    minimumOrderQuantity: dish.moq,
    optionGroups: [...dish.groups.values()].map((group) => ({
      id: group.id,
      name: group.name,
      required: group.required,
      maxSelections: group.maxSelections,
      options: [...group.options.values()].map((option) => ({
        id: option.id,
        name: option.name,
        active: option.active,
      })),
    })),
  };
}

export function toQuoteResponse(
  result: BuiltOrderResult,
): Record<string, unknown> {
  const { order, cutoff } = result;

  return {
    persisted: false,
    company: { id: order.delivery.companyId, name: order.delivery.companyName },
    employee: {
      id: order.delivery.customerEmployeeId,
      fullName: order.delivery.employeeName,
      email: order.delivery.employeeEmail,
    },
    delivery: {
      date: order.delivery.deliveryDate,
      time: order.delivery.deliveryTime,
      addressId: order.delivery.deliveryAddressId,
      addressLabel: order.delivery.deliveryAddressLabel,
      leaveKitchenMinutes: order.delivery.leaveKitchenMinutes,
      packagingTypeName: order.delivery.packagingTypeName,
    },
    priceTier: { id: order.priceTierId, name: order.priceTierName },
    cutoff: {
      deliveryDate: cutoff.deliveryDate,
      cutoffDate: cutoff.cutoffDate,
      cutoffAt: cutoff.cutoffAt.toISOString(),
      hasPassed: cutoff.hasPassed,
      cutoffTime: cutoff.cutoffTime,
      cutoffWorkingDays: cutoff.cutoffWorkingDays,
    },
    lines: order.lines.map((line) => ({
      dishId: line.dishId,
      sku: line.dishSku,
      name: line.dishName,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      lineTotalCents: line.lineTotalCents,
      combinations: line.combinations.map((combination) => ({
        quantity: combination.quantity,
        signature: combination.signature,
        unitPriceCents: combination.unitPriceCents,
        optionsPriceCents: combination.optionsPriceCents,
        totalCents: combination.totalCents,
        options: combination.options,
      })),
    })),
    subtotalCents: order.subtotalCents,
    totalCents: order.totalCents,
  };
}

export type { OrderLineInputDto };
