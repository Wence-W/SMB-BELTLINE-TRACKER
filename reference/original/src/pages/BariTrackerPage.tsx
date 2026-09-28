import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CasesDashboard } from "@/components/bari/CasesDashboard";
import { CaseModal } from "@/components/bari/CaseModal";
import { CaseNotesModal } from "@/components/bari/CaseNotesModal";
import { CasesTable } from "@/components/bari/CasesTable";
import { ConfirmModal } from "@/components/bari/ConfirmModal";
import { FilterBar } from "@/components/bari/FilterBar";
import { PreCertTracker } from "@/components/bari/PreCertTracker";
import { ConsultSection, UrgentSection } from "@/components/bari/SectionCard";
import { StaffWorkload } from "@/components/bari/StaffWorkload";
import { SummaryCards } from "@/components/bari/SummaryCards";
import {
  getConsultSummary,
  getDashboardSummary,
  getPreCertCategories,
  getStaffWorkload,
  getUrgentBariSummary,
} from "@/lib/computations";
import { applyFilters } from "@/lib/caseFilters";
import { ExportDialog } from "@/components/bari/ExportDialog";
import { APP_NAME } from "@/lib/constants";
import { generateId, now } from "@/lib/store";
import { EXPIRING_SOON_DAYS } from "@/lib/taskTypes";
import type {
  BariCase,
  CaseNote,
  CaseType,
  FilterState,
  PreCertCategory,
  StaffRecord,
} from "@/lib/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function convexDocToCase(doc: Record<string, unknown>): BariCase {
  return {
    _id: doc._id as string,
    id: doc._id as string, // use _id as the canonical id
    patientId: doc.patientId as string,
    dos: doc.dos as string | undefined,
    expirationDate: doc.expirationDate as string | undefined,
    caseType: doc.caseType as BariCase["caseType"],
    status: doc.status as BariCase["status"],
    priority: doc.priority as BariCase["priority"],
    assignedTo: doc.assignedTo as BariCase["assignedTo"],
    notes: (doc.notes as string) ?? "",
    createdAt: doc.createdAt as string,
    updatedAt: doc.updatedAt as string,
    completedAt: doc.completedAt as string | undefined,
    approvedAt: doc.approvedAt as string | undefined,
    insuranceProvider: doc.insuranceProvider as string | undefined,
    authorizationNumber: doc.authorizationNumber as string | undefined,
    authStatus: doc.authStatus as BariCase["authStatus"],
    provider: doc.provider as string | undefined,
    requestBy: doc.requestBy as string | undefined,
    createdBy: doc.createdBy as BariCase["createdBy"],
    noteLog: (doc.noteLog as CaseNote[] | undefined) ?? [],
  };
}

function caseToMutationArgs(c: BariCase) {
  return {
    patientId: c.patientId,
    dos: c.dos || undefined,
    expirationDate: c.expirationDate || undefined,
    caseType: c.caseType,
    status: c.status,
    authStatus: c.authStatus,
    priority: c.priority,
    assignedTo: c.assignedTo,
    notes: c.notes,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    completedAt: c.completedAt,
    approvedAt: c.approvedAt,
    insuranceProvider: c.insuranceProvider,
    authorizationNumber: c.authorizationNumber,
    provider: c.provider,
    requestBy: c.requestBy,
    createdBy: c.createdBy,
    noteLog: c.noteLog ?? [],
  };
}

// ─── Filters ─────────────────────────────────────────────────────────────────

