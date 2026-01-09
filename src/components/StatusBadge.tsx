import { ShipmentStatus, STATUS_LABELS, STATUS_CLASSES } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: ShipmentStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span className={cn('status-badge', STATUS_CLASSES[status], className)}>
      {STATUS_LABELS[status]}
    </span>
  );
}
