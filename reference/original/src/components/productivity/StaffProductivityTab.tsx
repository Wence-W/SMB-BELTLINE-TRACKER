import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { QuickDateRangeFilter, type DatePreset } from "@/components/QuickDateRangeFilter";
import { openPrintWindow } from "@/lib/exportUtils";
import { formatDateTimeEST } from "@/lib/dateFormat";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fromDateInputValue,
  getDayRange,
  getMonthRange,
  getWeekRange,
  toDateInputValue,
  type PeriodRange,
} from "@/lib/intakeTypes";

// Raw case shape as returned by `api.cases.listAll` — looser than the
// front-end `BariCase` type (caseType/status are plain strings here).
interface RawCase {
  caseType: string;
  status: string;
  authStatus?: string;
  assignedTo: string;
  createdAt: string;
  createdBy?: string;
  approvedAt?: string;
  completedAt?: string;
  authCancelledAt?: string;
  updatedAt?: string;
  notes?: string;
  noteLog?: { addedAt: string; addedBy?: string }[];
  notesUpdatedAt?: string;
  notesUpdatedBy?: string;
}

// ============================================================
// Staff Daily Productivity — Daily Operations Summary
// ============================================================
// Rebuilt 2026-07-21 per Wence's mockup: a company-wide rollup with one
// column per day in the selected period plus a grand Total column,
// grouped into 3 sections (Verification Team / Intake Team / Billing,
// per Wence 2026-07-21). Two rows from his original mockup ("Ins Veri:
// With/No Coverage" and "Data Management") have no equivalent tracked
// data anywhere in the app — Wence confirmed to skip them.

function dateOnly(iso?: string): string | null {
  return iso ? iso.slice(0, 10) : null;
}

const PRECERT_TYPES = new Set<string>([
  "precert_bari",
  "precert_veins",
  "precert_general",
  "precert_modified_urgent",
  "precert_egd",
]);

// Pre-Cert On-going activity events for a case: one (date, staff) pair per
// individual note/update added to it. Creating the case with no notes does
// NOT count on its own — that's just an assignment, not on-going work
// (Wence, 2026-07-23). But if the initial Notes box was filled in at
// creation, that first note counts too, credited to the creator on the
// creation date (Wence, 2026-07-24 — "also count the first notes"; that
// initial Notes text lives in `notes`, separate from the timestamped
// `noteLog` entries added later via the note icon).
// EXCEPTION (Wence, 2026-07-29): the creator's initial-note credit only
// applies if the creator is also the case's assignee. An Intake staffer who
// creates a case (with notes) and hands it off to a Verifier for the actual
// Pre-Cert work did intake/creation work, not Pre-Cert on-going work — so
// that credit stays with whoever is actually assigned to the case.
// COUNTED PER NOTE, not deduped per staff/day (Wence, 2026-08-28): each
// individual note — the initial Notes box, every `noteLog` entry, and the
// latest direct Notes-box edit — is its own credit, even if several land on
// the same case/staff/day. A case touched with 3 notes in one day credits 3,
// not 1. This is a retroactive change: past days where a staffer added 2+
// notes to the same case on the same day now show more credit than before.
// MUST be identical to ReportsTab.tsx's copy of this function — that's what
// keeps the two tabs' totals in sync.
function precertOngoingEvents(c: RawCase): { date: string; staff: string }[] {
  const events: { date: string; staff: string }[] = [];
  function add(date: string | null, staff: string | undefined) {
    if (!date || !staff) return;
    events.push({ date, staff });
  }
  if (c.notes && c.notes.trim().length > 0 && c.createdBy === c.assignedTo) {
    add(dateOnly(c.createdAt), c.createdBy);
  }
  for (const note of c.noteLog ?? []) {
    add(dateOnly(note.addedAt), note.addedBy);
  }
  // Direct edits to the Notes box itself, stamped server-side from the
  // logged-in staff account (Wence, 2026-07-29).
  add(dateOnly(c.notesUpdatedAt), c.notesUpdatedBy);
  return events;
}

interface DayColumn {
  date: string; // YYYY-MM-DD
  label: string; // "Jul 1"
}

