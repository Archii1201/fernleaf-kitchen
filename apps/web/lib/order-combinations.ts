import type { OrderCombination, OrderLineInput } from './api/orders';

export type CombinationInput = OrderLineInput['combinations'][number];

/** Form state only: prices and validation remain on the server. */
export function setCombinationOptions(
  combination: CombinationInput,
  optionGroupId: string,
  optionIds: string[],
): CombinationInput {
  return {
    ...combination,
    selections: [
      ...(combination.selections ?? []).filter((group) => group.optionGroupId !== optionGroupId),
      ...(optionIds.length ? [{ optionGroupId, optionIds }] : []),
    ],
  };
}

export function combinationInput(snapshot: OrderCombination): CombinationInput {
  const groups = new Map<string, string[]>();
  for (const option of snapshot.options) {
    groups.set(option.optionGroupId, [...(groups.get(option.optionGroupId) ?? []), option.optionId]);
  }
  return {
    quantity: snapshot.quantity,
    selections: [...groups].map(([optionGroupId, optionIds]) => ({ optionGroupId, optionIds })),
  };
}
