// Phase 2 parity: the Billing screen's numbers and labels must equal the
// ORIGINAL BillingTab's for the same data (plan 5.2 BL-01, BL-02). The oracle
// is a verbatim copy of the original's categoryTotals / metricTotals closures
// (packages/parity/oracles/extracted/billingTab.ts).
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  BILLING_CATEGORIES,
  categoryLabel,
  categoryTotals,
  LEGACY_BILLING_LABEL,
  metricTotals,
  productivityNames,
} from "../../apps/web/src/lib/billing";
import { inDateRange, isInCurrentMonth } from "../../apps/web/src/lib/dates";
import { generateFixtures } from "../../packages/parity/fixtures";
import { billingTab, dateRangeFilter } from "../../packages/parity/oracles";

/** Same values AND the same key order (row order on screen follows key order). */
const ordered = (value: unknown) => JSON.stringify(value);

/** The original's This Month table, computed entirely by original code. */
function originalTable(
  entries: Parameters<typeof billingTab.makeBillingTotals>[0],
  metrics: Parameters<typeof billingTab.makeBillingTotals>[1],
  staffNames: string[],
  from: string,
  to: string,
) {
  const allEntries = entries.filter(e => dateRangeFilter.inDateRange(e.date, from, to));
  const { categoryTotals, metricTotals } = billingTab.makeBillingTotals(allEntries, metrics, staffNames);
  const data = categoryTotals(billingTab.isInCurrentMonth);
  const metricsByStaff = metricTotals(billingTab.isInCurrentMonth);
  return {
    data,
    metrics: metricsByStaff,
    names: Array.from(new Set([...staffNames, ...Object.keys(data), ...Object.keys(metricsByStaff)])),
  };
}

function rebuildTable(
  entries: Parameters<typeof categoryTotals>[0],
  metrics: Parameters<typeof metricTotals>[0],
  staffNames: string[],
  from: string,
  to: string,
) {
  const allEntries = entries.filter(e => inDateRange(e.date, from, to));
  const data = categoryTotals(allEntries, d => isInCurrentMonth(d));
  const metricsByStaff = metricTotals(metrics, staffNames, d => isInCurrentMonth(d));
  return { data, metrics: metricsByStaff, names: productivityNames(staffNames, data, metricsByStaff) };
}

// Dates around "now" so the current-month filter is really exercised.
const today = new Date();
const dayOffset = (n: number) => {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const date = fc.integer({ min: -70, max: 70 }).map(dayOffset);
const names = ["Ana", "Ben", "Cy", "Dee"];
// Includes rows with no category (legacy) and unknown categories. Names of
// Object.prototype members are left out: see PHASE2.md "Not reachable".
const category = fc.option(fc.constantFrom(...BILLING_CATEGORIES.map(c => c.value), "billing_tasks", "other"), {
  nil: undefined,
});
const entryArb = fc.record(
  { staff: fc.constantFrom(...names), date, category, tasksCompleted: fc.nat(6) },
  { requiredKeys: ["staff", "date", "tasksCompleted"] },
);
const metricArb = fc.record({
  staff: fc.constantFrom(...names),
  date,
  faxDocs: fc.nat(9),
  newPatientIntake: fc.nat(9),
});
const range = fc.tuple(fc.option(date, { nil: "" }), fc.option(date, { nil: "" }));

describe("Billing: rebuild === original", () => {
  test("categories and labels match the original's", () => {
    expect(BILLING_CATEGORIES).toEqual(billingTab.BILLING_CATEGORIES);
    for (const c of [...BILLING_CATEGORIES.map(x => x.value), "billing_tasks", "", undefined]) {
      const expected = c ? (billingTab.BILLING_CATEGORY_LABELS[c] ?? c) : "Legacy Billing Task";
      expect(categoryLabel(c)).toBe(expected);
    }
    expect(LEGACY_BILLING_LABEL).toBe("Legacy Billing Task");
  });

  test("This Month table: totals, Fax/NPC and row order on random data (BL-01, BL-02)", () => {
    fc.assert(
      fc.property(
        fc.array(entryArb, { maxLength: 40 }),
        fc.array(metricArb, { maxLength: 30 }),
        fc.subarray(names),
        range,
        (entries, metrics, roster, [from, to]) => {
          expect(ordered(rebuildTable(entries, metrics, roster, from, to))).toBe(
            ordered(originalTable(entries, metrics, roster, from, to)),
          );
        },
      ),
      { numRuns: 5_000 },
    );
  });

  test("an Intake person sharing no roster name is not pulled into Fax/NPC (BL-02)", () => {
    const month = dayOffset(0);
    const metrics = [
      { staff: "Ana", date: month, faxDocs: 3, newPatientIntake: 1 },
      { staff: "Intake Only", date: month, faxDocs: 9, newPatientIntake: 9 },
    ];
    const table = rebuildTable([], metrics, ["Ana"], "", "");
    expect(table.names).toEqual(["Ana"]);
    expect(table.metrics).toEqual({ Ana: { faxDocs: 3, newPatientChart: 1 } });
  });

  test("legacy rows (no category) count nowhere in the table (BL-01)", () => {
    const table = rebuildTable([{ staff: "Old", date: dayOffset(0), tasksCompleted: 5 }], [], [], "", "");
    expect(table.names).toEqual([]);
  });

  test("the synthetic fixture set gives identical tables", () => {
    for (const seed of [1, 2, 20260928]) {
      const set = generateFixtures(seed);
      const roster = set.billingStaff.map(s => s.name);
      expect(ordered(rebuildTable(set.billingEntries, set.intakeDailyMetrics, roster, "", ""))).toBe(
        ordered(originalTable(set.billingEntries, set.intakeDailyMetrics, roster, "", "")),
      );
    }
  });

  test("inDateRange and isInCurrentMonth equal the original's", () => {
    const iso = fc.oneof(
      date,
      date.map(d => `${d}T23:30:00.000Z`),
      fc.constantFrom("", null, undefined),
    );
    fc.assert(
      fc.property(iso, range, (value, [from, to]) => {
        expect(inDateRange(value, from, to)).toBe(dateRangeFilter.inDateRange(value, from, to));
      }),
      { numRuns: 5_000 },
    );
    fc.assert(
      fc.property(date, d => {
        expect(isInCurrentMonth(d)).toBe(billingTab.isInCurrentMonth(d));
      }),
    );
  });
});
