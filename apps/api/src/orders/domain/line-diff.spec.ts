import { describe, expect, it } from 'vitest';
import { PrepUnitLockedError } from '../orders.errors.js';
import { combinationKey, diffCombinations } from './line-diff.js';
import type { BuiltLine, ExistingCombinationView } from './order-types.js';

const combo = (signature: string, quantity: number) => ({
  quantity,
  signature,
  unitPriceCents: 100,
  optionsPriceCents: 0,
  totalCents: 100 * quantity,
  options: [],
});

const line = (dishId: string, signature: string, quantity: number): BuiltLine => ({
  dishId,
  categoryId: 'cat',
  dishName: 'Wrap',
  dishSku: 'WRAP',
  dishDescription: null,
  dishTemperature: 'HOT',
  kitchenStationId: 'st',
  kitchenStationCode: 'HOT_LINE',
  kitchenStationName: 'Hot',
  quantity,
  unitPriceCents: 100,
  lineTotalCents: 100 * quantity,
  notes: null,
  combinations: [combo(signature, quantity)],
});

const existing = (
  dishId: string,
  signature: string,
  quantity: number,
  prepStatus: ExistingCombinationView['prepStatus'] = 'PENDING',
): ExistingCombinationView => ({
  key: combinationKey(dishId, signature),
  dishId,
  signature,
  quantity,
  combinationId: `combo-${signature}`,
  lineId: 'line-1',
  prepStatus,
});

describe('line diff', () => {
  it('marks matching quantity as UNCHANGED', () => {
    const diffs = diffCombinations(
      [line('dish-1', 'plain', 2)],
      [existing('dish-1', 'plain', 2)],
    );

    expect(diffs.map((entry) => entry.kind)).toEqual(['UNCHANGED']);
  });

  it('creates a NEW combination', () => {
    const diffs = diffCombinations([line('dish-1', 'plain', 1)], []);

    expect(diffs[0]?.kind).toBe('NEW');
  });

  it('updates an unstarted CHANGED combination', () => {
    const diffs = diffCombinations(
      [line('dish-1', 'plain', 3)],
      [existing('dish-1', 'plain', 1, 'PENDING')],
    );

    expect(diffs[0]?.kind).toBe('CHANGED');
  });

  it('rejects CHANGED when prep has started or finished', () => {
    expect(() =>
      diffCombinations(
        [line('dish-1', 'plain', 3)],
        [existing('dish-1', 'plain', 1, 'IN_PROGRESS')],
      ),
    ).toThrow(PrepUnitLockedError);

    expect(() =>
      diffCombinations(
        [line('dish-1', 'plain', 3)],
        [existing('dish-1', 'plain', 1, 'READY')],
      ),
    ).toThrow(PrepUnitLockedError);
  });

  it('deletes an unstarted REMOVED combination', () => {
    const diffs = diffCombinations([], [existing('dish-1', 'plain', 1)]);

    expect(diffs[0]?.kind).toBe('REMOVED');
  });

  it('rejects REMOVED when prep has started or finished', () => {
    expect(() =>
      diffCombinations([], [existing('dish-1', 'plain', 1, 'IN_PROGRESS')]),
    ).toThrow(PrepUnitLockedError);

    expect(() =>
      diffCombinations([], [existing('dish-1', 'plain', 1, 'READY')]),
    ).toThrow(PrepUnitLockedError);
  });
});
