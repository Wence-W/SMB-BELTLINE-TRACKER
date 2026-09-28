import { useQuery } from "convex/react";
import { Fragment, useMemo, useState } from "react";
import { DateRangeFilter, inDateRange } from "@/components/DateRangeFilter";
import { QuickDateRangeFilter, type DatePreset } from "@/components/QuickDateRangeFilter";
import { api } from "../../../convex/_generated/api";
import {
  BOOST_CATEGORIES,
  isInCurrentMonth,
  isInCurrentWeek,
  isToday,
} from "@/lib/intakeTypes";

function dateOnly(iso?: string): string | null {
  return iso ? iso.slice(0, 10) : null;
}

const BILLING_CATEGORIES = [
  { value: "new_claims", label: "New Claims" },
  { value: "ar_aging", label: "A/R Aging" },
  { value: "emails", label: "Emails" },
  { value: "boost_billing", label: "Boost Billing" },
] as const;

const PRECERT_TYPES = new Set<string>([
  "precert_bari",
  "precert_veins",
  "precert_general",
  "precert_modified_urgent",
  "precert_egd",
]);

// Raw case shape as returned by `api.cases.listAll`.
interface RawPrecertCase {
  assignedTo: string;
  createdAt: string;
  createdBy?: string;
  notes?: string;
  noteLog?: { addedAt: string; addedBy?: string }[];
  notesUpdatedAt?: string;
  notesUpdatedBy?: string;
}

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
// MUST be identical to StaffProductivityTab.tsx's copy of this function —
// that's what keeps the two tabs' totals in sync.
function precertOngoingEvents(c: RawPrecertCase): { date: string; staff: string }[] {
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

export function ReportsTab() {
  const [period, setPeriod] = useState<DatePreset>("today");
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  // Export Reports filters (Gretchen, 2026-08-13): explicit Created Date and
  // Completed Date ranges. When either range is set it takes over from the
  // Daily/Weekly/Monthly pills, so the numbers always describe one window.
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [completedFrom, setCompletedFrom] = useState("");
  const [completedTo, setCompletedTo] = useState("");
  // Team filter, deliberately in this filter card and not inside any table
  // (Gretchen, 2026-08-13: keep team filters separate from the data tables).
  const [teamFilter, setTeamFilter] = useState("all");
  // Boost Productivity Report (Gretchen, 2026-08-13b): moved here from the
  // Intake Team tab, above the Daily Productivity by Team cards. Has its own
  // Date From/To (kept separate from the Report Filters card above, same as
  // before) but is now scoped to whichever team is selected in the Team
  // filter above — it no longer shows company-wide when a team is picked.
  const [boostFrom, setBoostFrom] = useState("");
  const [boostTo, setBoostTo] = useState("");
  const rawTasks = useQuery(api.tasks.listAll);
  const rawCases = useQuery(api.cases.listAll);
  const intakeEntries = useQuery(api.intake.listEntries);
  const billingEntries = useQuery(api.billing.listEntries);
  const caseStaff = useQuery(api.staff.listAll);
  const intakeStaff = useQuery(api.intake.listStaff);
  const billingStaff = useQuery(api.billing.listStaff);
  // Intake Team's own metric set (Gretchen, 2026-08-13c): Inbound/Outbound
  // call counts plus the daily metrics logged on the Intake tab. Replaces
  // the generic Tasks Completed/Approved/Pre-Cert/Intake Activity/Billing
  // columns for Intake Team rows only — the other teams keep those.
  const dailyMetrics = useQuery(api.intake.listDailyMetrics);
  // Call Audit records (Wence, 2026-08-13): the Verification Team summary
  // shows Call Audits / Fax Docs / New Patient Chart instead of Intake
  // Activity / Billing Tasks. Call Audits are counted from the real audit
  // records (audits the staff member performed, by auditorName, on the
  // dateReviewed) — not from a manually logged number.
  const callAuditCounts = useQuery(api.callAudits.countsByAuditor);

  // Created/Completed Date range is scoped to Ins Verifiers (Verification
  // Team) only (Wence, 2026-08-13): the fields are hidden for every other
  // Team-filter selection, and any previously-typed range is ignored (not
  // applied) once you're off Verification Team so Intake/Billing/Other
  // numbers always stay on Daily/Weekly/Monthly.
  const isVerificationTeamFilter = teamFilter === "Verification Team";
  const hasCustomRange =
    isVerificationTeamFilter &&
    !!(createdFrom || createdTo || completedFrom || completedTo);
  const periodFn =
    period === "today"
      ? isToday
      : period === "week"
        ? isInCurrentWeek
        : period === "month"
          ? isInCurrentMonth
          : (dateISO: string) => inDateRange(dateISO, reportFrom, reportTo);

  // A "completion event" date (task/case completedAt, or the log date of an
  // intake/billing entry) has to satisfy the active window.
  const filterFn = useMemo(() => {
    if (!hasCustomRange) return periodFn;
    return (dateISO: string) =>
      inDateRange(dateISO, completedFrom, completedTo) &&
      (completedFrom || completedTo ? true : inDateRange(dateISO, createdFrom, createdTo));
  }, [hasCustomRange, periodFn, createdFrom, createdTo, completedFrom, completedTo]);

  // Created-date gate applied to the record itself (case/task created date).
  // Scoped to Verification Team only, same as hasCustomRange above.
  const createdOk = (createdAt?: string) =>
    !isVerificationTeamFilter || (!createdFrom && !createdTo)
      ? true
      : inDateRange(createdAt, createdFrom, createdTo);

  const allStaffNames = useMemo(() => {
    const names = new Set<string>();
    for (const s of caseStaff ?? []) names.add(s.name);
    for (const s of intakeStaff ?? []) names.add(s.name);
    for (const s of billingStaff ?? []) names.add(s.name);
    for (const t of rawTasks ?? []) names.add(t.assignedTo);
    return names;
  }, [caseStaff, intakeStaff, billingStaff, rawTasks]);

  const summary = useMemo(() => {
    const byStaff: Record<
      string,
      {
        tasksCompleted: number;
        intake: number;
        billing: number;
        billingCategories: Record<string, number>;
        precertNotes: number;
        approved: number;
      }
    > = {};
    function ensure(name: string) {
      return (byStaff[name] ??= {
        tasksCompleted: 0,
        intake: 0,
        billing: 0,
        billingCategories: {},
        precertNotes: 0,
        approved: 0,
      });
    }

    for (const name of allStaffNames) ensure(name);

    for (const t of rawTasks ?? []) {
      const completedDate = dateOnly(t.completedAt);
      if (!createdOk(t.createdDate)) continue;
      if (t.status === "completed" && completedDate && filterFn(completedDate)) {
        ensure(t.assignedTo).tasksCompleted += 1;
      }
    }
    // Case completions (from the Cases tracker) count as "Task Completed"
    // too — this is the team's actual day-to-day work, since the separate
    // Task Management tool (`tasks` table) is essentially unused.
    for (const c of rawCases ?? []) {
      if (!c.assignedTo) continue;
      if (!createdOk(c.createdAt)) continue;
      // An approved/partial-approval Pre-Cert case already counts under
      // "Approved" below — don't also double-count it as a plain Task
      // Completed (Wence, 2026-07-22).
      const isApprovedCase =
        c.authStatus === "approved" || c.authStatus === "partial_approval";
      const completedDate = dateOnly(c.completedAt);
      if (
        c.status === "completed" &&
        !isApprovedCase &&
        completedDate &&
        filterFn(completedDate)
      ) {
        ensure(c.assignedTo).tasksCompleted += 1;
      }
    }
    // Approved / Partial Approval (Pre-Cert auth outcome) credit: any day a
    // staff member added a note/update to a case that is (currently, or
    // ends up) in Approved/Partial Approval status counts as "Approved"
    // activity for that staff on that day — not just the single day the
    // case's status actually flipped to Approved. E.g. Gretchen adding a
    // follow-up note today on a case that was approved last week still
    // counts as Approved work today (Wence, 2026-08-07 — confirmed via
    // EXAMPLE-ID/EXAMPLE-ID approved weeks earlier but touched today, credited
    // as Approved today, not Ongoing). Credited to whoever added the note,
    // via the same precertOngoingEvents() helper Ongoing uses below.
    for (const c of rawCases ?? []) {
      if (!PRECERT_TYPES.has(c.caseType)) continue;
      if (!createdOk(c.createdAt)) continue;
      const isApprovedCase =
        c.authStatus === "approved" || c.authStatus === "partial_approval";
      // Auth Status "Cancelled" (Wence, 2026-09-02): the prior auth was
      // pulled after the fact. Notes dated before the cancellation keep
      // their Approved credit (if the case had been approved — approvedAt
      // set); notes on/after it count as On-going below instead. MUST stay
      // identical to StaffProductivityTab.tsx's copy of this logic.
      const authCancelled = c.authStatus === "cancelled";
      const cancelDate = authCancelled
        ? (dateOnly(c.authCancelledAt) ?? dateOnly(c.updatedAt))
        : null;
      if (!isApprovedCase && !(authCancelled && c.approvedAt)) continue;
      for (const ev of precertOngoingEvents(c)) {
        if (cancelDate && ev.date >= cancelDate) continue;
        if (filterFn(ev.date)) ensure(ev.staff).approved += 1;
      }
    }
    // Pre-Cert On-going — per-staff breakdown of the same metric Staff
    // Daily Productivity shows company-wide: credits whichever staff added
    // an update/note to a Pre-Cert case, on each day that falls in the
    // period. Deliberately NOT gated on the case's current status (Wence,
    // 2026-07-23): a note added while the case was still open must keep
    // counting for that day even if the case later gets completed — using
    // current status would retroactively erase yesterday's real activity.
    // A case worked on by the same staff on 3 different days in the week
    // counts 3 times, keeping day-column sums equal to this column's sum.
    // EXCEPTION (Wence, 2026-07-27): if the note/update that lands on the
    // same day the case got approved was added by the case's own assigned
    // staff, that's the same single approval action — don't also credit it
    // as a separate On-going event on top of the Approved credit above.
    for (const c of rawCases ?? []) {
      if (!PRECERT_TYPES.has(c.caseType)) continue;
      // Once a Pre-Cert case is Completed — Approved/Partial Approval OR
      // any other completed outcome (Denied, etc.) — any further notes
      // (added any day after) must NOT generate a separate On-going event
      // (Wence, 2026-08-07: notes on an already-completed case shouldn't
      // move it back into Ongoing or inflate that count, regardless of
      // auth outcome). EXCEPTION (Wence, 2026-09-02): if the auth was
      // cancelled (Auth Status "Cancelled"), notes dated on/after the
      // cancellation DO count as On-going again — real follow-up work on a
      // pulled auth. MUST stay identical to StaffProductivityTab.tsx's copy.
      const authCancelled = c.authStatus === "cancelled";
      if (c.status === "completed" && !authCancelled) continue;
      if (!createdOk(c.createdAt)) continue;
      const cancelDate = authCancelled
        ? (dateOnly(c.authCancelledAt) ?? dateOnly(c.updatedAt))
        : null;
      for (const ev of precertOngoingEvents(c)) {
        // Pre-cancellation notes: keep their old credit — Approved (above)
        // if the case had been approved, otherwise On-going only while the
        // case isn't Completed (same as the normal rule).
        if (cancelDate && ev.date < cancelDate) {
          if (c.approvedAt || c.status === "completed") continue;
        }
        if (filterFn(ev.date)) ensure(ev.staff).precertNotes += 1;
      }
    }
    for (const e of intakeEntries ?? []) {
      if (!filterFn(e.date)) continue;
      ensure(e.staff).intake += e.count;
    }
    for (const e of billingEntries ?? []) {
      if (!filterFn(e.date)) continue;
      ensure(e.staff).billing += e.tasksCompleted;
      if (e.category) {
        const categories = ensure(e.staff).billingCategories;
        // Each Billing Activity Log row can represent multiple completed
        // items. The category summary must use that manually entered count,
        // not count the row itself as one.
        categories[e.category] =
          (categories[e.category] ?? 0) + e.tasksCompleted;
      }
    }
    return byStaff;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rawTasks,
    rawCases,
    intakeEntries,
    billingEntries,
    filterFn,
    allStaffNames,
    createdFrom,
    createdTo,
    isVerificationTeamFilter,
  ]);

  // Per-staff Inbound/Outbound/New Patient Chart/GHL Chats/Fax Docs/Email
  // Sent/Call Audits, used only for Intake Team rows (Gretchen, 2026-08-13c).
  const intakeMetrics = useMemo(() => {
    const byStaff: Record<
      string,
      {
        inbound: number;
        outbound: number;
        newPatientIntake: number;
        ghlChats: number;
        faxDocs: number;
        emailsSent: number;
        callAudits: number;
        otherConcerns: number;
      }
    > = {};
    function ensure(name: string) {
      return (byStaff[name] ??= {
        inbound: 0,
        outbound: 0,
        newPatientIntake: 0,
        ghlChats: 0,
        faxDocs: 0,
        emailsSent: 0,
        callAudits: 0,
        otherConcerns: 0,
      });
    }
    for (const name of allStaffNames) ensure(name);
    for (const e of intakeEntries ?? []) {
      if (!filterFn(e.date)) continue;
      if (e.direction === "inbound") ensure(e.staff).inbound += e.count;
      else if (e.direction === "outbound") ensure(e.staff).outbound += e.count;
      // Inbound Others (Wence, 2026-08-13): the "Inbound Other Concern"
      // entries logged from the Verification Team cards on the Dashboard.
      if (e.category === "other_concerns") ensure(e.staff).otherConcerns += e.count;
    }
    for (const m of dailyMetrics ?? []) {
      if (!filterFn(m.date)) continue;
      const row = ensure(m.staff);
      row.newPatientIntake += m.newPatientIntake;
      row.ghlChats += m.ghlChats;
      row.faxDocs += m.faxDocs;
      row.emailsSent += m.emailsSent;
      row.callAudits += m.callAudits;
    }
    return byStaff;
  }, [allStaffNames, intakeEntries, dailyMetrics, filterFn]);

  // Verification/Other teams' Call Audits count (Wence, 2026-08-13): number
  // of Call Audit records the staff member performed (auditorName), dated by
  // dateReviewed and filtered by the same active window as everything else.
  // Name matching is case/space-insensitive so roster spellings still line up.
  const callAuditsByStaff = useMemo(() => {
    const byKey: Record<string, number> = {};
    for (const a of callAuditCounts ?? []) {
      const date = dateOnly(a.dateReviewed);
      if (!date || !filterFn(date)) continue;
      const key = (a.auditorName ?? "").trim().toLowerCase();
      if (!key) continue;
      byKey[key] = (byKey[key] ?? 0) + a.count;
    }
    const byStaff: Record<string, number> = {};
    for (const name of allStaffNames) {
      byStaff[name] = byKey[name.trim().toLowerCase()] ?? 0;
    }
    return byStaff;
  }, [callAuditCounts, filterFn, allStaffNames]);

  // Billing Team's category totals come from its Activity Log. Historical
  // aggregate Billing Tasks stay preserved but are intentionally not
  // attributed to one of the new categories.
  function billingGroupTotals(names: string[]) {
    return names.reduce(
      (acc, name) => {
        const categories = summary[name]?.billingCategories ?? {};
        const metrics = intakeMetrics[name];
        return {
          new_claims: acc.new_claims + (categories.new_claims ?? 0),
          ar_aging: acc.ar_aging + (categories.ar_aging ?? 0),
          emails: acc.emails + (categories.emails ?? 0),
          boost_billing: acc.boost_billing + (categories.boost_billing ?? 0),
          fax: acc.fax + (metrics?.faxDocs ?? 0),
          new_patient: acc.new_patient + (metrics?.newPatientIntake ?? 0),
        };
      },
      {
        new_claims: 0,
        ar_aging: 0,
        emails: 0,
        boost_billing: 0,
        fax: 0,
        new_patient: 0,
      },
    );
  }

  const teamTotals = useMemo(() => {
    const totals = { tasksCompleted: 0, intake: 0, billing: 0, approved: 0 };
    for (const v of Object.values(summary)) {
      totals.tasksCompleted += v.tasksCompleted;
      totals.intake += v.intake;
      totals.billing += v.billing;
      totals.approved += v.approved;
    }
    return totals;
  }, [summary]);

  const periodLabel = hasCustomRange
    ? [
        createdFrom || createdTo
          ? `Created ${createdFrom || "…"} → ${createdTo || "…"}`
          : "",
        completedFrom || completedTo
          ? `Completed ${completedFrom || "…"} → ${completedTo || "…"}`
          : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : period === "today"
      ? "Today"
      : period === "week"
        ? "This Week"
        : period === "month"
          ? "This Month"
          : `${reportFrom || "…"} → ${reportTo || "…"}`;

  // Group Staff Performance Summary rows by team: Verification Team, Intake
  // Team, Billing, then anyone else (e.g. only ever assigned a Task).
  // A person on multiple rosters (e.g. Rose is both Verification + Intake)
  // is grouped under their first/primary team only, per Wence (2026-07-22).
  const teamGroups = useMemo(() => {
    // Each staff member is grouped under exactly one team, even if they're
    // on multiple rosters (e.g. Rose is on both Verification + Intake
    // rosters but is grouped under Intake Team per Wence, 2026-07-22).
    // Priority order for resolving overlaps: Intake > Verification > Billing.
    const seen = new Set<string>();
    const groups: { label: string; names: string[] }[] = [
      { label: "Verification Team", names: [] },
      { label: "Intake Team", names: [] },
      { label: "Billing", names: [] },
      { label: "Other", names: [] },
    ];
    function addAll(list: string[], group: (typeof groups)[number]) {
      for (const name of [...list].sort((a, b) => a.localeCompare(b))) {
        if (seen.has(name) || !allStaffNames.has(name)) continue;
        seen.add(name);
        group.names.push(name);
      }
    }
    addAll((intakeStaff ?? []).map(s => s.name), groups[1]);
    addAll((caseStaff ?? []).map(s => s.name), groups[0]);
    addAll((billingStaff ?? []).map(s => s.name), groups[2]);
    addAll([...allStaffNames], groups[3]);
    return groups.filter(g => g.names.length > 0);
  }, [caseStaff, intakeStaff, billingStaff, allStaffNames]);

  const visibleTeamGroups = useMemo(
    () =>
      teamFilter === "all"
        ? teamGroups
        : teamGroups.filter(g => g.label === teamFilter),
    [teamGroups, teamFilter],
  );

  // Boost Productivity Report data (Gretchen, 2026-08-13b) — Boost
  // appointment activity (Booked/No Show/Cancelled) by staff, scoped by
  // this card's own Date From/To AND by the Team filter above (staff not
  // on the selected team's roster are excluded; "All Teams" shows everyone
  // with Boost activity, same as before the move).
  const boostSummary = useMemo(() => {
    const visibleNames = new Set(visibleTeamGroups.flatMap(g => g.names));
    const scoped = (intakeEntries ?? []).filter(
      e =>
        BOOST_CATEGORIES.includes(e.category) &&
        inDateRange(e.date, boostFrom, boostTo) &&
        (teamFilter === "all" || visibleNames.has(e.staff)),
    );
    const byStaff = new Map<string, { booked: number; noShow: number; cancelled: number }>();
    for (const e of scoped) {
      const row = byStaff.get(e.staff) ?? { booked: 0, noShow: 0, cancelled: 0 };
      if (e.category === "boost_booked") row.booked += e.count;
      else if (e.category === "boost_no_show") row.noShow += e.count;
      else if (e.category === "boost_cancelled") row.cancelled += e.count;
      byStaff.set(e.staff, row);
    }
    const rows = [...byStaff.entries()]
      .map(([staff, v]) => ({ staff, ...v, total: v.booked + v.noShow + v.cancelled }))
      .sort((a, b) => b.total - a.total || a.staff.localeCompare(b.staff));
    const totals = rows.reduce(
      (acc, r) => ({
        booked: acc.booked + r.booked,
        noShow: acc.noShow + r.noShow,
        cancelled: acc.cancelled + r.cancelled,
        total: acc.total + r.total,
      }),
      { booked: 0, noShow: 0, cancelled: 0, total: 0 },
    );
    const cards = [
      { label: "Boost Booked", value: totals.booked, color: "text-emerald-600" },
      { label: "Boost No Show", value: totals.noShow, color: "text-orange-600" },
      { label: "Boost Cancelled", value: totals.cancelled, color: "text-rose-600" },
      { label: "Total Boost Activity", value: totals.total, color: "text-violet-600" },
    ];
    return { rows, totals, cards };
  }, [intakeEntries, boostFrom, boostTo, teamFilter, visibleTeamGroups]);

  return (
    <div className="space-y-6">
      {/* ── Filters card — kept separate from every data table below
             (Gretchen, 2026-08-13) ───────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl shadow-sm p-4 space-y-3">
        <h3 className="font-semibold text-foreground text-sm">Report Filters</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <QuickDateRangeFilter
            preset={period}
            from={reportFrom}
            to={reportTo}
            onPresetChange={setPeriod}
            onRangeChange={({ from, to }) => {
              setReportFrom(from);
              setReportTo(to);
            }}
            idPrefix="reports-period"
          />
          {hasCustomRange && (
            <span className="text-[11px] text-muted-foreground">
              Ins Verifiers date range active — quick date filter ignored
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {/* Created/Completed Date — Ins Verifiers (Verification Team)
              export only (Wence, 2026-08-13). Hidden for every other Team
              selection; picking a different team also stops these ranges
              from affecting the data (see isVerificationTeamFilter gates
              above), so Intake/Billing/Other/All Teams always run on
              Daily/Weekly/Monthly. */}
          {isVerificationTeamFilter && (
            <>
              <DateRangeFilter
                label="Created Date"
                idPrefix="reports-created"
                from={createdFrom}
                to={createdTo}
                onChange={({ from, to }) => {
                  setCreatedFrom(from);
                  setCreatedTo(to);
                }}
              />
              <DateRangeFilter
                label="Completed Date"
                idPrefix="reports-completed"
                from={completedFrom}
                to={completedTo}
                onChange={({ from, to }) => {
                  setCompletedFrom(from);
                  setCompletedTo(to);
                }}
              />
            </>
          )}
          <div className="flex items-center gap-1.5">
            <label
              className="text-xs text-muted-foreground whitespace-nowrap"
              htmlFor="reports-team-filter"
            >
              Team
            </label>
            <select
              id="reports-team-filter"
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value)}
              className="bg-card border border-input/60 rounded-lg px-2.5 py-1.5 text-xs text-foreground"
            >
              <option value="all">All Teams</option>
              {teamGroups.map(g => (
                <option key={g.label} value={g.label}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl px-5 py-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {periodLabel} — Tasks Completed
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">
            {teamTotals.tasksCompleted}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl px-5 py-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {periodLabel} — Approved
          </p>
          <p className="mt-1 text-2xl font-bold text-blue-600">
            {teamTotals.approved}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl px-5 py-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {periodLabel} — Intake Activity
          </p>
          <p className="mt-1 text-2xl font-bold text-violet-600">
            {teamTotals.intake}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl px-5 py-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {periodLabel} — Billing Tasks
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-600">
            {teamTotals.billing}
          </p>
        </div>
      </div>

      {/* Verification/Other teams keep the original 5-column summary
          (Gretchen: Intake Team 2026-08-13c and Billing 2026-08-13d are
          split out below, each with their own columns). */}
      {visibleTeamGroups.some(g => g.label !== "Intake Team" && g.label !== "Billing") && (
        <div className="bg-card border border-border rounded-xl shadow-sm p-5">
          <h3 className="font-semibold text-foreground text-sm mb-3">
            Staff Performance Summary — {periodLabel}
          </h3>
          {Object.keys(summary).length === 0 ? (
            <p className="text-muted-foreground text-sm">No activity recorded for this period yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3">Staff</th>
                    <th className="py-2 pr-3 text-center">Tasks Completed</th>
                    <th className="py-2 pr-3 text-center">Approved</th>
                    <th className="py-2 pr-3 text-center">Pre-Cert On-going</th>
                    <th className="py-2 pr-3 text-center">Call Audits</th>
                    <th className="py-2 pr-3 text-center">Fax Docs</th>
                    <th className="py-2 pr-3 text-center">New Patient Chart</th>
                    <th className="py-2 pr-3 text-center">Inbound Others</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTeamGroups
                    .filter(group => group.label !== "Intake Team" && group.label !== "Billing")
                    .map(group => (
                      <Fragment key={group.label}>
                        <tr>
                          <td
                            colSpan={8}
                            className="pt-3 pb-1 pr-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                          >
                            {group.label}
                          </td>
                        </tr>
                        {group.names.map(name => {
                          const v = summary[name];
                          if (!v) return null;
                          return (
                            <tr key={`${group.label}-${name}`} className="border-b border-border hover:bg-muted">
                              <td className="py-2 pr-3 font-medium text-foreground">{name}</td>
                              <td className="py-2 pr-3 text-center">{v.tasksCompleted}</td>
                              <td className="py-2 pr-3 text-center">{v.approved}</td>
                              <td className="py-2 pr-3 text-center">{v.precertNotes}</td>
                              <td className="py-2 pr-3 text-center">{callAuditsByStaff[name] ?? 0}</td>
                              <td className="py-2 pr-3 text-center">
                                {intakeMetrics[name]?.faxDocs ?? 0}
                              </td>
                              <td className="py-2 pr-3 text-center">
                                {intakeMetrics[name]?.newPatientIntake ?? 0}
                              </td>
                              <td className="py-2 pr-3 text-center">
                                {intakeMetrics[name]?.otherConcerns ?? 0}
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Boost Productivity Report (Gretchen, 2026-08-13): only shown for
             Intake Team and All Teams views, positioned above the Intake
             Team Performance Summary. Hidden for Billing/Verification. */}
      {(teamFilter === "all" || teamFilter === "Intake Team") && (
        <div className="bg-card border-2 border-violet-500/40 rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div>
              <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
                Boost Productivity Report
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Boost appointment activity (Booked / No Show / Cancelled) by staff
                {teamFilter !== "all" ? ` — ${teamFilter}` : ""}.
              </p>
            </div>
            <DateRangeFilter
              idPrefix="boost-productivity"
              size="sm"
              from={boostFrom}
              to={boostTo}
              onChange={({ from, to }) => {
                setBoostFrom(from);
                setBoostTo(to);
              }}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {boostSummary.cards.map(card => (
              <div
                key={card.label}
                className="rounded-lg border border-border bg-muted/30 px-4 py-3"
              >
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {card.label}
                </p>
                <p className={`mt-1 text-2xl font-bold ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </div>

          {boostSummary.rows.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No Boost activity logged for this date range{teamFilter !== "all" ? " / team" : ""}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-1.5 pr-2">Staff</th>
                    <th className="py-1.5 px-2 text-right">Booked Appt</th>
                    <th className="py-1.5 px-2 text-right">No Show Appt</th>
                    <th className="py-1.5 px-2 text-right">Cancelled Appt</th>
                    <th className="py-1.5 pl-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {boostSummary.rows.map(row => (
                    <tr key={row.staff} className="border-b border-border">
                      <td className="py-1.5 pr-2 font-medium text-foreground">{row.staff}</td>
                      <td className="py-1.5 px-2 text-right">{row.booked}</td>
                      <td className="py-1.5 px-2 text-right">{row.noShow}</td>
                      <td className="py-1.5 px-2 text-right">{row.cancelled}</td>
                      <td className="py-1.5 pl-2 text-right font-semibold">{row.total}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border">
                    <td className="py-1.5 pr-2 font-semibold text-foreground">All Staff</td>
                    <td className="py-1.5 px-2 text-right font-semibold">{boostSummary.totals.booked}</td>
                    <td className="py-1.5 px-2 text-right font-semibold">{boostSummary.totals.noShow}</td>
                    <td className="py-1.5 px-2 text-right font-semibold">{boostSummary.totals.cancelled}</td>
                    <td className="py-1.5 pl-2 text-right font-semibold">{boostSummary.totals.total}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Intake Team gets its own Performance Summary with call-center
          metrics instead of the generic productivity columns (Gretchen,
          2026-08-13c). */}
      {visibleTeamGroups
        .filter(group => group.label === "Intake Team")
        .map(group => (
          <div
            key={`intake-summary-${group.label}`}
            className="bg-card border border-border rounded-xl shadow-sm p-5"
          >
            <h3 className="font-semibold text-foreground text-sm mb-3">
              Intake Team — Performance Summary — {periodLabel}
            </h3>
            {group.names.length === 0 ? (
              <p className="text-muted-foreground text-sm">No Intake Team staff found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                      <th className="py-2 pr-3">Staff</th>
                      <th className="py-2 pr-3 text-center">Inbound</th>
                      <th className="py-2 pr-3 text-center">Outbound</th>
                      <th className="py-2 pr-3 text-center">New Patient Chart</th>
                      <th className="py-2 pr-3 text-center">GHL Chats</th>
                      <th className="py-2 pr-3 text-center">Fax Docs</th>
                      <th className="py-2 pr-3 text-center">Email Sent</th>
                      <th className="py-2 pr-3 text-center">Call Audits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.names.map(name => {
                      const v = intakeMetrics[name];
                      if (!v) return null;
                      return (
                        <tr key={`intake-summary-${name}`} className="border-b border-border hover:bg-muted">
                          <td className="py-2 pr-3 font-medium text-foreground">{name}</td>
                          <td className="py-2 pr-3 text-center">{v.inbound}</td>
                          <td className="py-2 pr-3 text-center">{v.outbound}</td>
                          <td className="py-2 pr-3 text-center">{v.newPatientIntake}</td>
                          <td className="py-2 pr-3 text-center">{v.ghlChats}</td>
                          <td className="py-2 pr-3 text-center">{v.faxDocs}</td>
                          <td className="py-2 pr-3 text-center">{v.emailsSent}</td>
                          <td className="py-2 pr-3 text-center">{v.callAudits}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}

      {/* Billing Team's Performance Summary uses the Billing Activity Log
          categories (Wence, 2026-08-14). */}
      {visibleTeamGroups
        .filter(group => group.label === "Billing")
        .map(group => {
          const totals = billingGroupTotals(group.names);
          return (
            <div
              key={`billing-summary-${group.label}`}
              className="bg-card border border-border rounded-xl shadow-sm p-5"
            >
              <h3 className="font-semibold text-foreground text-sm mb-3">
                Billing Team — Performance Summary — {periodLabel}
              </h3>
              {group.names.length === 0 ? (
                <p className="text-muted-foreground text-sm">No Billing Team staff found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                        <th className="py-2 pr-3">Staff</th>
                        {BILLING_CATEGORIES.map(category => (
                          <th key={category.value} className="py-2 pr-3 text-center">
                            {category.label}
                          </th>
                        ))}
                        <th className="py-2 pr-3 text-center">Fax</th>
                        <th className="py-2 pr-3 text-center">New Patient</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.names.map(name => {
                        const categories = summary[name]?.billingCategories ?? {};
                        const metrics = intakeMetrics[name];
                        return (
                          <tr key={`billing-summary-${name}`} className="border-b border-border hover:bg-muted">
                            <td className="py-2 pr-3 font-medium text-foreground">{name}</td>
                            {BILLING_CATEGORIES.map(category => (
                              <td key={category.value} className="py-2 pr-3 text-center">
                                {categories[category.value] ?? 0}
                              </td>
                            ))}
                            <td className="py-2 pr-3 text-center">{metrics?.faxDocs ?? 0}</td>
                            <td className="py-2 pr-3 text-center">
                              {metrics?.newPatientIntake ?? 0}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 border-border">
                        <td className="py-2 pr-3 font-semibold text-foreground">
                          {group.label} Total
                        </td>
                        {BILLING_CATEGORIES.map(category => (
                          <td key={category.value} className="py-2 pr-3 text-center font-semibold">
                            {totals[category.value]}
                          </td>
                        ))}
                        <td className="py-2 pr-3 text-center font-semibold">{totals.fax}</td>
                        <td className="py-2 pr-3 text-center font-semibold">
                          {totals.new_patient}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

    </div>
  );
}
