// Intake, ported from the original components/productivity/IntakeTeamTab.tsx
// (layout, labels, filters, page size, toasts and confirm texts unchanged).
// Views: "log" = Activity Log (Intake Activity, Piedmont: Epic, Raw Entries)
// and "reports" = Activity Reports + Daily/Weekly/Monthly Productivity. The
// Booked Tracker view arrives in Phase 4.
//
// Differences: staff are picked from the Intake team roster; the save rules,
// Export (admin) and Reset (admin) run on the server; Raw Entries' Delete now
// asks first and says it removes that day's whole metrics record (IN-04);
// the excluded-name list is data (Admin → Dropdown lists), not code.
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { IntakeCategory } from "@convex/lib/enums";
import { type IntakeLogFilters, intakeLogRows } from "@convex/lib/intakeLog";
import {
  ACTIVE_INTAKE_CATEGORY_OPTIONS,
  categoryDirection,
  categoryLabel,
  type IntakeDirection,
  isBoostCategory,
  resultLabel,
  resultOptionsForDirection,
} from "@convex/lib/intakeTaxonomy";
import { useMutation, useQuery } from "convex/react";
import { Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { PiedmontEpicPanel } from "@/components/intake/PiedmontEpicPanel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsAdmin } from "@/lib/access";
import { formatDateTimeEST } from "@/lib/dateFormat";
import { todayISO } from "@/lib/dates";
import { errorMessage } from "@/lib/errors";
import { intakeExportRows } from "@/lib/intakeExport";
import {
  activityReport,
  type IntakeEntryRow,
  METRIC_FIELDS,
  type MetricKey,
  type MetricRow,
  rawEntryRows,
  summarize,
} from "@/lib/intakeReports";
import {
  addDays,
  addMonths,
  addWeeks,
  fromDateInputValue,
  getDayRange,
  getMonthRange,
  getWeekRange,
  type PeriodRange,
  toDateInputValue,
} from "@/lib/periods";
import { downloadXlsx } from "@/lib/xlsx";

const inputCls =
  "w-full bg-card border border-input text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-primary";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";
const pillCls = "rounded-md border border-input px-2 py-1 text-xs text-foreground";
const LOG_SHEET_PAGE_SIZE = 25;

function useIntakeData() {
  const roster = useQuery(api.access.listTeam, { team: "intake" });
  const entries = useQuery(api.intake.listEntries);
  const metrics = useQuery(api.dailyMetrics.list);
  const exclusions = useQuery(api.managedLists.list, { list: "intakeReportExclusions" });
  return {
    roster: roster ?? [],
    staffNames: (roster ?? []).map(s => s.displayName),
    entries: entries ?? [],
    metrics: (metrics ?? []) as MetricRow[],
    excludedNames: (exclusions ?? []).map(x => x.name),
  };
}

export function IntakePage({ view }: { view: "log" | "reports" }) {
  return <div className="space-y-6">{view === "log" ? <ActivityLogView /> : <ReportsView />}</div>;
}

// ─── Activity Log ────────────────────────────────────────────────────────────

function ActivityLogView() {
  const data = useIntakeData();
  const [tab, setTab] = useState<"intake" | "raw" | "piedmont">("intake");
  const [rawFilters, setRawFilters] = useState({ date: "", from: "", to: "" });
  const rawRows = useMemo(() => rawEntryRows(data.metrics, rawFilters), [data.metrics, rawFilters]);
  const activeCls =
    "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm";
  return (
    <>
      <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="intake" className={activeCls}>
            Intake Activity
          </TabsTrigger>
          <TabsTrigger value="piedmont" className={activeCls}>
            Piedmont: Epic
          </TabsTrigger>
          <TabsTrigger value="raw" className={activeCls}>
            Raw Entries ({rawRows.length})
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "intake" && (
        <>
          <LogActivityForm roster={data.roster} />
          <IntakeLogSheet entries={data.entries} staffNames={data.staffNames} />
        </>
      )}
      {tab === "raw" && <RawEntries rows={rawRows} filters={rawFilters} setFilters={setRawFilters} />}
      {tab === "piedmont" && <PiedmontEpicPanel />}
    </>
  );
}

