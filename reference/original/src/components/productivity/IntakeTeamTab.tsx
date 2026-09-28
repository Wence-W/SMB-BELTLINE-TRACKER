import { useMutation, useQuery } from "convex/react";
import { DateRangeFilter, inDateRange } from "@/components/DateRangeFilter";
import { Copy } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatDateTimeEST } from "@/lib/dateFormat";
import { BookedTrackerPanel } from "@/components/productivity/BookedTrackerPanel";
import { PiedmontEpicPanel } from "@/components/productivity/PiedmontEpicPanel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  ACTIVE_INTAKE_CATEGORIES,
  BOOST_CATEGORIES,
  INBOUND_CATEGORY_BUCKETS,
  INTAKE_CATEGORIES,
  OUTBOUND_CATEGORY_BUCKETS,
  addDays,
  addMonths,
  addWeeks,
  categoryLabel,
  fromDateInputValue,
  getDayRange,
  getMonthRange,
  getWeekRange,
  resultLabel,
  resultOptionsForDirection,
  toDateInputValue,
  type IntakeDirection,
} from "@/lib/intakeTypes";
import { now } from "@/lib/store";
import {
  exportIntakeToXLSX,
  filterIntakeByDateRange,
} from "@/lib/exportUtils";
import { ConfirmModal } from "@/components/bari/ConfirmModal";
import { useHasRestrictedAccess } from "@/lib/permissions";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const inputCls =
  "w-full bg-card border border-input text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-primary";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

const METRIC_FIELDS = [
  ["emailsSent", "Emails Sent"],
  ["ghlChats", "GHL Chats"],
  ["newPatientIntake", "New Patient Chart"],
  ["callAudits", "Call Audits"],
  ["faxDocs", "Fax Docs"],
] as const;

type MetricKey = (typeof METRIC_FIELDS)[number][0];

