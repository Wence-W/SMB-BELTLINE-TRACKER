// AUTO-EXTRACTED ORACLE. DO NOT EDIT.
// Verbatim copy of top-level declarations from the ORIGINAL app:
//   reference/original/src/components/productivity/BillingTab.tsx
//   sha256 0dabbb882c77116de9ad61d69277faf63a6643fe29250f4ed6e025663d2d4869
// Regenerate with: bun run packages/parity/extract-oracles.ts
/* biome-ignore-all lint: verbatim third-party copy */
import { isInCurrentMonth } from "@/lib/intakeTypes";
export { isInCurrentMonth };

const BILLING_CATEGORIES = [
  { value: "new_claims", label: "New Claims" },
  { value: "ar_aging", label: "A/R Aging" },
  { value: "emails", label: "Emails" },
  { value: "boost_billing", label: "Boost Billing" },
] as const;

const BILLING_CATEGORY_LABELS = Object.fromEntries(
  BILLING_CATEGORIES.map(category => [category.value, category.label]),
) as Record<string, string>;

type BillingCategoryTotals = Record<string, Record<string, number>>;

function makeBillingTotals(allEntries: { staff: string; date: string; category?: string; tasksCompleted: number }[], dailyMetrics: { staff: string; date: string; faxDocs: number; newPatientIntake: number }[] | undefined, staffNames: string[]) {
  function categoryTotals(filterFn: (d: string) => boolean): BillingCategoryTotals {
    const byStaff: BillingCategoryTotals = {};
    for (const e of allEntries) {
      if (!filterFn(e.date)) continue;
      if (!e.category || !BILLING_CATEGORY_LABELS[e.category]) continue;
      byStaff[e.staff] ??= {};
      byStaff[e.staff][e.category] = (byStaff[e.staff][e.category] ?? 0) + (e.tasksCompleted || 1);
    }
    return byStaff;
  }

  // Fax Docs / New Patient Chart, logged directly by Billing staff below
  // (or by an Intake Team member sharing the exact same name). Only shown
  // for staff who are actually on the Billing roster — matching against
  // ALL staff-name keys in dailyMetrics would incorrectly pull in Intake
  // Team members who happen to share a name but never did billing work.
  function metricTotals(filterFn: (d: string) => boolean) {
    const byStaff: Record<string, { faxDocs: number; newPatientChart: number }> = {};
    const rosterNames = new Set(staffNames);
    for (const m of dailyMetrics ?? []) {
      if (!filterFn(m.date)) continue;
      if (!rosterNames.has(m.staff)) continue;
      byStaff[m.staff] ??= { faxDocs: 0, newPatientChart: 0 };
      byStaff[m.staff].faxDocs += m.faxDocs;
      byStaff[m.staff].newPatientChart += m.newPatientIntake;
    }
    return byStaff;
  }
  return { categoryTotals, metricTotals };
}

export { BILLING_CATEGORIES, BILLING_CATEGORY_LABELS, makeBillingTotals };
export type { BillingCategoryTotals };
