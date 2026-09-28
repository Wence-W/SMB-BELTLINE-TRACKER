import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { capabilityValidator, teamValidator } from "./lib/enums";

// Phase 0 foundation tables only. Module tables (cases, intake, billing,
// appointments, call audits, ...) arrive with their phases; see
// docs/rebuild/STEP2-PLAN.md section 3 for the old -> new mapping.
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
