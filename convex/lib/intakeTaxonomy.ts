// Intake categories, results and report buckets: the same data as the
// original src/lib/intakeTypes.ts (labels, directions, legacy entries, bucket
// membership, order). Shared by the server (direction, validation, export)
// and the screens. tests/parity/intake.test.ts proves it equals the original.
import { BOOST_CATEGORY_VALUES, type IntakeDirection } from "./enums";

export type { IntakeDirection };

export type IntakeCategoryOption = {
  value: string;
  label: string;
  direction: IntakeDirection;
  /** Legacy categories resolve labels/directions for old rows but are not offered. */
  deprecated?: boolean;
};

export const INTAKE_CATEGORY_OPTIONS: IntakeCategoryOption[] = [
  { value: "appointment_concern", label: "Appointment Concern", direction: "inbound" },
  { value: "billing_concern", label: "Billing Concern", direction: "inbound" },
  { value: "ma_concern", label: "MA Concern", direction: "inbound" },
  { value: "inquiries", label: "Inquiries", direction: "inbound" },
  { value: "other_concerns", label: "Other Inbound", direction: "inbound" },
  { value: "missing_info", label: "Missing Info", direction: "outbound" },
  { value: "confirm_appointment", label: "Confirm Appointment", direction: "outbound" },
  { value: "prioritylist", label: "Prioritylist", direction: "outbound" },
  { value: "referral", label: "Referral", direction: "outbound" },
  { value: "callback", label: "Callback", direction: "outbound" },
  { value: "missed_appt", label: "Missed Appt", direction: "outbound" },
  // Data entry only: left out of reporting buckets (as in the original).
  { value: "scheduling", label: "Scheduling", direction: "outbound" },
  { value: "boost_booked", label: "Boost Booked Appt", direction: "outbound" },
  { value: "boost_no_show", label: "Boost No Show Appt", direction: "outbound" },
  { value: "boost_cancelled", label: "Boost Cancelled Appt", direction: "outbound" },
  { value: "booked_followup", label: "Booked Appointment – Follow-Up", direction: "inbound", deprecated: true },
  {
    value: "booked_followup_outbound",
    label: "Booked Appointment – Follow-Up",
    direction: "outbound",
    deprecated: true,
  },
  { value: "booked_new", label: "Booked Appointment – New", direction: "inbound", deprecated: true },
  { value: "booked_new_outbound", label: "Booked Appointment – New", direction: "outbound", deprecated: true },
  { value: "booked_veins", label: "Booked Appointment – Veins", direction: "inbound", deprecated: true },
  { value: "booked_veins_outbound", label: "Booked Appointment – Veins", direction: "outbound", deprecated: true },
  { value: "callback_inbound", label: "Callback", direction: "inbound", deprecated: true },
  { value: "did_not_book_callback", label: "Did Not Book / Callback", direction: "outbound", deprecated: true },
  { value: "failed_call", label: "Failed Call", direction: "inbound", deprecated: true },
  { value: "missing_information", label: "Missing Information", direction: "inbound", deprecated: true },
  { value: "other_concerns_outbound", label: "Other Concerns", direction: "outbound", deprecated: true },
  { value: "voicemail_no_answer", label: "Voicemail / No Answer", direction: "outbound", deprecated: true },
];

export const ACTIVE_INTAKE_CATEGORY_OPTIONS = INTAKE_CATEGORY_OPTIONS.filter(c => !c.deprecated);

export type IntakeResultOption = { value: string; label: string };

export const INBOUND_RESULTS: IntakeResultOption[] = [
  { value: "provided_info", label: "Provided Info" },
  { value: "processed_request", label: "Processed Request" },
  { value: "booked_consult_appt", label: "Booked Consult Appt" },
  { value: "booked_fu_appt", label: "Booked FU Appt" },
  { value: "transferred_call", label: "Transferred Call" },
  { value: "authorized", label: "Authorized" },
  { value: "failed_call_result", label: "Failed Call" },
];

export const OUTBOUND_RESULTS: IntakeResultOption[] = [
  { value: "booked_consult_appt", label: "Booked Consult Appt" },
  { value: "booked_fu_appt", label: "Booked FU Appt" },
  { value: "no_ans_lvm", label: "No Ans/LVM" },
  { value: "informed_pt", label: "Informed PT" },
  { value: "confirmed_appt", label: "Confirmed Appt" },
  { value: "invalid_number", label: "Invalid Number" },
  { value: "not_interested_wcb", label: "Not Interested/WCB" },
];

export function resultOptionsForDirection(direction: IntakeDirection): IntakeResultOption[] {
  return direction === "inbound" ? INBOUND_RESULTS : OUTBOUND_RESULTS;
}

export function resultLabel(value?: string): string {
  if (!value) return "—";
  return (
    INBOUND_RESULTS.find(r => r.value === value)?.label ?? OUTBOUND_RESULTS.find(r => r.value === value)?.label ?? value
  );
}

export type CategoryBucket = { label: string; values: string[] };

export const INBOUND_CATEGORY_BUCKETS: CategoryBucket[] = [
  { label: "Appointment Concern", values: ["appointment_concern"] },
  { label: "Billing Concern", values: ["billing_concern"] },
  { label: "MA Concern", values: ["ma_concern"] },
  { label: "Inquiries", values: ["inquiries"] },
  {
    label: "Other Inbound",
    values: [
      "other_concerns",
      "booked_followup",
      "booked_new",
      "booked_veins",
      "callback_inbound",
      "failed_call",
      "missing_information",
    ],
  },
];

export const OUTBOUND_CATEGORY_BUCKETS: CategoryBucket[] = [
  { label: "Missing Info", values: ["missing_info"] },
  { label: "Confirm Appointment", values: ["confirm_appointment", "booked_new_outbound", "booked_veins_outbound"] },
  { label: "Prioritylist", values: ["prioritylist"] },
  { label: "Referral", values: ["referral"] },
  {
    label: "Callback",
    values: [
      "callback",
      "did_not_book_callback",
      "booked_followup_outbound",
      "other_concerns_outbound",
      "voicemail_no_answer",
    ],
  },
  { label: "Missed Appt", values: ["missed_appt"] },
];

export const BOOST_CATEGORIES: readonly string[] = BOOST_CATEGORY_VALUES;

export function isBoostCategory(category: string): boolean {
  return BOOST_CATEGORIES.includes(category);
}

export function categoryOption(value: string): IntakeCategoryOption | undefined {
  return INTAKE_CATEGORY_OPTIONS.find(c => c.value === value);
}

export function categoryLabel(value: string): string {
  return categoryOption(value)?.label ?? value;
}

/** A category's direction; unknown values count as inbound, as in the original. */
export function categoryDirection(value: string): IntakeDirection {
  return categoryOption(value)?.direction ?? "inbound";
}
