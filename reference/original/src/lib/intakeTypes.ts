export type IntakeDirection = "inbound" | "outbound";

export interface IntakeCategoryOption {
  value: string;
  label: string;
  direction: IntakeDirection;
  // Deprecated categories stay here so old logged entries still resolve a
  // label/direction, but are hidden from the "Log Intake Activity" dropdown.
  // Superseded 2026-07-17 by the simplified Category + Result model below
  // (Wence's "Activity Reports" mockup).
  deprecated?: boolean;
}

export const INTAKE_CATEGORIES: IntakeCategoryOption[] = [
  // ── Inbound categories (current, per Activity Reports mockup) ──
  { value: "appointment_concern", label: "Appointment Concern", direction: "inbound" },
  { value: "billing_concern", label: "Billing Concern", direction: "inbound" },
  { value: "ma_concern", label: "MA Concern", direction: "inbound" },
  { value: "inquiries", label: "Inquiries", direction: "inbound" },
  { value: "other_concerns", label: "Other Inbound", direction: "inbound" },
  // ── Outbound categories (current, per Activity Reports mockup) ──
  { value: "missing_info", label: "Missing Info", direction: "outbound" },
  { value: "confirm_appointment", label: "Confirm Appointment", direction: "outbound" },
  { value: "prioritylist", label: "Prioritylist", direction: "outbound" },
  { value: "referral", label: "Referral", direction: "outbound" },
  { value: "callback", label: "Callback", direction: "outbound" },
  { value: "missed_appt", label: "Missed Appt", direction: "outbound" },
  // Data-entry only per Wence (2026-08-27): intentionally omitted from
  // reporting and qualified-activity buckets.
  { value: "scheduling", label: "Scheduling", direction: "outbound" },
  // ── Boost Appts — reminder/confirmation calls to boost show rate.
  // Data-entry only via this dropdown, tracked as its own "Boost" column
  // in productivity views; no Result field applies. ──
  { value: "boost_booked", label: "Boost Booked Appt", direction: "outbound" },
  { value: "boost_no_show", label: "Boost No Show Appt", direction: "outbound" },
  { value: "boost_cancelled", label: "Boost Cancelled Appt", direction: "outbound" },
  // ── Deprecated (kept for legacy entries only, hidden from dropdown) ──
  { value: "booked_followup", label: "Booked Appointment – Follow-Up", direction: "inbound", deprecated: true },
  { value: "booked_followup_outbound", label: "Booked Appointment – Follow-Up", direction: "outbound", deprecated: true },
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

export const ACTIVE_INTAKE_CATEGORIES = INTAKE_CATEGORIES.filter(c => !c.deprecated);

// ─── Result taxonomy (added 2026-07-17, per Wence's Activity Reports mockup) ───
// Captures the outcome of a logged call, alongside Category (the reason/type).

export interface IntakeResultOption {
  value: string;
  label: string;
}

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
    INBOUND_RESULTS.find(r => r.value === value)?.label ??
    OUTBOUND_RESULTS.find(r => r.value === value)?.label ??
    value
  );
}

// ─── Category buckets for the per-staff Activity Reports view ───
// Maps every category value (current + deprecated/legacy) into the 5
// buckets shown per direction in the mockup, so old entries still roll up
// sensibly even though they predate the Result field.

export const INBOUND_CATEGORY_BUCKETS: { label: string; values: string[] }[] = [
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

export const OUTBOUND_CATEGORY_BUCKETS: { label: string; values: string[] }[] = [
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

export const BOOST_CATEGORIES: readonly string[] = [
  "boost_booked",
  "boost_no_show",
  "boost_cancelled",
];

export function categoryLabel(value: string): string {
  return INTAKE_CATEGORIES.find(c => c.value === value)?.label ?? value;
}

export interface IntakeEntry {
  id: string;
  staff: string;
  date: string;
  direction: IntakeDirection;
  category: string;
  result?: string;
  count: number;
  notes?: string;
  createdAt: string;
  patientId?: string;
  otherInfo?: string;
}

export interface IntakeDailyMetric {
  id: string;
  staff: string;
  date: string;
  emailsSent: number;
  ghlChats: number;
  newPatientIntake: number;
  callAudits: number;
  faxDocs: number;
  updatedAt: string;
}

export interface BillingEntry {
  id: string;
  staff: string;
  date: string;
  tasksCompleted: number;
  notes?: string;
  createdAt: string;
}

export function isInCurrentWeek(dateISO: string): boolean {
  const d = new Date(dateISO + "T00:00:00");
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return d >= monday && d <= sunday;
}

export function isInCurrentMonth(dateISO: string): boolean {
  const d = new Date(dateISO + "T00:00:00");
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  );
}

export function isToday(dateISO: string): boolean {
  return dateISO === new Date().toISOString().slice(0, 10);
}

// ─── Period navigation (Today / Week / Month cards w/ prev-next arrows) ───
// Added 2026-07-17 per Wence's mockup: each productivity card can page
// backward/forward through past periods via an `offset` (0 = current).

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function fmtDate(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}, ${d.getFullYear()}`;
}

export interface PeriodRange {
  start: Date;
  end: Date;
  label: string;
  inRange: (dateISO: string) => boolean;
}

// All three take a `refDate` (any date within the desired period, e.g. from
// a calendar picker) instead of an offset, so cards can jump directly to a
// chosen date as well as page via prev/next arrows (2026-07-17).

export function getDayRange(refDate: Date): PeriodRange {
  const d = new Date(refDate);
  d.setHours(0, 0, 0, 0);
  const iso = d.toISOString().slice(0, 10);
  return { start: d, end: d, label: fmtDate(d), inRange: dateISO => dateISO === iso };
}

export function getWeekRange(refDate: Date): PeriodRange {
  const day = refDate.getDay();
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(refDate);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(refDate.getDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  const label = `${fmtDate(monday)} - ${fmtDate(sunday)}`;
  return {
    start: monday,
    end: sunday,
    label,
    inRange: dateISO => {
      const d = new Date(dateISO + "T00:00:00");
      return d >= monday && d <= sunday;
    },
  };
}

export function getMonthRange(refDate: Date): PeriodRange {
  const first = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  const last = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
  last.setHours(23, 59, 59, 999);
  const label = `${fmtDate(first)} - ${fmtDate(last)}`;
  return {
    start: first,
    end: last,
    label,
    inRange: dateISO => {
      const d = new Date(dateISO + "T00:00:00");
      return d >= first && d <= last;
    },
  };
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
export function addWeeks(d: Date, n: number): Date {
  return addDays(d, n * 7);
}
export function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}
export function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function fromDateInputValue(v: string): Date {
  return new Date(v + "T00:00:00");
}
