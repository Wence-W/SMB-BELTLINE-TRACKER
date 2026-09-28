// Runs the ORIGINAL Pre-Cert credit helpers (verbatim extracted oracles)
// against the pinned landmine fixtures. These assertions pin today's
// behaviour as the parity baseline the Phase 6 rebuild must reproduce
// (plan section 5.2, PC-01..PC-11 and SP-01).
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { pinnedCases } from "../../packages/parity/fixtures";
import { intakeTypes, reportsTab, staffProductivity } from "../../packages/parity/oracles";

const byId = Object.fromEntries(pinnedCases().map(c => [c.patientId, c]));
const events = (id: string) => staffProductivity.precertOngoingEvents(byId[id]);

describe("precertOngoingEvents (original behaviour)", () => {
  test("PC-01: initial note credited only when creator = assignee", () => {
    expect(events("SYN-900001")).toEqual([{ date: "2026-09-07", staff: "Alex" }]);
    expect(events("SYN-900002")).toEqual([]);
  });

  test("PC-02: three same-day notes are three credits, not one", () => {
    expect(events("SYN-900003")).toEqual([
      { date: "2026-09-08", staff: "Blair" },
      { date: "2026-09-08", staff: "Blair" },
      { date: "2026-09-08", staff: "Blair" },
    ]);
  });

  test("PC-11: credit date is the UTC date (23:30 Eastern lands on the next day)", () => {
    expect(events("SYN-900009")).toContainEqual({ date: "2026-10-06", staff: "Blair" });
  });

  test("the Staff Productivity and Reports copies agree (the original's own MUST-be-identical rule)", () => {
    const note = fc.record({
      id: fc.string(),
      text: fc.string(),
      addedAt: fc
        .date({ min: new Date("2026-01-01"), max: new Date("2026-12-31"), noInvalidDate: true })
        .map(d => d.toISOString()),
      addedBy: fc.option(fc.constantFrom("Alex", "Blair", "Casey"), { nil: undefined }),
    });
    const iso = fc
      .date({ min: new Date("2026-01-01"), max: new Date("2026-12-31"), noInvalidDate: true })
      .map(d => d.toISOString());
    const rawCase = fc.record({
      caseType: fc.constantFrom("precert_bari", "initial_consult"),
      status: fc.constantFrom("new", "in_progress", "completed"),
      assignedTo: fc.constantFrom("Alex", "Blair"),
      createdAt: iso,
      createdBy: fc.option(fc.constantFrom("Alex", "Blair"), { nil: undefined }),
      notes: fc.option(fc.constantFrom("", "  ", "Initial"), { nil: undefined }),
      noteLog: fc.option(fc.array(note, { maxLength: 5 }), { nil: undefined }),
      notesUpdatedAt: fc.option(iso, { nil: undefined }),
      notesUpdatedBy: fc.option(fc.constantFrom("Alex", "Casey"), { nil: undefined }),
    });
    fc.assert(
      fc.property(rawCase, c => {
        expect(reportsTab.precertOngoingEvents(c)).toEqual(staffProductivity.precertOngoingEvents(c));
      }),
      { numRuns: 10_000 },
    );
  });
});

describe("buildDayColumns (original behaviour)", () => {
  // Holds for viewers at or west of UTC only; see the FINDING below for UTC+8.
  test.each(["UTC", "America/New_York"])(
    "SP-01: never emits a Saturday or Sunday column, and emits every weekday (%s)",
    tz => {
      const previous = process.env.TZ;
      process.env.TZ = tz;
      try {
        fc.assert(
          fc.property(
            fc.date({ min: new Date("2025-01-01"), max: new Date("2027-12-31"), noInvalidDate: true }),
            fc.integer({ min: 0, max: 62 }),
            (start, span) => {
              const startDay = new Date(start);
              startDay.setHours(0, 0, 0, 0);
              const end = new Date(startDay);
              end.setDate(end.getDate() + span);
              const range = { start: startDay, end, label: "", inRange: () => true };
              const columns = staffProductivity.buildDayColumns(range as never);
              let weekdays = 0;
              for (const d = new Date(startDay); d <= end; d.setDate(d.getDate() + 1)) {
                if (d.getDay() !== 0 && d.getDay() !== 6) weekdays++;
              }
              expect(columns).toHaveLength(weekdays);
              for (const column of columns) {
                const day = intakeTypes.fromDateInputValue(column.date).getDay();
                expect(day === 0 || day === 6).toBe(false);
              }
            },
          ),
          { numRuns: 2_000 },
        );
      } finally {
        process.env.TZ = previous;
      }
    },
  );

  // FINDING (Phase 0): column dates come from toDateInputValue(), which is a
  // UTC ISO slice, while the weekday test and labels use the viewer's local
  // calendar. East of UTC every column's DATA is the previous day: a
  // Philippines-based viewer sees Sun..Thu activity under Mon..Fri labels,
  // Friday's activity never shows, and Sunday's does. Pinned as parity
  // baseline; fixing it is plan decision D3.
  test.each([
    ["UTC", "Sep 7:2026-09-07|Sep 8:2026-09-08|Sep 9:2026-09-09|Sep 10:2026-09-10|Sep 11:2026-09-11"],
    ["America/New_York", "Sep 7:2026-09-07|Sep 8:2026-09-08|Sep 9:2026-09-09|Sep 10:2026-09-10|Sep 11:2026-09-11"],
    ["Asia/Manila", "Sep 7:2026-09-06|Sep 8:2026-09-07|Sep 9:2026-09-08|Sep 10:2026-09-09|Sep 11:2026-09-10"],
  ])("week of 2026-09-07 as seen from %s", (tz, expected) => {
    const previous = process.env.TZ;
    process.env.TZ = tz;
    try {
      const range = intakeTypes.getWeekRange(new Date(2026, 8, 9, 12));
      const columns = staffProductivity.buildDayColumns(range).map(d => `${d.label}:${d.date}`);
      expect(columns.join("|")).toBe(expected);
    } finally {
      process.env.TZ = previous;
    }
  });
});
