const DEFAULT_TIMEZONE = 'UTC';

const normalizedTimeZones = new Map<string, string>();
const dayKeyFormatters = new Map<string, Intl.DateTimeFormat>();

function getDatePart(parts: Intl.DateTimeFormatPart[], type: 'year' | 'month' | 'day'): string {
  return parts.find((part) => part.type === type)?.value || '';
}

export function normalizeTimeZone(timeZone?: string): string {
  if (!timeZone) {
    return DEFAULT_TIMEZONE;
  }

  const cached = normalizedTimeZones.get(timeZone);
  if (cached !== undefined) {
    return cached;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    normalizedTimeZones.set(timeZone, timeZone);
    return timeZone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function getDayKeyForTimeZone(date: Date, timeZone?: string): string {
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  let formatter = dayKeyFormatters.get(normalizedTimeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: normalizedTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dayKeyFormatters.set(normalizedTimeZone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const year = getDatePart(parts, 'year');
  const month = getDatePart(parts, 'month');
  const day = getDatePart(parts, 'day');
  return `${year}-${month}-${day}`;
}
