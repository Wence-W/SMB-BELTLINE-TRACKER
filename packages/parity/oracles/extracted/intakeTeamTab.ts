// AUTO-EXTRACTED ORACLE. DO NOT EDIT.
// Verbatim copy of top-level declarations from the ORIGINAL app:
//   reference/original/src/components/productivity/IntakeTeamTab.tsx
//   sha256 5551441833b8625d6d989aec67cfd8a72a89a1be103373ec135f61dd458aa1cc
// Regenerate with: bun run packages/parity/extract-oracles.ts
/* biome-ignore-all lint: verbatim third-party copy */
import { inDateRange } from "./dateRangeFilter";
import {
  BOOST_CATEGORIES,
  INBOUND_CATEGORY_BUCKETS,
  INTAKE_CATEGORIES,
  OUTBOUND_CATEGORY_BUCKETS,
  categoryLabel,
  resultOptionsForDirection,
  type IntakeDirection,
} from "@/lib/intakeTypes";
type OracleEntry = {
  _id: string; staff: string; date: string; direction: string; category: string; result?: string;
  count: number; notes?: string; createdAt: string; patientId?: string;
};
type OracleMetric = {
  _id: string; staff: string; date: string; emailsSent: number; ghlChats: number;
  newPatientIntake: number; callAudits: number; faxDocs: number;
};

const METRIC_FIELDS = [
  ["emailsSent", "Emails Sent"],
  ["ghlChats", "GHL Chats"],
  ["newPatientIntake", "New Patient Chart"],
  ["callAudits", "Call Audits"],
  ["faxDocs", "Fax Docs"],
] as const;

type MetricKey = (typeof METRIC_FIELDS)[number][0];

