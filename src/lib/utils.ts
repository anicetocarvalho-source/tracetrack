import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, isValid, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safely formats a date string or Date object.
 * Returns the fallback string if the date is invalid, null, or undefined.
 */
export function safeFormatDate(
  date: string | Date | null | undefined,
  formatString: string,
  fallback: string = '-'
): string {
  if (!date) return fallback;
  
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    if (!isValid(dateObj)) return fallback;
    return format(dateObj, formatString);
  } catch {
    return fallback;
  }
}
