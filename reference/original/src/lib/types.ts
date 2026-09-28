// ============================================================
// Bariatric Operations Tracker — Core Types
// ============================================================

export type CaseType =
  | "urgent"
  | "initial_consult"
  | "followup_consult"
  | "no_appointment"
  | "reverification"
  | "predetermination"
  | "precert_bari"
  | "precert_veins"
  | "precert_general"
  | "precert_modified_urgent"
  | "precert_egd";

export type CaseStatus =
  | "new"
  | "in_progress"
  | "completed"
  | "on_hold"
  | "reassigned"
  | "cancelled";

// Staff members are now dynamic (managed in the app), so this is just a string.
export type StaffMember = string;

export interface StaffRecord {
  _id: string;
  name: string;
  color: string;
  email?: string;
}

export type Priority = "urgent" | "high" | "standard";

// Insurance authorization outcome — separate from workflow Status, tracked
// only on Pre-Cert cases (precert_bari/veins/general/modified_urgent).
export type AuthStatus =
  | "pending_pre_auth"
  | "approved"
  | "partial_approval"
  | "denied"
  | "peer_to_peer"
  | "appeal"
  | "pending_pred"
  // Auth was cancelled after the fact (e.g. insurance pulled a prior auth).
  // Follow-up notes on the case count as Pre-Cert On-going again even if the
  // case's workflow Status is Completed (Wence, 2026-09-02).
  | "cancelled";

export interface CaseNote {
  id: string;
  text: string;
  addedAt: string; // ISO date string
  addedBy?: string; // optional staff member name
}

export interface BariCase {
  id: string; // app-level id (used for local fallback)
  _id?: string; // Convex document ID (present when loaded from DB)
  patientId: string;
  dos?: string; // Date of Service (YYYY-MM-DD)
  expirationDate?: string; // Case/authorization expiration date (YYYY-MM-DD)
  caseType: CaseType;
  status: CaseStatus;
  priority: Priority;
  assignedTo: StaffMember;
  notes: string;
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
  completedAt?: string;
  approvedAt?: string;
  authCancelledAt?: string; // stamped server-side when Auth Status flips to "cancelled"
  insuranceProvider?: string;
  authorizationNumber?: string;
  provider?: string; // Ordering/referring physician — Pre-Cert cases only
  requestBy?: string; // Reverification cases only — who requested the reverification
  noteLog?: CaseNote[]; // multiple timestamped notes
  authStatus?: AuthStatus; // Pre-Cert only — insurance authorization outcome
  createdBy?: StaffMember; // staff who actually created the case — auto-detected from the logged-in account at creation time, frozen, never changes on reassignment
  auditBookmarked?: boolean; // Completed tab "last clicked" audit marker (single moving highlight)
  // Documentation Audit / QA review (Wence, 2026-09-11) — separate from
  // auditBookmarked and from the case's workflow status. Undefined = Not Audited.
  docAuditStatus?: "reviewed" | "audited";
  docAuditedBy?: string;
  docAuditedAt?: string;
  docAuditNotes?: string;
}

export interface UrgentBariSummary {
  createdToday: number;
  completed: number;
  remaining: number;
}

export interface ConsultSummary {
  total: number;
  completed: number;
  remaining: number;
  completionPercent: number;
}

export interface PreCertCategory {
  label: string;
  key: "bari" | "veins" | "general" | "modified_urgent" | "egd";
  new: number;
  updated: number;
  approved: number;
  remaining: number;
}

export interface StaffWorkloadEntry {
  name: StaffMember;
  urgent: number;
  high: number;
  standard: number;
  total: number;
  precertUrgent: number;
  precertHigh: number;
  precertStandard: number;
  precertTotal: number;
}

export interface DashboardSummary {
  totalCases: number;
  totalCompleted: number;
  totalRemaining: number;
  totalApproved: number;
  productivityPercent: number;
}

export type SortField =
  | "caseType"
  | "status"
  | "priority"
  | "assignedTo"
  | "createdAt"
  | "dos";
export type SortDirection = "asc" | "desc";

export interface FilterState {
  search: string;
  /** Created-date range filter (YYYY-MM-DD, blank = open ended).
   *  Gretchen, 2026-08-13: Date From / Date To on every tab. */
  dateFrom: string;
  dateTo: string;
  caseType: CaseType | "all";
  status: CaseStatus | "all";
  authStatus: AuthStatus | "all";
  assignedTo: StaffMember | "all";
  priority: Priority | "all";
  sortField: SortField;
  sortDirection: SortDirection;
}