const emptyForm = () => ({
  staffPersonId: "",
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

function LogActivityForm({ roster }: { roster: { personId: Id<"people">; displayName: string }[] }) {
  const logActivity = useMutation(api.intake.logActivity);
  const [form, setForm] = useState(emptyForm);
  const staffPersonId = form.staffPersonId || roster[0]?.personId || "";
  const direction = categoryDirection(form.category);

  function handleSave() {
    if (!staffPersonId) {
      toast.error("Select a staff member");
      return;
    }
    const count = Number(form.count) || 0;
    const metricsFilled = METRIC_FIELDS.some(([key]) => Number(form[key]) > 0);
    if (count > 0 && !form.category) {
      toast.error("Select a category, or set Category to None and Count to 0");
      return;
    }
    if (!(count > 0 && form.category) && !metricsFilled) {
      toast.error("Enter a category count or at least one metric value");
      return;
    }
    logActivity({
      staffPersonId: staffPersonId as Id<"people">,
      date: form.date,
      ...(form.category ? { category: form.category as IntakeCategory } : {}),
      result: form.result,
      count,
      notes: form.notes || undefined,
      patientId: form.patientId || undefined,
      otherInfo: form.otherInfo || undefined,
      metrics: {
        emailsSent: Number(form.emailsSent) || 0,
        ghlChats: Number(form.ghlChats) || 0,
        newPatientIntake: Number(form.newPatientIntake) || 0,
        callAudits: Number(form.callAudits) || 0,
        faxDocs: Number(form.faxDocs) || 0,
      },
    })
      .then(() => {
        toast.success("Activity logged");
        setForm(f => ({ ...emptyForm(), staffPersonId: f.staffPersonId, date: f.date }));
      })
      .catch(err => toast.error(errorMessage(err, "Failed to log activity")));
  }

  const group = (label: string, keep: (value: string, dir: IntakeDirection) => boolean) => (
    <optgroup label={label}>
      {ACTIVE_INTAKE_CATEGORY_OPTIONS.filter(c => keep(c.value, c.direction)).map(c => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
    </optgroup>
  );

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-5">
      <h3 className="font-semibold text-foreground text-sm mb-3">Log Intake Activity</h3>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end mb-3">
        <div>
          <label className={labelCls} htmlFor="intake-patient-id">
            Patient ID
          </label>
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
          <label className={labelCls} htmlFor="intake-staff">
            Staff
          </label>
          <select
            id="intake-staff"
            className={inputCls}
            value={staffPersonId}
            onChange={e => setForm(f => ({ ...f, staffPersonId: e.target.value }))}
          >
            {roster.map(s => (
              <option key={s.personId} value={s.personId}>
                {s.displayName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="intake-category">
            Category
          </label>
          <select
            id="intake-category"
            className={inputCls}
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value, result: "" }))}
          >
            <option value="">— None —</option>
            {group("Inbound", (v, dir) => dir === "inbound" && !isBoostCategory(v))}
            {group("Outbound", (v, dir) => dir === "outbound" && !isBoostCategory(v))}
            {group("Boost", v => isBoostCategory(v))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="intake-count">
            Count
          </label>
          <input
            id="intake-count"
            type="number"
            min={0}
            className={inputCls}
            value={form.count}
            onChange={e => setForm(f => ({ ...f, count: Number(e.target.value) }))}
          />
        </div>
        {!isBoostCategory(form.category) && (
          <div>
            <label className={labelCls} htmlFor="intake-result">
              Result
            </label>
            <select
              id="intake-result"
              className={inputCls}
              value={form.result}
              onChange={e => setForm(f => ({ ...f, result: e.target.value }))}
            >
              <option value="">— None —</option>
              {resultOptionsForDirection(direction).map(r => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 items-end mb-3">
        <div>
          <label className={labelCls} htmlFor="intake-notes">
            Additional Notes
          </label>
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
            <label className={labelCls} htmlFor={`metric-${key}`}>
              {label}
            </label>
            <input
              id={`metric-${key}`}
              type="number"
              min={0}
              className={inputCls}
              value={form[key]}
              onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) }))}
            />
          </div>
        ))}
        <button
          type="button"
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
  );
}

type Entry = ReturnType<typeof useIntakeData>["entries"][number];

