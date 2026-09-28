// Booked Tracker (Intake > Booked Tracker sub-tab) — ported back from the
// standalone Intake Booked Tracker Space into SMB Beltline Tracker per
// Wence's request, 2026-08-04. Replaces the old category/result-based
// Booked summary with the full Appointments feature: Add Appointment
// modal, Source→Type→Service + Location→Provider conditional dropdowns,
// All/SMB/Boost tabs, search/filters/status badges.
//
// 2026-08-04 update: rows are fully clickable and open the Appointment
// Details drawer (view + inline edit); the old per-row Edit/Delete/View
// action buttons and the Full Name / Actions table columns were removed
// per Wence's spec. Source column is hidden on the SMB/Boost tabs since
// the tab itself already scopes the source group.
//
// 2026-08-05 update: header sized to match Intake Directory, panel wrapped
// in the same enclosed card container used on the Cases page, and
// Export Excel / Reset (with confirmation) buttons added next to the tabs.
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Plus,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/bari/ConfirmModal";
import { AppointmentDetailsDrawer } from "@/components/booked/AppointmentDetailsDrawer";
import { AppointmentModal } from "@/components/booked/AppointmentModal";
import { AppointmentReport } from "@/components/booked/AppointmentReport";
import {
  AppointmentsTable,
  matches,
} from "@/components/booked/AppointmentsTable";
import { exportAppointmentsToXLSX } from "@/components/booked/exportAppointments";
import {
  EMPTY_FILTERS,
  type FilterState,
  FiltersBar,
} from "@/components/booked/FiltersBar";
import { parseAppointmentsFile } from "@/components/booked/importAppointments";
import type { Appointment, AppointmentDraft } from "@/components/booked/types";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { appointmentNotificationReason } from "@/lib/appointmentNotifications";
import {
  APPOINTMENT_TYPES_BY_GROUP,
  SERVICE_TYPES_BY_GROUP,
  sourceGroup,
} from "@/lib/appointmentOptions";
import { easternDateTimeKey, formatDateTimeEST } from "@/lib/dateFormat";
import { useHasRestrictedAccess } from "@/lib/permissions";
import {
  isYearToDateConsult,
  withYtdConsultStatusSnapshot,
} from "@/lib/ytdConsults";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type ViewKey = "report" | "all" | "smb" | "boost" | "ytdConsults";

// Collapses a batch of raw `source` values (e.g. from an import file or an
// export selection) down to the single SMB/Boost/Mixed label the Report
// badge shows (Gretchen, 2026-08-05).
function summarizeSourceGroup(
  sources: string[],
): "SMB" | "Boost" | "Mixed" | undefined {
  if (sources.length === 0) return undefined;
  const groups = new Set(sources.map(sourceGroup));
  if (groups.size > 1) return "Mixed";
  return groups.values().next().value as "SMB" | "Boost";
}

function sourceBadgeClass(group: "SMB" | "Boost" | "Mixed") {
  if (group === "Boost")
    return "bg-violet-500/15 text-violet-600 dark:text-violet-400";
  if (group === "Mixed")
    return "bg-slate-500/15 text-slate-600 dark:text-slate-400";
  return "bg-blue-500/15 text-blue-600 dark:text-blue-400";
}

