import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { capabilityValidator, teamValidator } from "./lib/enums";

// Tables arrive phase by phase; see docs/rebuild/STEP2-PLAN.md section 3 for
// the old -> new mapping. Migrated tables carry `legacyId` (the original
// row's _id) so reconciliation and rollback deltas can be traced (plan 3.3).
const legacyId = v.optional(v.string());
export default defineSchema({
  ...authTables,

  // One identity per staff member (replaces the four separate name lists:
  // staff, intakeStaff, billingStaff, callAuditRoster). `legacyNames` keeps
  // every historical free-text spelling so migrated rows still attribute.
  // A login only gets access once it is linked to an active person.
  people: defineTable({
    displayName: v.string(),
    email: v.string(), // normalized lower-case; the login address
    userId: v.optional(v.id("users")),
    teams: v.array(teamValidator),
    active: v.boolean(),
    legacyNames: v.array(v.string()),
    // Profile photo (Settings). Accepted only through settings.setProfilePhoto,
    // which validates the file (closes the original's S3 storage-ID hole).
    profilePhotoId: v.optional(v.id("_storage")),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_email", ["email"])
    .index("by_userId", ["userId"]),

  // Access is data, not code: replaces the hard-coded email allowlists.
  roles: defineTable({
    userId: v.id("users"),
    capability: capabilityValidator,
    grantedBy: v.optional(v.id("users")), // absent only for the CLI owner bootstrap
    grantedAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_capability", ["userId", "capability"]),

  // HIPAA audit trail. Holds field NAMES only, never field values, so it can
  // never become a second copy of PHI.
  auditLog: defineTable({
    actorUserId: v.optional(v.id("users")), // absent for internal/system writes
    action: v.string(), // "insert" | "update" | "delete" | "export" | "view" | ...
    table: v.string(),
    docId: v.optional(v.string()),
    fields: v.array(v.string()),
    at: v.string(),
  })
    .index("by_table_doc", ["table", "docId"])
    .index("by_actor", ["actorUserId"]),

  // ─── Phase 1: Intake Directory (1:1 with the original) ───────────────────
  clinicWidgets: defineTable({
    name: v.string(),
    address: v.string(),
    fax: v.string(),
    order: v.number(),
    legacyId,
  }),
  clinicProviders: defineTable({
    clinicId: v.id("clinicWidgets"),
    providerName: v.string(),
    order: v.number(),
    legacyId,
  }).index("by_clinic", ["clinicId"]),
  departmentWidgets: defineTable({
    name: v.string(),
    extension: v.optional(v.string()),
    slackChannel: v.optional(v.string()),
    order: v.number(),
    legacyId,
  }),
  departmentMembers: defineTable({
    departmentId: v.id("departmentWidgets"),
    memberName: v.string(),
    locationTag: v.optional(v.string()),
    assignment: v.optional(v.string()),
    order: v.number(),
    legacyId,
  }).index("by_department", ["departmentId"]),

  // ─── Phase 1: managed dropdown lists (1:1 with the original) ─────────────
  precertProviders: defineTable({ name: v.string(), legacyId }).index("by_name", ["name"]),
  reverificationRequesters: defineTable({ name: v.string(), legacyId }).index("by_name", ["name"]),
  piedmontEpicProviders: defineTable({ name: v.string(), legacyId }).index("by_name", ["name"]),

  // Booked Tracker Scheduler / Provider choices. The original kept built-in
  // defaults in CODE (staff and physician names) plus override rows; here the
  // defaults are rows too (`builtIn: true`, loaded by the migration), ordered
  // by `order`, so the effective list is identical without names in code.
  appointmentDropdownOptions: defineTable({
    optionType: v.union(v.literal("scheduler"), v.literal("provider")),
    value: v.string(),
    location: v.optional(v.string()),
    optionKey: v.string(),
    active: v.boolean(),
    builtIn: v.boolean(),
    order: v.number(),
    legacyId,
  }).index("by_optionKey", ["optionKey"]),

  // ─── Phase 2: Billing (plus the daily metrics row it shares with Intake) ──
  // Staff stay free-text strings exactly as in the original (reports match on
  // them); `staffPersonId` records who that is when the row was written here.
  billingEntries: defineTable({
    staff: v.string(),
    staffPersonId: v.optional(v.id("people")),
    date: v.string(), // YYYY-MM-DD
    // Optional: historical aggregate "Billing Tasks" rows have no category.
    category: v.optional(v.string()),
    tasksCompleted: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.string(),
    legacyId,
  })
    .index("by_staff", ["staff"])
    .index("by_date", ["date"]),
  // One row per (staff, date). Billing writes faxDocs/newPatientIntake; the
  // Intake Team tab (Phase 3) writes the rest.
  intakeDailyMetrics: defineTable({
    staff: v.string(),
    staffPersonId: v.optional(v.id("people")),
    date: v.string(),
    emailsSent: v.number(),
    ghlChats: v.number(),
    newPatientIntake: v.number(),
    callAudits: v.number(),
    faxDocs: v.number(),
    updatedAt: v.string(),
    legacyId,
  }).index("by_staff_date", ["staff", "date"]),

  // Dev/staging only: stands in for a real email transport until the owner
  // picks a BAA-covered provider (plan G0). Readable only through an internal
  // query; refused when DEPLOYMENT_ENV=production.
  devOutbox: defineTable({
    to: v.string(),
    subject: v.string(),
    text: v.string(),
    createdAt: v.string(),
  }).index("by_to", ["to"]),
});
