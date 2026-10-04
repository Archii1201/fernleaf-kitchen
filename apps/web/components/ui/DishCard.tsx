'use client';

import { type Dish } from '../../lib/api/catalogue';
import { rupees } from '../../lib/format';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';
import { DishImage } from './DishImage';

export function DishCard({
  dish,
  onEdit,
  onToggleActive,
  onManageGroups,
  toggling = false,
}: {
  dish: Dish;
  onEdit?: (dish: Dish) => void;
  onToggleActive?: (dish: Dish) => void;
  onManageGroups?: (dish: Dish) => void;
  toggling?: boolean;
}) {
  const tempTone =
    dish.temperature === 'HOT'
      ? 'orange'
      : dish.temperature === 'COLD'
      ? 'navy'
      : 'muted';

  return (
    <Card className="flex flex-col overflow-hidden !p-0 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <div className="relative">
        <DishImage
          imageFileId={dish.imageFileId}
          alt={dish.name}
          className="h-44 w-full"
        />
        <div className="absolute right-3 top-3 flex gap-1.5">
          <Badge tone={dish.active ? 'success' : 'muted'} dot>
            {dish.active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <span className="font-mono text-xs font-semibold tracking-wider text-[var(--muted)]">
            {dish.sku}
          </span>
          <span className="font-semibold text-[var(--navy)]">
            {rupees(dish.costCents)}
          </span>
        </div>

        <h3 className="serif text-xl font-semibold leading-snug text-[var(--navy)] line-clamp-1">
          {dish.name}
        </h3>

        {dish.description ? (
          <p className="mt-1 text-xs text-[var(--muted)] line-clamp-2">
            {dish.description}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {dish.kitchenStation?.name ? (
            <Badge tone="navy">{dish.kitchenStation.name}</Badge>
          ) : null}
          <Badge tone={tempTone}>{dish.temperature}</Badge>
          {dish.portionSize?.name ? (
            <Badge tone="muted">{dish.portionSize.name}</Badge>
          ) : null}
        </div>

        {dish.dietaryTags && dish.dietaryTags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {dish.dietaryTags.map((tag) => (
              <span
                key={tag.id}
                className="rounded bg-[var(--cream-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--navy)]"
              >
                {tag.name}
              </span>
            ))}
          </div>
        ) : null}

        {dish.allergens && dish.allergens.length > 0 ? (
          <div className="mt-2 text-[11px] text-[var(--danger)]">
            <span className="font-medium">Allergens: </span>
            {dish.allergens.map((a) => a.name).join(', ')}
          </div>
        ) : null}

        {dish.optionGroups && dish.optionGroups.length > 0 ? (
          <div className="mt-2 text-xs text-[var(--muted)]">
            <span className="font-medium text-[var(--navy)]">
              {dish.optionGroups.length}
            </span>{' '}
            option group{dish.optionGroups.length === 1 ? '' : 's'} linked
          </div>
        ) : null}

        <div className="mt-auto pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
            <div className="flex gap-1.5">
              {onEdit ? (
                <Button variant="ghost" size="sm" onClick={() => onEdit(dish)}>
                  Edit
                </Button>
              ) : null}
              {onManageGroups ? (
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => onManageGroups(dish)}
                >
                  Groups ({dish.optionGroups?.length ?? 0})
                </Button>
              ) : null}
            </div>

            {onToggleActive ? (
              <Button
                variant={dish.active ? 'ghost' : 'navy'}
                size="sm"
                busy={toggling}
                onClick={() => onToggleActive(dish)}
              >
                {dish.active ? 'Deactivate' : 'Activate'}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