function buildDayColumns(range: PeriodRange): DayColumn[] {
  const days: DayColumn[] = [];
  const cursor = new Date(range.start);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(range.end);
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    // Bari Ops works Monday–Friday only. Weekend activity must not appear
    // as a report column or be included in any table total (Wence, 2026-08-26).
    const dayOfWeek = cursor.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const iso = toDateInputValue(cursor);
      days.push({
        date: iso,
        label: cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

interface RowDef {
  label: string;
  count: (date: string) => number;
  cls?: string;
}

type StaffProductivityView = "productivity" | "qualified-total";

export function StaffProductivityTab() {
  const rawCases = useQuery(api.cases.listAll);
  const intakeEntries = useQuery(api.intake.listEntries);
  const billingEntries = useQuery(api.billing.listEntries);
  const dailyMetrics = useQuery(api.intake.listDailyMetrics);
  // Real call audit records (by dateReviewed), not the retired manually-typed
  // intakeDailyMetrics.callAudits field (Wence, 2026-08-26).
  const callAuditCounts = useQuery(api.callAudits.countsByAuditor);

  const [period, setPeriod] = useState<DatePreset>("week");
  const [customFrom, setCustomFrom] = useState(() => toDateInputValue(new Date()));
  const [customTo, setCustomTo] = useState(() => toDateInputValue(new Date()));
  const [view, setView] = useState<StaffProductivityView>("productivity");

  const range: PeriodRange =
    period === "today"
      ? getDayRange(new Date())
      : period === "week"
        ? getWeekRange(new Date())
      : period === "month"
        ? getMonthRange(new Date())
        : {
            start: fromDateInputValue(customFrom),
            end: fromDateInputValue(customTo),
            label: `${customFrom} - ${customTo}`,
            inRange: () => true,
          };
  const days = useMemo(() => buildDayColumns(range), [range.start, range.end]);

  // ── Per-day (and per-staff, for the two breakdown tables) lookups ──
  const casesByDay = useMemo(() => {
    const created: Record<string, RawCase[]> = {};
    // Pre-Cert Approved: count of (case, staff) note/update activity events
    // per day, same model as On-going below. Any day a staff member adds a
    // note/update to a case that is Approved/Partial Approval counts as
    // Approved activity for that day — not just the single day the case's
    // status actually flipped to Approved (Wence, 2026-08-07: a follow-up
    // note today on a case approved weeks ago still counts as Approved
    // activity today). See ReportsTab.tsx's identical copy of this logic.
    const approved: Record<string, number> = {};
    const verificationCompleted: Record<string, RawCase[]> = {};
    // Pre-Cert On-going: count of (case, staff) note/update activity events
    // per day — see precertOngoingEvents. Deliberately NOT gated on the
    // case's current status (Wence, 2026-07-23): a note added while a case
    // was still open must keep counting for that day even if the case later
    // gets completed.
    const ongoing: Record<string, number> = {};
    for (const c of rawCases ?? []) {
      if (PRECERT_TYPES.has(c.caseType)) {
        const cd = dateOnly(c.createdAt);
        if (cd) (created[cd] ??= []).push(c);
        const isApprovedCase =
          c.authStatus === "approved" || c.authStatus === "partial_approval";
        // Auth Status "Cancelled" = the prior auth was pulled after the fact
        // (Wence, 2026-09-02). Split the case's note credit at the
        // cancellation date: notes before it keep their Approved credit (if
        // the case had been approved — approvedAt set), notes on/after it
        // count as On-going again, even when the case's workflow Status is
        // Completed. MUST stay identical to ReportsTab.tsx's copy.
        const authCancelled = c.authStatus === "cancelled";
        const cancelDate = authCancelled
          ? (dateOnly(c.authCancelledAt) ?? dateOnly(c.updatedAt))
          : null;
        if (isApprovedCase || (authCancelled && c.approvedAt)) {
          for (const ev of precertOngoingEvents(c)) {
            if (cancelDate && ev.date >= cancelDate) continue;
            approved[ev.date] = (approved[ev.date] ?? 0) + 1;
          }
        }
        // Once a Pre-Cert case is Completed — Approved/Partial Approval OR
        // any other completed outcome (Denied, etc.) — any further notes
        // (added any day after) must NOT generate a separate On-going event
        // (Wence, 2026-08-07: notes on an already-completed case shouldn't
        // move it back into Ongoing or inflate that count, regardless of
        // auth outcome). EXCEPTION (Wence, 2026-09-02): if the auth was
        // cancelled, notes on/after the cancellation date DO count as
        // On-going again — that's real follow-up work on a pulled auth.
        // See ReportsTab.tsx's identical copy of this logic.
        if (authCancelled) {
          for (const ev of precertOngoingEvents(c)) {
            // Pre-cancellation notes: keep their old credit — Approved (above)
            // if the case had been approved, otherwise On-going only while the
            // case isn't Completed (same as the normal rule).
            if (cancelDate && ev.date < cancelDate) {
              if (c.approvedAt || c.status === "completed") continue;
            }
            ongoing[ev.date] = (ongoing[ev.date] ?? 0) + 1;
          }
        } else if (c.status !== "completed") {
          for (const ev of precertOngoingEvents(c)) {
            ongoing[ev.date] = (ongoing[ev.date] ?? 0) + 1;
          }
        }
      } else if (c.status === "completed") {
        const cd = dateOnly(c.completedAt);
        if (cd) (verificationCompleted[cd] ??= []).push(c);
      }
    }
    return { created, approved, verificationCompleted, ongoing };
  }, [rawCases]);

  const intakeByDay = useMemo(() => {
    const byDay: Record<string, typeof intakeEntries> = {};
    for (const e of intakeEntries ?? []) {
      (byDay[e.date] ??= []).push(e);
    }
    return byDay;
  }, [intakeEntries]);

  const metricsByDay = useMemo(() => {
    const byDay: Record<
      string,
      { emailsSent: number; ghlChats: number; newPatientIntake: number; callAudits: number; faxDocs: number }
    > = {};
    for (const m of dailyMetrics ?? []) {
      const row = (byDay[m.date] ??= {
        emailsSent: 0,
        ghlChats: 0,
        newPatientIntake: 0,
        callAudits: 0,
        faxDocs: 0,
      });
      row.emailsSent += m.emailsSent;
      row.ghlChats += m.ghlChats;
      row.newPatientIntake += m.newPatientIntake;
      row.callAudits += m.callAudits;
      row.faxDocs += m.faxDocs;
    }
    return byDay;
  }, [dailyMetrics]);

  const callAuditsByDay = useMemo(() => {
    const byDay: Record<string, number> = {};
    for (const c of callAuditCounts ?? []) {
      if (!c.dateReviewed) continue;
      byDay[c.dateReviewed] = (byDay[c.dateReviewed] ?? 0) + c.count;
    }
    return byDay;
  }, [callAuditCounts]);

  const billingByDay = useMemo(() => {
    const byDay: Record<string, number> = {};
    for (const b of billingEntries ?? []) {
      byDay[b.date] = (byDay[b.date] ?? 0) + b.tasksCompleted;
    }
    return byDay;
  }, [billingEntries]);

  // ── Intake category matchers (mirrors legacy Booked New/Veins/FU model
  //     Wence's mockup uses, plus the current Category+Result model so
  //     entries logged either way still land in the right bucket) ──
  function intakeCount(
    date: string,
    direction: "inbound" | "outbound",
    match: (e: NonNullable<typeof intakeEntries>[number]) => boolean,
  ): number {
    return (intakeByDay[date] ?? []).reduce(
      (sum, e) => (e.direction === direction && match(e) ? sum + e.count : sum),
      0,
    );
  }

  const bookedNewCategories = new Set(["booked_new", "booked_new_outbound"]);
  const bookedVeinsCategories = new Set(["booked_veins", "booked_veins_outbound"]);
  const bookedFuCategories = new Set(["booked_followup", "booked_followup_outbound"]);
  const outboundOtherCategories = new Set([
    "missing_info",
    "confirm_appointment",
    "prioritylist",
    "referral",
    "other_concerns_outbound",
  ]);
  const outboundCallbackCategories = new Set(["did_not_book_callback", "callback"]);

  function isBookedNew(e: { category: string; result?: string }) {
    return bookedNewCategories.has(e.category) || e.result === "booked_consult_appt";
  }
  function isBookedFu(e: { category: string; result?: string }) {
    return bookedFuCategories.has(e.category) || e.result === "booked_fu_appt";
  }

  const inboundNewPt = (d: string) => intakeCount(d, "inbound", e => isBookedNew(e));
  const inboundVeins = (d: string) =>
    intakeCount(d, "inbound", e => bookedVeinsCategories.has(e.category));
  const inboundFu = (d: string) =>
    intakeCount(d, "inbound", e => isBookedFu(e) && !isBookedNew(e));
  const inboundOther = (d: string) =>
    intakeCount(
      d,
      "inbound",
      e => !isBookedNew(e) && !isBookedFu(e) && !bookedVeinsCategories.has(e.category),
    );
  const totalInbound = (d: string) =>
    inboundNewPt(d) + inboundVeins(d) + inboundFu(d) + inboundOther(d);

  const outboundNewPt = (d: string) => intakeCount(d, "outbound", e => isBookedNew(e));
  const outboundVeins = (d: string) =>
    intakeCount(d, "outbound", e => bookedVeinsCategories.has(e.category));
  const outboundFu = (d: string) =>
    intakeCount(d, "outbound", e => isBookedFu(e) && !isBookedNew(e));
  const outboundOtherConcern = (d: string) =>
    intakeCount(
      d,
      "outbound",
      e =>
        !isBookedNew(e) &&
        !isBookedFu(e) &&
        !bookedVeinsCategories.has(e.category) &&
        outboundOtherCategories.has(e.category),
    );
  const outboundCallback = (d: string) =>
    intakeCount(d, "outbound", e => outboundCallbackCategories.has(e.category));
  const outboundVmNoAnswer = (d: string) =>
    intakeCount(
      d,
      "outbound",
      e => e.category === "voicemail_no_answer" || e.result === "no_ans_lvm",
    );
  const totalOutbound = (d: string) =>
    outboundNewPt(d) +
    outboundVeins(d) +
    outboundFu(d) +
    outboundOtherConcern(d) +
    outboundCallback(d) +
    outboundVmNoAnswer(d);

  const boostCount = (d: string, category: string) =>
    intakeCount(d, "outbound", e => e.category === category);

  const precertApproved = (d: string) => casesByDay.approved[d] ?? 0;
  const precertOnGoing = (d: string) => casesByDay.ongoing[d] ?? 0;
  const verificationTaskCompleted = (d: string) =>
    casesByDay.verificationCompleted[d]?.length ?? 0;

  function rowTotal(row: RowDef): number {
    return days.reduce((sum, d) => sum + row.count(d.date), 0);
  }
  function visibleRows<T extends RowDef>(rows: T[]): T[] {
    return rows.filter(row => rowTotal(row) > 0);
  }

  const verificationRows = visibleRows([
    { label: "Task Completed", count: verificationTaskCompleted },
    { label: "Pre-Cert Approved", count: precertApproved },
    { label: "Pre-Cert On-going", count: precertOnGoing },
  ]);
  const inboundRows = visibleRows([
    { label: "Booked Appts (New PT)", count: inboundNewPt },
    { label: "Booked Appt Veins", count: inboundVeins },
    { label: "Booked Appts (FU)", count: inboundFu },
    { label: "Other Concern", count: inboundOther },
    { label: "Total Inbound", count: totalInbound },
  ]);
  const outboundRows = visibleRows([
    { label: "Booked Appts (New PT)", count: outboundNewPt },
    { label: "Booked Appt Veins", count: outboundVeins },
    { label: "Booked Appts (FU)", count: outboundFu },
    { label: "Other Concern (Missing Info, etc)", count: outboundOtherConcern },
    { label: "Did Not Book/Asked for Callback", count: outboundCallback },
    { label: "VM / No Answer", count: outboundVmNoAnswer },
    { label: "Total Outbound", count: totalOutbound },
  ]);

  const intakeFlatRows = visibleRows([
    { label: "EMAILS", cls: "bg-sky-100", count: d => metricsByDay[d]?.emailsSent ?? 0 },
    { label: "GHL CHATS", cls: "bg-yellow-100", count: d => metricsByDay[d]?.ghlChats ?? 0 },
    { label: "NEW PT INPUT", cls: "bg-purple-100", count: d => metricsByDay[d]?.newPatientIntake ?? 0 },
    { label: "CALL AUDITS", cls: "bg-indigo-100", count: d => callAuditsByDay[d] ?? 0 },
    { label: "FAX DOCS", cls: "bg-orange-100", count: d => metricsByDay[d]?.faxDocs ?? 0 },
  ]);

  const totalBookedRows = visibleRows([
    { label: "Total Booked Appts (New PT)", count: d => inboundNewPt(d) + outboundNewPt(d) },
    { label: "Total Booked Veins Consult", count: d => inboundVeins(d) + outboundVeins(d) },
    { label: "Total Booked Appts (FU)", count: d => inboundFu(d) + outboundFu(d) },
  ]);
  const totalBookedGrandTotal = days.reduce(
    (sum, day) => sum + totalBookedRows.reduce((s, r) => s + r.count(day.date), 0),
    0,
  );

  const boostRows = visibleRows([
    { label: "Boost Booked Appts", count: d => boostCount(d, "boost_booked") },
    { label: "Boost No Show Appts", count: d => boostCount(d, "boost_no_show") },
    { label: "Boost Cancelled Appts", count: d => boostCount(d, "boost_cancelled") },
  ]);

  const billingRow: RowDef = { label: "BILLING", count: d => billingByDay[d] ?? 0 };
  const hasIntakeActivity =
    inboundRows.length + outboundRows.length + intakeFlatRows.length + totalBookedRows.length > 0;
  const showBilling = rowTotal(billingRow) > 0;

  // Qualified Activities Total is a separate view inside Staff Daily
  // Productivity. It counts each underlying activity once, deliberately
  // leaving out the main sheet's subtotal rows and Boost rows. The team
  // split is Verification (including Call Audits), Intake, and Billing
  // (Wence, 2026-08-26).
  function qualifiedTeamTotalsForDay(date: string) {
    const verification =
      (casesByDay.verificationCompleted[date]?.length ?? 0) +
      (casesByDay.approved[date] ?? 0) +
      (casesByDay.ongoing[date] ?? 0) +
      (callAuditsByDay[date] ?? 0);
    const intakeActivity = totalInbound(date) + totalOutbound(date);
    const metrics = metricsByDay[date];
    const intakeMetrics = metrics
      ? metrics.emailsSent + metrics.ghlChats + metrics.newPatientIntake + metrics.faxDocs
      : 0;
    const billing = billingByDay[date] ?? 0;
    return {
      verification,
      intake: intakeActivity + intakeMetrics,
      billing,
    };
  }

  function qualifiedTotalForDay(date: string): number {
    const teams = qualifiedTeamTotalsForDay(date);
    return teams.verification + teams.intake + teams.billing;
  }

  const qualifiedTeamRows: RowDef[] = [
    { label: "Verification (incl. Call Audits)", count: d => qualifiedTeamTotalsForDay(d).verification },
    { label: "Intake", count: d => qualifiedTeamTotalsForDay(d).intake },
    { label: "Billing", count: d => qualifiedTeamTotalsForDay(d).billing },
  ];
  const qualifiedRangeTotal = useMemo(
    () => days.reduce((sum, day) => sum + qualifiedTotalForDay(day.date), 0),
    [days, casesByDay, intakeByDay, metricsByDay, callAuditsByDay, billingByDay],
  );
  const currentWeekRange = useMemo(() => getWeekRange(new Date()), []);
  const currentMonthRange = useMemo(() => getMonthRange(new Date()), []);
  const currentWeekDays = useMemo(
    () => buildDayColumns(currentWeekRange),
    [currentWeekRange.start, currentWeekRange.end],
  );
  const currentMonthDays = useMemo(
    () => buildDayColumns(currentMonthRange),
    [currentMonthRange.start, currentMonthRange.end],
  );
  const currentWeekQualifiedTotal = useMemo(
    () => currentWeekDays.reduce((sum, day) => sum + qualifiedTotalForDay(day.date), 0),
    [currentWeekDays, casesByDay, intakeByDay, metricsByDay, callAuditsByDay, billingByDay],
  );
  const currentMonthQualifiedTotal = useMemo(
    () => currentMonthDays.reduce((sum, day) => sum + qualifiedTotalForDay(day.date), 0),
    [currentMonthDays, casesByDay, intakeByDay, metricsByDay, callAuditsByDay, billingByDay],
  );

  function handleQualifiedPrint() {
    const now = formatDateTimeEST(new Date());
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Qualified Activities Total - ${now}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    .subtitle { color: #666; font-size: 11px; margin-bottom: 16px; }
    .cards { display: flex; gap: 16px; margin-bottom: 20px; }
    .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 16px; }
    .card .n { font-size: 22px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; }
    th, td.num { text-align: center; }
    td.label { text-align: left; white-space: nowrap; }
    th { background: #1e293b; color: white; padding: 5px 8px; font-size: 11px; white-space: nowrap; }
    th:first-child { text-align: left; }
    td { padding: 4px 8px; border-bottom: 1px solid #e5e7eb; }
    td.total { font-weight: bold; }
    @media print { body { -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <h1>Qualified Activities Total</h1>
  <div class="subtitle">Generated: ${now}  |  Period: ${range.label}</div>
  <div class="cards">
    <div class="card">This Week (${currentWeekRange.label})<br/><span class="n">${currentWeekQualifiedTotal}</span></div>
    <div class="card">This Month (${currentMonthRange.label})<br/><span class="n">${currentMonthQualifiedTotal}</span></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Category</th>
        ${days.map(d => `<th>${d.label}</th>`).join("")}
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${qualifiedTeamRows
        .map(
          row => `<tr>
        <td class="label">${row.label}</td>
        ${days.map(d => `<td class="num">${row.count(d.date)}</td>`).join("")}
        <td class="num total">${rowTotal(row)}</td>
      </tr>`,
        )
        .join("")}
      <tr>
        <td class="label">Total Qualified Activities</td>
        ${days.map(d => `<td class="num">${qualifiedTotalForDay(d.date)}</td>`).join("")}
        <td class="num total">${qualifiedRangeTotal}</td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;
    openPrintWindow(html);
  }

  // Print — builds a standalone HTML doc mirroring the on-screen table for
  // whatever date range/period is currently selected above (Wence, 2026-07-22).
  function handlePrint() {
    if (view === "qualified-total") {
      handleQualifiedPrint();
      return;
    }
    const now = formatDateTimeEST(new Date());
    function rowsHtml(rows: RowDef[], cls: string, bold = false): string {
      return rows
        .map(
          row => `<tr class="${cls}">
        <td class="label ${bold ? "bold" : ""}">${row.label}</td>
        ${days.map(d => `<td class="num">${row.count(d.date)}</td>`).join("")}
        <td class="num total">${rowTotal(row)}</td>
      </tr>`,
        )
        .join("");
    }
    const sectionHtml = (title: string) =>
      `<tr><td class="section" colspan="${days.length + 2}">${title}</td></tr>`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Staff Daily Productivity - ${now}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    .subtitle { color: #666; font-size: 11px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td.num { text-align: center; }
    td.label { text-align: left; white-space: nowrap; }
    td.label.bold { font-weight: bold; }
    th { background: #1e293b; color: white; padding: 3px 6px; font-size: 10px; white-space: nowrap; }
    th:first-child { text-align: left; }
    td { padding: 2px 6px; border-bottom: 1px solid #e5e7eb; }
    td.total { font-weight: bold; }
    td.section { background: #e2e8f0; font-weight: bold; text-transform: uppercase; font-size: 10px; padding: 4px 6px; }
    @media print { body { -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <h1>Staff Daily Productivity</h1>
  <div class="subtitle">Generated: ${now}  |  Period: ${range.label}</div>
  <table>
    <thead>
      <tr>
        <th>Category</th>
        ${days.map(d => `<th>${d.label}</th>`).join("")}
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${verificationRows.length > 0 ? sectionHtml("Verification Team") + rowsHtml(verificationRows, "") : ""}
      ${hasIntakeActivity ? sectionHtml("Intake Team") : ""}
      ${rowsHtml(inboundRows, "", true)}
      ${rowsHtml(outboundRows, "", true)}
      ${rowsHtml(intakeFlatRows, "", true)}
      ${rowsHtml(totalBookedRows, "")}
      ${boostRows.length > 0 ? rowsHtml(boostRows, "") : ""}
      ${showBilling ? sectionHtml("Billing") + rowsHtml([billingRow], "", true) : ""}
    </tbody>
  </table>
</body>
</html>`;
    openPrintWindow(html);
  }

  function renderRow(row: RowDef, key: string, cls: string, boldLabel = false) {
    return (
      <tr key={key} className={`border-b border-border ${cls}`}>
        <td className={`py-0.5 px-1.5 leading-tight text-foreground whitespace-nowrap ${boldLabel ? "font-bold" : "font-medium"}`}>
          {row.label}
        </td>
        {days.map(d => (
          <td key={d.date} className="py-0.5 px-1.5 leading-tight text-center">
            {row.count(d.date)}
          </td>
        ))}
        <td className="py-0.5 px-1.5 leading-tight text-center font-semibold">{rowTotal(row)}</td>
      </tr>
    );
  }

  function sectionHeaderRow(title: string) {
    return (
      <tr key={`section-${title}`}>
        <td
          colSpan={days.length + 2}
          className="py-1 px-1.5 leading-tight font-bold text-foreground text-[11px] uppercase tracking-wide bg-muted border-b-2 border-border"
        >
          {title}
        </td>
      </tr>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="space-y-2">
          <h3 className="font-semibold text-foreground text-sm">
            {view === "productivity" ? "Staff Daily Productivity" : "Qualified Activities Total"}
          </h3>
          <Tabs
            value={view}
            onValueChange={value => setView(value as StaffProductivityView)}
            className="w-fit"
          >
            <TabsList className="h-8">
              <TabsTrigger value="productivity" className="h-6 px-2.5 text-xs">
                Staff Daily Productivity
              </TabsTrigger>
              <TabsTrigger value="qualified-total" className="h-6 px-2.5 text-xs">
                Qualified Activities Total
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <QuickDateRangeFilter
            preset={period}
            from={customFrom}
            to={customTo}
            onPresetChange={setPeriod}
            onRangeChange={({ from, to }) => {
              setCustomFrom(from);
              setCustomTo(to);
            }}
            idPrefix="staff-productivity"
          />
          <button
            onClick={handlePrint}
            className="border border-input rounded-md px-2 py-1 text-foreground hover:bg-muted"
          >
            🖨️ Print
          </button>
        </div>
      </div>
      {view === "qualified-total" ? (
        <>
          <p className="text-muted-foreground text-xs mb-4">
            Company-wide qualified activity split by team. Call Audits are included under Verification;
            Boost activity and subtotal rows are excluded so the work is not double-counted.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                This Week ({currentWeekRange.label})
              </div>
              <div className="text-2xl font-bold text-foreground">{currentWeekQualifiedTotal}</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                This Month ({currentMonthRange.label})
              </div>
              <div className="text-2xl font-bold text-foreground">{currentMonthQualifiedTotal}</div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="inline-table w-fit min-w-max text-xs border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-1 px-1.5 leading-tight text-left bg-muted">Category</th>
                  {days.map(d => (
                    <th key={d.date} className="py-1 px-1.5 leading-tight text-center bg-muted whitespace-nowrap">
                      {d.label}
                    </th>
                  ))}
                  <th className="py-1 px-1.5 leading-tight text-center bg-muted whitespace-nowrap">Total</th>
                </tr>
              </thead>
              <tbody>
                {qualifiedTeamRows.map((row, index) => (
                  <tr
                    key={row.label}
                    className={`border-b border-border ${
                      index === 0 ? "bg-cyan-100" : index === 1 ? "bg-emerald-100" : "bg-rose-100"
                    }`}
                  >
                    <td className="py-1 px-1.5 leading-tight font-semibold text-foreground whitespace-nowrap">
                      {row.label}
                    </td>
                    {days.map(d => (
                      <td key={d.date} className="py-1 px-1.5 leading-tight text-center">
                        {row.count(d.date)}
                      </td>
                    ))}
                    <td className="py-1 px-1.5 leading-tight text-center font-semibold">
                      {rowTotal(row)}
                    </td>
                  </tr>
                ))}
                <tr className="border-b border-border bg-teal-100">
                  <td className="py-1 px-1.5 leading-tight font-bold text-foreground whitespace-nowrap">
                    Total Qualified Activities
                  </td>
                  {days.map(d => (
                    <td key={d.date} className="py-1 px-1.5 leading-tight text-center font-bold">
                      {qualifiedTotalForDay(d.date)}
                    </td>
                  ))}
                  <td className="py-1 px-1.5 leading-tight text-center font-bold">{qualifiedRangeTotal}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="overflow-x-auto">
          <table className="inline-table w-fit min-w-max text-xs border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="py-1 px-1.5 leading-tight text-left bg-muted">Category</th>
                {days.map(d => (
                  <th key={d.date} className="py-1 px-1.5 leading-tight text-center bg-muted whitespace-nowrap">
                    {d.label}
                  </th>
                ))}
                <th className="py-1 px-1.5 leading-tight text-center bg-muted whitespace-nowrap">Total</th>
              </tr>
            </thead>
            <tbody>
              {verificationRows.length > 0 && (
                <>
                  {sectionHeaderRow("Verification Team")}
                  {verificationRows.map(row => renderRow(row, `ver-${row.label}`, "bg-cyan-100"))}
                </>
              )}
              {hasIntakeActivity && (
                <>
                  {sectionHeaderRow("Intake Team")}
                  {inboundRows.map(row =>
                    renderRow(row, `inbound-${row.label}`, "bg-emerald-100", row.label.startsWith("Total")),
                  )}
                  {outboundRows.map(row =>
                    renderRow(row, `outbound-${row.label}`, "bg-amber-100", row.label.startsWith("Total")),
                  )}
                  {intakeFlatRows.map(row => renderRow(row, row.label, row.cls ?? "bg-sky-50", true))}
                  {totalBookedRows.length > 0 && (
                    <tr>
                      <td colSpan={days.length + 2} className="py-0.5"></td>
                    </tr>
                  )}
                  {totalBookedRows.map((row, i) => (
                    <tr key={row.label} className="border-b border-border bg-green-200/70">
                      <td className="py-0.5 px-1.5 leading-tight font-medium text-foreground whitespace-nowrap">
                        {row.label}
                      </td>
                      {days.map(d => (
                        <td key={d.date} className="py-0.5 px-1.5 leading-tight text-center">
                          {row.count(d.date)}
                        </td>
                      ))}
                      {i === 0 && (
                        <td
                          rowSpan={totalBookedRows.length}
                          className="py-0.5 px-1.5 leading-tight text-center font-bold bg-amber-800/20 align-middle"
                        >
                          {totalBookedGrandTotal}
                        </td>
                      )}
                    </tr>
                  ))}
                </>
              )}
              {boostRows.map((row, i) => (
                <tr key={row.label} className="border-b border-border bg-slate-100">
                  <td className="py-0.5 px-1.5 leading-tight font-medium text-foreground whitespace-nowrap">
                    {i === 0 && <span className="font-bold mr-2">BOOST APPTS</span>}
                    {row.label}
                  </td>
                  {days.map(d => (
                    <td key={d.date} className="py-0.5 px-1.5 leading-tight text-center">
                      {row.count(d.date)}
                    </td>
                  ))}
                  <td className="py-0.5 px-1.5 leading-tight text-center font-semibold">{rowTotal(row)}</td>
                </tr>
              ))}

              {showBilling && (
                <>
                  {sectionHeaderRow("Billing")}
                  {renderRow(billingRow, "billing", "bg-rose-100", true)}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
