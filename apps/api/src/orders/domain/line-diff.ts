import { PrepUnitLockedError } from '../orders.errors.js';
import type {
  BuiltCombination,
  BuiltLine,
  ExistingCombinationView,
  LineDiffEntry,
} from './order-types.js';

export function combinationKey(dishId: string, signature: string): string {
  return `${dishId}::${signature}`;
}

export function flattenIncoming(lines: readonly BuiltLine[]): Map<
  string,
  BuiltCombination & { dishId: string }
> {
  const map = new Map<string, BuiltCombination & { dishId: string }>();

  for (const line of lines) {
    for (const combination of line.combinations) {
      map.set(combinationKey(line.dishId, combination.signature), {
        ...combination,
        dishId: line.dishId,
      });
    }
  }

  return map;
}

/**
 * Diff incoming combinations against the current order. Kitchen-started
 * rows cannot be changed or removed; pending rows can.
 */
export function diffCombinations(
  incomingLines: readonly BuiltLine[],
  existing: readonly ExistingCombinationView[],
): LineDiffEntry[] {
  const incoming = flattenIncoming(incomingLines);
  const existingByKey = new Map(existing.map((row) => [row.key, row]));
  const entries: LineDiffEntry[] = [];

  for (const [key, next] of incoming) {
    const current = existingByKey.get(key);

    if (!current) {
      entries.push({ kind: 'NEW', key, incoming: next });
      continue;
    }

    if (current.quantity === next.quantity) {
      entries.push({ kind: 'UNCHANGED', key, incoming: next, existing: current });
    } else {
      assertUnlocked(current);
      entries.push({ kind: 'CHANGED', key, incoming: next, existing: current });
    }
  }

  for (const current of existing) {
    if (!incoming.has(current.key)) {
      assertUnlocked(current);
      entries.push({ kind: 'REMOVED', key: current.key, existing: current });
    }
  }

  return entries;
}

function assertUnlocked(row: ExistingCombinationView): void {
  if (row.prepStatus !== 'PENDING') {
    throw new PrepUnitLockedError(row.signature, row.prepStatus);
  }
}
