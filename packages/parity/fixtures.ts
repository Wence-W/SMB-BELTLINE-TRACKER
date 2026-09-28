// Synthetic fixture generator in the ORIGINAL schema's shape
// (reference/original/convex/schema.ts), for the oracle tests and for loading
// the reference instance (plan section 5.1). Everything here is fake:
// patient IDs are "SYN-######", phones are 555-01xx, emails use the reserved
// example.invalid domain, and staff are generic first names.
import { createRng, type Rng } from "./rng";

export const FIXTURE_STAFF = ["Alex", "Blair", "Casey", "Drew", "Emery", "Finley"] as const;
export const FIXTURE_INTAKE_STAFF = ["Gray", "Harper", "Indy", "Jules"] as const;
export const FIXTURE_BILLING_STAFF = ["Kai"] as const;

const VERIFICATION_TYPES = [
  "urgent",
  "initial_consult",
  "followup_consult",
  "no_appointment",
  "reverification",
  "predetermination",
] as const;
const PRECERT_TYPES = [
  "precert_bari",
  "precert_veins",
  "precert_general",
  "precert_modified_urgent",
  "precert_egd",
] as const;
const STATUSES = ["new", "in_progress", "completed", "on_hold", "reassigned", "cancelled"] as const;
const PRIORITIES = ["urgent", "high", "standard"] as const;
const AUTH_STATUSES = [
  "pending_pre_auth",
  "approved",
  "partial_approval",
  "denied",
  "peer_to_peer",
  "appeal",
  "pending_pred",
  "cancelled",
] as const;

const INBOUND = ["appointment_concern", "billing_concern", "ma_concern", "inquiries", "other_concerns"] as const;
const OUTBOUND = [
  "missing_info",
  "confirm_appointment",
  "prioritylist",
  "referral",
  "callback",
  "missed_appt",
  "scheduling",
] as const;
const BOOST = ["boost_booked", "boost_no_show", "boost_cancelled"] as const;
const LEGACY_INBOUND = [
  "booked_new",
  "booked_veins",
  "booked_followup",
  "callback_inbound",
  "failed_call",
  "missing_information",
] as const;
const LEGACY_OUTBOUND = [
  "booked_new_outbound",
  "booked_veins_outbound",
  "booked_followup_outbound",
  "did_not_book_callback",
  "other_concerns_outbound",
  "voicemail_no_answer",
] as const;
const INBOUND_RESULTS = [
  "provided_info",
  "processed_request",
  "booked_consult_appt",
  "booked_fu_appt",
  "transferred_call",
  "authorized",
  "failed_call_result",
] as const;
const OUTBOUND_RESULTS = [
  "booked_consult_appt",
  "booked_fu_appt",
  "no_ans_lvm",
  "informed_pt",
  "confirmed_appt",
  "invalid_number",
  "not_interested_wcb",
] as const;
const BILLING_CATEGORIES = ["new_claims", "ar_aging", "emails", "boost_billing"] as const;

export type NoteLogEntry = { id: string; text: string; addedAt: string; addedBy?: string };
export type FixtureCase = {
  patientId: string;
  dos?: string;
  expirationDate?: string;
  caseType: string;
  status: string;
  priority: string;
  assignedTo: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  approvedAt?: string;
  authCancelledAt?: string;
  insuranceProvider?: string;
  authorizationNumber?: string;
  authStatus?: string;
  createdBy?: string;
  noteLog?: NoteLogEntry[];
  notesUpdatedAt?: string;
  notesUpdatedBy?: string;
};
export type FixtureIntakeEntry = {
  staff: string;
  date: string;
  direction: string;
  category: string;
  result?: string;
  count: number;
  notes?: string;
  createdAt: string;
  patientId?: string;
};
export type FixtureDailyMetric = {
  staff: string;
  date: string;
  emailsSent: number;
  ghlChats: number;
  newPatientIntake: number;
  callAudits: number;
  faxDocs: number;
  updatedAt: string;
};
export type FixtureBillingEntry = {
  staff: string;
  date: string;
  category?: string;
  tasksCompleted: number;
  createdAt: string;
};
export type FixtureSet = {
  seed: number;
  staff: { name: string; color: string }[];
  intakeStaff: { name: string; email: string }[];
  billingStaff: { name: string; email: string }[];
  cases: FixtureCase[];
  intakeEntries: FixtureIntakeEntry[];
  intakeDailyMetrics: FixtureDailyMetric[];
  billingEntries: FixtureBillingEntry[];
};

