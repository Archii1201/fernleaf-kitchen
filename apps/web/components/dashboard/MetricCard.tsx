import { Icon, type IconName } from '../ui/Icon';

export function MetricCard({
  label,
  value,
  hint,
  icon,
  tone = 'navy',
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: IconName;
  tone?: 'navy' | 'orange' | 'success' | 'danger' | 'warning';
}) {
  const accent = {
    navy: 'bg-[#e6ebf3] text-[var(--navy)]',
    orange: 'bg-[var(--orange-soft)] text-[var(--orange-deep)]',
    success: 'bg-[var(--success-soft)] text-[var(--success)]',
    danger: 'bg-[var(--danger-soft)] text-[var(--danger)]',
    warning: 'bg-[var(--warning-soft)] text-[var(--warning)]',
  }[tone];

  return (
    <div className="card-hover relative overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow)]">
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow">{label}</p>
        {icon ? (
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${accent}`}>
            <Icon name={icon} className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <p className="serif mt-3 text-4xl font-semibold leading-none text-[var(--navy)]">{value ?? '—'}</p>
      {hint ? <p className="mt-2 text-sm text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}
