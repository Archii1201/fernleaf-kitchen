'use client';

import { getDish, getGroup } from '../../lib/api/catalogue';
import { setCombinationOptions, type CombinationInput } from '../../lib/order-combinations';
import { useLoad } from '../../lib/use-load';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ErrorState } from '../ui/EmptyState';

export function OrderCombinationEditor({ dishId, quantity, combinations, onChange }: {
  dishId: string;
  quantity: number;
  combinations: CombinationInput[];
  onChange: (combinations: CombinationInput[]) => void;
}) {
  const { data: groups, loading, error, reload } = useLoad(async () => {
    const dish = await getDish(dishId);
    return Promise.all(dish.optionGroups.map(async (link) => ({
      ...(await getGroup(link.id)), required: link.required,
    }))).then((rows) => rows.filter((group) => group.active));
  }, ['order-option-groups', dishId]);

  const total = combinations.reduce((sum, combination) => sum + combination.quantity, 0);
  const update = (index: number, combination: CombinationInput) =>
    onChange(combinations.map((current, i) => i === index ? combination : current));

  return (
    <div className="space-y-4">
      {loading ? <p role="status">Loading available options…</p> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      <p className={total === quantity ? 'text-sm' : 'text-sm text-[var(--danger)]'}>
        Assigned quantity: {total} / {quantity}. Combination quantities must equal the line quantity.
      </p>
      {combinations.map((combination, index) => (
        <fieldset key={index} className="space-y-3 rounded border border-[var(--border)] bg-white p-3">
          <legend className="px-1 font-semibold">Combination {index + 1}</legend>
          <Input label="Combination quantity" type="number" min={1} step={1}
            value={combination.quantity}
            onChange={(event) => update(index, { ...combination, quantity: Number(event.target.value) })} />
          {groups?.map((group) => {
            const selected = combination.selections?.find((selection) => selection.optionGroupId === group.id)?.optionIds ?? [];
            return (
              <fieldset key={group.id} className="space-y-2">
                <legend className="font-medium">{group.name} — {group.required ? 'Required (at least 1)' : 'Optional'}
                  {group.maxSelections !== null ? ` · Maximum ${group.maxSelections}` : ''}
                </legend>
                {selected.length > 0 ? <Button variant="ghost" size="sm"
                  onClick={() => update(index, setCombinationOptions(combination, group.id, []))}>
                  Clear choices
                </Button> : null}
                {group.options.filter((option) => option.active && option.membershipActive).map((option) => (
                  <label key={option.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={selected.includes(option.id)}
                      disabled={!selected.includes(option.id) && group.maxSelections !== null && selected.length >= group.maxSelections}
                      onChange={(event) => update(index, setCombinationOptions(combination, group.id,
                        event.target.checked ? [...selected, option.id] : selected.filter((id) => id !== option.id)))} />
                    {option.name}
                  </label>
                ))}
                {group.required && selected.length === 0 ? <p className="text-xs text-[var(--danger)]">Choose an option.</p> : null}
              </fieldset>
            );
          })}
          <Button variant="ghost" size="sm" disabled={combinations.length === 1}
            onClick={() => onChange(combinations.filter((_, i) => i !== index))}>Remove combination</Button>
        </fieldset>
      ))}
      <Button variant="subtle" size="sm" onClick={() => onChange([...combinations, { quantity: 1, selections: [] }])}>
        Add combination
      </Button>
      <p className="text-xs text-[var(--muted)]">The server validates selections and calculates each combination price.</p>
    </div>
  );
}
