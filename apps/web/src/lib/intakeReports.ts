// Intake screen computations (rebuild): productivity summaries, Raw Entries
// metric lines and the Activity Reports tables. Each must give the same
// output, in the same order, as the matching code inside the original
// IntakeTeamTab; tests/parity/intake.test.ts runs both on random data.
import { inDateRange } from "../../../../convex/lib/intakeLog";
import {
  BOOST_CATEGORIES,
  categoryLabel,
  categoryOption,
  type CategoryBucket,
  INBOUND_CATEGORY_BUCKETS,
  type IntakeDirection,
  isBoostCategory,
  OUTBOUND_CATEGORY_BUCKETS,
  resultOptionsForDirection,
} from "../../../../convex/lib/intakeTaxonomy";

export const METRIC_FIELDS = [
  ["emailsSent", "Emails Sent"],
  ["ghlChats", "GHL Chats"],
  ["newPatientIntake", "New Patient Chart"],
  ["callAudits", "Call Audits"],
  ["faxDocs", "Fax Docs"],
] as const;
export type MetricKey = (typeof METRIC_FIELDS)[number][0];

export type IntakeEntryRow = {
  _id: string;
  staff: string;
  date: string;
  direction: string;
  category: string;
  result?: string;
  count: number;
  createdAt: string;
};
export type MetricRow = { _id: string; staff: string; date: string } & Record<MetricKey, number>;

export type StaffSummary = {
  consult: number;
  followUp: number;
  inbound: number;
  outbound: number;
  boost: number;
  admin: number;
  total: number;
};

const CONSULT_LEGACY = ["booked_new", "booked_new_outbound", "booked_veins", "booked_veins_outbound"];
const FOLLOW_UP_LEGACY = ["booked_followup", "booked_followup_outbound"];

/**
 * Per-staff productivity for one period. An entry adds its `count` to exactly
 * one column (Consult, Follow Up, Boost, Outbound, else Inbound, checked in
 * that order); every metric value adds to Admin. Excluded names are skipped.
 */
export function summarize(
  entries: IntakeEntryRow[],
  metrics: MetricRow[],
  excludedNames: string[],
  inPeriod: (dateISO: string) => boolean,
): Record<string, StaffSummary> {
  const byStaff: Record<string, StaffSummary> = {};
  const row = (staff: string) => {
    byStaff[staff] ??= { consult: 0, followUp: 0, inbound: 0, outbound: 0, boost: 0, admin: 0, total: 0 };
    return byStaff[staff];
  };
  for (const e of entries) {
    if (!inPeriod(e.date) || excludedNames.includes(e.staff)) continue;
    const s = row(e.staff);
    if (e.result === "booked_consult_appt" || CONSULT_LEGACY.includes(e.category)) s.consult += e.count;
    else if (e.result === "booked_fu_appt" || FOLLOW_UP_LEGACY.includes(e.category)) s.followUp += e.count;
    else if (isBoostCategory(e.category)) s.boost += e.count;
    else if (categoryOption(e.category)?.direction === "outbound") s.outbound += e.count;
    else s.inbound += e.count;
    s.total += e.count;
  }
  for (const m of metrics) {
    if (!inPeriod(m.date) || excludedNames.includes(m.staff)) continue;
    const sum = m.emailsSent + m.ghlChats + m.newPatientIntake + m.callAudits + m.faxDocs;
    const s = row(m.staff);
    s.admin += sum;
    s.total += sum;
  }
  return byStaff;
}

export type MetricLine = { id: string; metricId: string; date: string; staff: string; label: string; count: number };

/** Raw Entries: one row per non-zero metric, newest date first, filtered like the original. */
export function rawEntryRows(metrics: MetricRow[], filters: { date: string; from: string; to: string }): MetricLine[] {
  const lines = metrics.flatMap(m =>
    METRIC_FIELDS.filter(([key]) => Number(m[key]) > 0).map(([key, label]) => ({
      id: `${m._id}-${key}`,
      metricId: m._id,
      date: m.date,
      staff: m.staff,
      label,
      count: Number(m[key]) || 0,
    })),
  );
  return lines
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter(r => (!filters.date || r.date === filters.date) && inDateRange(r.date, filters.from, filters.to));
}

export type ReportFilters = { staff: string; date: string; from: string; to: string };

/** The Activity Reports single-date filter as an inclusive range, or null for all time. */
export function reportDateRange(date: string): { start: string; end: string } | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { start: date, end: date };
}

type CountRow = { label: string; count: number };

function bucketCounts(entries: IntakeEntryRow[], direction: IntakeDirection, buckets: CategoryBucket[]) {
  const rows = buckets.map(b => ({
    label: b.label,
    count: entries
      .filter(e => e.direction === direction && b.values.includes(e.category))
      .reduce((sum, e) => sum + e.count, 0),
  }));
  return { rows, total: rows.reduce((sum, r) => sum + r.count, 0) };
}

function resultCounts(entries: IntakeEntryRow[], direction: IntakeDirection): { rows: CountRow[] } {
  return {
    rows: resultOptionsForDirection(direction).map(opt => ({
      label: opt.label,
      count: entries
        .filter(e => e.direction === direction && e.result === opt.value)
        .reduce((sum, e) => sum + e.count, 0),
    })),
  };
}

const ADMIN_TASK_ORDER: { key: MetricKey; label: string }[] = [
  { key: "newPatientIntake", label: "New Patient Chart" },
  { key: "ghlChats", label: "GHL Chats" },
  { key: "faxDocs", label: "Fax Docs" },
  { key: "emailsSent", label: "Email Sent" },
  { key: "callAudits", label: "Call Audits" },
];

/**
 * Activity Reports. Inbound/Outbound tables leave Boost out and follow the
 * staff picker; the Admin Task table's Boost rows are company-wide (they
 * ignore the staff picker and the exclusion list), as in the original.
 */
export function activityReport(
  entries: IntakeEntryRow[],
  metrics: MetricRow[],
  filters: ReportFilters,
  excludedNames: string[],
) {
  const range = reportDateRange(filters.date);
  const inRange = (d: string) =>
    (!range || (d >= range.start && d <= range.end)) && inDateRange(d, filters.from, filters.to);
  const forStaff = (staff: string) => (!filters.staff || staff === filters.staff) && !excludedNames.includes(staff);
  const reportEntries = entries.filter(e => forStaff(e.staff) && inRange(e.date) && !isBoostCategory(e.category));
  const boostEntries = entries.filter(e => inRange(e.date) && isBoostCategory(e.category));
  const reportMetrics = metrics.filter(m => forStaff(m.staff) && inRange(m.date));
  const adminTaskRows: CountRow[] = [
    ...ADMIN_TASK_ORDER.map(({ key, label }) => ({
      label,
      count: reportMetrics.reduce((sum, m) => sum + (m[key] ?? 0), 0),
    })),
    ...BOOST_CATEGORIES.map(cat => ({
      label: categoryLabel(cat),
      count: boostEntries.filter(e => e.category === cat).reduce((sum, e) => sum + e.count, 0),
    })),
  ];
  return {
    range,
    inboundCategory: bucketCounts(reportEntries, "inbound", INBOUND_CATEGORY_BUCKETS),
    outboundCategory: bucketCounts(reportEntries, "outbound", OUTBOUND_CATEGORY_BUCKETS),
    inboundResult: resultCounts(reportEntries, "inbound"),
    outboundResult: resultCounts(reportEntries, "outbound"),
    adminTaskRows,
    adminTaskTotal: adminTaskRows.reduce((sum, r) => sum + r.count, 0),
  };
}
