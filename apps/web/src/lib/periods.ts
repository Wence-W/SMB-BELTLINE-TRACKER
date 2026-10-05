// Period navigation for the Intake productivity cards. Same behaviour as the
// original src/lib/intakeTypes.ts helpers, including its timezone quirk:
// getDayRange and toDateInputValue use the UTC calendar day of LOCAL
// midnight, so east of UTC they point at the previous day (plan IN-10, F1;
// kept for parity until D3). Proven against the original in
// tests/parity/intake.test.ts.
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function fmtDate(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}, ${d.getFullYear()}`;
}

export type PeriodRange = { start: Date; end: Date; label: string; inRange: (dateISO: string) => boolean };

const localMidnight = (iso: string) => new Date(`${iso}T00:00:00`);

export function getDayRange(refDate: Date): PeriodRange {
  const d = new Date(refDate);
  d.setHours(0, 0, 0, 0);
  const iso = d.toISOString().slice(0, 10);
  return { start: d, end: d, label: fmtDate(d), inRange: dateISO => dateISO === iso };
}

export function getWeekRange(refDate: Date): PeriodRange {
  const monday = new Date(refDate);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(refDate.getDate() - ((refDate.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return {
    start: monday,
    end: sunday,
    label: `${fmtDate(monday)} - ${fmtDate(sunday)}`,
    inRange: dateISO => {
      const d = localMidnight(dateISO);
      return d >= monday && d <= sunday;
    },
  };
}

export function getMonthRange(refDate: Date): PeriodRange {
  const first = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  const last = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
  last.setHours(23, 59, 59, 999);
  return {
    start: first,
    end: last,
    label: `${fmtDate(first)} - ${fmtDate(last)}`,
    inRange: dateISO => {
      const d = localMidnight(dateISO);
      return d >= first && d <= last;
    },
  };
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
export const addWeeks = (d: Date, n: number) => addDays(d, n * 7);
export function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}
export const toDateInputValue = (d: Date) => d.toISOString().slice(0, 10);
export const fromDateInputValue = (v: string) => localMidnight(v);