export type FixtureOptions = {
  startDate?: string; // YYYY-MM-DD, inclusive
  days?: number;
  cases?: number;
  intakeEntries?: number;
  billingEntries?: number;
};

const DAY_MS = 86_400_000;

function isoDay(startMs: number, offset: number): string {
  return new Date(startMs + offset * DAY_MS).toISOString().slice(0, 10);
}

/** A timestamp on a given UTC day, biased toward the UTC-midnight edges the plan tests (PC-11). */
function timestampOn(rng: Rng, day: string): string {
  const base = Date.parse(`${day}T00:00:00.000Z`);
  const edge = rng.chance(0.2);
  const minutes = edge ? rng.pick([1, 15, 30, 23 * 60 + 30, 23 * 60 + 59]) : rng.int(0, 24 * 60 - 1);
  return new Date(base + minutes * 60_000 + rng.int(0, 59_999)).toISOString();
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

export function syntheticPatientId(n: number): string {
  return `SYN-${String(n).padStart(6, "0")}`;
}

function randomCase(rng: Rng, n: number, startMs: number, days: number): FixtureCase {
  const precert = rng.chance(0.45);
  const caseType = precert ? rng.pick(PRECERT_TYPES) : rng.pick(VERIFICATION_TYPES);
  const createdDay = isoDay(startMs, rng.int(0, days - 1));
  const createdAt = timestampOn(rng, createdDay);
  const assignedTo = rng.pick(FIXTURE_STAFF);
  const createdBy = rng.chance(0.15) ? undefined : rng.chance(0.6) ? assignedTo : rng.pick(FIXTURE_STAFF);
  const status = rng.pick(STATUSES);
  const authStatus = precert && rng.chance(0.85) ? rng.pick(AUTH_STATUSES) : undefined;

  const noteLog: NoteLogEntry[] = [];
  const noteCount = rng.int(0, 4);
  let cursor = createdAt;
  for (let i = 0; i < noteCount; i++) {
    // Several notes can land on the same day (per-note credit, PC-02).
    cursor = addMinutes(cursor, rng.chance(0.4) ? rng.int(5, 90) : rng.int(600, 4 * 24 * 60));
    noteLog.push({
      id: `note-${n}-${i}`,
      text: `Synthetic note ${i + 1}`,
      addedAt: cursor,
      addedBy: rng.chance(0.95) ? rng.pick(FIXTURE_STAFF) : undefined,
    });
  }
  noteLog.reverse(); // the original prepends new notes

  const approved = authStatus === "approved" || authStatus === "partial_approval";
  const cancelled = authStatus === "cancelled";
  const wasApprovedBeforeCancel = cancelled && rng.chance(0.5);
  const updatedAt = addMinutes(cursor, rng.int(1, 600));
  const c: FixtureCase = {
    patientId: syntheticPatientId(n),
    caseType,
    status,
    priority: rng.pick(PRIORITIES),
    assignedTo,
    notes: rng.chance(0.6) ? "Synthetic initial note" : "",
    createdAt,
    updatedAt,
    ...(rng.chance(0.7) ? { dos: isoDay(startMs, rng.int(-10, days + 10)) } : {}),
    ...(rng.chance(0.3) ? { expirationDate: isoDay(startMs, rng.int(0, days + 20)) } : {}),
    ...(createdBy !== undefined ? { createdBy } : {}),
    ...(authStatus ? { authStatus } : {}),
    ...(noteLog.length ? { noteLog } : {}),
  };
  if (status === "completed" || approved) c.completedAt = addMinutes(createdAt, rng.int(30, 3 * 24 * 60));
  if (approved || wasApprovedBeforeCancel) c.approvedAt = addMinutes(createdAt, rng.int(30, 3 * 24 * 60));
  // Some cancelled cases lack the stamp, exercising the updatedAt fallback (PC-10).
  if (cancelled && rng.chance(0.8)) c.authCancelledAt = addMinutes(createdAt, rng.int(60, 5 * 24 * 60));
  if (rng.chance(0.3)) {
    c.notesUpdatedAt = addMinutes(createdAt, rng.int(10, 5 * 24 * 60));
    c.notesUpdatedBy = rng.pick(FIXTURE_STAFF);
  }
  return c;
}

/**
 * Hand-pinned cases for the landmines in plan section 5.2 (PC-01..PC-11), so
 * every fixture set covers them regardless of the random draw.
 */
export function pinnedCases(): FixtureCase[] {
  const base = {
    priority: "standard",
    notes: "",
    createdAt: "2026-09-07T14:00:00.000Z", // a Monday
    updatedAt: "2026-09-10T14:00:00.000Z",
  };
  const note = (id: string, addedAt: string, addedBy = "Alex"): NoteLogEntry => ({
    id,
    text: "Synthetic note",
    addedAt,
    addedBy,
  });
  return [
    // PC-01: initial note credited only when creator = assignee
    {
      ...base,
      patientId: "SYN-900001",
      caseType: "precert_bari",
      status: "in_progress",
      assignedTo: "Alex",
      createdBy: "Alex",
      notes: "Initial",
    },
    {
      ...base,
      patientId: "SYN-900002",
      caseType: "precert_bari",
      status: "in_progress",
      assignedTo: "Alex",
      createdBy: "Blair",
      notes: "Initial",
    },
    // PC-02: three notes, same person, same day
    {
      ...base,
      patientId: "SYN-900003",
      caseType: "precert_veins",
      status: "in_progress",
      assignedTo: "Blair",
      noteLog: [
        note("n3c", "2026-09-08T16:00:00.000Z", "Blair"),
        note("n3b", "2026-09-08T15:00:00.000Z", "Blair"),
        note("n3a", "2026-09-08T14:00:00.000Z", "Blair"),
      ],
    },
    // PC-06: Approved but still In Progress (double credit, plan D1)
    {
      ...base,
      patientId: "SYN-900004",
      caseType: "precert_general",
      status: "in_progress",
      assignedTo: "Casey",
      authStatus: "approved",
      approvedAt: "2026-09-08T12:00:00.000Z",
      completedAt: "2026-09-08T12:00:00.000Z",
      noteLog: [note("n4", "2026-09-09T13:00:00.000Z", "Casey")],
    },
    // PC-07: Completed + Denied
    {
      ...base,
      patientId: "SYN-900005",
      caseType: "precert_egd",
      status: "completed",
      assignedTo: "Drew",
      authStatus: "denied",
      completedAt: "2026-09-09T12:00:00.000Z",
      noteLog: [note("n5", "2026-09-09T13:00:00.000Z", "Drew")],
    },
    // PC-08: approved, then cancelled on 2026-09-10
    {
      ...base,
      patientId: "SYN-900006",
      caseType: "precert_bari",
      status: "completed",
      assignedTo: "Emery",
      authStatus: "cancelled",
      approvedAt: "2026-09-08T12:00:00.000Z",
      completedAt: "2026-09-08T12:00:00.000Z",
      authCancelledAt: "2026-09-10T09:00:00.000Z",
      noteLog: [note("n6b", "2026-09-11T10:00:00.000Z", "Emery"), note("n6a", "2026-09-09T10:00:00.000Z", "Emery")],
    },
    // PC-09: cancelled, never approved, Completed
    {
      ...base,
      patientId: "SYN-900007",
      caseType: "precert_veins",
      status: "completed",
      assignedTo: "Finley",
      authStatus: "cancelled",
      completedAt: "2026-09-08T12:00:00.000Z",
      authCancelledAt: "2026-09-10T09:00:00.000Z",
      noteLog: [note("n7b", "2026-09-11T10:00:00.000Z", "Finley"), note("n7a", "2026-09-09T10:00:00.000Z", "Finley")],
    },
    // PC-10: cancelled with no authCancelledAt (falls back to updatedAt)
    {
      ...base,
      patientId: "SYN-900008",
      caseType: "precert_general",
      status: "in_progress",
      assignedTo: "Alex",
      authStatus: "cancelled",
      noteLog: [note("n8", "2026-09-11T10:00:00.000Z")],
    },
    // PC-11: a note at 23:30 US-Eastern = 03:30Z the next day; plus a Saturday note (SP-01)
    {
      ...base,
      patientId: "SYN-900009",
      caseType: "precert_modified_urgent",
      status: "in_progress",
      assignedTo: "Blair",
      noteLog: [note("n9b", "2026-09-12T15:00:00.000Z", "Blair"), note("n9a", "2026-10-06T03:30:00.000Z", "Blair")],
    },
  ];
}

export function generateFixtures(seed: number, options: FixtureOptions = {}): FixtureSet {
  const rng = createRng(seed);
  const startDate = options.startDate ?? "2026-08-03";
  const days = options.days ?? 63;
  const startMs = Date.parse(`${startDate}T00:00:00.000Z`);
  const colors = ["pink", "blue", "green", "purple", "yellow", "cyan"];

  const cases = [...pinnedCases()];
  for (let n = 1; n <= (options.cases ?? 300); n++) cases.push(randomCase(rng, n, startMs, days));

  const intakeEntries: FixtureIntakeEntry[] = [];
  for (let n = 1; n <= (options.intakeEntries ?? 600); n++) {
    const date = isoDay(startMs, rng.int(0, days - 1)); // weekends included on purpose
    const roll = rng.next();
    let direction: "inbound" | "outbound";
    let category: string;
    let result: string | undefined;
    if (roll < 0.12) {
      direction = "outbound";
      category = rng.pick(BOOST); // Boost never has a Result
    } else if (roll < 0.5) {
      direction = "inbound";
      category = rng.chance(0.1) ? rng.pick(LEGACY_INBOUND) : rng.pick(INBOUND);
      result = rng.chance(0.85) ? rng.pick(INBOUND_RESULTS) : undefined;
    } else {
      direction = "outbound";
      category = rng.chance(0.1) ? rng.pick(LEGACY_OUTBOUND) : rng.pick(OUTBOUND);
      result = rng.chance(0.85) ? rng.pick(OUTBOUND_RESULTS) : undefined;
    }
    intakeEntries.push({
      staff: rng.pick(FIXTURE_INTAKE_STAFF),
      date,
      direction,
      category,
      ...(result ? { result } : {}),
      count: rng.chance(0.7) ? 1 : rng.int(2, 6), // IN-01: count > 1 differs from row count
      createdAt: timestampOn(rng, date),
      ...(rng.chance(0.6) ? { patientId: syntheticPatientId(500_000 + n) } : {}),
    });
  }

  const intakeDailyMetrics: FixtureDailyMetric[] = [];
  for (const staff of [...FIXTURE_INTAKE_STAFF, ...FIXTURE_BILLING_STAFF, ...FIXTURE_STAFF.slice(0, 2)]) {
    for (let d = 0; d < days; d++) {
      if (!rng.chance(0.35)) continue;
      const date = isoDay(startMs, d);
      intakeDailyMetrics.push({
        staff,
        date,
        emailsSent: rng.int(0, 8),
        ghlChats: rng.int(0, 5),
        newPatientIntake: rng.int(0, 4),
        callAudits: rng.int(0, 2),
        faxDocs: rng.int(0, 6),
        updatedAt: timestampOn(rng, date),
      });
    }
  }

  const billingEntries: FixtureBillingEntry[] = [];
  for (let n = 1; n <= (options.billingEntries ?? 120); n++) {
    const date = isoDay(startMs, rng.int(0, days - 1));
    billingEntries.push({
      staff: rng.pick(FIXTURE_BILLING_STAFF),
      date,
      ...(rng.chance(0.9) ? { category: rng.pick(BILLING_CATEGORIES) } : {}), // some legacy rows
      tasksCompleted: rng.int(1, 5),
      createdAt: timestampOn(rng, date),
    });
  }

  return {
    seed,
    staff: FIXTURE_STAFF.map((name, i) => ({ name, color: colors[i % colors.length] })),
    intakeStaff: FIXTURE_INTAKE_STAFF.map(name => ({ name, email: `${name.toLowerCase()}@example.invalid` })),
    billingStaff: FIXTURE_BILLING_STAFF.map(name => ({ name, email: `${name.toLowerCase()}@example.invalid` })),
    cases,
    intakeEntries,
    intakeDailyMetrics,
    billingEntries,
  };
}
