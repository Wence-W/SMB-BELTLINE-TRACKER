// The Intake Log table's rows: the same filtering and order as the original
// IntakeTeamTab `logSheetEntries`. Used by the screen and by the server-side
// export, so an export always holds exactly the rows the admin was looking at.
import { categoryDirection, type IntakeDirection, isBoostCategory } from "./intakeTaxonomy";

export type IntakeLogFilters = {
  /** Single exact date ("" = any). */
  date: string;
  /** Date From / Date To (either may be ""). */
  from: string;
  to: string;
  staff: string;
  direction: "" | IntakeDirection;
};

export const NO_INTAKE_LOG_FILTERS: IntakeLogFilters = { date: "", from: "", to: "", staff: "", direction: "" };

type LogRow = { staff: string; date: string; category: string; createdAt: string };

/** True when the date part of `iso` is inside [from, to]; blank ends are open. */
export function inDateRange(iso: string | undefined | null, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!iso) return false;
  const day = iso.slice(0, 10);
  return !(from && day < from) && !(to && day > to);
}

/**
 * Boost entries are never listed (they only count in reports). Newest date
 * first, then newest logged first.
 */
export function intakeLogRows<T extends LogRow>(entries: T[], filters: IntakeLogFilters): T[] {
  const rows = entries.filter(
    e =>
      !isBoostCategory(e.category) &&
      (!filters.date || e.date === filters.date) &&
      (!(filters.from || filters.to) || inDateRange(e.date, filters.from, filters.to)) &&
      (!filters.staff || e.staff === filters.staff) &&
      (!filters.direction || categoryDirection(e.category) === filters.direction),
  );
  return rows.sort((a, b) =>
    a.date !== b.date ? b.date.localeCompare(a.date) : b.createdAt.localeCompare(a.createdAt),
  );
}

/** Export Excel's own From/To on top of the table rows (the original's filterIntakeByDateRange). */
export function filterByExportRange<T extends { date: string }>(rows: T[], from: string, to: string): T[] {
  if (!from && !to) return rows;
  return rows.filter(r => !(from && r.date < from) && !(to && r.date > to));
}
