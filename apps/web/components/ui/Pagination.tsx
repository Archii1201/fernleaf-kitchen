import { Button } from './Button';

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total?: number;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return total !== undefined ? <p className="mt-4 text-sm text-[var(--muted)]">{total} total</p> : null;
  }

  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-[var(--muted)]">
        Page {page} of {totalPages}
        {total !== undefined ? ` · ${total} total` : ''}
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" icon="chevronLeft" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
}
