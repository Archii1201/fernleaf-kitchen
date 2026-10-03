/** Credits are all-or-nothing: take a credit only when it fits the remainder. */
export function applyCredits(
  subtotalCents: number,
  credits: readonly { id: string; amountCents: number }[],
): { creditCents: number; totalCents: number; appliedIds: string[] } {
  let remaining = subtotalCents;
  const appliedIds: string[] = [];

  for (const credit of credits) {
    if (credit.amountCents <= remaining) {
      remaining -= credit.amountCents;
      appliedIds.push(credit.id);
    }
  }

  return {
    creditCents: subtotalCents - remaining,
    totalCents: remaining,
    appliedIds,
  };
}

export function creditCapacity(orderTotalCents: number, existingCreditCents: number): number {
  return orderTotalCents - existingCreditCents;
}