const DEFAULT_FILTERS: FilterState = {
  search: "",
  dateFrom: "",
  dateTo: "",
  caseType: "all",
  status: "all",
  authStatus: "all",
  assignedTo: "all",
  priority: "all",
  sortField: "createdAt",
  sortDirection: "desc",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

type CasesSubTab = "dashboard" | "all_cases" | "precert" | "verification_team";

interface BariTrackerPageProps {
  // Controlled from OperationsPage's sidebar nav (URL-driven) when provided;
  // falls back to internal state so the component still works standalone.
  subTab?: CasesSubTab;
  onSubTabChange?: (tab: CasesSubTab) => void;
  // Set by OperationsPage when a Patient ID is clicked from the Priority /
  // Urgent / Expiring "Matching Cases" mini-list, so that case's edit modal
  // pops open here instead of that list staying read-only (Wence, 2026-07-27).
  openCaseId?: string | null;
  onOpenCaseHandled?: () => void;
}

export function BariTrackerPage({
  subTab: subTabProp,
  onSubTabChange,
  openCaseId,
  onOpenCaseHandled,
}: BariTrackerPageProps = {}) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [caseModalOpen, setCaseModalOpen] = useState(false);
  const [editCase, setEditCase] = useState<BariCase | null>(null);
  const [defaultCaseType, setDefaultCaseType] = useState<CaseType | undefined>();
  const [deleteId, setDeleteId] = useState<string | null>(null); // Convex _id
  const [resetConfirm, setResetConfirm] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [notesCase, setNotesCase] = useState<BariCase | null>(null);
  // Classic (pre-2026-08-13) Dashboard overview, collapsed by default now
  // that the Dashboard leads with charts.
  const [showClassicOverview, setShowClassicOverview] = useState(false);
  const [internalSubTab, setInternalSubTab] = useState<CasesSubTab>("dashboard");
  const subTab = subTabProp ?? internalSubTab;
  const setSubTab = onSubTabChange ?? setInternalSubTab;

  // ─── Convex ────────────────────────────────────────────────────────────────
  const rawCases = useQuery(api.cases.listAll);
  const rawStaff = useQuery(api.staff.listAll);
  const rawProviders = useQuery(api.precertProviders.listAll);
  const rawRequesters = useQuery(api.reverificationRequesters.listAll);
  const authUser = useQuery(api.auth.currentUser);
  const rawTasks = useQuery(api.tasks.listAll);
  const dailyMetrics = useQuery(api.intake.listDailyMetrics);
  const intakeEntries = useQuery(api.intake.listEntries);
  // Count-only Call Audit roll-up (auditor name + review date + count).
  const callAuditCounts = useQuery(api.callAudits.countsByAuditor);
  const upsertDailyMetric = useMutation(api.intake.upsertDailyMetric);
  const addIntakeEntry = useMutation(api.intake.addEntry);
  const addCaseMut = useMutation(api.cases.addCase);
  const updateCaseMut = useMutation(api.cases.updateCase);
  const deleteCaseMut = useMutation(api.cases.deleteCase);
  const updateNotesMut = useMutation(api.cases.updateNotes);
  const deleteAllMut = useMutation(api.cases.deleteAll);
  const seedStaffMut = useMutation(api.staff.seedDefaults);
  const addStaffMut = useMutation(api.staff.addStaff);
  const deleteStaffMut = useMutation(api.staff.deleteStaff);
  const updateStaffEmailMut = useMutation(api.staff.updateStaffEmail);
  const seedProvidersMut = useMutation(api.precertProviders.seedDefaults);
  const addProviderMut = useMutation(api.precertProviders.addProvider);
  const deleteProviderMut = useMutation(api.precertProviders.deleteProvider);
  const seedRequestersMut = useMutation(api.reverificationRequesters.seedDefaults);
  const addRequesterMut = useMutation(api.reverificationRequesters.addRequester);
  const deleteRequesterMut = useMutation(api.reverificationRequesters.deleteRequester);

  // Seed default staff once if the table is empty
  const staffSeededRef = useRef(false);
  useEffect(() => {
    if (rawStaff !== undefined && rawStaff.length === 0 && !staffSeededRef.current) {
      staffSeededRef.current = true;
      void seedStaffMut({});
    }
  }, [rawStaff, seedStaffMut]);

  // Seed default Pre-Cert providers (Dr. Procter, Dr. Danthuluri) once if
  // the table is empty (Wence, 2026-08-04).
  const providersSeededRef = useRef(false);
  useEffect(() => {
    if (
      rawProviders !== undefined &&
      rawProviders.length === 0 &&
      !providersSeededRef.current
    ) {
      providersSeededRef.current = true;
      void seedProvidersMut({});
    }
  }, [rawProviders, seedProvidersMut]);

  // Seed the initial Reverification requester choices once. After that,
  // additions/removals are preserved as live staff-managed data.
  const requestersSeededRef = useRef(false);
  useEffect(() => {
    if (
      rawRequesters !== undefined &&
      rawRequesters.length === 0 &&
      !requestersSeededRef.current
    ) {
      requestersSeededRef.current = true;
      void seedRequestersMut({});
    }
  }, [rawRequesters, seedRequestersMut]);

  const providerNames = useMemo(
    () => (rawProviders ?? []).map(p => p.name),
    [rawProviders],
  );
  const requesterNames = useMemo(
    () => (rawRequesters ?? []).map(r => r.name),
    [rawRequesters],
  );

  const staffList: StaffRecord[] = useMemo(
    () =>
      (rawStaff ?? []).map(s => ({
        _id: s._id as string,
        name: s.name,
        color: s.color,
      })),
    [rawStaff],
  );
  const staffNames = useMemo(() => staffList.map(s => s.name), [staffList]);

  // Created By is now auto-detected from whoever is logged in — matched by
  // email against the staff roster (each staff member has their own login).
  // No manual picker on the form anymore (Wence, 2026-07-28).
  const currentStaffName = useMemo(() => {
    const email = authUser?.email;
    if (!email) return undefined;
    return (rawStaff ?? []).find(
      s => s.email && s.email.toLowerCase() === email.toLowerCase(),
    )?.name;
  }, [authUser, rawStaff]);

  const cases: BariCase[] = useMemo(
    () => (rawCases ?? []).map(doc => convexDocToCase(doc as Record<string, unknown>)),
    [rawCases],
  );

  const isLoading = rawCases === undefined;

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleSaveCase = useCallback(
    async (c: BariCase) => {
      const isEdit = !!(c._id);
      try {
        if (isEdit) {
          await updateCaseMut({
            _id: c._id as Id<"cases">,
            ...caseToMutationArgs(c),
          });
          toast.success("Case updated successfully");
        } else {
          // New case: generate a temp id so patientId uniqueness logic works.
          // createdBy is auto-detected from whoever is logged in (matched by
          // email against the staff roster) — no manual field on the form
          // anymore (2026-07-28, Wence). Falls back to "Unknown" if the
          // logged-in account isn't mapped to a staff member.
          const withId = {
            ...c,
            createdBy: currentStaffName ?? "Unknown",
            createdAt: now(),
            updatedAt: now(),
          };
          await addCaseMut({
            clientId: generateId(),
            ...caseToMutationArgs(withId),
          });
          toast.success("Case added successfully");
        }
        setCaseModalOpen(false);
        setEditCase(null);
      } catch (err) {
        toast.error("Failed to save case. Please try again.");
        console.error(err);
      }
    },
    [addCaseMut, updateCaseMut, currentStaffName],
  );

  const handleDeleteConfirmed = useCallback(async () => {
    if (!deleteId) return;
    try {
      await deleteCaseMut({ _id: deleteId as Id<"cases"> });
      toast.success("Case deleted");
    } catch {
      toast.error("Failed to delete case.");
    }
    setDeleteId(null);
  }, [deleteId, deleteCaseMut]);

  const handleReset = useCallback(async () => {
    try {
      await deleteAllMut({});
      setResetConfirm(false);
      toast.success("All data has been reset");
    } catch {
      toast.error("Failed to reset data.");
    }
  }, [deleteAllMut]);

  const handleSaveNotes = useCallback(
    async (caseId: string, notes: CaseNote[]) => {
      try {
        await updateNotesMut({
          _id: caseId as Id<"cases">,
          noteLog: notes,
        });
        // Keep modal in sync optimistically
        setNotesCase(prev =>
          prev?.id === caseId ? { ...prev, noteLog: notes } : prev,
        );
      } catch {
        toast.error("Failed to save note.");
      }
    },
    [updateNotesMut],
  );

  const handleAddStaff = useCallback(
    async (name: string, color: string, email?: string) => {
      try {
        await addStaffMut({ name, color, email });
        toast.success(`${name} added to staff`);
      } catch (err) {
        const msg = err instanceof Error && err.message.includes("already exists")
          ? "That staff member already exists"
          : "Failed to add staff member";
        toast.error(msg);
      }
    },
    [addStaffMut],
  );

  const handleDeleteStaff = useCallback(
    async (staff: StaffRecord) => {
      try {
        await deleteStaffMut({ _id: staff._id as Id<"staff"> });
        toast.success(`${staff.name} removed from staff`);
      } catch {
        toast.error("Failed to remove staff member");
      }
    },
    [deleteStaffMut],
  );

  const handleAddProvider = useCallback(
    async (name: string) => {
      try {
        await addProviderMut({ name });
        toast.success(`${name} added to providers`);
      } catch (err) {
        const msg =
          err instanceof Error && err.message.includes("already exists")
            ? "That provider already exists"
            : "Failed to add provider";
        toast.error(msg);
      }
    },
    [addProviderMut],
  );

  const handleDeleteProvider = useCallback(
    async (name: string) => {
      const match = (rawProviders ?? []).find(p => p.name === name);
      if (!match) return;
      try {
        await deleteProviderMut({ _id: match._id as Id<"precertProviders"> });
        toast.success(`${name} removed from providers`);
      } catch {
        toast.error("Failed to remove provider");
      }
    },
    [rawProviders, deleteProviderMut],
  );

  const handleAddRequestBy = useCallback(
    async (name: string) => {
      try {
        await addRequesterMut({ name });
        toast.success(`${name} added to Request by`);
      } catch (err) {
        const msg =
          err instanceof Error && err.message.includes("already exists")
            ? "That requester already exists"
            : "Failed to add requester";
        toast.error(msg);
      }
    },
    [addRequesterMut],
  );

  const handleDeleteRequestBy = useCallback(
    async (name: string) => {
      const match = (rawRequesters ?? []).find(r => r.name === name);
      if (!match) return;
      try {
        await deleteRequesterMut({
          _id: match._id as Id<"reverificationRequesters">,
        });
        toast.success(`${name} removed from Request by`);
      } catch {
        toast.error("Failed to remove requester");
      }
    },
    [rawRequesters, deleteRequesterMut],
  );

  const handleUpdateStaffEmail = useCallback(
    async (staff: StaffRecord, email: string) => {
      try {
        await updateStaffEmailMut({ _id: staff._id as Id<"staff">, email });
        toast.success(`Email updated for ${staff.name}`);
      } catch {
        toast.error("Failed to update email");
      }
    },
    [updateStaffEmailMut],
  );

  function openAddModal(caseType?: CaseType) {
    setEditCase(null);
    setDefaultCaseType(caseType);
    setCaseModalOpen(true);
  }

  function openEditModal(c: BariCase) {
    setEditCase(c);
    setDefaultCaseType(undefined);
    setCaseModalOpen(true);
  }

  // Open the edit modal for a case requested from outside (Priority/Urgent/
  // Expiring mini-lists), then let the parent know it's been handled so it
  // doesn't reopen on every re-render.
  useEffect(() => {
    if (!openCaseId) return;
    const match = cases.find(c => c._id === openCaseId || c.id === openCaseId);
    if (match) {
      setSubTab("all_cases");
      openEditModal(match);
    }
    onOpenCaseHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCaseId, cases]);



  const filtered = useMemo(() => applyFilters(cases, filters), [cases, filters]);
  // All Cases view is split 2026-07-17: Bari Task vs Pre-Cert (by caseType),
  // each further split into Pending vs Completed (by status).
  const PRECERT_TYPES = new Set<CaseType>([
    "precert_bari",
    "precert_veins",
    "precert_general",
    "precert_modified_urgent",
    "precert_egd",
  ]);
  const isPrecert = (c: BariCase) => PRECERT_TYPES.has(c.caseType);
  const BARI_TASK_OTHER_STATUSES = new Set<BariCase["status"]>([
    "reassigned",
    "cancelled",
    "on_hold",
  ]);
  const bariTaskNew = useMemo(
    () => filtered.filter(c => !isPrecert(c) && c.status === "new"),
    [filtered],
  );
  const bariTaskPending = useMemo(
    () =>
      filtered.filter(
        c =>
          !isPrecert(c) &&
          c.status !== "completed" &&
          c.status !== "new" &&
          !BARI_TASK_OTHER_STATUSES.has(c.status),
      ),
    [filtered],
  );
  const bariTaskCompleted = useMemo(
    () => filtered.filter(c => !isPrecert(c) && c.status === "completed"),
    [filtered],
  );
  const bariTaskReassigned = useMemo(
    () => filtered.filter(c => !isPrecert(c) && c.status === "reassigned"),
    [filtered],
  );
  const bariTaskCancelled = useMemo(
    () => filtered.filter(c => !isPrecert(c) && c.status === "cancelled"),
    [filtered],
  );
  const bariTaskOnHold = useMemo(
    () => filtered.filter(c => !isPrecert(c) && c.status === "on_hold"),
    [filtered],
  );
  // Pre-Cert split 2026-07-17 per Wence: Approved now rolls into Completed
  // (alongside status "completed"), and Reassigned/Cancelled/On Hold get
  // their own separate tab instead of sitting in Pending.
  const PRECERT_OTHER_STATUSES = new Set<BariCase["status"]>([
    "reassigned",
    "cancelled",
    "on_hold",
  ]);
  // "New" gets its own tab (added 2026-07-21) instead of sitting in Pending.
  const precertNew = useMemo(
    () => filtered.filter(c => isPrecert(c) && c.status === "new"),
    [filtered],
  );
  const precertPending = useMemo(
    () =>
      filtered.filter(
        c =>
          isPrecert(c) &&
          c.status !== "completed" &&
          c.status !== "new" &&
          !PRECERT_OTHER_STATUSES.has(c.status),
      ),
    [filtered],
  );
  const precertCompleted = useMemo(
    () => filtered.filter(c => isPrecert(c) && c.status === "completed"),
    [filtered],
  );
  const precertOther = useMemo(
    () => filtered.filter(c => isPrecert(c) && PRECERT_OTHER_STATUSES.has(c.status)),
    [filtered],
  );
  const precertReassigned = useMemo(
    () => filtered.filter(c => isPrecert(c) && c.status === "reassigned"),
    [filtered],
  );
  const precertCancelled = useMemo(
    () => filtered.filter(c => isPrecert(c) && c.status === "cancelled"),
    [filtered],
  );
  const precertOnHold = useMemo(
    () => filtered.filter(c => isPrecert(c) && c.status === "on_hold"),
    [filtered],
  );
  type PrecertSubTab =
    | "new"
    | "pending"
    | "completed"
    | "reassigned"
    | "cancelled"
    | "on_hold";
  const [precertSubTab, setPrecertSubTab] = useState<PrecertSubTab>("pending");
  type AllCasesSubTab =
    | "new"
    | "pending"
    | "completed"
    | "reassigned"
    | "cancelled"
    | "on_hold";
  const [allCasesSubTab, setAllCasesSubTab] = useState<AllCasesSubTab>("pending");
  // Calendar filter for the Completed tab (2026-07-17 per Wence): pick a
  // specific date to narrow the Completed list down to cases completed
  // on that day, based on completedAt.
  const [completedDateFilter, setCompletedDateFilter] = useState("");

  const summary = useMemo(() => getDashboardSummary(cases), [cases]);
  const urgentSummary = useMemo(() => getUrgentBariSummary(cases), [cases]);
  const preCertCategories = useMemo(() => getPreCertCategories(cases), [cases]);
  const staffWorkload = useMemo(
    () => getStaffWorkload(cases, staffNames),
    [cases, staffNames],
  );

  // Per-staff extras shown on the Verification Team cards: fax docs / new
  // patient chart totals (all-time, from Intake Daily Metrics keyed by
  // staff name) and open Task counts (urgent priority, expiring/expired).
  const staffExtras = useMemo(() => {
    const map: Record<
      string,
      {
        faxDocs: number;
        newPatientChart: number;
        callAudits: number;
        otherConcern: number;
        urgentTasks: number;
        expiringTasks: number;
      }
    > = {};
    function ensure(name: string) {
      map[name] ??= {
        faxDocs: 0,
        newPatientChart: 0,
        callAudits: 0,
        otherConcern: 0,
        urgentTasks: 0,
        expiringTasks: 0,
      };
      return map[name];
    }
    for (const m of dailyMetrics ?? []) {
      const row = ensure(m.staff);
      row.faxDocs += m.faxDocs;
      row.newPatientChart += m.newPatientIntake;
    }
    // Call Audits on the card = real Call Audit records where this staffer is
    // the assigned Auditor, all-time (Wence, 2026-08-13). The old manually
    // typed intakeDailyMetrics.callAudits field is no longer read or logged.
    // Roster spellings can differ in case/spacing from the auditor name
    // stored on the audit, so resolve to the Verification roster name.
    const staffByKey = new Map(
      staffNames.map(n => [n.trim().toLowerCase(), n]),
    );
    for (const c of callAuditCounts ?? []) {
      const name =
        staffByKey.get(c.auditorName.trim().toLowerCase()) ?? c.auditorName;
      ensure(name).callAudits += c.count;
    }
    for (const e of intakeEntries ?? []) {
      if (e.category !== "other_concerns") continue;
      ensure(e.staff).otherConcern += e.count;
    }
    for (const t of rawTasks ?? []) {
      if (t.status === "completed" || t.status === "cancelled") continue;
      const row = ensure(t.assignedTo);
      if (t.priority === "urgent") row.urgentTasks += 1;
      if (t.expirationDate) {
        const target = new Date(t.expirationDate + "T00:00:00");
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const days = Math.round(
          (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (days <= EXPIRING_SOON_DAYS) row.expiringTasks += 1;
      }
    }
    return map;
  }, [dailyMetrics, intakeEntries, rawTasks, callAuditCounts, staffNames]);

  // Lets a Verification Team member log their own Fax Docs / New Patient
  // Chart directly (part of their own productivity), instead of relying on
  // an Intake Team entry happening to share their name. Preserves any
  // existing emails/chats/audits already logged for that staff+date.
  const handleLogStaffMetric = useCallback(
    (staff: string, date: string, faxDocs: number, newPatientChart: number) => {
      const existing = (dailyMetrics ?? []).find(
        m => m.staff === staff && m.date === date,
      );
      upsertDailyMetric({
        staff,
        date,
        emailsSent: existing?.emailsSent ?? 0,
        ghlChats: existing?.ghlChats ?? 0,
        // Call Audits is no longer logged by hand (Wence, 2026-08-13) — the
        // card reads real audit records. Keep whatever was stored before so
        // no historical value is silently wiped.
        callAudits: existing?.callAudits ?? 0,
        faxDocs,
        newPatientIntake: newPatientChart,
        updatedAt: now(),
      })
        .then(() => toast.success("Saved"))
        .catch(() => toast.error("Failed to save"));
    },
    [dailyMetrics, upsertDailyMetric],
  );

  // Lets a Verification Team member log their own Inbound Other Concern
  // count directly (part of their own productivity), writing an Intake
  // Entry with category "other_concerns" — same category the Staff Daily
  // Productivity report already sums, regardless of which team logged it.
  const handleLogOtherConcern = useCallback(
    (staff: string, date: string, count: number) => {
      addIntakeEntry({
        staff,
        date,
        direction: "inbound",
        category: "other_concerns",
        count,
        createdAt: now(),
      })
        .then(() => toast.success("Saved"))
        .catch(() => toast.error("Failed to save"));
    },
    [addIntakeEntry],
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-muted text-foreground">
      {/* Top header */}
      <div className="sticky top-0 z-30 bg-card/90 backdrop-blur-md border-b border-border px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-foreground text-sm font-bold">🏥</span>
            </div>
            <div>
              <h1 className="font-bold text-foreground text-base leading-tight">
                {APP_NAME}
              </h1>
              <p className="text-muted-foreground text-[11px]">
                {isLoading ? "Loading…" : `${cases.length} cases · Live sync`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => openAddModal()}
              className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary text-white text-xs font-medium transition-colors"
            >
              + Add Case
            </button>
            {/* Export dialog (Wence, 2026-09-24): opens pre-filled with the
                current on-screen filters; every filter is adjustable before
                exporting to Excel / PDF / Print. Replaces the old header
                Created/Completed date boxes (now inside the dialog). */}
            <button
              onClick={() => setExportOpen(true)}
              disabled={cases.length === 0}
              className="px-3 py-1.5 rounded-lg bg-sky-700/40 hover:bg-sky-700/70 text-sky-700 border border-sky-600/40 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ⬇ Export
            </button>
            <button
              onClick={() => setResetConfirm(true)}
              disabled={cases.length === 0}
              className="px-3 py-1.5 rounded-lg bg-rose-700/30 hover:bg-rose-700/50 text-rose-700 border border-rose-600/40 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-6 space-y-6 max-w-[1600px]">
        {isLoading ? (
          <div className="flex items-center justify-center py-32">
            <div className="text-muted-foreground text-sm flex items-center gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Loading cases…
            </div>
          </div>
        ) : (
          <>
            {/* Sub-tabs: Dashboard / All Cases */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSubTab("dashboard")}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  subTab === "dashboard"
                    ? "bg-primary border-primary text-white"
                    : "bg-muted border-border text-foreground hover:bg-card"
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => setSubTab("all_cases")}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  subTab === "all_cases"
                    ? "bg-primary border-primary text-white"
                    : "bg-muted border-border text-foreground hover:bg-card"
                }`}
              >
                All Cases{" "}
                <span className="opacity-70">
                  (
                  {bariTaskNew.length +
                    bariTaskPending.length +
                    bariTaskCompleted.length +
                    bariTaskReassigned.length +
                    bariTaskCancelled.length +
                    bariTaskOnHold.length}
                  )
                </span>
              </button>
              <button
                onClick={() => setSubTab("precert")}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  subTab === "precert"
                    ? "bg-primary border-primary text-white"
                    : "bg-muted border-border text-foreground hover:bg-card"
                }`}
              >
                Pre-Cert{" "}
                <span className="opacity-70">
                  (
                  {precertNew.length +
                    precertPending.length +
                    precertCompleted.length +
                    precertOther.length}
                  )
                </span>
              </button>
              <button
                onClick={() => setSubTab("verification_team")}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  subTab === "verification_team"
                    ? "bg-primary border-primary text-white"
                    : "bg-muted border-border text-foreground hover:bg-card"
                }`}
              >
                Verification Team
              </button>
            </div>

            {subTab === "dashboard" && (
              <>
            {/* Chart dashboard (Gretchen, 2026-08-13): replaces the old
                summary-card/section overview as the default Dashboard view.
                The classic overview (with its per-section "+ Add Case"
                shortcuts and the Pre-Cert Tracker) is preserved behind a
                collapsible toggle so nothing was lost. */}
            <CasesDashboard cases={cases} />

            <button
              type="button"
              onClick={() => setShowClassicOverview(v => !v)}
              className="text-xs font-medium text-muted-foreground underline hover:text-foreground"
            >
              {showClassicOverview ? "Hide" : "Show"} classic overview (summary cards, quick add, Pre-Cert Tracker)
            </button>

            {showClassicOverview && (
              <>
            {/* Summary cards */}
            <SummaryCards summary={summary} />

            {/* Section overview grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <UrgentSection
                data={urgentSummary}
                onAddCase={() => openAddModal("urgent")}
              />
              <ConsultSection
                title="Bari Initial Consults"
                data={getConsultSummary(cases, "initial_consult")}
                accentColor="blue"
                onAddCase={() => openAddModal("initial_consult")}
              />
              <ConsultSection
                title="Bari Follow-Up Consults"
                data={getConsultSummary(cases, "followup_consult")}
                accentColor="violet"
                onAddCase={() => openAddModal("followup_consult")}
              />
              <ConsultSection
                title="No Appointment"
                data={getConsultSummary(cases, "no_appointment")}
                accentColor="amber"
                onAddCase={() => openAddModal("no_appointment")}
              />
              <ConsultSection
                title="Reverification"
                data={getConsultSummary(cases, "reverification")}
                accentColor="emerald"
                onAddCase={() => openAddModal("reverification")}
              />
              <ConsultSection
                title="Predetermination"
                data={getConsultSummary(cases, "predetermination")}
                accentColor="indigo"
                onAddCase={() => openAddModal("predetermination")}
              />
            </div>

            {/* Pre-Cert Tracker */}
            <PreCertTracker
              categories={preCertCategories}
              onAddCase={key => {
                const map: Record<PreCertCategory["key"], CaseType> = {
                  bari: "precert_bari",
                  veins: "precert_veins",
                  general: "precert_general",
                  modified_urgent: "precert_modified_urgent",
                  egd: "precert_egd",
                };
                openAddModal(map[key]);
              }}
            />
              </>
            )}
              </>
            )}

            {subTab === "verification_team" && (
              <>
            {/* Staff Workload (Verification Team) */}
            <StaffWorkload
              workload={staffWorkload}
              staffList={staffList}
              extras={staffExtras}
              onAddStaff={handleAddStaff}
              onDeleteStaff={handleDeleteStaff}
              onUpdateStaffEmail={handleUpdateStaffEmail}
              onLogMetric={handleLogStaffMetric}
              onLogOtherConcern={handleLogOtherConcern}
            />
              </>
            )}

            {subTab === "all_cases" && (
              <>
            {/* Filters shared by both tables below (2026-07-17 per Wence:
                split into Bari Task vs Pre-Cert, each Pending vs Completed). */}
            <div className="rounded-xl border border-border bg-card backdrop-blur-sm">
              <div className="p-4">
                <FilterBar
                  filters={filters}
                  staffOptions={staffNames}
                  onChange={setFilters}
                />
              </div>
            </div>

            {/* All Cases status tabs 2026-07-17: same tab treatment as
                Pre-Cert, so Pending/Completed don't stack/scroll. */}
            <div className="flex items-center gap-2 flex-wrap justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                {(
                  [
                    { key: "new", label: "New", list: bariTaskNew },
                    { key: "pending", label: "Pending", list: bariTaskPending },
                    { key: "completed", label: "Completed", list: bariTaskCompleted },
                    { key: "reassigned", label: "Reassigned", list: bariTaskReassigned },
                    { key: "cancelled", label: "Cancelled", list: bariTaskCancelled },
                    { key: "on_hold", label: "On Hold", list: bariTaskOnHold },
                  ] as const
                ).map(t => (
                  <button
                    key={t.key}
                    onClick={() => setAllCasesSubTab(t.key)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      allCasesSubTab === t.key
                        ? "bg-primary border-primary text-white"
                        : "bg-muted border-border text-foreground hover:bg-card"
                    }`}
                  >
                    {t.label} <span className="opacity-70">({t.list.length})</span>
                  </button>
                ))}
              </div>
              {/* Calendar selection for Completed tab (2026-07-17 per Wence):
                  narrow Completed cases down to a specific completed date. */}
              {allCasesSubTab === "completed" && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={completedDateFilter}
                    onChange={e => setCompletedDateFilter(e.target.value)}
                    className="bg-card border border-input/60 text-sm text-foreground rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/50 hover:border-border transition-colors"
                  />
                  {completedDateFilter && (
                    <button
                      onClick={() => setCompletedDateFilter("")}
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card backdrop-blur-sm">
              <div className="p-4 border-b border-border">
                <h2 className="font-bold text-foreground text-base">
                  {allCasesSubTab === "new" && "New"}
                  {allCasesSubTab === "pending" && "Pending"}
                  {allCasesSubTab === "completed" && "Completed"}
                  {allCasesSubTab === "reassigned" && "Reassigned"}
                  {allCasesSubTab === "cancelled" && "Cancelled"}
                  {allCasesSubTab === "on_hold" && "On Hold"}
                </h2>
              </div>
              <div className="p-4">
                <CasesTable
                  cases={
                    allCasesSubTab === "new"
                      ? bariTaskNew
                      : allCasesSubTab === "pending"
                        ? bariTaskPending
                        : allCasesSubTab === "completed"
                          ? completedDateFilter
                            ? bariTaskCompleted.filter(
                                c => c.completedAt?.slice(0, 10) === completedDateFilter,
                              )
                            : bariTaskCompleted
                          : allCasesSubTab === "reassigned"
                            ? bariTaskReassigned
                            : allCasesSubTab === "cancelled"
                              ? bariTaskCancelled
                              : bariTaskOnHold
                  }
                  onEdit={openEditModal}
                  onDelete={id => setDeleteId(id)}
                  onOpenNotes={c => setNotesCase(c)}
                />
              </div>
            </div>
              </>
            )}

            {subTab === "precert" && (
              <>
            <div className="rounded-xl border border-border bg-card backdrop-blur-sm">
              <div className="p-4">
                <FilterBar
                  filters={filters}
                  staffOptions={staffNames}
                  onChange={setFilters}
                  showAuthStatus
                />
              </div>
            </div>

            {/* Pre-Cert status tabs 2026-07-17: split into own tabs (no more
                stacked/scrolling tables) so each status is one click away. */}
            <div className="flex items-center gap-2 flex-wrap">
              {(
                [
                  { key: "new", label: "New", list: precertNew },
                  { key: "pending", label: "Pending", list: precertPending },
                  { key: "completed", label: "Completed", list: precertCompleted },
                  { key: "reassigned", label: "Reassigned", list: precertReassigned },
                  { key: "cancelled", label: "Cancelled", list: precertCancelled },
                  { key: "on_hold", label: "On Hold", list: precertOnHold },
                ] as const
              ).map(t => (
                <button
                  key={t.key}
                  onClick={() => setPrecertSubTab(t.key)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    precertSubTab === t.key
                      ? "bg-primary border-primary text-white"
                      : "bg-muted border-border text-foreground hover:bg-card"
                  }`}
                >
                  {t.label} <span className="opacity-70">({t.list.length})</span>
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-card backdrop-blur-sm">
              <div className="p-4 border-b border-border">
                <h2 className="font-bold text-foreground text-base">
                  {precertSubTab === "new" && "New"}
                  {precertSubTab === "pending" && "Pending"}
                  {precertSubTab === "completed" && "Completed"}
                  {precertSubTab === "reassigned" && "Reassigned"}
                  {precertSubTab === "cancelled" && "Cancelled"}
                  {precertSubTab === "on_hold" && "On Hold"}
                </h2>
              </div>
              <div className="p-4">
                <CasesTable
                  cases={
                    precertSubTab === "new"
                      ? precertNew
                      : precertSubTab === "pending"
                        ? precertPending
                        : precertSubTab === "completed"
                          ? precertCompleted
                          : precertSubTab === "reassigned"
                            ? precertReassigned
                            : precertSubTab === "cancelled"
                              ? precertCancelled
                              : precertOnHold
                  }
                  onEdit={openEditModal}
                  onDelete={id => setDeleteId(id)}
                  onOpenNotes={c => setNotesCase(c)}
                  showAuthStatus
                />
              </div>
            </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <CaseNotesModal
        open={notesCase !== null}
        caseId={notesCase?.id ?? ""}
        patientId={notesCase?.patientId ?? ""}
        existingNotes={notesCase?.noteLog ?? []}
        staffOptions={staffNames}
        onSave={handleSaveNotes}
        onClose={() => setNotesCase(null)}
      />

      <CaseModal
        open={caseModalOpen}
        editCase={editCase}
        defaultCaseType={defaultCaseType}
        staffOptions={staffNames}
        providerOptions={providerNames}
        onAddProvider={handleAddProvider}
        onDeleteProvider={handleDeleteProvider}
        requestByOptions={requesterNames}
        onAddRequestBy={handleAddRequestBy}
        onDeleteRequestBy={handleDeleteRequestBy}
        onSave={handleSaveCase}
        onClose={() => {
          setCaseModalOpen(false);
          setEditCase(null);
        }}
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        cases={cases}
        screenFilters={filters}
        showAuthStatus={subTab === "precert"}
        staffOptions={staffNames}
      />

      <ConfirmModal
        open={deleteId !== null}
        title="Delete Case"
        message="Are you sure you want to delete this case? This action cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteId(null)}
      />

      <ConfirmModal
        open={resetConfirm}
        title="Reset All Data"
        message="This will permanently delete ALL cases from this tracker. This cannot be undone."
        confirmLabel="Reset Everything"
        confirmVariant="danger"
        onConfirm={handleReset}
        onCancel={() => setResetConfirm(false)}
      />
    </div>
  );
}
