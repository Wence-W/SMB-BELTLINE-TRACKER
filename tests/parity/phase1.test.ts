// Phase 1 parity: the rebuild must produce the same lists and numbers as the
// ORIGINAL code for the same inputs (plan section 5.1, step 2).
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import historical from "../../apps/web/src/data/historicalActivity.json";
import { monthLabel, trendDirection } from "../../apps/web/src/lib/historical";
import {
  effectiveOptions,
  materializeOptions,
  type OptionRow,
  optionKey,
  planOptionChange,
} from "../../convex/lib/appointmentOptions";
import { appointmentOptions, appointmentOptionsBackend, historicalActivity } from "../../packages/parity/oracles";
import * as originalBackendOptions from "../../reference/original/convex/appointmentOptions";

// The original's built-in defaults (backend copy is what its list query used).
const ORIGINAL_DEFAULTS = {
  schedulers: [...originalBackendOptions.SCHEDULERS],
  providersByLocation: originalBackendOptions.PROVIDERS_BY_LOCATION,
};

type Override = {
  optionType: "scheduler" | "provider";
  value: string;
  location?: string;
  optionKey: string;
  active: boolean;
};

/** Faithful model of the original add/remove mutation handlers. */
function originalChange(
  overrides: Override[],
  op: { optionType: "scheduler" | "provider"; value: string; location?: string },
  active: boolean,
) {
  const value = op.value.trim();
  const location = op.location?.trim();
  const key = appointmentOptionsBackend.optionKey(op.optionType, value, location);
  const existing = overrides.find(o => o.optionKey === key);
  if (existing) Object.assign(existing, { value, location, active });
  else overrides.push({ optionType: op.optionType, value, location, optionKey: key, active });
}

/** The original list query, built from its verbatim effectiveValues(). */
function originalList(overrides: Override[]) {
  return {
    schedulers: appointmentOptionsBackend.effectiveValues(
      ORIGINAL_DEFAULTS.schedulers,
      overrides.filter(o => o.optionType === "scheduler").map(o => ({ value: o.value, active: o.active })),
    ),
    providersByLocation: Object.fromEntries(
      originalBackendOptions.CLINIC_LOCATIONS.map(location => [
        location,
        appointmentOptionsBackend.effectiveValues(
          [...(ORIGINAL_DEFAULTS.providersByLocation[location] ?? [])],
          overrides
            .filter(o => o.optionType === "provider" && o.location === location)
            .map(o => ({ value: o.value, active: o.active })),
        ),
      ]),
    ),
  };
}

function rebuildChange(
  rows: OptionRow[],
  op: { optionType: "scheduler" | "provider"; value: string; location?: string },
  active: boolean,
) {
  const key = optionKey(op.optionType, op.value, op.location?.trim());
  const existing = rows.find(r => r.optionKey === key) ?? null;
  const nextOrder = rows.reduce((max, r) => Math.max(max, r.order), -1) + 1;
  const plan = planOptionChange(existing, op, active, nextOrder);
  if (plan.kind === "patch" && existing) Object.assign(existing, plan.patch);
  else if (plan.kind === "insert") rows.push(plan.row);
}

describe("Booked Tracker options: rebuild === original", () => {
  test("the frontend and backend copies of the original defaults agree", () => {
    expect([...appointmentOptions.SCHEDULERS]).toEqual(ORIGINAL_DEFAULTS.schedulers);
    expect(appointmentOptions.PROVIDERS_BY_LOCATION).toEqual(ORIGINAL_DEFAULTS.providersByLocation);
  });

  test("migration: materialized rows give the original list for the original data", () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { maxLength: 10 }), flags => {
        // Random mix of deactivated defaults and custom overrides.
        const overrides: Override[] = [];
        ORIGINAL_DEFAULTS.schedulers.forEach((value, i) => {
          if (flags[i]) originalChange(overrides, { optionType: "scheduler", value: value.toUpperCase() }, false);
        });
        originalChange(overrides, { optionType: "provider", value: "Dr. Custom", location: "Newnan" }, true);
        const rows = materializeOptions(ORIGINAL_DEFAULTS, overrides);
        expect(effectiveOptions(rows)).toEqual(originalList(overrides));
      }),
    );
  });

  test("any sequence of admin add/remove keeps both models identical", () => {
    const pool = [
      ...ORIGINAL_DEFAULTS.schedulers,
      ...ORIGINAL_DEFAULTS.schedulers.map(s => ` ${s.toLowerCase()} `),
      "Custom One",
      "custom one",
      "Custom Two",
    ];
    // Real default names come from the original's own lists at run time, so
    // none are written into rebuild code; case variants exercise the key rules.
    const originalProviders = [...new Set(Object.values(ORIGINAL_DEFAULTS.providersByLocation).flat())];
    const providerPool = [...originalProviders, ...originalProviders.map(p => p.toLowerCase()), "Dr. New"];
    const op = fc.oneof(
      fc.record({
        optionType: fc.constant("scheduler" as const),
        value: fc.constantFrom(...pool),
        active: fc.boolean(),
      }),
      fc.record({
        optionType: fc.constant("provider" as const),
        value: fc.constantFrom(...providerPool),
        location: fc.constantFrom(...originalBackendOptions.CLINIC_LOCATIONS),
        active: fc.boolean(),
      }),
    );
    fc.assert(
      fc.property(fc.array(op, { maxLength: 30 }), ops => {
        const overrides: Override[] = [];
        const rows = materializeOptions(ORIGINAL_DEFAULTS, []);
        for (const { active, ...change } of ops) {
          originalChange(overrides, change, active);
          rebuildChange(rows, change, active);
          expect(effectiveOptions(rows)).toEqual(originalList(overrides));
        }
      }),
      { numRuns: 3_000 },
    );
  });
});

describe("Historical Activity: rebuild === original", () => {
  const data = historical as unknown as { months: { month: string }[]; categories: string[] };

  test("trend and labels on the real archive", () => {
    for (const category of data.categories) {
      expect(trendDirection(data.months as never, category)).toEqual(
        historicalActivity.trendDirection(data.months as never, category),
      );
    }
    for (const { month } of data.months) expect(monthLabel(month)).toBe(historicalActivity.monthLabel(month));
  });

  test("trend on random series, including zeros and short histories", () => {
    fc.assert(
      fc.property(fc.array(fc.nat({ max: 5_000 }), { maxLength: 12 }), values => {
        const months = values.map((n, i) => ({ month: `2025-${String((i % 12) + 1).padStart(2, "0")}`, X: n }));
        expect(trendDirection(months, "X")).toEqual(historicalActivity.trendDirection(months, "X"));
      }),
      { numRuns: 5_000 },
    );
  });
});
