import { ShipmentStatus, STATUS_CLASSES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface StatusBadgeProps {
  status: ShipmentStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { t } = useTranslation();
  
  return (
    <span className={cn('status-badge', STATUS_CLASSES[status], className)}>
      {t(`status.${status}`)}
    </span>
  );
}
