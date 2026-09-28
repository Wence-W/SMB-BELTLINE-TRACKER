import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const schema = defineSchema({
  ...authTables,

  staff: defineTable({
    name: v.string(),
    color: v.string(),
    email: v.optional(v.string()),
  })
    .index("by_name", ["name"])
    .index("by_email", ["email"]),

  // Ordering/referring physicians for Pre-Cert cases (Provider dropdown on
  // the Pre-Cert form/table) — dynamic, staff can add/remove (Wence, 2026-08-04).
  precertProviders: defineTable({
    name: v.string(),
  }).index("by_name", ["name"]),

  // Requester choices for Reverification cases — staff-managed dropdown.
  reverificationRequesters: defineTable({
    name: v.string(),
  }).index("by_name", ["name"]),

  tasks: defineTable({
    title: v.string(),
    assignedTo: v.string(),
    createdDate: v.string(),
    dueDate: v.optional(v.string()),
    expirationDate: v.optional(v.string()),
    priority: v.string(), // "low" | "medium" | "high" | "urgent"
    status: v.string(), // "pending" | "in_progress" | "completed" | "cancelled"
    notes: v.string(),
    completedAt: v.optional(v.string()),
    updatedAt: v.string(),
    // Notification tracking so the Viktor email cron never double-sends
    notifiedAssigned: v.optional(v.boolean()),
    notifiedDueSoon: v.optional(v.boolean()),
    notifiedExpiringSoon: v.optional(v.boolean()),
    notifiedOverdue: v.optional(v.boolean()),
    notifiedCompleted: v.optional(v.boolean()),
    lastNotifiedUpdateAt: v.optional(v.string()),
    // Single moving "last reviewed" marker for the Completed Tasks audit
    // bookmark (Wence, 2026-07-28) — only ever true on at most one task at
    // a time; setting a new one clears the previous.
    auditBookmarked: v.optional(v.boolean()),
  })
    .index("by_assignedTo", ["assignedTo"])
    .index("by_status", ["status"])
    .index("by_priority", ["priority"])
    .index("by_auditBookmarked", ["auditBookmarked"]),

  intakeStaff: defineTable({
    name: v.string(),
    email: v.string(),
  }).index("by_name", ["name"]),

  billingStaff: defineTable({
    name: v.string(),
    email: v.string(),
  }).index("by_name", ["name"]),

  intakeEntries: defineTable({
    staff: v.string(),
    date: v.string(), // YYYY-MM-DD
    direction: v.string(), // "inbound" | "outbound"
    category: v.string(),
    result: v.optional(v.string()), // outcome of the call, added 2026-07-17
    count: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.string(),
    patientId: v.optional(v.string()), // Patient ID / ticket #, added 2026-07-24
    otherInfo: v.optional(v.string()), // "Others" free-text catch-all, added 2026-07-24
  })
    .index("by_staff", ["staff"])
    .index("by_date", ["date"]),

  // To Provider dropdown options for Log Epic Referral (Wence, 2026-09-10) —
  // dynamic list, add/remove restricted to the same allowlist as the Booked
  // Tracker Scheduler/Provider dropdowns until Wence says otherwise.
  piedmontEpicProviders: defineTable({
    name: v.string(),
  }).index("by_name", ["name"]),

  // Piedmont: Epic referral log — separate widget/table added under the
  // Activity Log tab bar (Wence, 2026-09-10), independent of intakeEntries.
  piedmontEpicReferrals: defineTable({
    date: v.string(), // YYYY-MM-DD
    refId: v.string(),
    mrNumber: v.string(),
    chart: v.string(),
    toProvider: v.string(),
    referringProvider: v.string(),
    createdAt: v.string(),
  }).index("by_date", ["date"]),

  intakeDailyMetrics: defineTable({
    staff: v.string(),
    date: v.string(),
    emailsSent: v.number(),
    ghlChats: v.number(),
    newPatientIntake: v.number(),
    callAudits: v.number(),
    faxDocs: v.number(),
    updatedAt: v.string(),
  }).index("by_staff_date", ["staff", "date"]),

  billingEntries: defineTable({
    staff: v.string(),
    date: v.string(),
    // Activity category added 2026-08-14. Optional so the historical
    // aggregate "Billing Tasks" entries remain readable.
    category: v.optional(v.string()),
    tasksCompleted: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_staff", ["staff"])
    .index("by_date", ["date"]),

  cases: defineTable({
    patientId: v.string(),
    dos: v.optional(v.string()),
    expirationDate: v.optional(v.string()),
    caseType: v.string(),
    status: v.string(),
    priority: v.string(),
    assignedTo: v.string(),
    notes: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
    completedAt: v.optional(v.string()),
    approvedAt: v.optional(v.string()),
    // Stamped server-side when authStatus flips to "cancelled" (prior auth
    // pulled after the fact). Notes dated on/after this count as Pre-Cert
    // On-going even on a Completed case (Wence, 2026-09-02).
    authCancelledAt: v.optional(v.string()),
    insuranceProvider: v.optional(v.string()),
    authorizationNumber: v.optional(v.string()),
    authStatus: v.optional(v.string()),
    // Ordering/referring physician — Pre-Cert cases only (Wence, 2026-08-04).
    provider: v.optional(v.string()),
    // Requester for Reverification cases only (Wence, 2026-08-19).
    requestBy: v.optional(v.string()),
    createdBy: v.optional(v.string()),
    noteLog: v.optional(
      v.array(
        v.object({
          id: v.string(),
          text: v.string(),
          addedAt: v.string(),
          addedBy: v.optional(v.string()),
        }),
      ),
    ),
    // Notification tracking so the Viktor email cron never double-sends
    notifiedAssigned: v.optional(v.boolean()),
    notifiedExpiringSoon: v.optional(v.boolean()),
    notifiedOverdue: v.optional(v.boolean()),
    lastNotifiedUpdateAt: v.optional(v.string()),
    // Single moving "last clicked" marker for the Completed tab's Matching
    // Cases audit bookmark (Wence, 2026-07-28) — only ever true on at most
    // one case at a time; clicking a Patient ID sets a new one and clears
    // the previous.
    auditBookmarked: v.optional(v.boolean()),
    // Attribution for edits to the top-level `notes` box (Wence, 2026-07-29):
    // unlike `noteLog` entries (added via the note icon), direct edits to the
    // initial Notes textarea previously had no who/when tracking. Stamped
    // automatically from the logged-in staff's account whenever `notes`
    // changes via `updateCase` (not set on initial case creation).
    notesUpdatedAt: v.optional(v.string()),
    notesUpdatedBy: v.optional(v.string()),
    // Documentation Audit / QA review (Wence, 2026-09-11) — separate from
    // `auditBookmarked` (a plain "last clicked" marker) and separate from
    // the case's own workflow `status`. This tracks whether someone has
    // manually reviewed a Completed case's documentation, who did it, when,
    // and any notes. Undefined = Not Audited.
    docAuditStatus: v.optional(
      v.union(v.literal("reviewed"), v.literal("audited")),
    ),
    docAuditedBy: v.optional(v.string()),
    docAuditedAt: v.optional(v.string()),
    docAuditNotes: v.optional(v.string()),
  })
    .index("by_caseType", ["caseType"])
    .index("by_assignedTo", ["assignedTo"])
    .index("by_status", ["status"])
    .index("by_auditBookmarked", ["auditBookmarked"])
    .index("by_docAuditStatus", ["docAuditStatus"]),

  // Patient ID change log (Wence, 2026-09-17): "only me can edit" already
  // locks who can change a set Patient ID (see PATIENT_ID_LOCK_EXEMPT_EMAIL
  // in convex/cases.ts) — this records every such change going forward so
  // it can be reviewed later. Going-forward only, no backfill of past edits
  // (none were ever recorded). Visible only to the 4 RESTRICTED_ACTION_EMAILS
  // admins, per Wence.
  patientIdHistory: defineTable({
    caseId: v.id("cases"),
    oldPatientId: v.string(),
    newPatientId: v.string(),
    changedBy: v.optional(v.string()),
    changedAt: v.string(),
  }).index("by_caseId", ["caseId"]),

  userPreferences: defineTable({
    userId: v.id("users"),
    colorTheme: v.string(), // "healthcare" | "spring" | "summer" | "autumn" | "rain" | "winter" | "animal" | "spider"
    animationIntensity: v.optional(v.string()), // "off" | "low" | "medium" | "high"
  }).index("by_userId", ["userId"]),

  // Ported from the standalone Intake Booked Tracker app back into Booked
  // Tracker (Wence, 2026-08-04) — Add Appointment modal + All/SMB/Boost tabs.
  appointments: defineTable({
    patientId: v.string(),
    fullName: v.optional(v.string()), // form field removed 2026-08-04 (Wence); old rows keep their name

    phone: v.string(),
    email: v.string(),
    source: v.string(), // "SMB-PLD" | "SMB INB-NEW" | "SMB INB-OLD" | "SMB TASK" | "Boost"
    apptDateTime: v.string(), // ISO datetime string
    appointmentType: v.string(), // "Consult" | "Follow Up"
    serviceType: v.string(),
    clinicLocation: v.string(), // "Atlanta" | "Stockbridge" | "Newnan"
    provider: v.string(),
    status: v.string(), // "Pending" | "Showed" | "No-Show" | "Cancelled"
    scheduler: v.optional(v.string()), // added 2026-08-04, required going forward in the UI
    createdDate: v.string(),
    updatedAt: v.string(),
    // Who last created/edited this row, resolved to a display name (not
    // email) at write time — shown in the Appointment Details view instead
    // of a raw email address (Gretchen, 2026-08-05).
    createdByName: v.optional(v.string()),
    updatedByName: v.optional(v.string()),
    // Snapshot used by Booked Tracker > Year to Date Consults. The main
    // appointment status can change later, but this view keeps the status
    // captured when the row first qualified (Wence, 2026-09-18).
    ytdConsultStatus: v.optional(v.string()),
    // "Update Synchronization" checklist (Wence, 2026-08-06) — tracked per
    // appointment in the Appointment Details drawer.
    patientPortalAccess: v.optional(v.boolean()),
    insuranceVerificationTask: v.optional(v.boolean()),
    sendToBoost: v.optional(v.boolean()),
    sendToPipelineDash: v.optional(v.boolean()),
  })
    .index("by_source", ["source"])
    .index("by_status", ["status"])
    .index("by_patientId", ["patientId"]),

  // Admin-managed Scheduler and Provider dropdown choices for the Appointment
  // form. Rows are overrides: the built-in choices stay available unless an
  // admin explicitly marks one inactive, and newly-added active rows extend
  // the relevant dropdown.
  appointmentDropdownOptions: defineTable({
    optionType: v.union(v.literal("scheduler"), v.literal("provider")),
    value: v.string(),
    location: v.optional(v.string()), // required for provider choices
    optionKey: v.string(), // normalized type/location/value identity
    active: v.boolean(),
  }).index("by_optionKey", ["optionKey"]),

  // Import/Export activity log for the Booked Tracker's Report badge
  // (Gretchen, 2026-08-05): who ran an import/export, when, and what it
  // covered.
  reports: defineTable({
    action: v.string(), // "import" | "export"
    userName: v.string(),
    recordCount: v.number(),
    details: v.string(), // e.g. tab/filter scope, filename
    createdAt: v.number(),
    // Gretchen, 2026-08-05: which appointment group this entry covers.
    // "Mixed" when the action touched both SMB and Boost rows (e.g. an
    // export/import run from the "All Appointments" tab).
    source: v.optional(v.union(v.literal("SMB"), v.literal("Boost"), v.literal("Mixed"))),
    // For "import" entries only: the exact appointment rows this import
    // created, so "Remove imported data" can undo precisely this batch
    // without touching any other appointment (Gretchen, 2026-08-05).
    importedIds: v.optional(v.array(v.id("appointments"))),
    // Set once someone removes the imported batch via the Report badge.
    removedAt: v.optional(v.number()),
    // Set once someone Closes this report entry via the Report badge
    // (Wence, 2026-08-06) — closed entries drop out of the badge's list.
    closedAt: v.optional(v.number()),
    // For "reset" entries only (Wence, 2026-08-12): a full snapshot of every
    // appointment row that Reset deleted, so "Undo" can restore them
    // exactly. Snapshot fields mirror `appointments` minus `_id`/
    // `_creationTime` — restoring re-inserts them as new rows.
    deletedSnapshot: v.optional(v.array(v.any())),
    // Set once someone Undoes a reset via the Report badge — the snapshot
    // has already been re-inserted, so Undo can't be run twice on the same
    // entry (Wence, 2026-08-12).
    undoneAt: v.optional(v.number()),
  }).index("by_createdAt", ["createdAt"]),

  // Live "who's viewing this" presence for the Appointment Details drawer
  // (Wence, 2026-08-05). One row per (appointment, user); heartbeat
  // refreshes lastSeen every few seconds while the drawer is open, and a
  // row is considered stale (auto-hidden) after ~15s of no heartbeat so a
  // closed tab/crashed client doesn't leave a stuck indicator.
  appointmentPresence: defineTable({
    appointmentId: v.id("appointments"),
    userId: v.id("users"),
    userName: v.string(),
    lastSeen: v.number(),
  })
    .index("by_appointment", ["appointmentId"])
    .index("by_appointment_user", ["appointmentId", "userId"]),

  // Ported alongside appointments — Beltline Directory (Wence, 2026-08-04).
  // Superseded by clinicWidgets/departmentWidgets below (Intake Directory
  // rebuild, 2026-08-04) — kept only so old data isn't lost; no longer read
  // by the UI.
  directoryEntries: defineTable({
    team: v.string(), // e.g. "Front Office"
    extension: v.optional(v.string()),
    slackChannel: v.optional(v.string()),
    groupLabel: v.optional(v.string()), // e.g. "Atlanta"
    memberName: v.string(),
    order: v.number(),
  }).index("by_team", ["team"]),

  // Intake Directory — Clinic tab (Wence, 2026-08-04).
  clinicWidgets: defineTable({
    name: v.string(), // e.g. "Atlanta"
    address: v.string(),
    fax: v.string(),
    order: v.number(),
  }),

  clinicProviders: defineTable({
    clinicId: v.id("clinicWidgets"),
    providerName: v.string(),
    order: v.number(),
  }).index("by_clinic", ["clinicId"]),

  // Intake Directory — Departments tab (Wence, 2026-08-04).
  departmentWidgets: defineTable({
    name: v.string(), // e.g. "Front Office"
    extension: v.optional(v.string()),
    slackChannel: v.optional(v.string()),
    order: v.number(),
  }),

  departmentMembers: defineTable({
    departmentId: v.id("departmentWidgets"),
    memberName: v.string(),
    locationTag: v.optional(v.string()), // e.g. "Stockbridge" -> "(Stockbridge) Name"
    assignment: v.optional(v.string()), // e.g. "Dr. Procter (Bariatric)" -> "Name — Assignment"
    order: v.number(),
  }).index("by_department", ["departmentId"]),

  // Verification Call Audits migration (Wence, 2026-08-13). Every record is
  // healthcare-sensitive: functions must require an authenticated Tracker
  // user, and restricted feedback is checked against this roster mapping on
  // the server. `sourceAuditId` makes the VCA migration idempotent while the
  // former app is retained as the rollback source of truth.
  callAuditRoster: defineTable({
    name: v.string(),
    normalizedName: v.string(),
    userEmail: v.string(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["normalizedName"])
    .index("by_email", ["userEmail"]),

  callAudits: defineTable({
    sourceAuditId: v.optional(v.string()),
    dateReviewed: v.string(),
    callDate: v.string(),
    verifierName: v.string(),
    auditorName: v.string(),
    callDuration: v.optional(v.string()),
    patientId: v.optional(v.string()),
    callCategory: v.string(),
    status: v.string(),
    videoStorageId: v.optional(v.id("_storage")),
    ratings: v.array(
      v.object({
        group: v.string(),
        criterion: v.string(),
        rating: v.number(),
      }),
    ),
    notes: v.optional(v.string()),
    coachingStrengths: v.optional(v.string()),
    coachingImprovements: v.optional(v.string()),
    coachingRecommendation: v.optional(v.string()),
    docNotesIncomplete: v.optional(v.boolean()),
    docNotesComplete: v.optional(v.boolean()),
    docMissingIssues: v.optional(v.string()),
    score: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdByEmail: v.optional(v.string()),
    updatedByEmail: v.optional(v.string()),
    migratedAt: v.optional(v.number()),
  })
    .index("by_sourceAuditId", ["sourceAuditId"])
    .index("by_callDate", ["callDate"])
    .index("by_verifier", ["verifierName"])
    .index("by_status", ["status"]),

  // Operator-only checkpointing for the controlled VCA source transfer.
  // Stores source IDs and machine state only—never PHI, notes, or recording
  // URLs—so a failed retry can resume safely and report reconciliation gaps.
  callAuditMigrationLedger: defineTable({
    sourceAuditId: v.string(),
    state: v.string(),
    targetAuditId: v.optional(v.id("callAudits")),
    recordingStorageId: v.optional(v.id("_storage")),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_sourceAuditId", ["sourceAuditId"]),

  // Intake Call Audits (migrated from Base44 `intake-call-audits`, 2026-08-17).
  // Deliberately a separate table from `callAudits`: Intake audits score a QA +
  // compliance percentage with a Pass/Fail result and risk level, and have no
  // 15-criterion star rubric, patient ID, or coaching fields.
  intakeCallAudits: defineTable({
    sourceAuditId: v.optional(v.string()),
    callDate: v.string(),
    intakeSpecialist: v.string(),
    auditor: v.string(),
    callCategory: v.string(),
    duration: v.optional(v.string()),
    qaScore: v.number(),
    complianceScore: v.number(),
    finalResult: v.string(),
    riskLevel: v.string(),
    status: v.string(),
    notes: v.optional(v.string()),
    chart: v.optional(v.string()),
    dateReviewed: v.optional(v.string()),
    // Full Base44 QA rubric (1-5 per criterion). Every entry stays optional:
    // older Base44 audits left whole sections unscored.
    scores: v.optional(
      v.object({
        greetingProfessionalOpening: v.optional(v.number()),
        greetingIntroducedSelf: v.optional(v.number()),
        greetingAcknowledgment: v.optional(v.number()),
        communicationClearExplanation: v.optional(v.number()),
        communicationActiveListening: v.optional(v.number()),
        communicationEmpathy: v.optional(v.number()),
        communicationProfessionalTone: v.optional(v.number()),
        communicationAvoidedInterruptions: v.optional(v.number()),
        handlingAccurateInfo: v.optional(v.number()),
        handlingConfirmedDetails: v.optional(v.number()),
        handlingEfficientFlow: v.optional(v.number()),
        handlingProperScheduling: v.optional(v.number()),
        closingSummarizedNextSteps: v.optional(v.number()),
        closingAskedAdditionalAssistance: v.optional(v.number()),
        closingRightDepartment: v.optional(v.number()),
        closingProfessionalClosing: v.optional(v.number()),
        closingDocumentation: v.optional(v.number()),
        hipaaVerifiedIdentity: v.optional(v.number()),
        hipaaProtectedInfo: v.optional(v.number()),
      }),
    ),
    documentation: v.optional(
      v.object({
        chartUpdated: v.optional(v.boolean()),
        notesComplete: v.optional(v.boolean()),
        followupDocumented: v.optional(v.boolean()),
        missingIssues: v.optional(v.string()),
      }),
    ),
    coaching: v.optional(
      v.object({
        strengths: v.optional(v.string()),
        improvements: v.optional(v.string()),
        recommendation: v.optional(v.string()),
        notes: v.optional(v.string()),
      }),
    ),
    videoStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdByEmail: v.optional(v.string()),
    updatedByEmail: v.optional(v.string()),
    migratedAt: v.optional(v.number()),
  })
    .index("by_sourceAuditId", ["sourceAuditId"])
    .index("by_callDate", ["callDate"])
    .index("by_specialist", ["intakeSpecialist"])
    .index("by_status", ["status"]),

  // Admin-only history for roster changes. This prevents a silent identity
  // remap from changing who may update an assigned auditor's feedback.
  callAuditRosterChanges: defineTable({
    action: v.string(),
    rosterName: v.string(),
    userEmail: v.string(),
    performedByEmail: v.string(),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),

  // Intake Highlights (migrated from Base44 `intake-call-audits` Highlights,
  // 2026-08-18). A showcase of great/learning-moment calls: an intake
  // specialist + call category + a protected audio clip, with 👍 ("Helpful")
  // reactions. Separate from intakeCallAudits — no QA rubric, just a clip.
  intakeHighlights: defineTable({
    sourceHighlightId: v.optional(v.string()),
    intakeSpecialist: v.string(),
    callCategory: v.string(),
    audioStorageId: v.optional(v.id("_storage")),
    submittedByEmail: v.optional(v.string()),
    submittedByName: v.optional(v.string()),
    submittedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    migratedAt: v.optional(v.number()),
  })
    .index("by_sourceHighlightId", ["sourceHighlightId"])
    .index("by_submittedAt", ["submittedAt"]),

  // One 👍 per user per highlight (toggle). userKey = signed-in email so a
  // migrated Base44 reaction and a live one can't double-count the same person.
  intakeHighlightReactions: defineTable({
    highlightId: v.id("intakeHighlights"),
    userKey: v.string(),
    userName: v.string(),
    createdAt: v.number(),
  })
    .index("by_highlight", ["highlightId"])
    .index("by_highlight_user", ["highlightId", "userKey"]),

  // Per-audit emoji reactions on the Intake Audits list (copied from Base44,
  // 2026-08-18). Base44 lets any Tracker user pick one of 5 emoji per audit
  // row (👍/⭐/🙌/❤️/💡); a second click either swaps their pick or removes it.
  // Exactly one reaction row per (auditId, userKey) — never multiple emoji
  // from the same person on the same audit.
  intakeCallAuditReactions: defineTable({
    auditId: v.id("intakeCallAudits"),
    emoji: v.union(
      v.literal("thumbsup"),
      v.literal("star"),
      v.literal("clap"),
      v.literal("heart"),
      v.literal("bulb"),
    ),
    userKey: v.string(),
    userName: v.string(),
    createdAt: v.number(),
  })
    .index("by_audit", ["auditId"])
    .index("by_audit_user", ["auditId", "userKey"]),

  // Verification Workflow Process / Verification Guidelines tabs (Wence,
  // 2026-09-23): each of the two static SOP tabs under Ins Verifiers gets
  // its own running "Updates" log (text and/or a pasted/uploaded screenshot)
  // plus a per-verifier one-click "I acknowledge" record — track-only, not
  // a gate, visible to everyone.
  verificationPageUpdates: defineTable({
    page: v.union(v.literal("process"), v.literal("guidelines")),
    text: v.optional(v.string()),
    screenshotStorageId: v.optional(v.id("_storage")),
    createdByName: v.optional(v.string()),
    createdByEmail: v.optional(v.string()),
    createdAt: v.string(),
  }).index("by_page", ["page"]),

  verificationPageAcknowledgements: defineTable({
    page: v.union(v.literal("process"), v.literal("guidelines")),
    userId: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    acknowledgedAt: v.string(),
  })
    .index("by_page", ["page"])
    .index("by_page_user", ["page", "userId"]),
});

export default schema;
