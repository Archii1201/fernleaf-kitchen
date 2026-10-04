import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combinationInput, setCombinationOptions } from './order-combinations.ts';

test('split quantities and selections stay independent', () => {
  const first = { quantity: 2, selections: [{ optionGroupId: 'protein', optionIds: ['chicken'] }] };
  const second = { quantity: 3, selections: [{ optionGroupId: 'protein', optionIds: ['paneer'] }] };
  assert.deepEqual(setCombinationOptions(first, 'sauce', ['mint']), {
    quantity: 2, selections: [
      { optionGroupId: 'protein', optionIds: ['chicken'] },
      { optionGroupId: 'sauce', optionIds: ['mint'] },
    ],
  });
  assert.equal(first.selections.length, 1);
  assert.deepEqual(second, { quantity: 3, selections: [{ optionGroupId: 'protein', optionIds: ['paneer'] }] });
});

test('changing and clearing a group does not duplicate it', () => {
  const first = { quantity: 1, selections: [{ optionGroupId: 'sauce', optionIds: ['mint'] }] };
  const changed = setCombinationOptions(first, 'sauce', ['spicy']);
  assert.deepEqual(changed.selections, [{ optionGroupId: 'sauce', optionIds: ['spicy'] }]);
  assert.deepEqual(setCombinationOptions(changed, 'sauce', []).selections, []);
});

test('editing restores snapshot selections without submitting prices', () => {
  assert.deepEqual(combinationInput({ quantity: 2, unitPriceCents: 1200, totalCents: 2400,
    options: [
      { optionId: 'chicken', optionGroupId: 'protein', optionPriceCents: 150 },
      { optionId: 'mint', optionGroupId: 'sauce', optionPriceCents: 50 },
    ],
  }), { quantity: 2, selections: [
    { optionGroupId: 'protein', optionIds: ['chicken'] },
    { optionGroupId: 'sauce', optionIds: ['mint'] },
  ] });
});
