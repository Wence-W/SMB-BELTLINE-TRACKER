// Date helpers shared by the productivity screens. Each matches the original's
// helper of the same name (tests/parity/billing.test.ts).

/** Today's date as the original computed it: the UTC calendar day (see D3). */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** True when the date part of `iso` is inside [from, to]; blank ends are open. */
export function inDateRange(iso: string | undefined | null, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!iso) return false;
  const day = iso.slice(0, 10);
  return !(from && day < from) && !(to && day > to);
}

/** Same calendar month as today, in the viewer's local time zone. */
export function isInCurrentMonth(dateISO: string, today: Date = new Date()): boolean {
  const d = new Date(`${dateISO}T00:00:00`);
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
}
