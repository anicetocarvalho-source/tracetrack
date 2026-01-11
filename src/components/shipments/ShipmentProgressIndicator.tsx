import { Check, Circle } from 'lucide-react';
import { ShipmentStatus, SHIPMENT_STATUSES, STATUS_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';

// Define the main progress stages (excluding terminal states like ON_HOLD_INCIDENT and CANCELLED)
const PROGRESS_STAGES: ShipmentStatus[] = [
  'RECEIVED',
  'REGISTERED', 
  'DOCS_VALIDATION',
  'PROCESSING',
  'IN_TRANSIT',
  'AT_TERMINAL',
  'CLEARANCE',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

// Simplified stages for compact display
const COMPACT_STAGES: { status: ShipmentStatus; label: string }[] = [
  { status: 'RECEIVED', label: 'Received' },
  { status: 'PROCESSING', label: 'Processing' },
  { status: 'IN_TRANSIT', label: 'Transit' },
  { status: 'CLEARANCE', label: 'Clearance' },
  { status: 'DELIVERED', label: 'Delivered' },
];

interface ShipmentProgressIndicatorProps {
  currentStatus: ShipmentStatus;
  className?: string;
  compact?: boolean;
}

export function ShipmentProgressIndicator({ 
  currentStatus, 
  className,
  compact = true 
}: ShipmentProgressIndicatorProps) {
  // Handle special statuses
  const isOnHold = currentStatus === 'ON_HOLD_INCIDENT';
  const isCancelled = currentStatus === 'CANCELLED';
  const isDelivered = currentStatus === 'DELIVERED';

  // Get the index of the current status in the full progress stages
  const currentIndex = PROGRESS_STAGES.indexOf(currentStatus);
  
  // Calculate progress percentage
  const getProgressPercentage = (): number => {
    if (isCancelled || isOnHold) return 0;
    if (isDelivered) return 100;
    if (currentIndex === -1) return 0;
    return Math.round((currentIndex / (PROGRESS_STAGES.length - 1)) * 100);
  };

  // Check if a stage is completed
  const isStageCompleted = (stageStatus: ShipmentStatus): boolean => {
    if (isCancelled || isOnHold) return false;
    const stageIndex = PROGRESS_STAGES.indexOf(stageStatus);
    return currentIndex >= stageIndex;
  };

  // Check if a stage is the current one
  const isCurrentStage = (stageStatus: ShipmentStatus): boolean => {
    // Map current status to its compact stage
    if (currentStatus === stageStatus) return true;
    
    // Handle statuses that map to compact stages
    if (stageStatus === 'PROCESSING' && ['REGISTERED', 'DOCS_VALIDATION', 'PROCESSING'].includes(currentStatus)) {
      return ['REGISTERED', 'DOCS_VALIDATION', 'PROCESSING'].includes(currentStatus) && 
             !isStageCompleted('IN_TRANSIT');
    }
    if (stageStatus === 'CLEARANCE' && ['AT_TERMINAL', 'CLEARANCE'].includes(currentStatus)) {
      return ['AT_TERMINAL', 'CLEARANCE'].includes(currentStatus) && 
             !isStageCompleted('OUT_FOR_DELIVERY');
    }
    
    return false;
  };

  // Get stage status for compact display
  const getCompactStageStatus = (stageStatus: ShipmentStatus): 'completed' | 'current' | 'pending' => {
    if (isCancelled || isOnHold) {
      return 'pending';
    }
    
    const stageIndex = PROGRESS_STAGES.indexOf(stageStatus);
    
    if (currentIndex > stageIndex) {
      return 'completed';
    }
    
    // Handle mapping of detailed statuses to compact stages
    if (stageStatus === 'PROCESSING') {
      if (['REGISTERED', 'DOCS_VALIDATION', 'PROCESSING'].includes(currentStatus)) {
        return 'current';
      }
      if (currentIndex > PROGRESS_STAGES.indexOf('PROCESSING')) {
        return 'completed';
      }
    }
    
    if (stageStatus === 'CLEARANCE') {
      if (['AT_TERMINAL', 'CLEARANCE'].includes(currentStatus)) {
        return 'current';
      }
      if (currentIndex > PROGRESS_STAGES.indexOf('CLEARANCE')) {
        return 'completed';
      }
    }
    
    if (currentStatus === stageStatus) {
      return 'current';
    }
    
    return 'pending';
  };

  const progressPercentage = getProgressPercentage();
  const stages = compact ? COMPACT_STAGES : PROGRESS_STAGES.map(s => ({ status: s, label: STATUS_LABELS[s] }));

  if (isCancelled) {
    return (
      <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-muted-foreground/50 w-full" />
        </div>
        <span className="font-medium text-muted-foreground">Cancelled</span>
      </div>
    );
  }

  if (isOnHold) {
    return (
      <div className={cn("flex items-center gap-2 text-xs text-destructive", className)}>
        <div className="flex-1 h-1.5 rounded-full bg-destructive/20 overflow-hidden">
          <div className="h-full bg-destructive animate-pulse w-full" />
        </div>
        <span className="font-medium">On Hold</span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Progress Bar */}
      <div className="relative">
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div 
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isDelivered ? "bg-green-500" : "bg-primary"
            )}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Stage Indicators */}
      <div className="flex justify-between">
        {stages.map((stage, index) => {
          const status = getCompactStageStatus(stage.status);
          
          return (
            <div 
              key={stage.status}
              className="flex flex-col items-center gap-1"
            >
              <div 
                className={cn(
                  "w-3 h-3 rounded-full flex items-center justify-center transition-all",
                  status === 'completed' && "bg-green-500 text-white",
                  status === 'current' && "bg-primary text-primary-foreground ring-2 ring-primary/30",
                  status === 'pending' && "bg-muted border border-muted-foreground/30"
                )}
              >
                {status === 'completed' && <Check className="w-2 h-2" />}
                {status === 'current' && <Circle className="w-1.5 h-1.5 fill-current" />}
              </div>
              <span 
                className={cn(
                  "text-[10px] leading-tight text-center max-w-[50px]",
                  status === 'completed' && "text-green-600 font-medium",
                  status === 'current' && "text-primary font-semibold",
                  status === 'pending' && "text-muted-foreground"
                )}
              >
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