export function BookedTrackerPanel() {
  const appointments = (useQuery(api.appointments.list) ?? []) as Appointment[];
  const createMut = useMutation(api.appointments.create);
  const updateMut = useMutation(api.appointments.update);
  const removeMut = useMutation(api.appointments.remove);
  const deleteAllMut = useMutation(api.appointments.deleteAll);
  const bulkImportMut = useMutation(api.appointments.bulkImport);
  const logReportMut = useMutation(api.reports.logReportEvent);
  const removeImportedDataMut = useMutation(api.reports.removeImportedData);
  const undoResetMut = useMutation(api.reports.undoReset);
  const closeReportMut = useMutation(api.reports.closeReport);
  const reports = useQuery(api.reports.listReports) ?? [];
  // Import/Export/Reset (Booked Tracker) and Report badge access are
  // restricted to a specific allowlist (Wence, 2026-08-06) — server-side
  // mutations reject anyone else too, this just keeps the UI clean.
  const canManage = useHasRestrictedAccess();
  const [closingReportId, setClosingReportId] = useState<Id<"reports"> | null>(
    null,
  );

  const [view, setView] = useState<ViewKey>("report");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [addOpen, setAddOpen] = useState(false);
  const [viewing, setViewing] = useState<Appointment | null>(null);
  const [viewingFromYtd, setViewingFromYtd] = useState(false);
  // Re-derive the drawer's appointment from the live `appointments.list`
  // query (instead of the click-time snapshot in `viewing`) so any
  // change reflects in the open drawer the moment Convex pushes the
  // update, no page refresh needed (Wence, 2026-08-06 follow-up).
  const viewingLive = viewing
    ? (() => {
        const live = appointments.find(a => a._id === viewing._id) ?? null;
        return live && viewingFromYtd ? withYtdConsultStatusSnapshot(live) : live;
      })()
    : null;

  const [resetConfirm, setResetConfirm] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [removingReportId, setRemovingReportId] =
    useState<Id<"reports"> | null>(null);
  const [undoingReportId, setUndoingReportId] =
    useState<Id<"reports"> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(() => new Date());

  // Keep the badge accurate as the clock moves an appointment from
  // "upcoming" to "Pending past due", and when Eastern midnight changes
  // which appointments count as scheduled today. This is only a local clock
  // tick; appointments themselves still come from the live Convex query.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Notifications are the union of:
  //   1. every appointment scheduled for today (Eastern Time), and
  //   2. every appointment still Pending after its scheduled time passed.
  // The Set-like filter below naturally de-duplicates appointments that
  // satisfy both rules, while recomputing live from the same Convex query as
  // the table (Wence, 2026-08-07).
  const notificationAppointments = useMemo(() => {
    return appointments
      .filter(a => appointmentNotificationReason(a, now))
      .sort((a, b) => {
        const aKey = easternDateTimeKey(a.apptDateTime);
        const bKey = easternDateTimeKey(b.apptDateTime);
        if (!aKey) return 1;
        if (!bKey) return -1;
        return aKey.localeCompare(bKey);
      });
  }, [appointments, now]);

  const notificationDetails = useMemo(() => {
    return new Map(
      notificationAppointments.map(a => {
        const reason = appointmentNotificationReason(a, now);
        return [a._id, reason] as const;
      }),
    );
  }, [notificationAppointments, now]);

  const scoped = appointments
    .filter(a => {
      if (view === "all" || view === "report") return true;
      if (view === "ytdConsults") return isYearToDateConsult(a);
      const group = sourceGroup(a.source);
      return view === "smb" ? group === "SMB" : group === "Boost";
    })
    .map(a => (view === "ytdConsults" ? withYtdConsultStatusSnapshot(a) : a));

  const serviceTypeOptions =
    view === "boost"
      ? SERVICE_TYPES_BY_GROUP.Boost
      : SERVICE_TYPES_BY_GROUP.SMB;
  const appointmentTypeOptions =
    view === "boost" || view === "ytdConsults"
      ? APPOINTMENT_TYPES_BY_GROUP.Boost
      : APPOINTMENT_TYPES_BY_GROUP.SMB;

  function handleViewChange(next: ViewKey) {
    setView(next);
    setViewing(null);
    setViewingFromYtd(false);
    // Service Type and Appointment Type options differ per tab (Boost only
    // offers its own values); clear stale selections so the filter never
    // points at a type that isn't in the newly-shown list.
    setFilters(f => ({ ...f, appointmentType: [], serviceType: [] }));
  }

  async function handleCreate(draft: AppointmentDraft) {
    await createMut(draft);
  }

  async function handleUpdate(
    draft: AppointmentDraft,
    id: string,
    options?: { statusChanged?: boolean },
  ) {
    // The drawer's edit form is seeded via `{...appointment}`, which also
    // carries Convex system/derived fields (_id, _creationTime, createdDate,
    // updatedAt) that aren't part of the `update` mutation's arg validator.
    // Convex object validators are strict, so passing those extras through
    // always failed with an ArgumentValidationError ("FAILED TO SAVE
    // APPOINTMENT"). Only forward the exact editable appointment fields.
    const {
      patientId,
      fullName,
      phone,
      email,
      source,
      apptDateTime,
      appointmentType,
      serviceType,
      clinicLocation,
      provider,
      status,
      scheduler,
      patientPortalAccess,
      insuranceVerificationTask,
      sendToBoost,
      sendToPipelineDash,
    } = draft;
    const live = appointments.find(a => a._id === id);
    // A YTD row displays its immutable status snapshot. If the user saves
    // another field without changing that displayed snapshot, preserve the
    // live status rather than reverting a newer status from All/Notifications.
    const displayedYtdStatus =
      live?.ytdConsultStatus ??
      (live && isYearToDateConsult(live) ? live.status : undefined);
    const nextStatus =
      viewingFromYtd &&
      live &&
      displayedYtdStatus !== undefined &&
      !options?.statusChanged
        ? live.status
        : status;
    await updateMut({
      _id: id as Id<"appointments">,
      patientId,
      fullName,
      phone,
      email,
      source,
      apptDateTime,
      appointmentType,
      serviceType,
      clinicLocation,
      provider,
      status: nextStatus,
      scheduler,
      patientPortalAccess,
      insuranceVerificationTask,
      sendToBoost,
      sendToPipelineDash,
    });
  }

  async function handleDelete(id: string) {
    await removeMut({ _id: id as Id<"appointments"> });
  }

  function handleExport() {
    // Export exactly what the current tab + active filters show.
    const filtered = scoped.filter(a => matches(a, filters));
    exportAppointmentsToXLSX(filtered, "booked-tracker.xlsx");
    const tabLabel =
      view === "all"
        ? "All Appointments"
        : view === "smb"
          ? "SMB Appointments"
          : view === "boost"
            ? "Boost Appointments"
            : "Year to Date Consults";
    logReportMut({
      action: "export",
      recordCount: filtered.length,
      details: `Exported ${filtered.length} appointment(s) from ${tabLabel}`,
      source: summarizeSourceGroup(filtered.map(a => a.source)),
    }).catch(() => {});
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    try {
      const { rows, skipped } = await parseAppointmentsFile(file);
      if (rows.length === 0) {
        toast.error("No valid rows found in that file.");
        return;
      }
      const { count, ids } = await bulkImportMut({ rows });
      await logReportMut({
        action: "import",
        recordCount: count,
        details: `Imported ${count} appointment(s) from "${file.name}"${skipped ? ` (${skipped} row(s) skipped)` : ""}`,
        source: summarizeSourceGroup(rows.map(r => r.source)),
        importedIds: ids,
      });
      toast.success(
        `Imported ${count} appointment${count === 1 ? "" : "s"}.${skipped ? ` ${skipped} row(s) skipped.` : ""}`,
      );
    } catch {
      toast.error("Failed to import file. Check the format and try again.");
    } finally {
      setImporting(false);
    }
  }

  // Reset is scoped to whichever tab is active: SMB/Boost tabs only clear
  // their own group so the other tabs' data is never touched; "All
  // Appointments" still clears everything (Gretchen, 2026-08-05).
  async function handleReset() {
    const group =
      view === "smb" ? "SMB" : view === "boost" ? "Boost" : undefined;
    try {
      await deleteAllMut(group ? { group } : {});
      setResetConfirm(false);
      toast.success(
        group
          ? `All ${group} booked entries have been deleted`
          : "All booked entries have been deleted",
      );
    } catch {
      toast.error("Failed to reset Booked Tracker data.");
    }
  }

  async function handleRemoveImportedData(reportId: Id<"reports">) {
    if (
      !window.confirm(
        "Remove all appointments created by this specific import? Other appointments (from other imports, manual entries, etc.) will not be affected. This cannot be undone.",
      )
    ) {
      return;
    }
    setRemovingReportId(reportId);
    try {
      const { removed } = await removeImportedDataMut({ reportId });
      toast.success(
        `Removed ${removed} imported record${removed === 1 ? "" : "s"}.`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to remove imported data.",
      );
    } finally {
      setRemovingReportId(null);
    }
  }

  async function handleUndoReset(reportId: Id<"reports">) {
    if (
      !window.confirm(
        "Restore every appointment this Reset deleted? This puts the deleted rows back exactly as they were.",
      )
    ) {
      return;
    }
    setUndoingReportId(reportId);
    try {
      const { restored } = await undoResetMut({ reportId });
      toast.success(
        `Restored ${restored} appointment${restored === 1 ? "" : "s"}.`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to undo reset.",
      );
    } finally {
      setUndoingReportId(null);
    }
  }

  async function handleCloseReport(reportId: Id<"reports">) {
    setClosingReportId(reportId);
    try {
      await closeReportMut({ reportId });
      toast.success("Report entry closed.");
    } catch {
      toast.error("Failed to close report entry.");
    } finally {
      setClosingReportId(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card backdrop-blur-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap p-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              Booked Tracker
            </h1>
            <button
              type="button"
              aria-label="Dashboard"
              aria-current={view === "report" ? "page" : undefined}
              onClick={() => handleViewChange("report")}
              className={`shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                view === "report"
                  ? "border-info bg-info text-white shadow-sm dark:text-slate-950"
                  : "border-border bg-background text-muted-foreground hover:border-info/50 hover:text-foreground"
              }`}
            >
              Dashboard
            </button>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Appointment intake &amp; booking log across SMB and Boost
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-white dark:hover:bg-emerald-600"
          >
            <Plus className="size-4" />
            Add Appointment
          </Button>

          <div className="flex items-center gap-2">
            <Popover open={notificationOpen} onOpenChange={setNotificationOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={notificationAppointments.length === 0}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-40 disabled:cursor-default disabled:hover:bg-amber-500/10"
                >
                  <AlertTriangle className="size-3.5" />
                  {notificationAppointments.length} Notification
                  {notificationAppointments.length === 1 ? "" : "s"}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-0">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-sm font-semibold text-foreground">
                    Notifications
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Today&apos;s appointments, plus Pending appointments past
                    their scheduled time.
                  </p>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notificationAppointments.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                      No appointment notifications right now.
                    </p>
                  ) : (
                    notificationAppointments.map(a => (
                      <button
                        key={a._id}
                        type="button"
                        onClick={() => {
                          setViewing(a);
                          setViewingFromYtd(false);
                          setNotificationOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-muted/60 transition-colors border-b border-border last:border-b-0"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="text-sm font-medium text-foreground truncate">
                              {a.patientId || "No Patient ID"}
                            </span>
                            <span
                              className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none ${
                                sourceGroup(a.source) === "Boost"
                                  ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                                  : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                              }`}
                            >
                              {sourceGroup(a.source)}
                            </span>
                          </span>
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                            {formatDateTimeEST(a.apptDateTime)}
                          </span>
                        </span>
                        <span className="mt-1 block text-[11px] text-amber-600 dark:text-amber-400">
                          {notificationDetails.get(a._id)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Report badge (Gretchen, 2026-08-05): import/export activity
                history — who, when, how many rows. Access restricted to
                the allowlist (Wence, 2026-08-06) — hidden entirely for
                everyone else. */}
            {canManage && (
              <Popover open={reportOpen} onOpenChange={setReportOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 transition-colors"
                  >
                    <ClipboardList className="size-3.5" />
                    Queue
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-0">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-sm font-semibold text-foreground">
                      Import / Export Queue
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Automatically updated activity history.
                    </p>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {reports.length === 0 ? (
                      <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                        No import or export activity yet.
                      </p>
                    ) : (
                      reports.map(r => (
                        <div
                          key={r._id}
                          className="px-3 py-2 border-b border-border last:border-b-0"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold capitalize text-foreground">
                                {r.action}
                              </span>
                              {r.source && (
                                <span
                                  className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none ${sourceBadgeClass(r.source)}`}
                                >
                                  {r.source}
                                </span>
                              )}
                            </span>
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                              {formatDateTimeEST(
                                new Date(r.createdAt).toISOString(),
                              )}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {r.details}
                          </p>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] text-muted-foreground/70">
                              By {r.userName} · {r.recordCount} record
                              {r.recordCount === 1 ? "" : "s"}
                              {r.removedAt ? " · Removed" : ""}
                              {r.undoneAt ? " · Undone" : ""}
                            </p>
                            <div className="flex items-center gap-3 shrink-0">
                              {r.action === "import" &&
                                !r.removedAt &&
                                r.importedIds &&
                                r.importedIds.length > 0 && (
                                  <button
                                    type="button"
                                    disabled={removingReportId === r._id}
                                    onClick={() =>
                                      handleRemoveImportedData(r._id)
                                    }
                                    className="flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400 hover:text-red-500 disabled:opacity-40 transition-colors"
                                  >
                                    <Trash2 className="size-3" />
                                    {removingReportId === r._id
                                      ? "Removing…"
                                      : "Remove imported data"}
                                  </button>
                                )}
                              {/* Undo (Wence, 2026-08-12): restores every row
                                this specific Reset deleted, from the saved
                                snapshot. One-time — disappears once used. */}
                              {r.action === "reset" &&
                                !r.undoneAt &&
                                r.deletedSnapshot &&
                                r.deletedSnapshot.length > 0 && (
                                  <button
                                    type="button"
                                    disabled={undoingReportId === r._id}
                                    onClick={() => handleUndoReset(r._id)}
                                    className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 disabled:opacity-40 transition-colors"
                                  >
                                    <Undo2 className="size-3" />
                                    {undoingReportId === r._id
                                      ? "Restoring…"
                                      : "Undo"}
                                  </button>
                                )}
                              {/* Close (Wence, 2026-08-06): archives this entry —
                                it drops off the list for good, doesn't touch the
                                underlying appointment data. */}
                              <button
                                type="button"
                                disabled={closingReportId === r._id}
                                onClick={() => handleCloseReport(r._id)}
                                className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
                              >
                                <Check className="size-3" />
                                {closingReportId === r._id
                                  ? "Closing…"
                                  : "Close"}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Tabs
            value={view}
            onValueChange={v => handleViewChange(v as ViewKey)}
          >
            <TabsList>
              <TabsTrigger
                value="all"
                className="data-[state=active]:bg-info data-[state=active]:text-white dark:data-[state=active]:text-slate-950 data-[state=active]:shadow-sm"
              >
                All Appointments
              </TabsTrigger>
              <TabsTrigger
                value="smb"
                className="data-[state=active]:bg-info data-[state=active]:text-white dark:data-[state=active]:text-slate-950 data-[state=active]:shadow-sm"
              >
                SMB Appointments
              </TabsTrigger>
              <TabsTrigger
                value="boost"
                className="data-[state=active]:bg-info data-[state=active]:text-white dark:data-[state=active]:text-slate-950 data-[state=active]:shadow-sm"
              >
                Boost Appointments
              </TabsTrigger>
              <TabsTrigger
                value="ytdConsults"
                className="data-[state=active]:bg-info data-[state=active]:text-white dark:data-[state=active]:text-slate-950 data-[state=active]:shadow-sm"
              >
                Year to Date Consults
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Import/Export/Reset restricted to the allowlist (Wence,
              2026-08-06) — hidden entirely for everyone else; server-side
              mutations reject anyone else too. */}
          {canManage && view !== "report" && (
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) void handleImportFile(file);
                  e.target.value = "";
                }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
              >
                <Upload className="size-4" />
                {importing ? "Importing…" : "Import"}
              </Button>
              <Button
                size="sm"
                onClick={handleExport}
                disabled={scoped.length === 0}
                className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:text-white dark:hover:bg-blue-600 disabled:opacity-40"
              >
                Export
              </Button>
              <Button
                size="sm"
                onClick={() => setResetConfirm(true)}
                disabled={scoped.length === 0 || view === "ytdConsults"}
                className="bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-40"
              >
                Reset
              </Button>
            </div>
          )}
        </div>

        {view === "report" ? (
          <AppointmentReport appointments={appointments} />
        ) : (
          <>
            <FiltersBar
              filters={filters}
              onChange={setFilters}
              serviceTypeOptions={serviceTypeOptions}
              appointmentTypeOptions={appointmentTypeOptions}
            />
            <AppointmentsTable
              appointments={scoped}
              filters={filters}
              onRowClick={appointment => {
                setViewing(appointment);
                setViewingFromYtd(view === "ytdConsults");
              }}
              // YTD intentionally matches All Appointments, including Source.
              hideSource={view === "smb" || view === "boost"}
            />
          </>
        )}
      </div>

      <AppointmentModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onSave={handleCreate}
      />

      <AppointmentDetailsDrawer
        appointment={viewingLive}
        onOpenChange={open => {
          if (!open) {
            setViewing(null);
            setViewingFromYtd(false);
          }
        }}
        onSave={handleUpdate}
        onDelete={handleDelete}
      />

      <ConfirmModal
        open={resetConfirm}
        title={
          view === "all"
            ? "Reset Booked Tracker"
            : `Reset ${view === "smb" ? "SMB" : "Boost"} Appointments`
        }
        message={
          view === "all"
            ? "This will permanently delete ALL booked appointments (SMB and Boost). This action cannot be undone."
            : `This will permanently delete all ${
                view === "smb" ? "SMB" : "Boost"
              } appointments only. The ${
                view === "smb" ? "Boost Appointments" : "SMB Appointments"
              } tab and the All Appointments view will not be affected. This action cannot be undone.`
        }
        confirmLabel="Delete Everything"
        confirmVariant="danger"
        onConfirm={handleReset}
        onCancel={() => setResetConfirm(false)}
      />
    </div>
  );
}
