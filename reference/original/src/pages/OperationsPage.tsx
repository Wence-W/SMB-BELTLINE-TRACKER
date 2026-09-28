import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ConfirmModal } from "@/components/bari/ConfirmModal";
import { DateRangeFilter, inDateRange } from "@/components/DateRangeFilter";
import { BillingTab } from "@/components/productivity/BillingTab";
import { BariVerificationProcessTab } from "@/components/productivity/BariVerificationProcessTab";
import { BariVerificationGuidelinesTab } from "@/components/productivity/BariVerificationGuidelinesTab";
import { HistoricalActivityTab } from "@/components/productivity/HistoricalActivityTab";
import { IntakeTeamTab } from "@/components/productivity/IntakeTeamTab";
import { ReportsTab } from "@/components/productivity/ReportsTab";
import { StaffProductivityTab } from "@/components/productivity/StaffProductivityTab";
import { TaskModal } from "@/components/tasks/TaskModal";
import { TaskTable } from "@/components/tasks/TaskTable";
import { DocAuditModal } from "@/components/tasks/DocAuditModal";
import { matchesDocAuditFilter, type DocAuditFilter } from "@/lib/docAudit";
import { matchesCompletedCase, matchesCompletedTask, sortCompletedCases } from "@/lib/completedFilters";
import { CASE_TYPE_OPTIONS } from "@/components/bari/FilterBar";
import type { CaseType, Priority, SortField } from "@/lib/types";
import {
  isExpired,
  isExpiringSoon,
  type Task,
} from "@/lib/taskTypes";
import { isDosExpiringSoon } from "@/lib/computations";
import type { BariCase } from "@/lib/types";
import { BariTrackerPage } from "./BariTrackerPage";
import { DirectoryPage } from "./DirectoryPage";
import { MiniCasesList } from "@/components/tasks/MiniCasesList";
import { CallAuditsPage } from "./CallAuditsPage";

function convexDocToCase(doc: Record<string, unknown>): BariCase {
  return {
    _id: doc._id as string,
    id: doc._id as string,
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
    noteLog: (doc.noteLog as BariCase["noteLog"]) ?? [],
    auditBookmarked: doc.auditBookmarked as boolean | undefined,
    docAuditStatus: doc.docAuditStatus as BariCase["docAuditStatus"],
    docAuditedBy: doc.docAuditedBy as string | undefined,
    docAuditedAt: doc.docAuditedAt as string | undefined,
    docAuditNotes: doc.docAuditNotes as string | undefined,
  };
}

function convexDocToTask(doc: {
  _id: Id<"tasks">;
  title: string;
  assignedTo: string;
  createdDate: string;
  dueDate?: string;
  expirationDate?: string;
  priority: string;
  status: string;
  notes: string;
  completedAt?: string;
  updatedAt: string;
  auditBookmarked?: boolean;
}): Task {
  return {
    id: doc._id,
    title: doc.title,
    assignedTo: doc.assignedTo,
    createdDate: doc.createdDate,
    dueDate: doc.dueDate,
    expirationDate: doc.expirationDate,
    priority: doc.priority as Task["priority"],
    status: doc.status as Task["status"],
    notes: doc.notes,
    completedAt: doc.completedAt,
    updatedAt: doc.updatedAt,
    auditBookmarked: doc.auditBookmarked,
  };
}

const TASK_TABS = ["priority", "urgent", "completed", "expiring"];

