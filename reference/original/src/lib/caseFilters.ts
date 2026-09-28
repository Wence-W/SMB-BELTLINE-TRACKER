// Shared case filter/sort logic — used by the on-screen FilterBar tables
// and by the Export dialog (Wence, 2026-09-24: export follows filters).
import { inDateRange } from "@/components/DateRangeFilter";
import type { BariCase, FilterState } from "@/lib/types";

export function applyFilters(cases: BariCase[], filters: FilterState): BariCase[] {
  let result = [...cases];

  if (filters.search.trim()) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      c =>
        c.patientId.toLowerCase().includes(q) ||
        (c.dos ?? "").toLowerCase().includes(q) ||
        (c.expirationDate ?? "").toLowerCase().includes(q) ||
        c.notes.toLowerCase().includes(q) ||
        (c.insuranceProvider ?? "").toLowerCase().includes(q) ||
        (c.authorizationNumber ?? "").toLowerCase().includes(q),
    );
  }

  if (filters.dateFrom || filters.dateTo) {
    result = result.filter(c =>
      inDateRange(c.createdAt, filters.dateFrom, filters.dateTo),
    );
  }

  if (filters.caseType !== "all")
    result = result.filter(c => c.caseType === filters.caseType);
  if (filters.status !== "all")
    result = result.filter(c => c.status === filters.status);
  if (filters.authStatus !== "all")
    result = result.filter(c => c.authStatus === filters.authStatus);
  if (filters.assignedTo !== "all")
    result = result.filter(c => c.assignedTo === filters.assignedTo);
  if (filters.priority !== "all")
    result = result.filter(c => c.priority === filters.priority);

  result.sort((a, b) => {
    const { sortField, sortDirection } = filters;
    const av = a[sortField] ?? "";
    const bv = b[sortField] ?? "";
    const cmp = String(av).localeCompare(String(bv));
    return sortDirection === "asc" ? cmp : -cmp;
  });

  return result;
}

