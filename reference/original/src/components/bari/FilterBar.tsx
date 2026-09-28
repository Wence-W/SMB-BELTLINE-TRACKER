import { DateRangeFilter } from "@/components/DateRangeFilter";
import type {
  BariCase,
  CaseType,
  FilterState,
  Priority,
  SortField,
  StaffMember,
} from "@/lib/types";

interface Props {
  filters: FilterState;
  staffOptions: string[];
  onChange: (f: FilterState) => void;
  /** Show the Auth Status filter — Pre-Cert view only. */
  showAuthStatus?: boolean;
}

export const CASE_TYPE_OPTIONS: { value: CaseType | "all"; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "urgent", label: "Urgent" },
  { value: "initial_consult", label: "Initial Consult" },
  { value: "followup_consult", label: "Follow-Up Consult" },
  { value: "no_appointment", label: "No Appointment" },
  { value: "reverification", label: "Reverification" },
  { value: "predetermination", label: "Predetermination" },
  { value: "precert_bari", label: "Pre-Cert Bari" },
  { value: "precert_veins", label: "Pre-Cert Veins" },
  { value: "precert_general", label: "Pre-Cert General" },
  { value: "precert_modified_urgent", label: "Precert – Modified/Urgent" },
  { value: "precert_egd", label: "Pre-Cert EGD" },
];

export const STATUS_OPTIONS: { value: BariCase["status"] | "all"; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "new", label: "New" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On Hold" },
  { value: "reassigned", label: "Reassigned" },
  { value: "cancelled", label: "Cancelled" },
];

export const AUTH_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All Auth Statuses" },
  { value: "pending_pre_auth", label: "Pending Pre-Auth" },
  { value: "approved", label: "Approved" },
  { value: "partial_approval", label: "Partial Approval" },
  { value: "denied", label: "Denied" },
  { value: "peer_to_peer", label: "Peer to Peer" },
  { value: "appeal", label: "Appeal" },
  { value: "pending_pred", label: "Pending Pred" },
  { value: "cancelled", label: "Cancelled" },
];

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "createdAt", label: "Date Created" },
  { value: "dos", label: "DOS" },
  { value: "caseType", label: "Case Type" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "assignedTo", label: "Assigned To" },
];

const selectClass =
  "bg-card border border-input/60 text-sm text-foreground rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50 hover:border-border transition-colors";

export function FilterBar({
  filters,
  staffOptions,
  onChange,
  showAuthStatus = false,
}: Props) {
  function set<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Search */}
      <div className="relative flex-1 min-w-48">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
          🔍
        </span>
        <input
          type="text"
          placeholder="Search patients, notes..."
          value={filters.search}
          onChange={e => set("search", e.target.value)}
          className="w-full bg-card border border-input/60 text-sm text-foreground rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50 hover:border-border transition-colors placeholder:text-muted-foreground"
        />
      </div>

      {/* Created Date From / To (Gretchen, 2026-08-13) */}
      <DateRangeFilter
        label="Created"
        idPrefix="cases-filter"
        from={filters.dateFrom}
        to={filters.dateTo}
        onChange={({ from, to }) =>
          onChange({ ...filters, dateFrom: from, dateTo: to })
        }
        className="px-1"
      />

      {/* Case Type */}
      <select
        value={filters.caseType}
        onChange={e => set("caseType", e.target.value as CaseType | "all")}
        className={selectClass}
      >
        {CASE_TYPE_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* Status */}
      <select
        value={filters.status}
        onChange={e =>
          set("status", e.target.value as BariCase["status"] | "all")
        }
        className={selectClass}
      >
        {STATUS_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* Auth Status — Pre-Cert only */}
      {showAuthStatus && (
        <select
          value={filters.authStatus}
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
      )}

      {/* Staff */}
      <select
        value={filters.assignedTo}
        onChange={e => set("assignedTo", e.target.value as StaffMember | "all")}
        className={selectClass}
      >
        <option value="all">All Staff</option>
        {staffOptions.map(s => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      {/* Priority */}
      <select
        value={filters.priority}
        onChange={e => set("priority", e.target.value as Priority | "all")}
        className={selectClass}
      >
        <option value="all">All Priorities</option>
        <option value="urgent">Urgent</option>
        <option value="high">High</option>
        <option value="standard">Standard</option>
      </select>

      {/* Sort */}
      <div className="flex gap-1">
        <select
          value={filters.sortField}
          onChange={e => set("sortField", e.target.value as SortField)}
          className={selectClass}
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>
              Sort: {o.label}
            </option>
          ))}
        </select>
        <button
          onClick={() =>
            set(
              "sortDirection",
              filters.sortDirection === "asc" ? "desc" : "asc",
            )
          }
          className={`${selectClass} px-3 select-none font-mono`}
          title={`Sort ${filters.sortDirection === "asc" ? "Descending" : "Ascending"}`}
        >
          {filters.sortDirection === "asc" ? "↑" : "↓"}
        </button>
      </div>
    </div>
  );
}
