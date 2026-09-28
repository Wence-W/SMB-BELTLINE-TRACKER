// Wence's request (2026-08-04): SMB Beltline Tracker should always display
// dates/times in Eastern Time (EST/EDT — America/New_York handles the DST
// switch automatically, which is what "Eastern Time" means in practice)
// regardless of the viewer's own device/browser timezone. Use these helpers
// anywhere a timestamp is rendered instead of calling toLocale*String
// directly, so every screen (Created Date, Last Updated, appointment
// date/time, activity log timestamps, etc.) stays consistent.

const TIME_ZONE = "America/New_York";

const EASTERN_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function easternDateTimeParts(value: string | number | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = EASTERN_DATE_TIME_FORMATTER.formatToParts(date);
  const get = (type: string) =>
    parts.find(part => part.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/**
 * Returns the calendar date in Eastern Time as YYYY-MM-DD.
 *
 * Appointment inputs are stored as YYYY-MM-DDTHH:mm without an offset, and
 * those values represent Eastern local time. Preserve that format directly;
 * values with an offset/UTC timestamp are converted through the formatter.
 */
export function easternDateKey(value: string | number | Date): string {
  if (typeof value === "string") {
    const localMatch = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}/.exec(value);
    if (localMatch) return localMatch[1];
    const dateOnlyMatch = /^(\d{4}-\d{2}-\d{2})$/.exec(value);
    if (dateOnlyMatch) return dateOnlyMatch[1];
  }
  const parts = easternDateTimeParts(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : "";
}

/**
 * Returns a comparable Eastern-local datetime key as YYYY-MM-DDTHH:mm.
 * This lets pending appointments be compared to "now" without interpreting
 * the stored, offset-less appointment value in the viewer's own timezone.
 */
export function easternDateTimeKey(value: string | number | Date): string {
  if (typeof value === "string") {
    const localMatch = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(value);
    if (localMatch) return localMatch[1];
  }
  const parts = easternDateTimeParts(value);
  return parts
    ? `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
    : "";
}

export function formatDateTimeEST(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDateEST(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

export function formatTimeEST(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

// Short "Mon, day" style label (used by chart/calendar cursors), still
// pinned to Eastern Time.
export function formatShortDateEST(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    timeZone: TIME_ZONE,
    month: "short",
    day: "numeric",
  });
}
