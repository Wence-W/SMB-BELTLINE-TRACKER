import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import * as enums from "../../convex/lib/enums";
import { render, TARGETS } from "../../packages/parity/extract-oracles";
import {
  FIXTURE_BILLING_STAFF,
  FIXTURE_INTAKE_STAFF,
  FIXTURE_STAFF,
  generateFixtures,
} from "../../packages/parity/fixtures";
import { appointmentOptions, intakeTypes } from "../../packages/parity/oracles";

describe("fixture generator", () => {
  test("is deterministic for a seed and varies across seeds", () => {
    expect(generateFixtures(7)).toEqual(generateFixtures(7));
    expect(generateFixtures(7).cases).not.toEqual(generateFixtures(8).cases);
  });

  test("produces synthetic data only (no real-looking identifiers)", () => {
    const set = generateFixtures(20260928);
    const text = JSON.stringify(set);
    for (const id of text.match(/"patientId":"[^"]*"/g) ?? []) {
      expect(id).toMatch(/^"patientId":"SYN-\d{6}"$/);
    }
    for (const email of text.match(/[\w.+-]+@[\w.-]+/g) ?? []) {
      expect(email.endsWith("@example.invalid")).toBe(true);
    }
    const allowed = new Set<string>([...FIXTURE_STAFF, ...FIXTURE_INTAKE_STAFF, ...FIXTURE_BILLING_STAFF]);
    for (const c of set.cases) {
      expect(allowed.has(c.assignedTo)).toBe(true);
      for (const n of c.noteLog ?? []) if (n.addedBy) expect(allowed.has(n.addedBy)).toBe(true);
    }
  });
});

describe("extracted oracles", () => {
  test.each(TARGETS)("$out is a current verbatim copy of its source", target => {
    const onDisk = readFileSync(
      join(import.meta.dirname, "../../packages/parity/oracles/extracted", target.out),
      "utf8",
    );
    expect(onDisk, "run: bun run extract-oracles").toBe(render(target));
  });
});

describe("rebuild enums match the original's option lists", () => {
  test("intake categories (current + legacy)", () => {
    const original = intakeTypes.INTAKE_CATEGORIES.map(c => c.value).sort();
    expect([...enums.INTAKE_CATEGORIES, ...enums.LEGACY_INTAKE_CATEGORIES].sort()).toEqual(original);
  });

  test("intake results", () => {
    const original = [
      ...new Set([...intakeTypes.INBOUND_RESULTS, ...intakeTypes.OUTBOUND_RESULTS].map(r => r.value)),
    ].sort();
    expect([...enums.INTAKE_RESULTS].sort()).toEqual(original);
  });

  test("boost categories are a subset of the rebuild's categories", () => {
    for (const c of intakeTypes.BOOST_CATEGORIES) expect(enums.INTAKE_CATEGORIES).toContain(c);
  });

  test("appointment sources, statuses and clinics", () => {
    expect([...enums.APPOINTMENT_SOURCES]).toEqual([...appointmentOptions.SOURCES]);
    expect([...enums.APPOINTMENT_STATUSES]).toEqual([...appointmentOptions.STATUSES]);
    expect([...enums.CLINIC_LOCATIONS]).toEqual([...appointmentOptions.CLINIC_LOCATIONS]);
  });
});
