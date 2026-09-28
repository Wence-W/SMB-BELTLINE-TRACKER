// Server-side enum validators. The original backend stored every one of
// these as an unvalidated v.string() (Inventory section 7). New writes must
// use a current value; `*ReadValidator`s additionally accept the legacy values
// still present in migrated rows, so historic data keeps loading.
import { type VLiteral, type VUnion, v } from "convex/values";

function literals<const T extends readonly [string, string, ...string[]]>(
  values: T,
): VUnion<T[number], VLiteral<T[number], "required">[], "required", never> {
  return v.union(...values.map(value => v.literal(value))) as VUnion<
    T[number],
    VLiteral<T[number], "required">[],
    "required",
    never
  >;
}

// ─── Access ──────────────────────────────────────────────────────────────────

// `owner` exists so that only the owner can grant `patient_id_override`
// (plan section 4); it replaces the single hard-coded exempt email.
export const CAPABILITIES = ["owner", "admin", "patient_id_override", "call_audit_access"] as const;
export type Capability = (typeof CAPABILITIES)[number];
export const capabilityValidator = literals(CAPABILITIES);

export const TEAMS = ["verification", "intake", "billing"] as const;
export type Team = (typeof TEAMS)[number];
export const teamValidator = literals(TEAMS);

// ─── Cases (reference/original/src/lib/types.ts:5-51) ───────────────────────

export const CASE_TYPES = [
  "urgent",
  "initial_consult",
  "followup_consult",
  "no_appointment",
  "reverification",
  "predetermination",
  "precert_bari",
  "precert_veins",
  "precert_general",
  "precert_modified_urgent",
  "precert_egd",
] as const;
export const caseTypeValidator = literals(CASE_TYPES);

export const CASE_STATUSES = ["new", "in_progress", "completed", "on_hold", "reassigned", "cancelled"] as const;
export const caseStatusValidator = literals(CASE_STATUSES);
// Migrated away on 2026-07-22 (convex/cases.ts:300-329 in the original) but
// may survive in old rows.
export const LEGACY_CASE_STATUSES = ["pending", "approved", "partial_approval", "denied"] as const;
export const caseStatusReadValidator = literals([...CASE_STATUSES, ...LEGACY_CASE_STATUSES]);

export const PRIORITIES = ["urgent", "high", "standard"] as const;
export const priorityValidator = literals(PRIORITIES);

export const AUTH_STATUSES = [
  "pending_pre_auth",
  "approved",
  "partial_approval",
  "denied",
  "peer_to_peer",
  "appeal",
  "pending_pred",
  "cancelled",
] as const;
export const authStatusValidator = literals(AUTH_STATUSES);

export const DOC_AUDIT_STATUSES = ["reviewed", "audited"] as const;
export const docAuditStatusValidator = literals(DOC_AUDIT_STATUSES);

// ─── Tasks (legacy, read-only in the rebuild) ────────────────────────────────

export const TASK_STATUSES = ["pending", "in_progress", "completed", "cancelled"] as const;
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

// ─── Intake (reference/original/src/lib/intakeTypes.ts:14-80) ───────────────

export const INTAKE_DIRECTIONS = ["inbound", "outbound"] as const;
export const intakeDirectionValidator = literals(INTAKE_DIRECTIONS);

export const INTAKE_CATEGORIES = [
  "appointment_concern",
  "billing_concern",
  "ma_concern",
  "inquiries",
  "other_concerns",
  "missing_info",
  "confirm_appointment",
  "prioritylist",
  "referral",
  "callback",
  "missed_appt",
  "scheduling",
  "boost_booked",
  "boost_no_show",
  "boost_cancelled",
] as const;
export const intakeCategoryValidator = literals(INTAKE_CATEGORIES);
// Deprecated 2026-07-17; hidden from the form but still mapped into report
// buckets, so they must stay readable.
export const LEGACY_INTAKE_CATEGORIES = [
  "booked_followup",
  "booked_followup_outbound",
  "booked_new",
  "booked_new_outbound",
  "booked_veins",
  "booked_veins_outbound",
  "callback_inbound",
  "did_not_book_callback",
  "failed_call",
  "missing_information",
  "other_concerns_outbound",
  "voicemail_no_answer",
] as const;
export const intakeCategoryReadValidator = literals([...INTAKE_CATEGORIES, ...LEGACY_INTAKE_CATEGORIES]);

export const INTAKE_RESULTS = [
  "provided_info",
  "processed_request",
  "booked_consult_appt",
  "booked_fu_appt",
  "transferred_call",
  "authorized",
  "failed_call_result",
  "no_ans_lvm",
  "informed_pt",
  "confirmed_appt",
  "invalid_number",
  "not_interested_wcb",
] as const;
export const intakeResultValidator = literals(INTAKE_RESULTS);

// ─── Billing (reference/original/src/components/productivity/BillingTab.tsx:19-24)

export const BILLING_CATEGORIES = ["new_claims", "ar_aging", "emails", "boost_billing"] as const;
export type BillingCategory = (typeof BILLING_CATEGORIES)[number];
export const billingCategoryValidator = literals(BILLING_CATEGORIES);

// ─── Booked Tracker (reference/original/convex/appointmentOptions.ts) ────────

export const APPOINTMENT_SOURCES = ["SMB-PLD", "SMB INB-NEW", "SMB INB-OLD", "SMB TASK", "Boost"] as const;
export const APPOINTMENT_TYPES = ["Consult", "Follow Up"] as const;
export const APPOINTMENT_STATUSES = ["Pending", "Showed", "No-Show", "Cancelled"] as const;
export const CLINIC_LOCATIONS = ["Atlanta", "Stockbridge", "Newnan"] as const;
export const appointmentStatusValidator = literals(APPOINTMENT_STATUSES);
export const clinicLocationValidator = literals(CLINIC_LOCATIONS);
// Imports historically accepted unknown source strings (counted as SMB), so
// sources stay free text on read; see plan D-flags before tightening.
