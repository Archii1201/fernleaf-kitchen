export function ProgressBar({ percent, tone = 'orange' }: { percent: number; tone?: 'orange' | 'success' | 'navy' }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const fill = { orange: 'bg-[var(--orange)]', success: 'bg-[var(--success)]', navy: 'bg-[var(--navy)]' }[tone];
  return (
    <div
      className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--cream-soft)]"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`progress-fill h-full rounded-full ${fill}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

/** Progress display only; the percentage always comes from the API. */
export function ProgressCard({
  label,
  percent,
  detail,
  tone = 'orange',
  children,
}: {
  label: string;
  percent: number;
  detail?: React.ReactNode;
  tone?: 'orange' | 'success' | 'navy';
  children?: React.ReactNode;
}) {
  return (
    <div className="card-hover rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow)]">
      <div className="mb-3 flex items-end justify-between gap-3">
        <p className="eyebrow">{label}</p>
        <p className="serif text-3xl font-semibold leading-none text-[var(--navy)]">{percent}%</p>
      </div>
      <ProgressBar percent={percent} tone={tone} />
      {detail ? <p className="mt-2 text-sm text-[var(--muted)]">{detail}</p> : null}
      {children}
    </div>
  );
}
