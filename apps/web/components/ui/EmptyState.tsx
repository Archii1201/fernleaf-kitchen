import { Icon, type IconName } from './Icon';

export function EmptyState({
  title,
  hint,
  icon = 'leaf',
  action,
}: {
  title: string;
  hint?: string;
  icon?: IconName;
  action?: React.ReactNode;
}) {
  return (
    <div className="fade-in flex flex-col items-center rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--ivory)] px-6 py-12 text-center">
      <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-[var(--orange-soft)] text-[var(--orange-deep)]">
        <Icon name={icon} />
      </span>
      <p className="serif text-xl font-semibold text-[var(--navy)]">{title}</p>
      {hint ? <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="fade-in flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--danger)]/25 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[#8f3a3a]"
    >
      <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="flex-1">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function Notice({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="fade-in flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--success)]/25 bg-[var(--success-soft)] px-4 py-3 text-sm text-[#335c41]"
    >
      <Icon name="check" className="h-4 w-4" />
      {message}
    </div>
  );
}

export function Feedback({ error, notice }: { error?: string | null; notice?: string | null }) {
  if (!error && !notice) {
    return null;
  }
  return <div className="mb-4">{error ? <ErrorState message={error} /> : <Notice message={notice!} />}</div>;
}