function makeIntakeTab(allEntries: OracleEntry[], allMetrics: OracleMetric[], logSheetDateFilter: string, logSheetFrom: string, logSheetTo: string, logSheetStaffFilter: string, logSheetDirectionFilter: "" | IntakeDirection, logDateFilter: string, logFrom: string, logTo: string, reportStaff: string, reportDateFilter: string, reportFrom: string, reportTo: string) {
  // Stand-ins for React hooks: compute the value once, as one render would.
  const useMemo = <T,>(compute: () => T, _deps: unknown[]): T => compute();
  const useCallback = <T,>(callback: T, _deps: unknown[]): T => callback;
  const logSheetEntries = useMemo(() => {
    // Boost entries (Booked/No Show/Cancelled Appt) are tracked only in the
    // Admin Task workstream (Reports > Boost column) — hide them from the
    // Intake Log spreadsheet itself (Wence, 2026-07-28).
    let rows = allEntries.filter(e => !BOOST_CATEGORIES.includes(e.category));
    if (logSheetDateFilter) rows = rows.filter(e => e.date === logSheetDateFilter);
    if (logSheetFrom || logSheetTo)
      rows = rows.filter(e => inDateRange(e.date, logSheetFrom, logSheetTo));
    if (logSheetStaffFilter) rows = rows.filter(e => e.staff === logSheetStaffFilter);
    if (logSheetDirectionFilter)
      rows = rows.filter(e => {
        const dir = INTAKE_CATEGORIES.find(c => c.value === e.category)?.direction ?? "inbound";
        return dir === logSheetDirectionFilter;
      });
    // Newest first, grouped implicitly by sorting on date (then createdAt).
    return [...rows].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [allEntries, logSheetDateFilter, logSheetFrom, logSheetTo, logSheetStaffFilter, logSheetDirectionFilter]);

  type StaffSummary = {
    consult: number;
    followUp: number;
    inbound: number;
    outbound: number;
    boost: number;
    admin: number;
    total: number;
  };

  // Jenn isn't an Intake Team member (no longer in the staff roster) but has
  // legacy Daily Metrics logged under her name, which kept surfacing a
  // "Jenn" row in Weekly/Monthly Productivity below. Excluded from this
  // team's productivity view per Wence (2026-07-21) — Jenn's own
  // Daily-Metrics entries are untouched, just hidden from this summary.
  const EXCLUDED_STAFF_NAMES = ["Jenn"];

  function summarize(filterFn: (dateISO: string) => boolean): Record<string, StaffSummary> {
    const byStaff: Record<string, StaffSummary> = {};
    const blank = (): StaffSummary => ({
      consult: 0,
      followUp: 0,
      inbound: 0,
      outbound: 0,
      boost: 0,
      admin: 0,
      total: 0,
    });
    for (const e of allEntries) {
      if (!filterFn(e.date)) continue;
      if (EXCLUDED_STAFF_NAMES.includes(e.staff)) continue;
      byStaff[e.staff] ??= blank();
      const cat = INTAKE_CATEGORIES.find(c => c.value === e.category);
      if (
        e.result === "booked_consult_appt" ||
        e.category === "booked_new" ||
        e.category === "booked_new_outbound" ||
        e.category === "booked_veins" ||
        e.category === "booked_veins_outbound"
      ) {
        byStaff[e.staff].consult += e.count;
      } else if (
        e.result === "booked_fu_appt" ||
        e.category === "booked_followup" ||
        e.category === "booked_followup_outbound"
      ) {
        byStaff[e.staff].followUp += e.count;
      } else if (BOOST_CATEGORIES.includes(e.category)) {
        byStaff[e.staff].boost += e.count;
      } else if (cat?.direction === "outbound") {
        byStaff[e.staff].outbound += e.count;
      } else {
        byStaff[e.staff].inbound += e.count;
      }
      byStaff[e.staff].total += e.count;
    }
    // Daily Metrics (Emails/Chats/New Patient Chart/Call Audits/Fax Docs)
    // are also real Intake productivity — staff who only log metrics (no
    // category counts, e.g. Rose) were disappearing from these cards
    // entirely until this counted them too (fixed 2026-07-17). Kept as its
    // own "Admin" column (2026-07-17 fix per Wence: these were wrongly
    // folded into "Boost" before, inflating Boost for staff who only do
    // admin tasks and never log actual Boost calls, e.g. Rose).
    for (const m of allMetrics) {
      if (!filterFn(m.date)) continue;
      if (EXCLUDED_STAFF_NAMES.includes(m.staff)) continue;
      byStaff[m.staff] ??= blank();
      const sum =
        m.emailsSent + m.ghlChats + m.newPatientIntake + m.callAudits + m.faxDocs;
      byStaff[m.staff].admin += sum;
      byStaff[m.staff].total += sum;
    }
    return byStaff;
  }

  // Combined Activity + Daily Metrics log: one unified, date-sorted list so
  // staff can see everything logged for a day in one place (merged
  // 2026-07-17). Each row keeps its own delete action tied to its source
  // record.
  type LogRow =
    | {
        kind: "entry";
        id: string;
        date: string;
        staff: string;
        category: string;
        result?: string;
        count: number;
        notes?: string;
      }
    | {
        kind: "metricLine";
        id: string;
        metricId: string;
        date: string;
        staff: string;
        label: string;
        count: number;
      };

  const combinedLog: LogRow[] = useMemo(() => {
    const rows: LogRow[] = [
      ...allEntries.map(e => ({
        kind: "entry" as const,
        id: e._id,
        date: e.date,
        staff: e.staff,
        category: e.category,
        result: e.result,
        count: e.count,
        notes: e.notes,
      })),
      // Admin Task metrics (Daily Metrics form) are stored as one combined
      // record per staff/date, but Wence wants each Admin Task workstream
      // (New Patient Chart, GHL Chats, Fax Docs, Email Sent, Call Audits)
      // to appear as its own Raw Entries row, same as the Admin Task
      // report breakdown — only workstreams actually logged (count > 0)
      // show a row (2026-07-29).
      ...allMetrics.flatMap(m =>
        METRIC_FIELDS.filter(([key]) => Number(m[key]) > 0).map(([key, label]) => ({
          kind: "metricLine" as const,
          id: `${m._id}-${key}`,
          metricId: m._id,
          date: m.date,
          staff: m.staff,
          label,
          count: Number(m[key]) || 0,
        })),
      ),
    ];
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [allEntries, allMetrics]);

  // Intake Log entries ("entry" kind) are no longer automatically added to
  // Raw Entries (Gretchen, 2026-08-05) — Raw Entries now only surfaces
  // Admin Task metric lines. The underlying Intake Log data itself is
  // untouched; it just lives on the Intake Log spreadsheet instead.
  const rawEntryRows = useMemo(() => combinedLog.filter(r => r.kind === "metricLine"), [combinedLog]);

  const filteredLog = useMemo(
    () =>
      rawEntryRows
        .filter(r => (logDateFilter ? r.date === logDateFilter : true))
        .filter(r => inDateRange(r.date, logFrom, logTo)),
    [rawEntryRows, logDateFilter, logFrom, logTo],
  );

  // Daily / Weekly / Monthly tabs (2026-08-07 per Wence, option 2): the period
  // widens the picked date into a range — Daily = that date, Weekly = that
  // date's Mon–Sun week, Monthly = that date's calendar month. With no date
  // picked, all periods show all-time (unchanged from before).
  const reportPeriod: "daily" | "weekly" | "monthly" = "daily";

  // Inclusive [start, end] ISO date strings for the active period, or null for
  // all-time. Parsed as local Y/M/D to avoid UTC off-by-one on the date input.
  const reportDateRange = useMemo(() => {
    if (!reportDateFilter) return null;
    const [y, m, d] = reportDateFilter.split("-").map(Number);
    if (!y || !m || !d) return null;
    const iso = (dt: Date) =>
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    if (reportPeriod === "daily") return { start: reportDateFilter, end: reportDateFilter };
    if (reportPeriod === "weekly") {
      const base = new Date(y, m - 1, d);
      // getDay(): 0=Sun → shift so Monday starts the week
      const offset = (base.getDay() + 6) % 7;
      const start = new Date(y, m - 1, d - offset);
      const end = new Date(y, m - 1, d - offset + 6);
      return { start: iso(start), end: iso(end) };
    }
    return { start: iso(new Date(y, m - 1, 1)), end: iso(new Date(y, m, 0)) };
  }, [reportDateFilter, reportPeriod]);

  const inReportRange = useCallback(
    (dateISO: string) =>
      (!reportDateRange ||
        (dateISO >= reportDateRange.start && dateISO <= reportDateRange.end)) &&
      inDateRange(dateISO, reportFrom, reportTo),
    [reportDateRange, reportFrom, reportTo],
  );

  const reportEntries = useMemo(
    () =>
      allEntries.filter(
        e =>
          (!reportStaff || e.staff === reportStaff) &&
          !EXCLUDED_STAFF_NAMES.includes(e.staff) &&
          inReportRange(e.date) &&
          !BOOST_CATEGORIES.includes(e.category),
      ),
    [allEntries, reportStaff, inReportRange],
  );

  // Boost entries kept separate from reportEntries (excluded above) but
  // rolled into the Admin Task table as their own rows, per Wence 2026-07-17.
  // Company-wide (NOT filtered by the reportStaff picker) per Wence
  // 2026-07-22 — boost activity is logged under whichever staff ran the
  // campaign (in practice, almost always one person), so filtering it by
  // the Activity Reports staff picker made it look permanently "broken" (0)
  // for everyone else. Still respects the date filter.
  const reportBoostEntries = useMemo(
    () =>
      allEntries.filter(
        e => inReportRange(e.date) && BOOST_CATEGORIES.includes(e.category),
      ),
    [allEntries, inReportRange],
  );

  const reportMetrics = useMemo(
    () =>
      allMetrics.filter(
        m =>
          (!reportStaff || m.staff === reportStaff) &&
          !EXCLUDED_STAFF_NAMES.includes(m.staff) &&
          inReportRange(m.date),
      ),
    [allMetrics, reportStaff, inReportRange],
  );

  function bucketCounts(
    entries: typeof reportEntries,
    direction: IntakeDirection,
    buckets: { label: string; values: string[] }[],
  ) {
    const rows = buckets.map(b => {
      const matched = entries.filter(e => e.direction === direction && b.values.includes(e.category));
      const count = matched.reduce((sum, e) => sum + e.count, 0);
      return { label: b.label, count };
    });
    const total = rows.reduce((sum, r) => sum + r.count, 0);
    return { rows, total };
  }

  // Result breakdown, per Wence's 2026-07-21 mockup: a second Result+Count
  // column pair next to Category+Count, listing every Result option for the
  // direction (not just ones with entries) with its total count across all
  // categories in that direction — separate from the Category breakdown,
  // not tied row-for-row to it.
  function resultCounts(entries: typeof reportEntries, direction: IntakeDirection) {
    const options = resultOptionsForDirection(direction);
    const rows = options.map(opt => {
      const count = entries
        .filter(e => e.direction === direction && e.result === opt.value)
        .reduce((sum, e) => sum + e.count, 0);
      return { label: opt.label, count };
    });
    return { rows };
  }

  const inboundCategory = bucketCounts(reportEntries, "inbound", INBOUND_CATEGORY_BUCKETS);

  const outboundCategory = bucketCounts(reportEntries, "outbound", OUTBOUND_CATEGORY_BUCKETS);

  const inboundResult = resultCounts(reportEntries, "inbound");

  const outboundResult = resultCounts(reportEntries, "outbound");

  const ADMIN_TASK_ORDER: { key: MetricKey; label: string }[] = [
    ["newPatientIntake", "New Patient Chart"],
    ["ghlChats", "GHL Chats"],
    ["faxDocs", "Fax Docs"],
    ["emailsSent", "Email Sent"],
    ["callAudits", "Call Audits"],
  ].map(([key, label]) => ({ key: key as MetricKey, label }));

  // Boost rows appended to Admin Task table, same row styling as the other
  // Admin Task rows (e.g. New Patient Chart), per Wence 2026-07-17.
  const boostRows = BOOST_CATEGORIES.map(cat => ({
    label: categoryLabel(cat),
    count: reportBoostEntries
      .filter(e => e.category === cat)
      .reduce((sum, e) => sum + e.count, 0),
  }));

  const adminTaskRows = [
    ...ADMIN_TASK_ORDER.map(({ key, label }) => ({
      label,
      count: reportMetrics.reduce((sum, m) => sum + (m[key] ?? 0), 0),
    })),
    ...boostRows,
  ];

  const adminTaskTotal = adminTaskRows.reduce((sum, r) => sum + r.count, 0);
  return { logSheetEntries, EXCLUDED_STAFF_NAMES, summarize, combinedLog, rawEntryRows, filteredLog, reportPeriod, reportDateRange, inReportRange, reportEntries, reportBoostEntries, reportMetrics, bucketCounts, resultCounts, inboundCategory, outboundCategory, inboundResult, outboundResult, ADMIN_TASK_ORDER, boostRows, adminTaskRows, adminTaskTotal };
}

export { METRIC_FIELDS, makeIntakeTab };
export type { MetricKey };
