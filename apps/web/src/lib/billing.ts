// Billing tab computations (rebuild). Must produce the same output as the
// original BillingTab's categoryTotals / metricTotals and labels; proven by
// tests/parity/billing.test.ts against verbatim copies of the original code.
import { BILLING_CATEGORIES as CATEGORY_VALUES } from "../../../../convex/lib/enums";

const LABELS: Record<(typeof CATEGORY_VALUES)[number], string> = {
  new_claims: "New Claims",
  ar_aging: "A/R Aging",
  emails: "Emails",
  boost_billing: "Boost Billing",
};

export const BILLING_CATEGORIES = CATEGORY_VALUES.map(value => ({ value, label: LABELS[value] }));

export const LEGACY_BILLING_LABEL = "Legacy Billing Task";

function isKnownCategory(category: string | undefined): category is keyof typeof LABELS {
  return category !== undefined && Object.hasOwn(LABELS, category);
}

/** Log table label: the category's name, the raw value if unknown, or the legacy label if none. */
export function categoryLabel(category: string | undefined): string {
  if (!category) return LEGACY_BILLING_LABEL;
  return isKnownCategory(category) ? LABELS[category] : category;
}

type Entry = { staff: string; date: string; category?: string; tasksCompleted: number };
type Metric = { staff: string; date: string; faxDocs: number; newPatientIntake: number };
type DayFilter = (date: string) => boolean;

/** Staff -> category -> Σ count. Rows with no or an unknown category are left out. */
export function categoryTotals(entries: Entry[], inPeriod: DayFilter): Record<string, Record<string, number>> {
  const byStaff: Record<string, Record<string, number>> = {};
  for (const e of entries) {
    if (!inPeriod(e.date) || !isKnownCategory(e.category)) continue;
    byStaff[e.staff] ??= {};
    const row = byStaff[e.staff];
    row[e.category] = (row[e.category] ?? 0) + (e.tasksCompleted || 1);
  }
  return byStaff;
}

/**
 * Fax Docs / New Patient Chart per staff name, counting ONLY names on the
 * Billing roster (an Intake person with the same name is not pulled in).
 */
export function metricTotals(
  metrics: Metric[],
  rosterNames: string[],
  inPeriod: DayFilter,
): Record<string, { faxDocs: number; newPatientChart: number }> {
  const roster = new Set(rosterNames);
  const byStaff: Record<string, { faxDocs: number; newPatientChart: number }> = {};
  for (const m of metrics) {
    if (!inPeriod(m.date) || !roster.has(m.staff)) continue;
    byStaff[m.staff] ??= { faxDocs: 0, newPatientChart: 0 };
    const row = byStaff[m.staff];
    row.faxDocs += m.faxDocs;
    row.newPatientChart += m.newPatientIntake;
  }
  return byStaff;
}

/** Row order of the This Month table: roster first, then other names as they first appear. */
export function productivityNames(rosterNames: string[], ...totals: Record<string, unknown>[]): string[] {
  return Array.from(new Set([...rosterNames, ...totals.flatMap(t => Object.keys(t))]));
}
