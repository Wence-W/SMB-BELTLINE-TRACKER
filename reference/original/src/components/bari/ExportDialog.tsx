// Export dialog (Wence, 2026-09-24 — "1 and 2"): opens pre-filled with the
// current on-screen filter bar (option 1: export follows the filters), and
// every filter is adjustable inside the dialog before exporting (option 2).
// Replaces the old header Created/Completed date boxes.
import { useEffect, useMemo, useState } from "react";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import {
  AUTH_STATUS_OPTIONS,
  CASE_TYPE_OPTIONS,
  STATUS_OPTIONS,
} from "@/components/bari/FilterBar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { applyFilters } from "@/lib/caseFilters";
import {
  type ExportDateRange,
  exportToPDF,
  exportToXLSX,
  filterCasesByDateRange,
  printReport,
} from "@/lib/exportUtils";
import type { BariCase, FilterState } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cases: BariCase[];
  /** Current on-screen filter bar state — used to pre-fill the dialog. */
  screenFilters: FilterState;
  /** Pre-fill Auth Status only when the user is on the Pre-Cert tab
   *  (that's the only tab where the filter bar shows it). */
  showAuthStatus: boolean;
  staffOptions: string[];
}

const PRIORITY_OPTIONS = [
  { value: "all", label: "All Priorities" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "standard", label: "Standard" },
];

