import { rupees } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { DishImage } from './DishImage';

export function DishCard({
  name,
  sku,
  description,
  station,
  priceCents,
  priceLabel = 'Price',
  tags = [],
  active,
  imageFileId,
  onClick,
  selected = false,
  footer,
}: {
  name: string;
  sku: string;
  description?: string | null;
  station?: string;
  priceCents?: number | null;
  priceLabel?: string;
  tags?: string[];
  active?: boolean;
  imageFileId?: string | null;
  onClick?: () => void;
  selected?: boolean;
  footer?: React.ReactNode;
}) {
  const body = (
    <>
      <div className="relative">
        <DishImage imageFileId={imageFileId} alt={name} className="h-40 w-full" />
        {active === false ? (
          <span className="absolute left-3 top-3">
            <Badge tone="muted">Inactive</Badge>
          </span>
        ) : null}
        {station ? (
          <span className="absolute right-3 top-3">
            <Badge tone="navy">{station}</Badge>
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4 text-left">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{sku}</p>
        <h3 className="serif text-xl font-semibold leading-snug text-[var(--navy)]">{name}</h3>
        {description ? <p className="line-clamp-2 text-sm text-[var(--muted)]">{description}</p> : null}
        {tags.length ? (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <Badge key={tag} tone="muted">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
        {priceCents !== undefined ? (
          <div className="mt-auto flex items-baseline justify-between pt-2">
            <span className="text-xs text-[var(--muted)]">{priceLabel}</span>
            {priceCents === null ? (
              <Badge tone="warning">Price missing</Badge>
            ) : (
              <span className="serif text-2xl font-semibold text-[var(--orange-deep)]">{rupees(priceCents)}</span>
            )}
          </div>
        ) : null}
        {footer}
      </div>
    </>
  );

  const frame = `card-hover flex h-full flex-col overflow-hidden rounded-[var(--radius)] border bg-white shadow-[var(--shadow)] ${
    selected ? 'border-[var(--orange)] ring-2 ring-[var(--orange)]/40' : 'border-[var(--border)]'
  }`;

  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={selected} className={`${frame} w-full`}>
      {body}
    </button>
  ) : (
    <article className={frame}>{body}</article>
  );
}