export function OperationsPage() {
  const rawTasks = useQuery(api.tasks.listAll);
  const rawStaff = useQuery(api.staff.listAll);
  const rawCases = useQuery(api.cases.listAll);
  const addTaskMut = useMutation(api.tasks.addTask);
  const updateTaskMut = useMutation(api.tasks.updateTask);
  const deleteTaskMut = useMutation(api.tasks.deleteTask);
  const setAuditBookmarkMut = useMutation(api.tasks.setAuditBookmark);
  const handleToggleAuditBookmark = (t: Task) => {
    setAuditBookmarkMut({ taskId: t.id as Id<"tasks"> }).catch(() =>
      toast.error("Failed to update bookmark"),
    );
  };
  const setCaseAuditBookmarkMut = useMutation(api.cases.setAuditBookmark);
  const handleCaseBookmarkClick = (c: BariCase) => {
    setCaseAuditBookmarkMut({ caseId: c.id as Id<"cases"> }).catch(() =>
      toast.error("Failed to update bookmark"),
    );
  };

  // Documentation Audit / QA review (Wence, 2026-09-11) — Completed tab's
  // Matching Cases list only. Manually marks a completed case's
  // documentation as Reviewed/Audited, separate from workflow status.
  const setDocAuditMut = useMutation(api.cases.setDocumentationAudit);
  const [docAuditTarget, setDocAuditTarget] = useState<BariCase | null>(null);
  const [docAuditFilter, setDocAuditFilter] = useState<DocAuditFilter>("all");
  function handleDocAuditSave(args: {
    status: "reviewed" | "audited" | null;
    auditedBy: string;
    notes: string;
  }) {
    if (!docAuditTarget) return;
    setDocAuditMut({
      caseId: docAuditTarget.id as Id<"cases">,
      status: args.status,
      auditedBy: args.auditedBy || undefined,
      notes: args.notes || undefined,
    })
      .then(() =>
        toast.success(
          args.status === null ? "Audit cleared" : "Documentation audit saved",
        ),
      )
      .catch(() => toast.error("Failed to save documentation audit"))
      .finally(() => setDocAuditTarget(null));
  }

  // Navigation now lives in the left sidebar (2026-07-17 per Wence) — the
  // active tab/sub-tab are driven off the URL (?tab=..&sub=..) so sidebar
  // links can navigate directly instead of local button state.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "cases";
  const casesSubTab =
    (searchParams.get("sub") as "dashboard" | "all_cases" | "precert" | "verification_team") ??
    "dashboard";

  function setActiveTab(tab: string) {
    setSearchParams({ tab });
  }
  function setCasesSubTab(sub: "dashboard" | "all_cases" | "precert" | "verification_team") {
    setSearchParams({ tab: "cases", sub });
  }

  // Clicking a Patient ID in the Priority/Urgent/Expiring "Matching Cases"
  // mini-list jumps to the Cases tab with that case's edit modal already
  // open (Wence, 2026-07-27).
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);
  function openCaseForEdit(c: BariCase) {
    setOpenCaseId((c._id as string) ?? c.id);
    setActiveTab("cases");
  }

  const staffNames = useMemo(
    () => (rawStaff ?? []).map(s => s.name),
    [rawStaff],
  );

  const tasks: Task[] = useMemo(
    () => (rawTasks ?? []).map(convexDocToTask),
    [rawTasks],
  );
  const cases: BariCase[] = useMemo(
    () => (rawCases ?? []).map(convexDocToCase),
    [rawCases],
  );
  // Date From / Date To range shared by the task tabs (Gretchen,
  // 2026-08-13). On Completed it filters by Completed date; on
  // Priority / Urgent / Expiring it filters by Created date.
  const [taskFrom, setTaskFrom] = useState("");
  const [taskTo, setTaskTo] = useState("");
  const OPEN_CASE_STATUSES = new Set<BariCase["status"]>([
    "new",
    "in_progress",
    "on_hold",
    "reassigned",
  ]);
  const casesUrgentOpen = useMemo(
    () =>
      cases.filter(
        c =>
          c.priority === "urgent" &&
          OPEN_CASE_STATUSES.has(c.status) &&
          inDateRange(c.createdAt, taskFrom, taskTo),
      ),
    [cases, taskFrom, taskTo],
  );
  // Priority tab includes both Urgent and High priority Cases (added
  // 2026-07-17 per Wence: High priority cases should surface in Priority tab).
  const casesPriorityOpen = useMemo(
    () =>
      cases.filter(
        c =>
          (c.priority === "urgent" || c.priority === "high") &&
          OPEN_CASE_STATUSES.has(c.status) &&
          inDateRange(c.createdAt, taskFrom, taskTo),
      ),
    [cases, taskFrom, taskTo],
  );
  // Calendar filter for the Ins Verifiers > Completed tab (Wence, 2026-07-28):
  // narrow both the completed Task table and Matching Cases down to a
  // specific completed date, mirroring the same pattern used on the All
  // Cases > Completed sub-tab.
  const [completedDateFilter, setCompletedDateFilter] = useState("");
  const [completedSearch, setCompletedSearch] = useState("");
  const [completedStaff, setCompletedStaff] = useState("all");
  // Case Type / Priority / Sort added to the Completed tab (Wence,
  // 2026-09-24: "add filter to completed" -> lahat ng nasa screenshot),
  // reusing the same options as the Cases FilterBar. These apply to the
  // Matching Cases list only — the Task table below has no case type and
  // uses a different priority scale, so it stays governed by Search/Staff
  // as before.
  const [completedCaseType, setCompletedCaseType] = useState<CaseType | "all">("all");
  const [completedPriority, setCompletedPriority] = useState<Priority | "all">("all");
  const [completedSortField, setCompletedSortField] = useState<SortField>("createdAt");
  const [completedSortDirection, setCompletedSortDirection] = useState<"asc" | "desc">("desc");
  // Include historical assignees so removing a roster name doesn't make
  // their completed work impossible to select.
  const completedStaffOptions = useMemo(
    () => [...new Set([
      ...staffNames,
      ...cases.filter(c => c.status === "completed").map(c => c.assignedTo),
      ...tasks.filter(t => t.status === "completed").map(t => t.assignedTo),
    ])].filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [staffNames, cases, tasks],
  );
  const dateField = (activeTab === "completed" ? "completed" : "created") as
    | "completed"
    | "created";
  const casesCompletedAll = useMemo(
    () => cases.filter(c => c.status === "completed"),
    [cases],
  );
  const casesCompleted = useMemo(
    () =>
      sortCompletedCases(
        casesCompletedAll
          .filter(c =>
            completedDateFilter
              ? c.completedAt?.slice(0, 10) === completedDateFilter
              : true,
          )
          .filter(c => inDateRange(c.completedAt, taskFrom, taskTo))
          .filter(c =>
            matchesCompletedCase(c, completedSearch, completedStaff, completedCaseType, completedPriority),
          )
          .filter(c => matchesDocAuditFilter(c, docAuditFilter)),
        completedSortField,
        completedSortDirection,
      ),
    [
      casesCompletedAll,
      completedDateFilter,
      taskFrom,
      taskTo,
      docAuditFilter,
      completedSearch,
      completedStaff,
      completedCaseType,
      completedPriority,
      completedSortField,
      completedSortDirection,
    ],
  );
  const casesExpiringSoon = useMemo(
    () =>
      cases
        .filter(isDosExpiringSoon)
        .filter(c => inDateRange(c.createdAt, taskFrom, taskTo)),
    [cases, taskFrom, taskTo],
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  const priorityTasks = useMemo(
    () =>
      tasks.filter(
        t =>
          (t.priority === "high" || t.priority === "urgent") &&
          t.status !== "completed" &&
          t.status !== "cancelled" &&
          inDateRange(t.createdDate, taskFrom, taskTo),
      ),
    [tasks, taskFrom, taskTo],
  );
  const urgentTasks = useMemo(
    () =>
      tasks.filter(
        t =>
          t.priority === "urgent" &&
          t.status !== "completed" &&
          t.status !== "cancelled" &&
          inDateRange(t.createdDate, taskFrom, taskTo),
      ),
    [tasks, taskFrom, taskTo],
  );
  const completedTasksAll = useMemo(
    () => tasks.filter(t => t.status === "completed"),
    [tasks],
  );
  const completedTasks = useMemo(
    () =>
      completedTasksAll
        .filter(t =>
          completedDateFilter
            ? t.completedAt?.slice(0, 10) === completedDateFilter
            : true,
        )
        .filter(t => inDateRange(t.completedAt, taskFrom, taskTo))
        .filter(t => matchesCompletedTask(t, completedSearch, completedStaff)),
    [completedTasksAll, completedDateFilter, taskFrom, taskTo, completedSearch, completedStaff],
  );
  const expiringTasks = useMemo(
    () =>
      tasks
        .filter(t => isExpiringSoon(t) || isExpired(t))
        .filter(t => inDateRange(t.createdDate, taskFrom, taskTo)),
    [tasks, taskFrom, taskTo],
  );

  function handleSave(task: Task) {
    const isNew = !editTask;
    const args = {
      title: task.title,
      assignedTo: task.assignedTo,
      createdDate: task.createdDate,
      dueDate: task.dueDate || undefined,
      expirationDate: task.expirationDate || undefined,
      priority: task.priority,
      status: task.status,
      notes: task.notes,
      completedAt: task.completedAt,
      updatedAt: task.updatedAt,
    };
    const promise = isNew
      ? addTaskMut(args)
      : updateTaskMut({ _id: task.id as Id<"tasks">, ...args });

    promise
      .then(() => {
        toast.success(isNew ? "Task added" : "Task updated");
        setModalOpen(false);
        setEditTask(null);
      })
      .catch(() => toast.error("Failed to save task. Please try again."));
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteTaskMut({ _id: deleteTarget.id as Id<"tasks"> })
      .then(() => toast.success("Task deleted"))
      .catch(() => toast.error("Failed to delete task."))
      .finally(() => setDeleteTarget(null));
  }

  function openEdit(t: Task) {
    setEditTask(t);
    setModalOpen(true);
  }

  const showTaskToolbar = TASK_TABS.includes(activeTab);

  return (
    <div className="min-h-screen bg-muted">
      {/* Navigation lives in the left sidebar now — this page just renders
          whichever section the URL (?tab=..&sub=..) points to. */}
      {showTaskToolbar && (
        <div className="sticky top-0 z-20 bg-card border-b border-border px-4 sm:px-6 py-3">
          <div className="max-w-7xl flex flex-wrap justify-end items-center gap-3">
            {activeTab === "completed" && (
              <div role="search" aria-label="Completed filters" className="flex flex-wrap items-center gap-2 w-full">
                <div className="relative flex-1 min-w-48">
                  <span aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    🔍
                  </span>
                  <input
                    type="search"
                    aria-label="Search completed patients, notes, or tasks"
                    placeholder="Search patients, notes..."
                    value={completedSearch}
                    onChange={e => setCompletedSearch(e.target.value)}
                    className="w-full bg-card border border-input/60 text-sm text-foreground rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50 hover:border-border transition-colors placeholder:text-muted-foreground"
                  />
                </div>
                <select
                  aria-label="Completed case type"
                  value={completedCaseType}
                  onChange={e => setCompletedCaseType(e.target.value as CaseType | "all")}
                  className="max-w-full bg-card border border-input/60 text-sm text-foreground rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50 hover:border-border transition-colors"
                >
                  {CASE_TYPE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <select
                  aria-label="Completed assigned staff"
                  value={completedStaff}
                  onChange={e => setCompletedStaff(e.target.value)}
                  className="max-w-full bg-card border border-input/60 text-sm text-foreground rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50 hover:border-border transition-colors"
                >
                  <option value="all">All Staff</option>
                  {completedStaffOptions.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <select
                  aria-label="Completed priority"
                  value={completedPriority}
                  onChange={e => setCompletedPriority(e.target.value as Priority | "all")}
                  className="max-w-full bg-card border border-input/60 text-sm text-foreground rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50 hover:border-border transition-colors"
                >
                  <option value="all">All Priorities</option>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="standard">Standard</option>
                </select>
                <div className="flex gap-1">
                  <select
                    aria-label="Completed sort field"
                    value={completedSortField}
                    onChange={e => setCompletedSortField(e.target.value as SortField)}
                    className="max-w-full bg-card border border-input/60 text-sm text-foreground rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50 hover:border-border transition-colors"
                  >
                    <option value="createdAt">Sort: Date Created</option>
                    <option value="dos">Sort: DOS</option>
                    <option value="caseType">Sort: Case Type</option>
                    <option value="status">Sort: Status</option>
                    <option value="priority">Sort: Priority</option>
                    <option value="assignedTo">Sort: Assigned To</option>
                  </select>
                  <button
                    type="button"
                    aria-label={`Sort ${completedSortDirection === "asc" ? "Descending" : "Ascending"}`}
                    title={`Sort ${completedSortDirection === "asc" ? "Descending" : "Ascending"}`}
                    onClick={() =>
                      setCompletedSortDirection(d => (d === "asc" ? "desc" : "asc"))
                    }
                    className="bg-card border border-input/60 text-sm text-foreground rounded-lg px-3 py-2 select-none font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50 hover:border-border transition-colors"
                  >
                    {completedSortDirection === "asc" ? "↑" : "↓"}
                  </button>
                </div>
              </div>
            )}
            {/* Calendar selection for Completed tab (Wence, 2026-07-28):
                narrow both the Task table and Matching Cases down to a
                specific completed date. */}
            {activeTab === "completed" && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  aria-label="Completed date"
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
            {/* Documentation Audit filter (Wence, 2026-09-11) — Completed
                tab's Matching Cases list only: All Records / Audited /
                Not Audited. */}
            {activeTab === "completed" && (
              <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                {(
                  [
                    { key: "all", label: "All Records" },
                    { key: "audited", label: "Audited" },
                    { key: "not_audited", label: "Not Audited" },
                  ] as const
                ).map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setDocAuditFilter(opt.key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      docAuditFilter === opt.key
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            <DateRangeFilter
              label={dateField === "completed" ? "Completed" : "Created"}
              idPrefix={`tasks-${activeTab}`}
              from={taskFrom}
              to={taskTo}
              onChange={({ from, to }) => {
                setTaskFrom(from);
                setTaskTo(to);
              }}
            />
          </div>
        </div>
      )}

      {activeTab === "cases" && (
        <BariTrackerPage
          subTab={casesSubTab}
          onSubTabChange={setCasesSubTab}
          openCaseId={openCaseId}
          onOpenCaseHandled={() => setOpenCaseId(null)}
        />
      )}

      {activeTab !== "cases" && (
        <div className="max-w-7xl px-4 sm:px-6 py-6 space-y-6">
          {activeTab === "priority" && (
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl shadow-sm px-5 py-3">
                <TaskTable
                  tasks={priorityTasks}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                  emptyLabel="No High/Urgent priority tasks open right now."
                />
              </div>
              <MiniCasesList
                cases={casesPriorityOpen}
                onViewInCases={() => setActiveTab("cases")}
                onEditCase={openCaseForEdit}
                emptyLabel="No High/Urgent priority Cases open right now."
              />
            </div>
          )}

          {activeTab === "urgent" && (
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl shadow-sm px-5 py-3">
                <TaskTable
                  tasks={urgentTasks}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                  emptyLabel="No urgent tasks open right now."
                />
              </div>
              <MiniCasesList
                cases={casesUrgentOpen}
                onViewInCases={() => setActiveTab("cases")}
                onEditCase={openCaseForEdit}
                emptyLabel="No urgent-priority Cases open right now."
              />
            </div>
          )}

          {activeTab === "completed" && (
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl shadow-sm px-5 py-3">
                <TaskTable
                  tasks={completedTasks}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                  emptyLabel="No completed tasks match the selected filters."
                  bookmarkable
                  onToggleBookmark={handleToggleAuditBookmark}
                />
              </div>
              <MiniCasesList
                cases={casesCompleted}
                onViewInCases={() => setActiveTab("cases")}
                emptyLabel="No completed cases match the selected filters."
                boldPatientId
                onBookmarkClick={handleCaseBookmarkClick}
                otherCasesFirst
                docAuditEnabled
                onDocAuditClick={setDocAuditTarget}
              />
            </div>
          )}

          {activeTab === "expiring" && (
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl shadow-sm px-5 py-3">
                <TaskTable
                  tasks={expiringTasks}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                  emptyLabel="Nothing expiring soon."
                />
              </div>
              <MiniCasesList
                cases={casesExpiringSoon}
                onViewInCases={() => setActiveTab("cases")}
                onEditCase={openCaseForEdit}
                emptyLabel="No Cases with a DOS expiring within a week."
              />
            </div>
          )}

          {activeTab === "staff-productivity" && <StaffProductivityTab />}
          {/* 2026-08-04 per Wence: final structure — main "Intake" click
              shows the Reports dashboards (view="reports"), and the
              "Activity Log" sub-tab (route intake-reports, label only)
              shows the log-entry form/table (view="log"). */}
          {activeTab === "intake" && <IntakeTeamTab view="reports" />}
          {activeTab === "intake-reports" && <IntakeTeamTab view="log" />}
          {activeTab === "intake-booked" && <IntakeTeamTab view="booked" />}
          {activeTab === "billing" && <BillingTab view="overview" />}
          {activeTab === "billing-activity" && <BillingTab view="log" />}
          {activeTab === "reports" && <ReportsTab />}
          {activeTab === "historical" && <HistoricalActivityTab />}
          {activeTab === "verification-process" && <BariVerificationProcessTab />}
          {activeTab === "verification-guidelines" && <BariVerificationGuidelinesTab />}
          {activeTab === "directory" && <DirectoryPage />}
          {activeTab === "call-audits" && <CallAuditsPage />}
        </div>
      )}

      <TaskModal
        open={modalOpen}
        editTask={editTask}
        staffOptions={staffNames}
        onSave={handleSave}
        onClose={() => {
          setModalOpen(false);
          setEditTask(null);
        }}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete task?"
        message={`Are you sure you want to delete "${deleteTarget?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <DocAuditModal
        open={!!docAuditTarget}
        targetCase={docAuditTarget}
        staffNames={staffNames}
        onSave={handleDocAuditSave}
        onCancel={() => setDocAuditTarget(null)}
      />
    </div>
  );
}
