// Phase 3 parity: the Intake screens' lists and numbers must equal the
// ORIGINAL IntakeTeamTab's for the same data (plan 5.2 IN-01, IN-04, IN-05,
// IN-08, IN-09, IN-10). The oracle is a verbatim copy of the original
// component's own logic (packages/parity/oracles/extracted/intakeTeamTab.ts).
import fc from "fast-check";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, test } from "vitest";
import { intakeExportRows, piedmontExportRows } from "../../apps/web/src/lib/intakeExport";
import { activityReport, METRIC_FIELDS, rawEntryRows, summarize } from "../../apps/web/src/lib/intakeReports";
import * as periods from "../../apps/web/src/lib/periods";
import { buildXlsx } from "../../apps/web/src/lib/xlsx";
import {
  BOOST_CATEGORY_VALUES,
  INTAKE_CATEGORIES,
  INTAKE_RESULTS,
  LEGACY_INTAKE_CATEGORIES,
} from "../../convex/lib/enums";
import { intakeLogRows } from "../../convex/lib/intakeLog";
import * as taxonomy from "../../convex/lib/intakeTaxonomy";
import { exportUtils, intakeTeamTab, intakeTypes } from "../../packages/parity/oracles";

const ordered = (value: unknown) => JSON.stringify(value);

// The original's excluded name is read from the oracle, so it isn't in rebuild code.
const ORIGINAL_EXCLUDED = makeOracle([], []).EXCLUDED_STAFF_NAMES;
const STAFF = ["Ana", "Ben", ...ORIGINAL_EXCLUDED];
const DATES = ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-07", "2026-10-01"];
const ALL_CATEGORIES = [...INTAKE_CATEGORIES, ...LEGACY_INTAKE_CATEGORIES, "unknown_category"];

function makeOracle(
  entries: Parameters<typeof intakeTeamTab.makeIntakeTab>[0],
  metrics: Parameters<typeof intakeTeamTab.makeIntakeTab>[1],
  f: Partial<Record<string, string>> = {},
) {
  return intakeTeamTab.makeIntakeTab(
    entries,
    metrics,
    f.logSheetDateFilter ?? "",
    f.logSheetFrom ?? "",
    f.logSheetTo ?? "",
    f.logSheetStaffFilter ?? "",
    (f.logSheetDirectionFilter ?? "") as "",
    f.logDateFilter ?? "",
    f.logFrom ?? "",
    f.logTo ?? "",
    f.reportStaff ?? "",
    f.reportDateFilter ?? "",
    f.reportFrom ?? "",
    f.reportTo ?? "",
  );
}

let seq = 0;
const entryArb = fc
  .record({
    staff: fc.constantFrom(...STAFF),
    date: fc.constantFrom(...DATES),
    direction: fc.constantFrom("inbound", "outbound"),
    category: fc.constantFrom(...ALL_CATEGORIES),
    result: fc.option(fc.constantFrom(...INTAKE_RESULTS, ""), { nil: undefined }),
    count: fc.nat(5),
    createdAt: fc.integer({ min: 0, max: 50 }).map(n => `2026-09-01T00:${String(n).padStart(2, "0")}:00.000Z`),
  })
  .map(e => ({ ...e, _id: `e${seq++}` }));
const metricArb = fc
  .record({
    staff: fc.constantFrom(...STAFF),
    date: fc.constantFrom(...DATES),
    emailsSent: fc.nat(3),
    ghlChats: fc.nat(3),
    newPatientIntake: fc.nat(3),
    callAudits: fc.nat(3),
    faxDocs: fc.nat(3),
  })
  .map(m => ({ ...m, _id: `m${seq++}` }));
const maybeDate = fc.constantFrom("", ...DATES, "2026-09-0"); // includes a malformed filter
const filtersArb = fc.record({
  date: maybeDate,
  from: maybeDate,
  to: maybeDate,
  staff: fc.constantFrom("", ...STAFF),
  direction: fc.constantFrom("" as const, "inbound" as const, "outbound" as const),
  reportStaff: fc.constantFrom("", ...STAFF),
  reportDate: maybeDate,
});

