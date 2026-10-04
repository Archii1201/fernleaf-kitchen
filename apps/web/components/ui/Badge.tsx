export type Tone = 'navy' | 'orange' | 'success' | 'warning' | 'danger' | 'muted';

const TONES: Record<Tone, string> = {
  navy: 'bg-[#e6ebf3] text-[var(--navy)]',
  orange: 'bg-[var(--orange-soft)] text-[#a85f0c]',
  success: 'bg-[var(--success-soft)] text-[var(--success)]',
  warning: 'bg-[var(--warning-soft)] text-[#9a6a12]',
  danger: 'bg-[var(--danger-soft)] text-[var(--danger)]',
  muted: 'bg-[var(--cream-soft)] text-[var(--muted)]',
};

export function Badge({
  children,
  tone = 'navy',
  dot = false,
}: {
  children: React.ReactNode;
  tone?: Tone;
  dot?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
