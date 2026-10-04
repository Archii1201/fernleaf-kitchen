import { formatDateTime, humanize } from '../../lib/format';

/** Renders the order's recorded events, oldest first, exactly as the API returns them. */
export function OrderTimeline({
  events,
}: {
  events: { id: string; type: string; occurredAt: string; note: string | null }[];
}) {
  if (!events.length) {
    return <p className="text-sm text-[var(--muted)]">No events recorded yet.</p>;
  }

  return (
    <ol className="relative space-y-5 border-l border-[var(--border)] pl-6">
      {events.map((event, index) => {
        const latest = index === events.length - 1;
        return (
          <li key={event.id} className="slide-up relative">
            <span
              aria-hidden="true"
              className={`absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white ${
                latest ? 'bg-[var(--orange)] ring-4 ring-[var(--orange)]/20' : 'bg-[var(--navy)]'
              }`}
            />
            <p className="text-sm font-semibold text-[var(--navy)]">{humanize(event.type)}</p>
            <p className="text-xs text-[var(--muted)]">{formatDateTime(event.occurredAt)}</p>
            {event.note ? <p className="mt-1 text-sm text-[var(--text)]">{event.note}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
