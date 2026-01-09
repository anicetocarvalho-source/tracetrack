import { useState } from 'react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { MapPin, User, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { TrackingEvent } from '@/types/database';
import { cn } from '@/lib/utils';

interface TrackingTimelineProps {
  events: TrackingEvent[];
  showVisibility?: boolean;
  initialLimit?: number;
}

export function TrackingTimeline({ 
  events, 
  showVisibility = true,
  initialLimit = 5 
}: TrackingTimelineProps) {
  const { t } = useTranslation();
  const [displayCount, setDisplayCount] = useState(initialLimit);

  if (!events || events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {t('tracking.noEvents')}
      </div>
    );
  }

  // Sort events by event_datetime descending (newest first)
  const sortedEvents = [...events].sort(
    (a, b) => new Date(b.event_datetime).getTime() - new Date(a.event_datetime).getTime()
  );

  const displayedEvents = sortedEvents.slice(0, displayCount);
  const hasMore = sortedEvents.length > displayCount;

  const handleLoadMore = () => {
    setDisplayCount(prev => prev + 10);
  };

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

      <div className="space-y-6">
        {displayedEvents.map((event, index) => (
          <div key={event.id} className="relative pl-10">
            {/* Timeline dot */}
            <div
              className={cn(
                'absolute left-2.5 w-3 h-3 rounded-full border-2 border-background',
                index === 0 ? 'bg-primary' : 'bg-muted-foreground/50'
              )}
            />

            <div className="bg-card border rounded-lg p-4">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <StatusBadge status={event.status} />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {showVisibility && (
                    <span
                      className={cn(
                        'flex items-center gap-1',
                        event.visible_to_client ? 'text-green-600' : 'text-muted-foreground'
                      )}
                      title={event.visible_to_client ? t('tracking.visibleToClient') : t('tracking.internalOnly')}
                    >
                      {event.visible_to_client ? (
                        <Eye className="w-3 h-3" />
                      ) : (
                        <EyeOff className="w-3 h-3" />
                      )}
                    </span>
                  )}
                  <span>{format(new Date(event.event_datetime), 'MMM d, yyyy HH:mm')}</span>
                </div>
              </div>

              <p className="text-sm whitespace-pre-wrap">{event.note}</p>

              <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
                {event.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {event.location}
                  </span>
                )}
                {event.creator && (
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {event.creator.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Load More Button */}
      {hasMore && (
        <div className="mt-4 text-center">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleLoadMore}
            className="text-muted-foreground"
          >
            <ChevronDown className="w-4 h-4 mr-2" />
            {t('common.loadMore')} ({sortedEvents.length - displayCount} {t('common.remaining') || 'remaining'})
          </Button>
        </div>
      )}
    </div>
  );
}
