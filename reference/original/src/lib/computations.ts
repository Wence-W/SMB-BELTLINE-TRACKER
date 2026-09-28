// ============================================================
// Bariatric Operations Tracker — Computed Data Helpers
// ============================================================

import { isToday } from "./store";
import type {
  BariCase,
  ConsultSummary,
  DashboardSummary,
  PreCertCategory,
  StaffWorkloadEntry,
  UrgentBariSummary,
} from "./types";

/** Statuses that count as "done" (work finished successfully) */
const DONE_STATUSES = new Set<BariCase["status"]>(["completed"]);

/** Statuses excluded from the "DOS expiring soon" check (already closed out). */
const CLOSED_STATUSES = new Set<BariCase["status"]>([
  "completed",
  "cancelled",
]);

/** Days-until-DOS threshold that flags a case as expiring soon. */
export const DOS_EXPIRING_SOON_DAYS = 7;

/**
 * True when a case's Date of Service is today or within the next
 * DOS_EXPIRING_SOON_DAYS days, and the case isn't already closed out.
 * Used to auto-surface cases that need attention before their DOS passes.
 */
export function isDosExpiringSoon(c: BariCase): boolean {
  if (!c.dos || CLOSED_STATUSES.has(c.status)) return false;
  const target = new Date(c.dos + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return days >= 0 && days <= DOS_EXPIRING_SOON_DAYS;
}

/** Statuses that count as "still needing work" */
const OPEN_STATUSES = new Set<BariCase["status"]>([
  "new",
  "in_progress",
  "on_hold",
  "reassigned",
]);

// (cancelled is neither done nor remaining — it's closed out)

/**
 * True when a case's Date of Service has already passed (not just
 * "expiring soon") and the case isn't already closed out. Used for the
 * Ins Verifiers > Expiring past-due badge (Wence, 2026-08-04).
 */
export function isDosPastDue(c: BariCase): boolean {
  if (!c.dos || CLOSED_STATUSES.has(c.status)) return false;
  const target = new Date(c.dos + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return target.getTime() < today.getTime();
}

/**
 * True when a case's insurance Auth Status is still blank or sitting in a
 * "pending" state (pending_pre_auth / pending_pred) — i.e. nobody has
 * recorded an outcome yet. Used for the Ins Verifiers > Urgent/Expiring
 * past-due badges (Wence, 2026-08-04): a case counts as "needs a status
 * update" when this is true.
 */
export function needsAuthStatusUpdate(c: BariCase): boolean {
  return !c.authStatus || c.authStatus === "pending_pre_auth" || c.authStatus === "pending_pred";
}

export function getUrgentBariSummary(cases: BariCase[]): UrgentBariSummary {
  const urgent = cases.filter(c => c.caseType === "urgent");
  return {
    createdToday: urgent.filter(c => isToday(c.createdAt)).length,
    completed: urgent.filter(c => DONE_STATUSES.has(c.status)).length,
    remaining: urgent.filter(c => OPEN_STATUSES.has(c.status)).length,
  };
}

export function getConsultSummary(
  cases: BariCase[],
  caseType: BariCase["caseType"],
): ConsultSummary {
  const filtered = cases.filter(c => c.caseType === caseType);
  const completed = filtered.filter(c => DONE_STATUSES.has(c.status)).length;
  const remaining = filtered.filter(c => OPEN_STATUSES.has(c.status)).length;
  const total = filtered.length;
  return {
    total,
    completed,
    remaining,
    completionPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

export function getPreCertCategories(cases: BariCase[]): PreCertCategory[] {
  const makeCategory = (
    label: string,
    key: PreCertCategory["key"],
    caseType: BariCase["caseType"],
  ): PreCertCategory => {
    const filtered = cases.filter(c => c.caseType === caseType);
    const approved = filtered.filter(c => c.authStatus === "approved").length;
    const completed = filtered.filter(c => c.status === "completed").length;
    const inProgress = filtered.filter(c => c.status === "in_progress").length;
    const newCount = filtered.filter(c => c.status === "new").length;
    return {
      label,
      key,
      new: newCount,
      updated: inProgress + completed,
      approved,
      remaining: newCount + inProgress,
    };
  };

  return [
    makeCategory("Pre-Cert Bari", "bari", "precert_bari"),
    makeCategory("Pre-Cert Veins", "veins", "precert_veins"),
    makeCategory("Pre-Cert General", "general", "precert_general"),
    makeCategory(
      "Modified / Urgent",
      "modified_urgent",
      "precert_modified_urgent",
    ),
    makeCategory("Pre-Cert EGD", "egd", "precert_egd"),
  ];
}

/** Pre-Cert case types — kept separate from Verification workload counts. */
const PRECERT_CASE_TYPES = new Set<BariCase["caseType"]>([
  "precert_bari",
  "precert_veins",
  "precert_general",
  "precert_modified_urgent",
  "precert_egd",
]);

export function getStaffWorkload(
  cases: BariCase[],
  staffNames: string[],
): StaffWorkloadEntry[] {
  return staffNames.map(name => {
    // Only count cases still needing work — completed/cancelled cases are
    // done and shouldn't inflate the staff workload cards (Wence 2026-07-22).
    const assigned = cases.filter(
      c => c.assignedTo === name && OPEN_STATUSES.has(c.status),
    );
    const verification = assigned.filter(c => !PRECERT_CASE_TYPES.has(c.caseType));
    const precert = assigned.filter(c => PRECERT_CASE_TYPES.has(c.caseType));
    return {
      name,
      urgent: verification.filter(c => c.priority === "urgent").length,
      high: verification.filter(c => c.priority === "high").length,
      standard: verification.filter(c => c.priority === "standard").length,
      total: verification.length,
      precertUrgent: precert.filter(c => c.priority === "urgent").length,
      precertHigh: precert.filter(c => c.priority === "high").length,
      precertStandard: precert.filter(c => c.priority === "standard").length,
      precertTotal: precert.length,
    };
  });
}

export function getDashboardSummary(cases: BariCase[]): DashboardSummary {
  const completed = cases.filter(c => DONE_STATUSES.has(c.status)).length;
  const remaining = cases.filter(c => OPEN_STATUSES.has(c.status)).length;
  const approved = cases.filter(
    c => c.authStatus === "approved" || c.authStatus === "partial_approval",
  ).length;
  return {
    totalCases: cases.length,
    totalCompleted: completed,
    totalRemaining: remaining,
    totalApproved: approved,
    productivityPercent:
      cases.length > 0 ? Math.round((completed / cases.length) * 100) : 0,
  };
}