describe("Intake taxonomy equals the original intakeTypes", () => {
  test("categories, results, buckets, Boost and labels", () => {
    expect(taxonomy.INTAKE_CATEGORY_OPTIONS).toEqual(intakeTypes.INTAKE_CATEGORIES);
    expect(taxonomy.ACTIVE_INTAKE_CATEGORY_OPTIONS).toEqual(intakeTypes.ACTIVE_INTAKE_CATEGORIES);
    expect(taxonomy.INBOUND_RESULTS).toEqual(intakeTypes.INBOUND_RESULTS);
    expect(taxonomy.OUTBOUND_RESULTS).toEqual(intakeTypes.OUTBOUND_RESULTS);
    expect(taxonomy.INBOUND_CATEGORY_BUCKETS).toEqual(intakeTypes.INBOUND_CATEGORY_BUCKETS);
    expect(taxonomy.OUTBOUND_CATEGORY_BUCKETS).toEqual(intakeTypes.OUTBOUND_CATEGORY_BUCKETS);
    expect([...taxonomy.BOOST_CATEGORIES]).toEqual([...intakeTypes.BOOST_CATEGORIES]);
    expect([...METRIC_FIELDS]).toEqual([...intakeTeamTab.METRIC_FIELDS]);
    for (const v of [...ALL_CATEGORIES, ""]) expect(taxonomy.categoryLabel(v)).toBe(intakeTypes.categoryLabel(v));
    for (const v of [...INTAKE_RESULTS, "", undefined, "other"])
      expect(taxonomy.resultLabel(v)).toBe(intakeTypes.resultLabel(v));
    // The server's validators accept exactly the original's values.
    expect([...INTAKE_CATEGORIES]).toEqual(intakeTypes.ACTIVE_INTAKE_CATEGORIES.map(c => c.value));
    expect([...LEGACY_INTAKE_CATEGORIES]).toEqual(
      intakeTypes.INTAKE_CATEGORIES.filter(c => c.deprecated).map(c => c.value),
    );
    expect(new Set(INTAKE_RESULTS)).toEqual(
      new Set([...intakeTypes.INBOUND_RESULTS, ...intakeTypes.OUTBOUND_RESULTS].map(r => r.value)),
    );
    expect([...BOOST_CATEGORY_VALUES]).toEqual([...intakeTypes.BOOST_CATEGORIES]);
  });
});

describe("Intake screens: rebuild === original", () => {
  test("Intake Log rows, Raw Entries, productivity and Activity Reports on random data", () => {
    fc.assert(
      fc.property(
        fc.array(entryArb, { maxLength: 30 }),
        fc.array(metricArb, { maxLength: 15 }),
        filtersArb,
        fc.subarray(DATES),
        (entries, metrics, f, periodDates) => {
          const oracle = makeOracle(entries, metrics, {
            logSheetDateFilter: f.date,
            logSheetFrom: f.from,
            logSheetTo: f.to,
            logSheetStaffFilter: f.staff,
            logSheetDirectionFilter: f.direction,
            logDateFilter: f.date,
            logFrom: f.from,
            logTo: f.to,
            reportStaff: f.reportStaff,
            reportDateFilter: f.reportDate,
            reportFrom: f.from,
            reportTo: f.to,
          });
          // Intake Log (IN-05): Boost excluded, filters, order.
          const logRows = intakeLogRows(entries, {
            date: f.date,
            from: f.from,
            to: f.to,
            staff: f.staff,
            direction: f.direction,
          });
          expect(logRows.map(e => e._id)).toEqual(oracle.logSheetEntries.map(e => e._id));
          // Raw Entries (IN-04): one row per non-zero metric.
          const raw = rawEntryRows(metrics, { date: f.date, from: f.from, to: f.to });
          expect(ordered(raw)).toBe(ordered(oracle.filteredLog.map(({ kind: _kind, ...r }) => r)));
          // Productivity cards (IN-01, IN-08): any period.
          const inPeriod = (d: string) => periodDates.includes(d);
          expect(ordered(summarize(entries, metrics, ORIGINAL_EXCLUDED, inPeriod))).toBe(
            ordered(oracle.summarize(inPeriod)),
          );
          // Activity Reports (IN-09).
          const report = activityReport(
            entries,
            metrics,
            { staff: f.reportStaff, date: f.reportDate, from: f.from, to: f.to },
            ORIGINAL_EXCLUDED,
          );
          expect(ordered(report.range)).toBe(ordered(oracle.reportDateRange));
          expect(ordered(report.inboundCategory)).toBe(ordered(oracle.inboundCategory));
          expect(ordered(report.outboundCategory)).toBe(ordered(oracle.outboundCategory));
          expect(ordered(report.inboundResult)).toBe(ordered(oracle.inboundResult));
          expect(ordered(report.outboundResult)).toBe(ordered(oracle.outboundResult));
          expect(ordered(report.adminTaskRows)).toBe(ordered(oracle.adminTaskRows));
          expect(report.adminTaskTotal).toBe(oracle.adminTaskTotal);
        },
      ),
      { numRuns: 3_000 },
    );
  });

  test("IN-01: one entry with count 5 is one log row and counts 5 in every report", () => {
    const e = {
      _id: "x",
      staff: "Ana",
      date: "2026-09-01",
      direction: "inbound",
      category: "inquiries",
      count: 5,
      createdAt: "t",
    };
    expect(intakeLogRows([e], { date: "", from: "", to: "", staff: "", direction: "" })).toHaveLength(1);
    expect(summarize([e], [], [], () => true).Ana.inbound).toBe(5);
    expect(activityReport([e], [], { staff: "", date: "", from: "", to: "" }, []).inboundCategory.total).toBe(5);
  });

  test("IN-09: Boost rows in the Admin Task table ignore the staff picker", () => {
    const boost = {
      _id: "b",
      staff: "Ben",
      date: "2026-09-01",
      direction: "outbound",
      category: "boost_booked",
      count: 2,
      createdAt: "t",
    };
    const report = activityReport([boost], [], { staff: "Ana", date: "", from: "", to: "" }, []);
    expect(report.adminTaskRows.find(r => r.label === "Boost Booked Appt")?.count).toBe(2);
    expect(report.outboundCategory.total).toBe(0);
  });
});

