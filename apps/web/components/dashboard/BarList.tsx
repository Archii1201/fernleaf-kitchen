/** Horizontal bars scaled to the largest value in the list (display only). */
export function BarList({
  rows,
  empty = 'Nothing to show',
}: {
  rows: { label: string; value: number; hint?: string }[];
  empty?: string;
}) {
  if (!rows.length) {
    return <p className="text-sm text-[var(--muted)]">{empty}</p>;
  }
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium text-[var(--navy)]">{row.label}</span>
            <span className="shrink-0 text-[var(--muted)]">
              {row.value}
              {row.hint ? ` · ${row.hint}` : ''}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--cream-soft)]">
            <div
              className="progress-fill h-full rounded-full bg-gradient-to-r from-[var(--orange)] to-[var(--orange-deep)]"
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
