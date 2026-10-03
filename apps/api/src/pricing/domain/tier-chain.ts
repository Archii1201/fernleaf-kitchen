import {
  BaseTierNotFoundError,
  TierCycleError,
  TierDepthExceededError,
  TierSelfReferenceError,
} from '../pricing.errors.js';
import type { PriceTierDefinition } from './pricing.types.js';

/**
 * How many base-tier hops a tier may make. Partner -> Standard is depth 1.
 * The cap keeps resolution bounded and keeps the grid's single context load
 * from degenerating into an unbounded walk.
 */
export const MAX_TIER_DERIVATION_DEPTH = 5;

export interface TierChainCandidate {
  id: string;
  baseTierId: string | null;
}

/**
 * Validates the derivation chain a tier would have after an edit.
 *
 * Called before every tier write, so an invalid chain can never reach the
 * database and the resolver never has to defend against one at read time.
 */
export function validateTierChain(
  candidate: TierChainCandidate,
  tiersById: ReadonlyMap<string, TierChainCandidate | PriceTierDefinition>,
): string[] {
  if (candidate.baseTierId === null) {
    return [candidate.id];
  }

  if (candidate.baseTierId === candidate.id) {
    throw new TierSelfReferenceError(candidate.id);
  }

  const chain = [candidate.id];
  const seen = new Set<string>([candidate.id]);

  let currentId: string | null = candidate.baseTierId;
  let depth = 0;

  while (currentId !== null) {
    depth += 1;

    if (seen.has(currentId)) {
      throw new TierCycleError([...chain, currentId]);
    }

    const current = tiersById.get(currentId);

    if (!current) {
      throw new BaseTierNotFoundError(currentId);
    }

    chain.push(currentId);
    seen.add(currentId);

    if (depth > MAX_TIER_DERIVATION_DEPTH) {
      throw new TierDepthExceededError(MAX_TIER_DERIVATION_DEPTH, chain);
    }

    currentId = current.baseTierId;
  }

  return chain;
}