// Split into sidebar sub-views per Wence: "Intake" (log entry + staff
// roster) stays the default landing view; "Activity Log" (renamed from
// "Reports" 2026-08-03, Weekly/Monthly Productivity, Activity Reports, Raw
// Entries) and "Booked Tracker" (added 2026-08-03: per-staff booked
// appointment breakdown) are nested underneath it — same pattern as Staff
// Daily Productivity's nested Reports tab. All views share this one
// component/query set; only the returned JSX differs.
export function IntakeTeamTab({ view = "log" }: { view?: "log" | "reports" | "booked" }) {
  const staff = useQuery(api.intake.listStaff);
  const entries = useQuery(api.intake.listEntries);
  const dailyMetrics = useQuery(api.intake.listDailyMetrics);
  const seedStaff = useMutation(api.intake.seedStaffDefaults);
  const addEntry = useMutation(api.intake.addEntry);
  const deleteEntry = useMutation(api.intake.deleteEntry);
  const upsertMetric = useMutation(api.intake.upsertDailyMetric);
  const deleteMetric = useMutation(api.intake.deleteDailyMetric);

  useEffect(() => {
    seedStaff({}).catch(() => {});
  }, [seedStaff]);

  const staffNames = useMemo(() => (staff ?? []).map(s => s.name), [staff]);

  // Single combined form: one staff + date logs both an Intake category
  // count AND the daily metrics numbers in one save, so staff no longer
  // have to log twice (merged 2026-07-17 per Wence's request).
  const [form, setForm] = useState({
    staff: "",
    date: todayISO(),
    category: "",
    result: "",
    count: 1,
    notes: "",
    patientId: "",
    otherInfo: "",
    emailsSent: 0,
    ghlChats: 0,
    newPatientIntake: 0,
    callAudits: 0,
    faxDocs: 0,
  });

  useEffect(() => {
    if (staffNames.length > 0 && !form.staff) {
      setForm(f => ({ ...f, staff: staffNames[0] }));
    }
  }, [staffNames, form.staff]);

  function handleSave() {
    if (!form.staff) {
      toast.error("Select a staff member");
      return;
    }
    const count = Number(form.count) || 0;
    const metricsFilled = METRIC_FIELDS.some(([key]) => Number(form[key]) > 0);
    const loggingCategory = count > 0 && !!form.category;

    if (count > 0 && !form.category) {
      toast.error("Select a category, or set Category to None and Count to 0");
      return;
    }

    if (!loggingCategory && !metricsFilled) {
      toast.error("Enter a category count or at least one metric value");
      return;
    }

    const jobs: Promise<unknown>[] = [];

    if (loggingCategory) {
      const cat = INTAKE_CATEGORIES.find(c => c.value === form.category);
      const direction = (cat?.direction ?? "inbound") as IntakeDirection;
      const isBoost = BOOST_CATEGORIES.includes(form.category);
      jobs.push(
        addEntry({
          staff: form.staff,
          date: form.date,
          direction,
          category: form.category,
          result: !isBoost && form.result ? form.result : undefined,
          count,
          notes: form.notes || undefined,
          createdAt: now(),
          patientId: form.patientId || undefined,
          otherInfo: form.otherInfo || undefined,
        }),
      );
    }

    if (metricsFilled) {
      jobs.push(
        upsertMetric({
          staff: form.staff,
          date: form.date,
          emailsSent: Number(form.emailsSent) || 0,
          ghlChats: Number(form.ghlChats) || 0,
          newPatientIntake: Number(form.newPatientIntake) || 0,
          callAudits: Number(form.callAudits) || 0,
          faxDocs: Number(form.faxDocs) || 0,
          updatedAt: now(),
        }),
      );
    }

    Promise.all(jobs)
      .then(() => {
        toast.success("Activity logged");
        setForm(f => ({
          ...f,
          category: "",
          count: 1,
          result: "",
          notes: "",
          patientId: "",
          otherInfo: "",
          emailsSent: 0,
          ghlChats: 0,
          newPatientIntake: 0,
          callAudits: 0,
          faxDocs: 0,
        }));
      })
      .catch(() => toast.error("Failed to log activity"));
  }

  const allEntries = entries ?? [];
  const allMetrics = dailyMetrics ?? [];

  // ─── Intake Log spreadsheet view (2026-07-24 per Wence's mockup) ───
  // A date-grouped list of logged entries shown right on the Log tab
  // (not nested under Reports): Patient ID / Staff / Call Reason / Notes
  // (summary, full text on click) / Resolution / Others. 20 rows/page,
  // with a date filter ("calendar selection").
  const [logSheetDateFilter, setLogSheetDateFilter] = useState("");
  // Date From / Date To ranges added to every Intake tab section
  // (Gretchen, 2026-08-13).
  const [logSheetFrom, setLogSheetFrom] = useState("");
  const [logSheetTo, setLogSheetTo] = useState("");
  const [logSheetStaffFilter, setLogSheetStaffFilter] = useState("");
  // Inbound/Outbound category-direction filter for the Intake Log (Wence, 2026-08-21).
  const [logSheetDirectionFilter, setLogSheetDirectionFilter] = useState<"" | IntakeDirection>("");
  const [logSheetPage, setLogSheetPage] = useState(1);
  const [logSheetNote, setLogSheetNote] = useState<{
    _id: Id<"intakeEntries">;
    patientId: string;
    notes: string;
    category: string;
    result?: string;
    direction: IntakeDirection;
    createdAt: string;
  } | null>(null);
  const [logSheetNoteDraft, setLogSheetNoteDraft] = useState("");
  const [logSheetPatientIdDraft, setLogSheetPatientIdDraft] = useState("");
  const [logSheetCategoryDraft, setLogSheetCategoryDraft] = useState("");
  const [logSheetResultDraft, setLogSheetResultDraft] = useState("");
  const [logSheetNoteEditing, setLogSheetNoteEditing] = useState(false);
  const [logSheetDeleteConfirm, setLogSheetDeleteConfirm] = useState(false);
  const [copiedPatientId, setCopiedPatientId] = useState<string | null>(null);
  const updateEntryDetails = useMutation(api.intake.updateEntryDetails);
  const LOG_SHEET_PAGE_SIZE = 25;

  // Activity Log tabs: "Intake Activity" (log form + Intake Log
  // spreadsheet) and "Raw Entries" (moved into its own tab, Gretchen
  // 2026-08-05).
  const [activityLogTab, setActivityLogTab] = useState<"intake" | "raw" | "piedmont">("intake");

  async function copyPatientIdToClipboard(value: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedPatientId(value);
      toast.success("Patient ID copied.");
      setTimeout(() => setCopiedPatientId(id => (id === value ? null : id)), 1500);
    } catch {
      toast.error("Failed to copy Patient ID.");
    }
  }

  // Export Excel / Export PDF / Print Report / Reset toolbar for the
  // Intake Log (mirrors the Cases tab toolbar), per Wence 2026-07-24.
  const deleteAllEntriesMut = useMutation(api.intake.deleteAllEntries);
  // Activity Log Export/Reset + Intake Staff Team Add/Remove restricted to
  // the allowlist (Wence, 2026-08-06) — server-side mutations reject
  // anyone else too, this just keeps the UI clean.
  const canManageRestricted = useHasRestrictedAccess();
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [intakeResetConfirm, setIntakeResetConfirm] = useState(false);
  const handleIntakeReset = () => {
    deleteAllEntriesMut({})
      .then(() => {
        setIntakeResetConfirm(false);
        toast.success("Intake log has been reset");
      })
      .catch(() => toast.error("Failed to reset intake log"));
  };

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

  const logSheetTotalPages = Math.max(1, Math.ceil(logSheetEntries.length / LOG_SHEET_PAGE_SIZE));
  const logSheetPageClamped = Math.min(logSheetPage, logSheetTotalPages);
  const logSheetPageRows = logSheetEntries.slice(
    (logSheetPageClamped - 1) * LOG_SHEET_PAGE_SIZE,
    logSheetPageClamped * LOG_SHEET_PAGE_SIZE,
  );

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

  // Calendar-driven period navigation: each card has its own reference date
  // (defaults to today) that can be paged with prev/next arrows or jumped
  // to directly via the date picker (added 2026-07-17 per Wence's mockup;
  // "Today's Productivity" card removed same day per Wence's request).
  const [weekRef, setWeekRef] = useState(new Date());
  const [monthRef, setMonthRef] = useState(new Date());

  // Each productivity card also has its own Daily/Weekly/Monthly pill tabs
  // (Wence 2026-08-07, option 2: "keep both cards, add tabs to each"). The
  // tab changes how the reference date is widened into a range and what the
  // prev/next arrows step by; the cards keep their default period.
  // Intake reports view is split into four pill tabs (Wence 2026-08-07):
  // Activity Reports / Daily / Weekly / Monthly Productivity. Each
  // productivity tab shows one card with its own date navigation.
  const [reportsTab, setReportsTab] = useState<
    "activity" | "daily" | "weekly" | "monthly"
  >("activity");
  const [dayRef, setDayRef] = useState(new Date());

  const dayRange = getDayRange(dayRef);
  const weekRange = getWeekRange(weekRef);
  const monthRange = getMonthRange(monthRef);

  const daySummary = summarize(dayRange.inRange);
  const weekSummary = summarize(weekRange.inRange);
  const monthSummary = summarize(monthRange.inRange);

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

  // Calendar filter for the raw log (added 2026-07-17 per Wence's
  // request). Empty string = show all dates.
  const [logDateFilter, setLogDateFilter] = useState("");
  const [logFrom, setLogFrom] = useState("");
  const [logTo, setLogTo] = useState("");
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

  // ─── Per-staff Activity Reports (Inbound / Outbound / Admin Task) ───
  // Replaces the old flat Activity Log with the 3-table report per Wence's
  // "Activity Reports" mockup (2026-07-17): a staff picker + optional date
  // filter drives Category+Result breakdowns per direction, plus an Admin
  // Task tally from Daily Metrics.
  // reportStaff "" = All Staff (combined totals) — added 2026-08-07 per Wence
  // (option 1a). Previously defaulted to the first staff name; now the report
  // opens on All Staff and every staff filter below is opt-in.
  const [reportStaff, setReportStaff] = useState("");
  const [reportDateFilter, setReportDateFilter] = useState("");
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
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

  // ─── Booked Tracker (added 2026-08-03 per Wence) ───
  return (
    <div className="space-y-6">
      {view === "log" && (
      <>
      {/* Activity Log tabs (Gretchen, 2026-08-05): "Intake Activity" (log
          form + Intake Log spreadsheet) and "Raw Entries" (Admin Task
          metric lines only — Intake Log entries no longer auto-populate
          here). Accent color works in both light and dark mode. */}
      <Tabs value={activityLogTab} onValueChange={v => setActivityLogTab(v as "intake" | "raw" | "piedmont")}>
        <TabsList>
          <TabsTrigger
            value="intake"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
          >
            Intake Activity
          </TabsTrigger>
          {/* Piedmont: Epic referral tab (Wence, 2026-09-10; reordered
              before Raw Entries per Wence, 2026-09-10 follow-up) */}
          <TabsTrigger
            value="piedmont"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
          >
            Piedmont: Epic
          </TabsTrigger>
          <TabsTrigger
            value="raw"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
          >
            Raw Entries ({filteredLog.length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {activityLogTab === "intake" && (
      <>
      {/* Intake Team Staff panel moved to Intake Directory > Intake Team tab
          (Wence, 2026-08-07). Staff data (intakeStaff table) and
          addStaffMut/deleteStaffMut are still used elsewhere on this page
          (staff pickers), so left in place. */}

      {/* Log activity (category + daily metrics, merged into one form) */}
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="font-semibold text-foreground text-sm mb-3">
          Log Intake Activity
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end mb-3">
          <div>
            <label className={labelCls} htmlFor="intake-patient-id">Patient ID</label>
            <input
              id="intake-patient-id"
              type="text"
              className={inputCls}
              placeholder="e.g. EXAMPLE-ID"
              value={form.patientId}
              onChange={e => setForm(f => ({ ...f, patientId: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="intake-staff">Staff</label>
            <select
              id="intake-staff"
              className={inputCls}
              value={form.staff}
              onChange={e => setForm(f => ({ ...f, staff: e.target.value }))}
            >
              {staffNames.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="intake-category">Category</label>
            <select
              id="intake-category"
              className={inputCls}
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value, result: "" }))}
            >
              <option value="">— None —</option>
              <optgroup label="Inbound">
                {ACTIVE_INTAKE_CATEGORIES.filter(
                  c => c.direction === "inbound" && !BOOST_CATEGORIES.includes(c.value),
                ).map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </optgroup>
              <optgroup label="Outbound">
                {ACTIVE_INTAKE_CATEGORIES.filter(
                  c => c.direction === "outbound" && !BOOST_CATEGORIES.includes(c.value),
                ).map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </optgroup>
              <optgroup label="Boost">
                {ACTIVE_INTAKE_CATEGORIES.filter(c => BOOST_CATEGORIES.includes(c.value)).map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </optgroup>
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="intake-count">Count</label>
            <input
              id="intake-count"
              type="number"
              min={0}
              className={inputCls}
              value={form.count}
              onChange={e => setForm(f => ({ ...f, count: Number(e.target.value) }))}
            />
          </div>
          {!BOOST_CATEGORIES.includes(form.category) && (
            <div>
              <label className={labelCls} htmlFor="intake-result">Result</label>
              <select
                id="intake-result"
                className={inputCls}
                value={form.result}
                onChange={e => setForm(f => ({ ...f, result: e.target.value }))}
              >
                <option value="">— None —</option>
                {resultOptionsForDirection(
                  (INTAKE_CATEGORIES.find(c => c.value === form.category)?.direction ??
                    "inbound") as IntakeDirection,
                ).map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 items-end mb-3">
          <div>
            <label className={labelCls} htmlFor="intake-notes">Additional Notes</label>
            <input
              id="intake-notes"
              type="text"
              className={inputCls}
              placeholder="Full details / notes for this call"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          {METRIC_FIELDS.map(([key, label]) => (
            <div key={key}>
              <label className={labelCls} htmlFor={`metric-${key}`}>{label}</label>
              <input
                id={`metric-${key}`}
                type="number"
                min={0}
                className={inputCls}
                value={form[key as MetricKey]}
                onChange={e =>
                  setForm(f => ({ ...f, [key]: Number(e.target.value) }))
                }
              />
            </div>
          ))}
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary hover:bg-primary text-white transition-colors shadow-sm h-[38px]"
          >
            + Log Activity
          </button>
        </div>
        <p className="text-muted-foreground text-xs mt-2">
          Leave Category Count at 0 to skip it, or leave metrics at 0 to skip those — only fields you fill in get saved.
        </p>
      </div>

      {/* Intake Log spreadsheet (2026-07-24, per Wence's mockup) */}
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h3 className="font-semibold text-foreground text-sm">
            Intake Log ({logSheetEntries.length} entries)
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <DateRangeFilter
              label="Export"
              idPrefix="intake-export"
              size="sm"
              from={exportFrom}
              to={exportTo}
              onChange={({ from, to }) => {
                setExportFrom(from);
                setExportTo(to);
              }}
            />
            {/* Export/Reset restricted to the allowlist (Wence, 2026-08-06)
                — hidden entirely for everyone else. */}
            {canManageRestricted && (
            <>
            <button
              onClick={() =>
                exportIntakeToXLSX(
                  filterIntakeByDateRange(logSheetEntries, { from: exportFrom, to: exportTo }),
                )
              }
              disabled={logSheetEntries.length === 0}
              className="px-3 py-1.5 rounded-lg bg-emerald-700/40 hover:bg-emerald-700/70 text-emerald-700 border border-emerald-600/40 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Export Excel
            </button>
            <button
              onClick={() => setIntakeResetConfirm(true)}
              disabled={logSheetEntries.length === 0}
              className="px-3 py-1.5 rounded-lg bg-orange-600/20 hover:bg-orange-600/40 text-orange-700 dark:text-orange-400 border border-orange-600/40 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Reset
            </button>
            </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-2">
            <select
              value={logSheetDirectionFilter}
              onChange={e => {
                setLogSheetDirectionFilter(e.target.value as "" | IntakeDirection);
                setLogSheetPage(1);
              }}
              className="rounded-md border border-input px-2 py-1 text-xs text-foreground"
            >
              <option value="">All Categories</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
            <select
              value={logSheetStaffFilter}
              onChange={e => {
                setLogSheetStaffFilter(e.target.value);
                setLogSheetPage(1);
              }}
              className="rounded-md border border-input px-2 py-1 text-xs text-foreground"
            >
              <option value="">All Staff</option>
              {staffNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <input
              type="date"
              value={logSheetDateFilter}
              onChange={e => {
                setLogSheetDateFilter(e.target.value);
                setLogSheetPage(1);
              }}
              className="rounded-md border border-input px-2 py-1 text-xs text-foreground"
            />
            <DateRangeFilter
              idPrefix="intake-logsheet"
              size="sm"
              from={logSheetFrom}
              to={logSheetTo}
              onChange={({ from, to }) => {
                setLogSheetFrom(from);
                setLogSheetTo(to);
                setLogSheetPage(1);
              }}
            />
            {(logSheetDateFilter || logSheetStaffFilter || logSheetDirectionFilter) && (
              <button
                onClick={() => {
                  setLogSheetDateFilter("");
                  setLogSheetStaffFilter("");
                  setLogSheetDirectionFilter("");
                  setLogSheetPage(1);
                }}
                className="text-xs text-primary hover:text-primary font-medium"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {logSheetEntries.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {logSheetDateFilter || logSheetStaffFilter || logSheetDirectionFilter ? "No entries match these filters." : "No entries yet."}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 whitespace-nowrap">Patient Chart</th>
                    <th className="py-2 pr-3 whitespace-nowrap">Staff</th>
                    <th className="py-2 pr-3 whitespace-nowrap">Call Reason</th>
                    <th className="py-2 pr-3 whitespace-nowrap">Resolution</th>
                    <th className="py-2 pr-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {logSheetPageRows.map((e) => {
                    const noteText = e.notes?.trim() ?? "";
                    const noteSummary =
                      noteText.length > 40 ? `${noteText.slice(0, 40)}…` : noteText;
                    const openEntry = () => {
                      setLogSheetNote({
                        _id: e._id,
                        patientId: e.patientId ?? "",
                        notes: noteText || "No additional notes.",
                        category: e.category,
                        result: e.result,
                        direction: e.direction as IntakeDirection,
                        createdAt: e.createdAt,
                      });
                      setLogSheetNoteDraft(noteText);
                      setLogSheetPatientIdDraft(e.patientId ?? "");
                      setLogSheetCategoryDraft(e.category);
                      setLogSheetResultDraft(e.result ?? "");
                      setLogSheetNoteEditing(false);
                    };
                    const patientIdText = e.patientId?.trim() ?? "";
                    const patientIdSummary =
                      patientIdText.length > 24 ? `${patientIdText.slice(0, 24)}…` : patientIdText;
                    return (
                      // Entire row opens the entry's details (Gretchen,
                      // 2026-08-05) — Patient ID keeps its own copy-to-clipboard
                      // control, which stops propagation so it doesn't also
                      // open the modal.
                      <tr
                        key={e._id}
                        onClick={openEntry}
                        className="border-b border-border hover:bg-muted cursor-pointer"
                      >
                        <td className="py-2 pr-3 max-w-[180px]">
                          {patientIdText ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="text-primary font-medium" title={patientIdText}>
                                {patientIdSummary}
                              </span>
                              <button
                                type="button"
                                title="Copy Patient ID"
                                onClick={e2 => {
                                  e2.stopPropagation();
                                  void copyPatientIdToClipboard(patientIdText);
                                }}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <Copy className="size-3" />
                              </button>
                              {copiedPatientId === patientIdText && (
                                <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                                  Copied!
                                </span>
                              )}
                            </span>
                          ) : (
                            "\u00A0"
                          )}
                        </td>
                        <td className="py-2 pr-3 font-medium text-foreground whitespace-nowrap">{e.staff}</td>
                        <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                          {categoryLabel(e.category)}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                          {resultLabel(e.result)}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {noteSummary || "\u00A0"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-muted-foreground">
                Page {logSheetPageClamped} of {logSheetTotalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLogSheetPage(p => Math.max(1, p - 1))}
                  disabled={logSheetPageClamped <= 1}
                  className="text-xs font-medium text-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setLogSheetPage(p => Math.min(logSheetTotalPages, p + 1))}
                  disabled={logSheetPageClamped >= logSheetTotalPages}
                  className="text-xs font-medium text-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {logSheetNote && (
        <>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            role="button"
            tabIndex={0}
            aria-label="Close"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setLogSheetNote(null)}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === " ") setLogSheetNote(null);
            }}
          />
          <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6">
            <h2 className="font-bold text-foreground text-base mb-1">
              Entry {!logSheetNoteEditing && logSheetNote.patientId ? `— ${logSheetNote.patientId}` : ""}
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              Logged {formatDateTimeEST(logSheetNote.createdAt)}
            </p>

            <div className="mb-4">
              <label className="block text-xs font-medium text-muted-foreground uppercase mb-1">
                Patient Chart
              </label>
              {logSheetNoteEditing ? (
                <input
                  type="text"
                  value={logSheetPatientIdDraft}
                  onChange={e => setLogSheetPatientIdDraft(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. EXAMPLE-ID"
                />
              ) : (
                <p className="text-foreground text-sm">{logSheetNote.patientId || "\u00A0"}</p>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-muted-foreground uppercase mb-1">
                Call Reason
              </label>
              {logSheetNoteEditing ? (
                <select
                  value={logSheetCategoryDraft}
                  onChange={e => setLogSheetCategoryDraft(e.target.value)}
                  className={inputCls}
                >
                  {ACTIVE_INTAKE_CATEGORIES.filter(c => c.direction === logSheetNote.direction).map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                  {/* Keep the current value selectable even if it's a legacy/deprecated category */}
                  {!ACTIVE_INTAKE_CATEGORIES.some(c => c.value === logSheetCategoryDraft) && (
                    <option value={logSheetCategoryDraft}>{categoryLabel(logSheetCategoryDraft)}</option>
                  )}
                </select>
              ) : (
                <p className="text-foreground text-sm">{categoryLabel(logSheetNote.category)}</p>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-muted-foreground uppercase mb-1">
                Resolution
              </label>
              {logSheetNoteEditing ? (
                <select
                  value={logSheetResultDraft}
                  onChange={e => setLogSheetResultDraft(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— None —</option>
                  {resultOptionsForDirection(logSheetNote.direction).map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              ) : (
                <p className="text-foreground text-sm">{resultLabel(logSheetNote.result)}</p>
              )}
            </div>

            <div className="mb-2">
              <label className="block text-xs font-medium text-muted-foreground uppercase mb-1">
                Notes
              </label>
              {logSheetNoteEditing ? (
                <textarea
                  value={logSheetNoteDraft}
                  onChange={e => setLogSheetNoteDraft(e.target.value)}
                  rows={5}
                  className={`${inputCls} resize-y`}
                  placeholder="Full details / notes for this call"
                />
              ) : (
                <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                  {logSheetNote.notes}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              {logSheetNoteEditing ? (
                <>
                  <button
                    onClick={() => {
                      setLogSheetPatientIdDraft(logSheetNote.patientId ?? "");
                      setLogSheetCategoryDraft(logSheetNote.category);
                      setLogSheetResultDraft(logSheetNote.result ?? "");
                      setLogSheetNoteDraft(
                        logSheetNote.notes === "No additional notes." ? "" : logSheetNote.notes,
                      );
                      setLogSheetNoteEditing(false);
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-muted hover:bg-muted text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      updateEntryDetails({
                        _id: logSheetNote._id,
                        patientId: logSheetPatientIdDraft.trim(),
                        category: logSheetCategoryDraft,
                        result: logSheetResultDraft,
                        notes: logSheetNoteDraft || undefined,
                      })
                        .then(() => {
                          setLogSheetNote(n =>
                            n
                              ? {
                                  ...n,
                                  patientId: logSheetPatientIdDraft.trim(),
                                  category: logSheetCategoryDraft,
                                  result: logSheetResultDraft,
                                  notes: logSheetNoteDraft || "No additional notes.",
                                }
                              : n,
                          );
                          setLogSheetNoteEditing(false);
                          toast.success("Entry updated");
                        })
                        .catch(() => toast.error("Failed to save entry"));
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-primary hover:bg-primary text-white transition-colors"
                  >
                    Save
                  </button>
                </>
              ) : (
                // Button order: Edit | Delete | Close (Gretchen, 2026-08-05).
                <>
                  <button
                    onClick={() => setLogSheetNoteEditing(true)}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-primary hover:bg-primary text-white transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setLogSheetDeleteConfirm(true)}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-rose-600 hover:bg-rose-500 text-white transition-colors"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setLogSheetNote(null)}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-muted hover:bg-muted text-foreground transition-colors"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <ConfirmModal
          open={logSheetDeleteConfirm}
          title="Delete Entry"
          message="This will permanently delete this Intake Log entry. This cannot be undone."
          confirmLabel="Delete"
          confirmVariant="danger"
          onConfirm={() => {
            if (!logSheetNote) return;
            deleteEntry({ _id: logSheetNote._id })
              .then(() => {
                setLogSheetDeleteConfirm(false);
                setLogSheetNote(null);
                toast.success("Entry deleted");
              })
              .catch(() => toast.error("Failed to delete entry"));
          }}
          onCancel={() => setLogSheetDeleteConfirm(false)}
        />
        </>
      )}

      <ConfirmModal
        open={intakeResetConfirm}
        title="Reset Intake Log"
        message="This will permanently delete ALL Intake Log entries. This cannot be undone."
        confirmLabel="Reset Everything"
        confirmVariant="danger"
        onConfirm={handleIntakeReset}
        onCancel={() => setIntakeResetConfirm(false)}
      />
      </>
      )}

      {activityLogTab === "raw" && (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="font-semibold text-foreground text-sm mb-3">
          Raw Entries ({filteredLog.length})
        </h3>
        <>
            <div className="flex items-center gap-2 mt-3 mb-3">
              <input
                type="date"
                value={logDateFilter}
                onChange={e => setLogDateFilter(e.target.value)}
                className="rounded-md border border-input px-2 py-1 text-xs text-foreground"
              />
              <DateRangeFilter
                idPrefix="intake-raw"
                size="sm"
                from={logFrom}
                to={logTo}
                onChange={({ from, to }) => {
                  setLogFrom(from);
                  setLogTo(to);
                }}
              />
              {logDateFilter && (
                <button
                  onClick={() => setLogDateFilter("")}
                  className="text-xs text-primary hover:text-primary font-medium"
                >
                  Clear
                </button>
              )}
            </div>
            {filteredLog.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {logDateFilter ? "No entries for this date." : "No entries yet."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Staff</th>
                      <th className="py-2 pr-3">Category</th>
                      <th className="py-2 pr-3">Result</th>
                      <th className="py-2 pr-3 text-right">Count</th>
                      <th className="py-2 pr-3">Notes</th>
                      <th className="py-2 pr-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLog.map(row => (
                      <tr key={`${row.kind}-${row.id}`} className="border-b border-border hover:bg-muted">
                        <td className="py-2 pr-3 text-muted-foreground">{row.date}</td>
                        <td className="py-2 pr-3 font-medium text-foreground">{row.staff}</td>
                        {/* Raw Entries now only ever holds Admin Task metric-line
                            rows (Intake Log entries no longer auto-populate here,
                            Gretchen 2026-08-05), so this is always the metricLine
                            branch — kept as a type guard for safety. */}
                        <td className="py-2 pr-3 text-muted-foreground">Admin Task — {row.label}</td>
                        <td className="py-2 pr-3 text-muted-foreground">—</td>
                        <td className="py-2 pr-3 text-right">{row.count}</td>
                        <td className="py-2 pr-3 text-muted-foreground">—</td>
                        <td className="py-2 pr-3 text-right">
                          <button
                            onClick={() => {
                              deleteMetric({ _id: row.metricId as Id<"intakeDailyMetrics"> }).catch(() =>
                                toast.error("Failed to delete"),
                              );
                            }}
                            className="text-rose-500 hover:text-rose-700 text-xs font-medium"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </>
      </div>
      )}

      {activityLogTab === "piedmont" && <PiedmontEpicPanel />}
      </>
      )}

      {view === "reports" && (
      <>

      {/* Four pill tabs (Wence 2026-08-07): Activity Reports / Daily /
          Weekly / Monthly Productivity, showing one section at a time. */}
      <div className="flex items-center gap-2 flex-wrap">
        {(
          [
            ["activity", "Activity Reports"],
            ["daily", "Daily Productivity"],
            ["weekly", "Weekly Productivity"],
            ["monthly", "Monthly Productivity"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setReportsTab(key)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              reportsTab === key
                ? "bg-primary border-primary text-white"
                : "bg-muted border-border text-foreground hover:bg-card"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Productivity dashboards: each tab shows one card with a calendar
          date picker + prev/next arrows to page through periods. */}
      {reportsTab !== "activity" && (
      <div>
        {(
          [
            {
              key: "daily",
              title: "Daily Productivity",
              data: daySummary,
              range: dayRange,
              ref: dayRef,
              setRef: setDayRef,
              step: (d: Date, n: number) => addDays(d, n),
            },
            {
              key: "weekly",
              title: "Weekly Productivity",
              data: weekSummary,
              range: weekRange,
              ref: weekRef,
              setRef: setWeekRef,
              step: (d: Date, n: number) => addWeeks(d, n),
            },
            {
              key: "monthly",
              title: "Monthly Productivity",
              data: monthSummary,
              range: monthRange,
              ref: monthRef,
              setRef: setMonthRef,
              step: (d: Date, n: number) => addMonths(d, n),
            },
          ] as const
        )
          .filter(card => card.key === reportsTab)
          .map(({ title, data, range, ref, setRef, step }) => (
          <div key={title} className="bg-card border border-border rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground text-xs uppercase tracking-wide">
                {title}
              </h3>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setRef(step(ref, -1))}
                  className="w-6 h-6 flex items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted"
                  aria-label="Previous period"
                >
                  ‹
                </button>
                <input
                  type="date"
                  value={toDateInputValue(ref)}
                  onChange={e => {
                    if (e.target.value) setRef(fromDateInputValue(e.target.value));
                  }}
                  className="text-[11px] font-semibold text-foreground border border-border rounded px-1.5 py-0.5"
                  aria-label={`${title} calendar selection`}
                />
                <button
                  type="button"
                  onClick={() => setRef(step(ref, 1))}
                  className="w-6 h-6 flex items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted"
                  aria-label="Next period"
                >
                  ›
                </button>
              </div>
            </div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">{range.label}</p>
            {Object.keys(data).length === 0 ? (
              <p className="text-muted-foreground text-xs">No activity logged.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-1.5 pr-2">Staff</th>
                      <th className="py-1.5 px-2 text-right">Consult</th>
                      <th className="py-1.5 px-2 text-right">Follow Up</th>
                      <th className="py-1.5 px-2 text-right">Inbound</th>
                      <th className="py-1.5 px-2 text-right">Outbound</th>
                      <th className="py-1.5 px-2 text-right">Boost</th>
                      <th className="py-1.5 px-2 text-right">Admin</th>
                      <th className="py-1.5 pl-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data).map(([name, d]) => (
                      <tr key={name} className="border-b border-border">
                        <td className="py-1.5 pr-2 font-medium text-foreground">{name}</td>
                        <td className="py-1.5 px-2 text-right">{d.consult}</td>
                        <td className="py-1.5 px-2 text-right">{d.followUp}</td>
                        <td className="py-1.5 px-2 text-right">{d.inbound}</td>
                        <td className="py-1.5 px-2 text-right">{d.outbound}</td>
                        <td className="py-1.5 px-2 text-right">{d.boost}</td>
                        <td className="py-1.5 px-2 text-right">{d.admin}</td>
                        <td className="py-1.5 pl-2 text-right font-semibold">{d.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
      )}

      {/* Activity Reports: per-staff Inbound/Outbound/Admin Task breakdown,
          replacing the flat Activity Log per Wence's mockup (2026-07-17).
          Shown only on the "Activity Reports" tab (Wence 2026-08-07). */}
      {reportsTab === "activity" && (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
            Activity Reports
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              className="rounded-md border border-input px-2 py-1 text-xs text-foreground"
              value={reportStaff}
              onChange={e => setReportStaff(e.target.value)}
              aria-label="Staff"
            >
              <option value="">All Staff</option>
              {staffNames.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            {/* Daily/Weekly/Monthly tabs removed here 2026-08-07 per Wence
                ("remove this in activity report") — they live on the Weekly /
                Monthly Productivity cards instead. This filter is a single
                exact date again. */}
            <input
              type="date"
              value={reportDateFilter}
              onChange={e => setReportDateFilter(e.target.value)}
              className="rounded-md border border-input px-2 py-1 text-xs text-foreground"
            />
            <DateRangeFilter
              idPrefix="intake-activity-reports"
              size="sm"
              from={reportFrom}
              to={reportTo}
              onChange={({ from, to }) => {
                setReportFrom(from);
                setReportTo(to);
              }}
            />
            {reportDateRange && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {reportDateRange.start === reportDateRange.end
                  ? reportDateRange.start
                  : `${reportDateRange.start} \u2192 ${reportDateRange.end}`}
              </span>
            )}
            {reportDateFilter && (
              <button
                onClick={() => setReportDateFilter("")}
                className="text-xs text-primary hover:text-primary font-medium"
              >
                Clear date
              </button>
            )}
          </div>
        </div>

        {/* 3 columns side by side (Inbound | Outbound | Admin Task), always
            in one row from md up (Wence 2026-08-07: was xl-only, Admin Task
            wrapped to its own row below md/xl breakpoints; compressed
            cell padding/font-size below so all 3 fit at md width too). */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
          {(() => {
            // Shared row count across BOTH Inbound and Outbound tables (not
            // just within each one) so "Total Inbound" and "Total Outbound"
            // land on the same line side by side, per Wence (2026-07-21).
            const sharedRowCount = Math.max(
              inboundCategory.rows.length,
              inboundResult.rows.length,
              outboundCategory.rows.length,
              outboundResult.rows.length,
            );
            return (
              [
                { title: "Inbound", category: inboundCategory, result: inboundResult },
                { title: "Outbound", category: outboundCategory, result: outboundResult },
              ] as const
            ).map(({ title, category, result }) => {
            const rowCount = sharedRowCount;
            return (
              <div key={title} className="border border-border rounded-lg overflow-x-auto">
                {/* whitespace-nowrap on every cell (2026-07-21 per Wence: align Total
                    Inbound/Total Outbound) — without it, longer labels ("Transferred
                    Call", "Confirmed Appt") wrap to 2 lines in one table but not the
                    other at the same row index, so the row heights drift apart and the
                    Total row lands on a different line side-by-side even though the
                    row *count* (rowCount) already matches. Forcing single-line rows
                    keeps every row the same height on both sides. */}
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-muted text-left text-muted-foreground border-b border-border">
                      <th className="py-1 px-1.5 whitespace-nowrap">Workstream</th>
                      <th className="py-1 px-1.5 whitespace-nowrap">Category</th>
                      <th className="py-1 px-1.5 text-right whitespace-nowrap">Count</th>
                      <th className="py-1 px-1.5 whitespace-nowrap">Result</th>
                      <th className="py-1 px-1.5 text-right whitespace-nowrap">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: rowCount }).map((_, i) => {
                      const catRow = category.rows[i];
                      const resRow = result.rows[i];
                      return (
                        <tr key={i} className="border-b border-border">
                          <td className="py-1 px-1.5 font-semibold text-foreground whitespace-nowrap">
                            {i === 0 ? title.toUpperCase() : ""}
                          </td>
                          <td className="py-1 px-1.5 text-foreground whitespace-nowrap">{catRow?.label ?? "\u00A0"}</td>
                          <td className="py-1 px-1.5 text-right whitespace-nowrap">{catRow ? catRow.count : "\u00A0"}</td>
                          <td className="py-1 px-1.5 text-foreground whitespace-nowrap">{resRow?.label ?? "\u00A0"}</td>
                          <td className="py-1 px-1.5 text-right whitespace-nowrap">{resRow ? resRow.count : "\u00A0"}</td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td colSpan={2} className="py-1 px-1.5 text-rose-500 font-medium">
                        Total {title}
                      </td>
                      <td className="py-1 px-1.5 text-right font-semibold text-rose-500">{category.total}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
            });
          })()}

          <div className="border border-border rounded-lg overflow-hidden md:col-span-1">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-muted text-left text-muted-foreground border-b border-border">
                  <th className="py-1 px-1.5">Workstream</th>
                  <th className="py-1 px-1.5 text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {adminTaskRows.map((r, i) => (
                  <tr key={r.label} className="border-b border-border">
                    <td className="py-1 px-1.5 text-foreground">
                      {i === 0 && (
                        <span className="font-semibold text-foreground mr-2">ADMIN TASK</span>
                      )}
                      {r.label}
                    </td>
                    <td className="py-1 px-1.5 text-right">{r.count}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-1 px-1.5 text-rose-500 font-medium">Total Admin Tasks</td>
                  <td className="py-1 px-1.5 text-right font-semibold text-rose-500">{adminTaskTotal}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      </>
      )}

      {view === "booked" && <BookedTrackerPanel />}
    </div>
  );
}
