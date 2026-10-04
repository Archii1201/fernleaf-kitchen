import { humanize } from '../../lib/format';
import { Badge, type Tone } from '../ui/Badge';

const TONE: Record<string, Tone> = {
  DRAFT: 'muted',
  PLACED: 'navy',
  CONFIRMED: 'navy',
  IN_KITCHEN: 'orange',
  READY: 'success',
  DISPATCH_READY: 'success',
  OUT_FOR_DELIVERY: 'warning',
  DELIVERED: 'success',
  CANCELLED: 'danger',
  REJECTED: 'danger',
  PENDING: 'muted',
  IN_PROGRESS: 'orange',
  ISSUED: 'navy',
  PAID: 'success',
  VOID: 'danger',
  LATE: 'danger',
  AT_RISK: 'warning',
  ON_TRACK: 'success',
};

/** Shared status pill for orders, prep units, drops, invoices and timing. */
export function OrderStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={TONE[status] ?? 'muted'} dot>
      {humanize(status)}
    </Badge>
  );
}

export const StatusBadge = OrderStatusBadge;