function IntakeLogSheet({ entries, staffNames }: { entries: Entry[]; staffNames: string[] }) {
  const isAdmin = useIsAdmin();
  const exportEntries = useMutation(api.intake.exportEntries);
  const resetEntries = useMutation(api.intake.resetEntries);
  const [filters, setFilters] = useState<IntakeLogFilters>({ date: "", from: "", to: "", staff: "", direction: "" });
  const [page, setPage] = useState(1);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);
  const [openId, setOpenId] = useState<Id<"intakeEntries"> | null>(null);
  const [copiedPatientId, setCopiedPatientId] = useState<string | null>(null);

  const rows = useMemo(() => intakeLogRows(entries, filters), [entries, filters]);
  const totalPages = Math.max(1, Math.ceil(rows.length / LOG_SHEET_PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const pageRows = rows.slice((pageClamped - 1) * LOG_SHEET_PAGE_SIZE, pageClamped * LOG_SHEET_PAGE_SIZE);
  const filtering = !!(filters.date || filters.staff || filters.direction);
  const update = (patch: Partial<IntakeLogFilters>) => {
    setFilters(f => ({ ...f, ...patch }));
    setPage(1);
  };

  async function copyPatientId(value: string) {
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

  function handleExport() {
    exportEntries({ filters, exportFrom, exportTo })
      .then(data => downloadXlsx("intake-log.xlsx", "Intake Log", intakeExportRows(data)))
      .catch(err => toast.error(errorMessage(err, "Failed to export")));
  }

  function handleReset() {
    resetEntries({})
      .then(() => {
        setResetConfirm(false);
        toast.success("Intake log has been reset");
      })
      .catch(err => toast.error(errorMessage(err, "Failed to reset intake log")));
  }

  const toolbarBtn =
    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed border";
  const open = openId ? entries.find(e => e._id === openId) : undefined;

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h3 className="font-semibold text-foreground text-sm">Intake Log ({rows.length} entries)</h3>
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
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={handleExport}
                disabled={rows.length === 0}
                className={`${toolbarBtn} bg-emerald-700/40 hover:bg-emerald-700/70 text-emerald-700 border-emerald-600/40`}
              >
                Export Excel
              </button>
              <button
                type="button"
                onClick={() => setResetConfirm(true)}
                disabled={rows.length === 0}
                className={`${toolbarBtn} bg-orange-600/20 hover:bg-orange-600/40 text-orange-700 dark:text-orange-400 border-orange-600/40`}
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
            aria-label="Direction"
            value={filters.direction}
            onChange={e => update({ direction: e.target.value as "" | IntakeDirection })}
            className={pillCls}
          >
            <option value="">All Categories</option>
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
          </select>
          <select
            aria-label="Staff"
            value={filters.staff}
            onChange={e => update({ staff: e.target.value })}
            className={pillCls}
          >
            <option value="">All Staff</option>
            {staffNames.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <input
            type="date"
            aria-label="Date"
            value={filters.date}
            onChange={e => update({ date: e.target.value })}
            className={pillCls}
          />
          <DateRangeFilter
            idPrefix="intake-logsheet"
            size="sm"
            from={filters.from}
            to={filters.to}
            onChange={({ from, to }) => update({ from, to })}
          />
          {filtering && (
            <button
              type="button"
              onClick={() => update({ date: "", staff: "", direction: "" })}
              className="text-xs text-primary hover:text-primary font-medium"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {filtering ? "No entries match these filters." : "No entries yet."}
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
                {pageRows.map(e => {
                  const noteText = e.notes?.trim() ?? "";
                  const noteSummary = noteText.length > 40 ? `${noteText.slice(0, 40)}…` : noteText;
                  const patientIdText = e.patientId?.trim() ?? "";
                  const patientIdSummary = patientIdText.length > 24 ? `${patientIdText.slice(0, 24)}…` : patientIdText;
                  return (
                    <tr
                      key={e._id}
                      onClick={() => setOpenId(e._id)}
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
                              onClick={ev => {
                                ev.stopPropagation();
                                void copyPatientId(patientIdText);
                              }}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Copy className="size-3" />
                            </button>
                            {copiedPatientId === patientIdText && (
                              <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Copied!</span>
                            )}
                          </span>
                        ) : (
                          " "
                        )}
                      </td>
                      <td className="py-2 pr-3 font-medium text-foreground whitespace-nowrap">{e.staff}</td>
                      <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{categoryLabel(e.category)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{resultLabel(e.result)}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{noteSummary || " "}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted-foreground">
              Page {pageClamped} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, Math.min(p, totalPages) - 1))}
                disabled={pageClamped <= 1}
                className="text-xs font-medium text-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={pageClamped >= totalPages}
                className="text-xs font-medium text-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}

      {open && <EntryWindow key={open._id} entry={open} onClose={() => setOpenId(null)} />}

      <ConfirmModal
        open={resetConfirm}
        title="Reset Intake Log"
        message="This will permanently delete ALL Intake Log entries. This cannot be undone."
        confirmLabel="Reset Everything"
        confirmVariant="danger"
        onConfirm={handleReset}
        onCancel={() => setResetConfirm(false)}
      />
    </div>
  );
}

/** The click-a-row entry window: view, then Edit | Delete | Close. */
function EntryWindow({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const updateEntryDetails = useMutation(api.intake.updateEntryDetails);
  const deleteEntry = useMutation(api.intake.deleteEntry);
  const [editing, setEditing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const notesShown = entry.notes?.trim() || "No additional notes.";
  const [draft, setDraft] = useState({
    patientId: entry.patientId ?? "",
    category: entry.category as string,
    result: (entry.result ?? "") as string,
    notes: entry.notes?.trim() ?? "",
  });
  const direction = entry.direction;
  const resetDraft = () =>
    setDraft({
      patientId: entry.patientId ?? "",
      category: entry.category,
      result: entry.result ?? "",
      notes: entry.notes?.trim() ?? "",
    });

  function save() {
    updateEntryDetails({
      id: entry._id,
      patientId: draft.patientId.trim(),
      category: draft.category,
      result: draft.result,
      // As in the original, an emptied note is not sent, so the stored note stays (F3).
      notes: draft.notes || undefined,
    })
      .then(() => {
        setEditing(false);
        toast.success("Entry updated");
      })
      .catch(err => toast.error(errorMessage(err, "Failed to save entry")));
  }

  const section = (label: string, view: React.ReactNode, edit: React.ReactNode) => (
    <div className="mb-4">
      <span className="block text-xs font-medium text-muted-foreground uppercase mb-1">{label}</span>
      {editing ? edit : view}
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <button
          type="button"
          aria-label="Close"
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6">
          <h2 className="font-bold text-foreground text-base mb-1">
            Entry {!editing && entry.patientId ? `— ${entry.patientId}` : ""}
          </h2>
          <p className="text-xs text-muted-foreground mb-4">Logged {formatDateTimeEST(entry.createdAt)}</p>
          {section(
            "Patient Chart",
            <p className="text-foreground text-sm">{entry.patientId || " "}</p>,
            <input
              type="text"
              aria-label="Patient Chart"
              value={draft.patientId}
              onChange={e => setDraft(d => ({ ...d, patientId: e.target.value }))}
              className={inputCls}
              placeholder="e.g. EXAMPLE-ID"
            />,
          )}
          {section(
            "Call Reason",
            <p className="text-foreground text-sm">{categoryLabel(entry.category)}</p>,
            <select
              aria-label="Call Reason"
              value={draft.category}
              onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
              className={inputCls}
            >
              {ACTIVE_INTAKE_CATEGORY_OPTIONS.filter(c => c.direction === direction).map(c => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
              {!ACTIVE_INTAKE_CATEGORY_OPTIONS.some(c => c.value === draft.category) && (
                <option value={draft.category}>{categoryLabel(draft.category)}</option>
              )}
            </select>,
          )}
          {section(
            "Resolution",
            <p className="text-foreground text-sm">{resultLabel(entry.result)}</p>,
            <select
              aria-label="Resolution"
              value={draft.result}
              onChange={e => setDraft(d => ({ ...d, result: e.target.value }))}
              className={inputCls}
            >
              <option value="">— None —</option>
              {resultOptionsForDirection(direction).map(r => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>,
          )}
          {section(
            "Notes",
            <p className="text-muted-foreground text-sm whitespace-pre-wrap">{notesShown}</p>,
            <textarea
              aria-label="Notes"
              value={draft.notes}
              onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
              rows={5}
              className={`${inputCls} resize-y`}
              placeholder="Full details / notes for this call"
            />,
          )}
          <div className="flex justify-end gap-2 mt-4">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    resetDraft();
                    setEditing(false);
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-muted hover:bg-muted text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-primary hover:bg-primary text-white transition-colors"
                >
                  Save
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-primary hover:bg-primary text-white transition-colors"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(true)}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-rose-600 hover:bg-rose-500 text-white transition-colors"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={onClose}
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
        open={deleteConfirm}
        title="Delete Entry"
        message="This will permanently delete this Intake Log entry. This cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => {
          deleteEntry({ id: entry._id })
            .then(() => {
              setDeleteConfirm(false);
              onClose();
              toast.success("Entry deleted");
            })
            .catch(err => toast.error(errorMessage(err, "Failed to delete entry")));
        }}
        onCancel={() => setDeleteConfirm(false)}
      />
    </>
  );
}

function RawEntries({
  rows,
  filters,
  setFilters,
}: {
  rows: ReturnType<typeof rawEntryRows>;
  filters: { date: string; from: string; to: string };
  setFilters: (f: { date: string; from: string; to: string }) => void;
}) {
  const deleteMetric = useMutation(api.dailyMetrics.deleteMetric);
  const [confirm, setConfirm] = useState<(typeof rows)[number] | null>(null);
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-5">
      <h3 className="font-semibold text-foreground text-sm mb-3">Raw Entries ({rows.length})</h3>
      <div className="flex items-center gap-2 mt-3 mb-3">
        <input
          type="date"
          aria-label="Date"
          value={filters.date}
          onChange={e => setFilters({ ...filters, date: e.target.value })}
          className={pillCls}
        />
        <DateRangeFilter
          idPrefix="intake-raw"
          size="sm"
          from={filters.from}
          to={filters.to}
          onChange={({ from, to }) => setFilters({ ...filters, from, to })}
        />
        {filters.date && (
          <button
            type="button"
            onClick={() => setFilters({ ...filters, date: "" })}
            className="text-xs text-primary hover:text-primary font-medium"
          >
            Clear
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {filters.date ? "No entries for this date." : "No entries yet."}
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
              {rows.map(row => (
                <tr key={`metricLine-${row.id}`} className="border-b border-border hover:bg-muted">
                  <td className="py-2 pr-3 text-muted-foreground">{row.date}</td>
                  <td className="py-2 pr-3 font-medium text-foreground">{row.staff}</td>
                  <td className="py-2 pr-3 text-muted-foreground">Admin Task — {row.label}</td>
                  <td className="py-2 pr-3 text-muted-foreground">—</td>
                  <td className="py-2 pr-3 text-right">{row.count}</td>
                  <td className="py-2 pr-3 text-muted-foreground">—</td>
                  <td className="py-2 pr-3 text-right">
                    <button
                      type="button"
                      onClick={() => setConfirm(row)}
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
      <ConfirmModal
        open={!!confirm}
        title="Delete Admin Task metrics"
        message={
          confirm
            ? `This deletes ALL Admin Task metrics ${confirm.staff} logged for ${confirm.date} (Emails, GHL Chats, New Patient Chart, Call Audits and Fax Docs), not just this line. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (!confirm) return;
          deleteMetric({ id: confirm.metricId as Id<"intakeDailyMetrics"> })
            .then(() => setConfirm(null))
            .catch(err => toast.error(errorMessage(err, "Failed to delete")));
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

// ─── Reports ─────────────────────────────────────────────────────────────────

type ReportsTab = "activity" | "daily" | "weekly" | "monthly";

function ReportsView() {
  const data = useIntakeData();
  const [reportsTab, setReportsTab] = useState<ReportsTab>("activity");
  return (
    <>
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
      {reportsTab === "daily" && (
        <ProductivityCard title="Daily Productivity" range={getDayRange} step={addDays} data={data} />
      )}
      {reportsTab === "weekly" && (
        <ProductivityCard title="Weekly Productivity" range={getWeekRange} step={addWeeks} data={data} />
      )}
      {reportsTab === "monthly" && (
        <ProductivityCard title="Monthly Productivity" range={getMonthRange} step={addMonths} data={data} />
      )}
      {reportsTab === "activity" && <ActivityReports data={data} />}
    </>
  );
}

function ProductivityCard({
  title,
  range: toRange,
  step,
  data,
}: {
  title: string;
  range: (ref: Date) => PeriodRange;
  step: (d: Date, n: number) => Date;
  data: ReturnType<typeof useIntakeData>;
}) {
  const [ref, setRef] = useState(() => new Date());
  const range = toRange(ref);
  const summary = summarize(data.entries as IntakeEntryRow[], data.metrics, data.excludedNames, range.inRange);
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h3 className="font-semibold text-foreground text-xs uppercase tracking-wide">{title}</h3>
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
      {Object.keys(summary).length === 0 ? (
        <p className="text-muted-foreground text-xs">No activity logged.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-1.5 pr-2">Staff</th>
                {["Consult", "Follow Up", "Inbound", "Outbound", "Boost", "Admin"].map(h => (
                  <th key={h} className="py-1.5 px-2 text-right">
                    {h}
                  </th>
                ))}
                <th className="py-1.5 pl-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(summary).map(([name, d]) => (
                <tr key={name} className="border-b border-border">
                  <td className="py-1.5 pr-2 font-medium text-foreground">{name}</td>
                  {[d.consult, d.followUp, d.inbound, d.outbound, d.boost, d.admin].map((n, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed column order
                    <td key={i} className="py-1.5 px-2 text-right">
                      {n}
                    </td>
                  ))}
                  <td className="py-1.5 pl-2 text-right font-semibold">{d.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ActivityReports({ data }: { data: ReturnType<typeof useIntakeData> }) {
  const [filters, setFilters] = useState({ staff: "", date: "", from: "", to: "" });
  const report = activityReport(data.entries as IntakeEntryRow[], data.metrics, filters, data.excludedNames);
  const tables = [
    { title: "Inbound", category: report.inboundCategory, result: report.inboundResult },
    { title: "Outbound", category: report.outboundCategory, result: report.outboundResult },
  ];
  // Shared row count so "Total Inbound" and "Total Outbound" line up side by side.
  const rowCount = Math.max(...tables.flatMap(t => [t.category.rows.length, t.result.rows.length]));
  const cell = "py-1 px-1.5 whitespace-nowrap";
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">Activity Reports</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            className={pillCls}
            value={filters.staff}
            onChange={e => setFilters(f => ({ ...f, staff: e.target.value }))}
            aria-label="Staff"
          >
            <option value="">All Staff</option>
            {data.staffNames.map(n => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <input
            type="date"
            aria-label="Date"
            value={filters.date}
            onChange={e => setFilters(f => ({ ...f, date: e.target.value }))}
            className={pillCls}
          />
          <DateRangeFilter
            idPrefix="intake-activity-reports"
            size="sm"
            from={filters.from}
            to={filters.to}
            onChange={({ from, to }) => setFilters(f => ({ ...f, from, to }))}
          />
          {report.range && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {report.range.start === report.range.end
                ? report.range.start
                : `${report.range.start} → ${report.range.end}`}
            </span>
          )}
          {filters.date && (
            <button
              type="button"
              onClick={() => setFilters(f => ({ ...f, date: "" }))}
              className="text-xs text-primary hover:text-primary font-medium"
            >
              Clear date
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
        {tables.map(({ title, category, result }) => (
          <div key={title} className="border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-muted text-left text-muted-foreground border-b border-border">
                  <th className={cell}>Workstream</th>
                  <th className={cell}>Category</th>
                  <th className={`${cell} text-right`}>Count</th>
                  <th className={cell}>Result</th>
                  <th className={`${cell} text-right`}>Count</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: rowCount }, (_, i) => {
                  const catRow = category.rows[i];
                  const resRow = result.rows[i];
                  return (
                    // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional, as in the original
                    <tr key={i} className="border-b border-border">
                      <td className={`${cell} font-semibold text-foreground`}>{i === 0 ? title.toUpperCase() : ""}</td>
                      <td className={`${cell} text-foreground`}>{catRow?.label ?? " "}</td>
                      <td className={`${cell} text-right`}>{catRow ? catRow.count : " "}</td>
                      <td className={`${cell} text-foreground`}>{resRow?.label ?? " "}</td>
                      <td className={`${cell} text-right`}>{resRow ? resRow.count : " "}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td colSpan={2} className="py-1 px-1.5 text-rose-500 font-medium">
                    Total {title}
                  </td>
                  <td className="py-1 px-1.5 text-right font-semibold text-rose-500">{category.total}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        ))}
        <div className="border border-border rounded-lg overflow-hidden md:col-span-1">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-muted text-left text-muted-foreground border-b border-border">
                <th className="py-1 px-1.5">Workstream</th>
                <th className="py-1 px-1.5 text-right">Count</th>
              </tr>
            </thead>
            <tbody>
              {report.adminTaskRows.map((r, i) => (
                <tr key={r.label} className="border-b border-border">
                  <td className="py-1 px-1.5 text-foreground">
                    {i === 0 && <span className="font-semibold text-foreground mr-2">ADMIN TASK</span>}
                    {r.label}
                  </td>
                  <td className="py-1 px-1.5 text-right">{r.count}</td>
                </tr>
              ))}
              <tr>
                <td className="py-1 px-1.5 text-rose-500 font-medium">Total Admin Tasks</td>
                <td className="py-1 px-1.5 text-right font-semibold text-rose-500">{report.adminTaskTotal}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export type { MetricKey };
