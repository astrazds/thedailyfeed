const DEFAULT_TIMEZONE = 'UTC';

function getDatePart(parts: Intl.DateTimeFormatPart[], type: 'year' | 'month' | 'day'): string {
  return parts.find((part) => part.type === type)?.value || '';
}

export function normalizeTimeZone(timeZone?: string): string {
  if (!timeZone) {
    return DEFAULT_TIMEZONE;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function getDayKeyForTimeZone(date: Date, timeZone?: string): string {
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: normalizedTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = getDatePart(parts, 'year');
  const month = getDatePart(parts, 'month');
  const day = getDatePart(parts, 'day');
  return `${year}-${month}-${day}`;
}
