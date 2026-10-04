import type { OrderLine } from '../../lib/api/orders';
import { humanize, rupees } from '../../lib/format';
import { FoodPlaceholder } from '../food/FoodPlaceholder';
import { Badge } from '../ui/Badge';
import { OrderStatusBadge } from './OrderStatusBadge';

export function OrderItemCard({ line }: { line: OrderLine }) {
  return (
    <article className="flex gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
      <FoodPlaceholder seed={line.name} label={line.name} className="hidden h-24 w-24 shrink-0 rounded-[var(--radius-sm)] sm:block" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{line.sku}</p>
            <h3 className="serif text-xl font-semibold text-[var(--navy)]">{line.name}</h3>
          </div>
          <p className="serif text-xl font-semibold text-[var(--navy)]">{rupees(line.lineTotalCents)}</p>
        </div>
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
          <span>
            {line.quantity} × {rupees(line.unitPriceCents)}
          </span>
          <Badge tone="navy">{line.kitchenStation.name}</Badge>
          <Badge tone="muted">{humanize(line.temperature)}</Badge>
        </div>
        <ul className="mt-3 space-y-2">
          {line.combinations.map((combination) => (
            <li key={combination.id} className="rounded-[var(--radius-sm)] bg-[var(--ivory)] px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  {combination.quantity} ×{' '}
                  {combination.options.length
                    ? combination.options.map((option) => option.optionName).join(', ')
                    : 'Standard'}
                </span>
                <span className="flex items-center gap-2">
                  {combination.prepUnit ? <OrderStatusBadge status={combination.prepUnit.status} /> : null}
                  <span className="text-[var(--muted)]">{rupees(combination.totalCents)}</span>
                </span>
              </div>
              {combination.options.length ? (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {combination.options
                    .map((option) => `${option.optionGroupName}: ${option.optionName} (+${rupees(option.optionPriceCents)})`)
                    .join(' · ')}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
