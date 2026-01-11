import * as React from "react";
import { CalendarIcon, X } from "lucide-react";
import { subDays } from "date-fns";
import { DateRange } from "react-day-picker";
import { useTranslation } from "react-i18next";

import { cn, safeFormatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface PresetRange {
  label: string;
  days: number | null;
}

interface DateRangePickerProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  presets?: PresetRange[];
  placeholder?: string;
  className?: string;
  align?: "start" | "center" | "end";
  showPresets?: boolean;
  disabled?: boolean;
}

export function DateRangePicker({
  dateRange,
  onDateRangeChange,
  presets,
  placeholder,
  className,
  align = "start",
  showPresets = true,
  disabled = false,
}: DateRangePickerProps) {
  const { t } = useTranslation();
  const [activePreset, setActivePreset] = React.useState<number | null>(null);

  const defaultPresets: PresetRange[] = [
    { label: t("dateRange.last7Days", "Last 7 days"), days: 7 },
    { label: t("dateRange.last30Days", "Last 30 days"), days: 30 },
    { label: t("dateRange.last90Days", "Last 90 days"), days: 90 },
    { label: t("dateRange.allTime", "All time"), days: null },
  ];

  const displayPresets = presets || defaultPresets;

  const handlePresetClick = (days: number | null) => {
    setActivePreset(days);
    if (days === null) {
      onDateRangeChange(undefined);
    } else {
      onDateRangeChange({
        from: subDays(new Date(), days - 1),
        to: new Date(),
      });
    }
  };

  const handleCalendarSelect = (range: DateRange | undefined) => {
    onDateRangeChange(range);
    setActivePreset(null);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDateRangeChange(undefined);
    setActivePreset(null);
  };

  const displayValue = React.useMemo(() => {
    if (!dateRange?.from) {
      return placeholder || t("dateRange.selectRange", "Select date range");
    }
    if (dateRange.to) {
      return `${safeFormatDate(dateRange.from, "MMM d, yyyy")} - ${safeFormatDate(dateRange.to, "MMM d, yyyy")}`;
    }
    return safeFormatDate(dateRange.from, "MMM d, yyyy");
  }, [dateRange, placeholder, t]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {showPresets && (
        <div className="flex flex-wrap gap-2">
          {displayPresets.map((preset) => (
            <Button
              key={preset.days ?? "all"}
              variant={activePreset === preset.days ? "default" : "outline"}
              size="sm"
              onClick={() => handlePresetClick(preset.days)}
              disabled={disabled}
              className="text-xs"
            >
              {preset.label}
            </Button>
          ))}
        </div>
      )}
      
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date-range"
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start text-left font-normal",
              !dateRange?.from && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            <span className="flex-1 truncate">{displayValue}</span>
            {dateRange?.from && (
              <X
                className="ml-2 h-4 w-4 opacity-50 hover:opacity-100"
                onClick={handleClear}
              />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align={align}>
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateRange?.from}
            selected={dateRange}
            onSelect={handleCalendarSelect}
            numberOfMonths={2}
            className="pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Compact version without presets inline
export function DateRangePickerCompact({
  dateRange,
  onDateRangeChange,
  placeholder,
  className,
  align = "start",
  disabled = false,
}: Omit<DateRangePickerProps, "presets" | "showPresets">) {
  const { t } = useTranslation();

  const handleCalendarSelect = (range: DateRange | undefined) => {
    onDateRangeChange(range);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDateRangeChange(undefined);
  };

  const displayValue = React.useMemo(() => {
    if (!dateRange?.from) {
      return placeholder || t("dateRange.selectRange", "Select date range");
    }
    if (dateRange.to) {
      return `${safeFormatDate(dateRange.from, "MMM d")} - ${safeFormatDate(dateRange.to, "MMM d, yyyy")}`;
    }
    return safeFormatDate(dateRange.from, "MMM d, yyyy");
  }, [dateRange, placeholder, t]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id="date-range-compact"
          variant="outline"
          disabled={disabled}
          className={cn(
            "justify-start text-left font-normal",
            !dateRange?.from && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          <span className="truncate">{displayValue}</span>
          {dateRange?.from && (
            <X
              className="ml-2 h-4 w-4 opacity-50 hover:opacity-100"
              onClick={handleClear}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <Calendar
          initialFocus
          mode="range"
          defaultMonth={dateRange?.from}
          selected={dateRange}
          onSelect={handleCalendarSelect}
          numberOfMonths={2}
          className="pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}