describe("Period navigation equals the original (incl. the IN-10 timezone behaviour)", () => {
  const refDate = fc.date({
    min: new Date("2025-01-01T00:00:00Z"),
    max: new Date("2027-12-31T00:00:00Z"),
    noInvalidDate: true,
  });
  test("day/week/month ranges, labels and stepping under the current TZ", () => {
    const probes = ["2026-02-28", "2026-03-01", "2026-09-06", "2026-09-07", "2026-09-13", "2026-09-14", "2026-12-31"];
    fc.assert(
      fc.property(refDate, fc.integer({ min: -3, max: 3 }), (ref, n) => {
        for (const [mine, theirs] of [
          [periods.getDayRange(ref), intakeTypes.getDayRange(ref)],
          [periods.getWeekRange(ref), intakeTypes.getWeekRange(ref)],
          [periods.getMonthRange(ref), intakeTypes.getMonthRange(ref)],
        ] as const) {
          expect(mine.label).toBe(theirs.label);
          expect(mine.start.getTime()).toBe(theirs.start.getTime());
          expect(mine.end.getTime()).toBe(theirs.end.getTime());
          for (const p of probes) expect(mine.inRange(p)).toBe(theirs.inRange(p));
        }
        expect(periods.addDays(ref, n).getTime()).toBe(intakeTypes.addDays(ref, n).getTime());
        expect(periods.addWeeks(ref, n).getTime()).toBe(intakeTypes.addWeeks(ref, n).getTime());
        expect(periods.addMonths(ref, n).getTime()).toBe(intakeTypes.addMonths(ref, n).getTime());
        expect(periods.toDateInputValue(ref)).toBe(intakeTypes.toDateInputValue(ref));
      }),
      { numRuns: 2_000 },
    );
    for (const p of probes)
      expect(periods.fromDateInputValue(p).getTime()).toBe(intakeTypes.fromDateInputValue(p).getTime());
  });
});

describe("Exports equal the original columns", () => {
  test("Intake Log and Piedmont: Epic rows", () => {
    const intakeRows = [
      {
        patientId: "SYN-000001",
        staff: "Ana",
        category: "inquiries",
        result: "provided_info",
        notes: "n",
        date: "2026-09-01",
        createdAt: "2026-09-02T03:30:00.000Z",
      },
      { staff: "Ben", category: "voicemail_no_answer", date: "2026-09-01", createdAt: "" },
    ];
    expect(intakeExportRows(intakeRows)).toEqual([
      exportUtils.INTAKE_EXPORT_HEADERS,
      ...intakeRows.map(r => exportUtils.intakeRowToArray(r)),
    ]);
    const referrals = [
      { date: "2026-09-01", refId: "R1", mrNumber: "MR1", chart: "C", toProvider: "P", referringProvider: "Q" },
    ];
    expect(piedmontExportRows(referrals)).toEqual([
      exportUtils.PIEDMONT_EPIC_EXPORT_HEADERS,
      ...referrals.map(r => exportUtils.piedmontEpicRowToArray(r)),
    ]);
  });

  test("the .xlsx holds the text as inline strings and never as formulas", () => {
    const files = unzipSync(
      buildXlsx("Intake Log", [
        ["Patient ID", "Notes"],
        ["SYN-1", '=HYPERLINK("x") & <b>\u0001'],
      ]),
    );
    expect(Object.keys(files).sort()).toEqual(
      [
        "[Content_Types].xml",
        "_rels/.rels",
        "xl/_rels/workbook.xml.rels",
        "xl/workbook.xml",
        "xl/worksheets/sheet1.xml",
      ].sort(),
    );
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain("=HYPERLINK(&quot;x&quot;) &amp; &lt;b&gt;</t>");
    expect(sheet).toContain('<col min="1" max="1" width="18" customWidth="1"/>');
    expect(strFromU8(files["xl/workbook.xml"])).toContain('name="Intake Log"');
  });
});

describe("IN-10: Daily Productivity as seen from UTC+8 (parity, pending D3)", () => {
  test("from Manila, the day card for Mon Sep 14 counts Sun Sep 13's activity, in both apps", () => {
    const saved = process.env.TZ;
    process.env.TZ = "Asia/Manila";
    try {
      const ref = new Date(2026, 8, 14, 10, 0); // 10:00 local on Monday Sep 14
      for (const range of [periods.getDayRange(ref), intakeTypes.getDayRange(ref)]) {
        expect(range.label).toBe("September 14, 2026");
        expect(range.inRange("2026-09-13")).toBe(true);
        expect(range.inRange("2026-09-14")).toBe(false);
      }
      expect(periods.toDateInputValue(periods.fromDateInputValue("2026-09-14"))).toBe("2026-09-13");
    } finally {
      process.env.TZ = saved;
    }
  });
});
