import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Timer, AlertTriangle, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface SLACountdownTimerProps {
  enteredAt: string;
  maxHours: number;
  breached?: boolean;
  className?: string;
}

export function SLACountdownTimer({
  enteredAt,
  maxHours,
  breached = false,
  className,
}: SLACountdownTimerProps) {
  const { t } = useTranslation();
  const [timeRemaining, setTimeRemaining] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
    totalSeconds: number;
    percentUsed: number;
    isOverdue: boolean;
  } | null>(null);

  useEffect(() => {
    const calculateTimeRemaining = () => {
      const enteredTime = new Date(enteredAt).getTime();
      const deadlineTime = enteredTime + (maxHours * 60 * 60 * 1000);
      const now = Date.now();
      const remainingMs = deadlineTime - now;
      
      const elapsedMs = now - enteredTime;
      const totalMs = maxHours * 60 * 60 * 1000;
      const percentUsed = Math.min((elapsedMs / totalMs) * 100, 100);

      if (remainingMs <= 0) {
        const overdueMs = Math.abs(remainingMs);
        const overdueSeconds = Math.floor(overdueMs / 1000);
        const overdueMinutes = Math.floor(overdueSeconds / 60);
        const overdueHours = Math.floor(overdueMinutes / 60);
        
        return {
          hours: overdueHours,
          minutes: overdueMinutes % 60,
          seconds: overdueSeconds % 60,
          totalSeconds: overdueSeconds,
          percentUsed: 100,
          isOverdue: true,
        };
      }

      const remainingSeconds = Math.floor(remainingMs / 1000);
      const remainingMinutes = Math.floor(remainingSeconds / 60);
      const remainingHours = Math.floor(remainingMinutes / 60);

      return {
        hours: remainingHours,
        minutes: remainingMinutes % 60,
        seconds: remainingSeconds % 60,
        totalSeconds: remainingSeconds,
        percentUsed,
        isOverdue: false,
      };
    };

    setTimeRemaining(calculateTimeRemaining());

    const interval = setInterval(() => {
      setTimeRemaining(calculateTimeRemaining());
    }, 1000);

    return () => clearInterval(interval);
  }, [enteredAt, maxHours]);

  if (!timeRemaining) {
    return null;
  }

  const formatTime = (h: number, m: number, s: number) => {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getStatusColor = () => {
    if (timeRemaining.isOverdue || breached) return 'text-destructive';
    if (timeRemaining.percentUsed >= 90) return 'text-destructive';
    if (timeRemaining.percentUsed >= 75) return 'text-amber-500';
    return 'text-green-500';
  };

  const getProgressColor = () => {
    if (timeRemaining.isOverdue || breached) return 'bg-destructive';
    if (timeRemaining.percentUsed >= 90) return 'bg-destructive';
    if (timeRemaining.percentUsed >= 75) return 'bg-amber-500';
    return 'bg-green-500';
  };

  const getBadgeVariant = () => {
    if (timeRemaining.isOverdue || breached) return 'destructive' as const;
    if (timeRemaining.percentUsed >= 75) return 'outline' as const;
    return 'outline' as const;
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* Timer display */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Timer className={cn('w-5 h-5', getStatusColor())} />
          <span className="text-sm text-muted-foreground">
            {timeRemaining.isOverdue ? t('sla.overdue') : t('sla.timeRemaining')}
          </span>
        </div>
        <Badge variant={getBadgeVariant()} className={cn('font-mono text-lg px-3 py-1', getStatusColor())}>
          {timeRemaining.isOverdue && '+'}{formatTime(timeRemaining.hours, timeRemaining.minutes, timeRemaining.seconds)}
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div
            className={cn('h-full transition-all duration-1000', getProgressColor())}
            style={{ width: `${timeRemaining.percentUsed}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{Math.round(timeRemaining.percentUsed)}% {t('sla.used')}</span>
          <span>{maxHours}h {t('sla.limit')}</span>
        </div>
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-2">
        {timeRemaining.isOverdue || breached ? (
          <Badge variant="destructive" className="animate-pulse">
            <AlertTriangle className="w-3 h-3 mr-1" />
            {t('sla.breached')}
          </Badge>
        ) : timeRemaining.percentUsed >= 90 ? (
          <Badge variant="destructive">
            <AlertTriangle className="w-3 h-3 mr-1" />
            {t('sla.critical')}
          </Badge>
        ) : timeRemaining.percentUsed >= 75 ? (
          <Badge variant="outline" className="border-amber-500 text-amber-600">
            <AlertTriangle className="w-3 h-3 mr-1" />
            {t('sla.warning')}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-green-500 text-green-600">
            <CheckCircle className="w-3 h-3 mr-1" />
            {t('sla.onTrack')}
          </Badge>
        )}
      </div>
    </div>
  );
}
