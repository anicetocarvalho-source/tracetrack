import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, User, Eye, EyeOff, ChevronDown, ChevronRight, List, LayoutList } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TrackingEvent } from '@/types/database';
import { cn, safeFormatDate } from '@/lib/utils';

interface TrackingTimelineProps {
  events: TrackingEvent[];
  showVisibility?: boolean;
  initialLimit?: number;
  defaultCompact?: boolean;
}

export function TrackingTimeline({ 
  events, 
  showVisibility = true,
  initialLimit = 5,
  defaultCompact = false
}: TrackingTimelineProps) {
  const { t } = useTranslation();
  const [displayCount, setDisplayCount] = useState(initialLimit);
  const [isCompact, setIsCompact] = useState(defaultCompact);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  const toggleEventExpanded = (eventId: string) => {
    setExpandedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  };

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
      {/* View Mode Toggle */}
      <div className="flex items-center justify-end gap-1 mb-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              size="sm"
              pressed={!isCompact}
              onPressedChange={() => setIsCompact(false)}
              className="h-8 w-8 p-0 data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
            >
              <LayoutList className="w-4 h-4" />
            </Toggle>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{t('tracking.detailedView')}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              size="sm"
              pressed={isCompact}
              onPressedChange={() => setIsCompact(true)}
              className="h-8 w-8 p-0 data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
            >
              <List className="w-4 h-4" />
            </Toggle>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{t('tracking.compactView')}</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Timeline line */}
      <div className="absolute left-4 top-12 bottom-0 w-0.5 bg-border" />

      <AnimatePresence mode="wait">
        {isCompact ? (
          <motion.div
            key="compact"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="space-y-1"
          >
            {displayedEvents.map((event, index) => {
              const isExpanded = expandedEvents.has(event.id);
              const needsExpansion = event.note.length > 50 || event.location || event.creator;
              
              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03, duration: 0.2 }}
                  className="relative pl-10 group"
                >
                  {/* Timeline dot */}
                  <div
                    className={cn(
                      'absolute left-2.5 w-2.5 h-2.5 rounded-full border-2 border-background transition-all',
                      isExpanded ? 'top-4' : 'top-1/2 -translate-y-1/2',
                      index === 0 ? 'bg-primary scale-110' : 'bg-muted-foreground/50 group-hover:bg-primary/50'
                    )}
                  />

                  <div 
                    className={cn(
                      'rounded-lg transition-all',
                      index === 0 && 'bg-primary/5',
                      needsExpansion && 'cursor-pointer',
                      isExpanded && 'bg-muted/50'
                    )}
                    onClick={() => needsExpansion && toggleEventExpanded(event.id)}
                  >
                    {/* Compact row */}
                    <div className={cn(
                      'flex items-center gap-3 py-2 px-3 rounded-lg transition-colors',
                      needsExpansion && 'hover:bg-muted/50'
                    )}>
                      {needsExpansion && (
                        <motion.div
                          animate={{ rotate: isExpanded ? 90 : 0 }}
                          transition={{ duration: 0.2 }}
                          className="shrink-0"
                        >
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </motion.div>
                      )}
                      
                      <StatusBadge status={event.status} className="text-xs py-0.5 px-2" />
                      
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {safeFormatDate(event.event_datetime, 'MMM d, HH:mm')}
                      </span>
                      
                      <span className="text-sm truncate flex-1 text-foreground/80">
                        {!isExpanded && event.note.length > 50 ? `${event.note.substring(0, 50)}...` : (isExpanded ? '' : event.note)}
                      </span>

                      <div className="flex items-center gap-2 shrink-0">
                        {event.location && !isExpanded && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                          </span>
                        )}
                        {showVisibility && (
                          <span
                            className={cn(
                              'flex items-center',
                              event.visible_to_client ? 'text-green-600' : 'text-muted-foreground/50'
                            )}
                          >
                            {event.visible_to_client ? (
                              <Eye className="w-3 h-3" />
                            ) : (
                              <EyeOff className="w-3 h-3" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 pt-1 ml-7 border-l-2 border-primary/20">
                            <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90 mb-2">
                              {event.note}
                            </p>
                            
                            {(event.location || event.creator) && (
                              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                {event.location && (
                                  <span className="flex items-center gap-1.5 bg-muted px-2 py-1 rounded-md">
                                    <MapPin className="w-3 h-3" />
                                    {event.location}
                                  </span>
                                )}
                                {event.creator && (
                                  <span className="flex items-center gap-1.5 bg-muted px-2 py-1 rounded-md">
                                    <User className="w-3 h-3" />
                                    {event.creator.name}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        ) : (
          <motion.div
            key="detailed"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {displayedEvents.map((event, index) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                className="relative pl-10"
              >
                {/* Timeline dot */}
                <div
                  className={cn(
                    'absolute left-2.5 top-5 w-3 h-3 rounded-full border-2 border-background transition-all',
                    index === 0 ? 'bg-primary ring-4 ring-primary/20' : 'bg-muted-foreground/50'
                  )}
                />

                <div className={cn(
                  'bg-card border rounded-xl p-4 transition-all hover:shadow-md hover:border-primary/20',
                  index === 0 && 'border-primary/30 bg-gradient-to-br from-card to-primary/5'
                )}>
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <StatusBadge status={event.status} />
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {showVisibility && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={cn(
                                'flex items-center gap-1 cursor-help',
                                event.visible_to_client ? 'text-green-600' : 'text-muted-foreground'
                              )}
                            >
                              {event.visible_to_client ? (
                                <Eye className="w-3.5 h-3.5" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5" />
                              )}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{event.visible_to_client ? t('tracking.visibleToClient') : t('tracking.internalOnly')}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      <span className="font-medium">{safeFormatDate(event.event_datetime, 'MMM d, yyyy HH:mm')}</span>
                    </div>
                  </div>

                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{event.note}</p>

                  {(event.location || event.creator) && (
                    <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
                      {event.location && (
                        <span className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
                          <MapPin className="w-3 h-3" />
                          {event.location}
                        </span>
                      )}
                      {event.creator && (
                        <span className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
                          <User className="w-3 h-3" />
                          {event.creator.name}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Load More Button */}
      {hasMore && (
        <motion.div 
          className="mt-4 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleLoadMore}
            className="text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <ChevronDown className="w-4 h-4 mr-2" />
            {t('common.loadMore')} ({sortedEvents.length - displayCount} {t('common.remaining') || 'remaining'})
          </Button>
        </motion.div>
      )}
    </div>
  );
}
