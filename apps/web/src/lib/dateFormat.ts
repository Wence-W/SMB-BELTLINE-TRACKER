// Eastern Time display helpers, identical to the original src/lib/dateFormat.ts
// formatDateTimeEST / formatDateEST: every screen shows Eastern time whatever
// the viewer's own timezone.
const TIME_ZONE = "America/New_York";

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
  return d.toLocaleDateString("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "numeric", day: "numeric" });
}