const EMPTY_FILTERS: FilterState = {
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

const selectClass =
  "w-full bg-card border border-input/60 text-sm text-foreground rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50 hover:border-border transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";

function fromScreen(screen: FilterState, showAuthStatus: boolean): FilterState {
  return {
    ...screen,
    authStatus: showAuthStatus ? screen.authStatus : "all",
  };
}

function labelOf(
  options: { value: string; label: string }[],
  value: string,
): string {
  return options.find(o => o.value === value)?.label ?? value;
}

function buildFiltersLabel(f: FilterState): string {
  const parts: string[] = [];
  if (f.search.trim()) parts.push(`Search: "${f.search.trim()}"`);
  if (f.caseType !== "all")
    parts.push(`Type: ${labelOf(CASE_TYPE_OPTIONS, f.caseType)}`);
  if (f.status !== "all")
    parts.push(`Status: ${labelOf(STATUS_OPTIONS, f.status)}`);
  if (f.authStatus !== "all")
    parts.push(`Auth: ${labelOf(AUTH_STATUS_OPTIONS, f.authStatus)}`);
  if (f.assignedTo !== "all") parts.push(`Staff: ${f.assignedTo}`);
  if (f.priority !== "all")
    parts.push(`Priority: ${labelOf(PRIORITY_OPTIONS, f.priority)}`);
  return parts.join("   |   ");
}

export function ExportDialog({
  open,
  onOpenChange,
  cases,
  screenFilters,
  showAuthStatus,
  staffOptions,
}: Props) {
  const [f, setF] = useState<FilterState>(() =>
    fromScreen(screenFilters, showAuthStatus),
  );
  const [completedFrom, setCompletedFrom] = useState("");
  const [completedTo, setCompletedTo] = useState("");

  // Re-sync with the on-screen filters every time the dialog opens.
  useEffect(() => {
    if (open) {
      setF(fromScreen(screenFilters, showAuthStatus));
      setCompletedFrom("");
      setCompletedTo("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function set<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setF(prev => ({ ...prev, [key]: value }));
  }

  const range: ExportDateRange = useMemo(
    () => ({
      from: f.dateFrom || undefined,
      to: f.dateTo || undefined,
      completedFrom: completedFrom || undefined,
      completedTo: completedTo || undefined,
      filtersLabel: buildFiltersLabel(f) || undefined,
    }),
    [f, completedFrom, completedTo],
  );

  const selected = useMemo(
    () =>
      filterCasesByDateRange(applyFilters(cases, f), {
        completedFrom: completedFrom || undefined,
        completedTo: completedTo || undefined,
      }),
    [cases, f, completedFrom, completedTo],
  );

  const disabled = selected.length === 0;
  const btn =
    "px-3 py-2 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export Cases</DialogTitle>
          <DialogDescription>
            Pre-filled with your current on-screen filters. Adjust anything
            below, then choose Excel, PDF, or Print.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="export-search">
              Search
            </label>
            <input
              id="export-search"
              type="text"
              placeholder="Search patients, notes..."
              value={f.search}
              onChange={e => set("search", e.target.value)}
              className={`${selectClass} placeholder:text-muted-foreground`}
            />
          </div>

          <div className="grid gap-2">
            <DateRangeFilter
              label="Created"
              idPrefix="export-dlg-created"
              from={f.dateFrom}
              to={f.dateTo}
              onChange={({ from, to }) =>
                setF(prev => ({ ...prev, dateFrom: from, dateTo: to }))
              }
            />
            <DateRangeFilter
              label="Completed"
              idPrefix="export-dlg-completed"
              from={completedFrom}
              to={completedTo}
              onChange={({ from, to }) => {
                setCompletedFrom(from);
                setCompletedTo(to);
              }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className={labelClass}>Case Type</span>
              <select
                value={f.caseType}
                onChange={e =>
                  set("caseType", e.target.value as FilterState["caseType"])
                }
                className={selectClass}
              >
                {CASE_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <span className={labelClass}>Status</span>
              <select
                value={f.status}
                onChange={e =>
                  set("status", e.target.value as FilterState["status"])
                }
                className={selectClass}
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <span className={labelClass}>Auth Status</span>
              <select
                value={f.authStatus}
                onChange={e =>
                  set("authStatus", e.target.value as FilterState["authStatus"])
                }
                className={selectClass}
              >
                {AUTH_STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <span className={labelClass}>Staff</span>
              <select
                value={f.assignedTo}
                onChange={e =>
                  set("assignedTo", e.target.value as FilterState["assignedTo"])
                }
                className={selectClass}
              >
                <option value="all">All Staff</option>
                {staffOptions.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <span className={labelClass}>Priority</span>
              <select
                value={f.priority}
                onChange={e =>
                  set("priority", e.target.value as FilterState["priority"])
                }
                className={selectClass}
              >
                {PRIORITY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setF(fromScreen(screenFilters, showAuthStatus));
                  setCompletedFrom("");
                  setCompletedTo("");
                }}
                className="text-muted-foreground hover:text-foreground underline"
              >
                Use on-screen filters
              </button>
              <button
                type="button"
                onClick={() => {
                  setF({
                    ...EMPTY_FILTERS,
                    sortField: f.sortField,
                    sortDirection: f.sortDirection,
                  });
                  setCompletedFrom("");
                  setCompletedTo("");
                }}
                className="text-muted-foreground hover:text-foreground underline"
              >
                Clear all
              </button>
            </div>
            <span
              data-testid="export-count"
              className="font-medium text-foreground"
            >
              {selected.length} of {cases.length} cases selected
            </span>
          </div>

          <div className="flex justify-end gap-2 flex-wrap border-t border-border pt-4">
            <button
              disabled={disabled}
              onClick={() => exportToXLSX(selected)}
              className={`${btn} bg-emerald-700/40 hover:bg-emerald-700/70 text-emerald-700 border-emerald-600/40`}
            >
              Export Excel
            </button>
            <button
              disabled={disabled}
              onClick={() => exportToPDF(selected, range)}
              className={`${btn} bg-sky-700/40 hover:bg-sky-700/70 text-sky-700 border-sky-600/40`}
            >
              Export PDF
            </button>
            <button
              disabled={disabled}
              onClick={() => printReport(selected, range)}
              className={`${btn} bg-violet-700/40 hover:bg-violet-700/70 text-violet-700 border-violet-600/40`}
            >
              Print Report
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
