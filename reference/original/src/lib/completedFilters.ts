import type { BariCase, CaseType, Priority, SortDirection, SortField } from "./types";
import type { Task } from "./taskTypes";

function matchesText(fields: (string | undefined)[], search: string): boolean {
  const query = search.trim().toLowerCase();
  return !query || fields.some(value => (value ?? "").toLowerCase().includes(query));
}

export function matchesCompletedCase(
  c: BariCase,
  search: string,
  staff: string,
  caseType: CaseType | "all" = "all",
  priority: Priority | "all" = "all",
): boolean {
  return (staff === "all" || c.assignedTo === staff) &&
    (caseType === "all" || c.caseType === caseType) &&
    (priority === "all" || c.priority === priority) &&
    matchesText(
      [c.patientId, c.notes, c.dos, c.expirationDate, c.insuranceProvider, c.authorizationNumber],
      search,
    );
}

/** Sorts the Completed tab's Matching Cases list (Wence, 2026-09-24: reuse
 *  the same Case Type / Priority / Sort controls from the Cases FilterBar). */
export function sortCompletedCases(
  cases: BariCase[],
  sortField: SortField,
  sortDirection: SortDirection,
): BariCase[] {
  const dir = sortDirection === "asc" ? 1 : -1;
  return [...cases].sort((a, b) => {
    const av = (a[sortField as keyof BariCase] ?? "") as string;
    const bv = (b[sortField as keyof BariCase] ?? "") as string;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

export function matchesCompletedTask(t: Task, search: string, staff: string): boolean {
  return (staff === "all" || t.assignedTo === staff) &&
    matchesText([t.title, t.notes], search);
}
