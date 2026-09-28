import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { RESTRICTED_ACTION_EMAILS } from "./permissions";

// Resolve the logged-in staff member's name from their auth account email,
// matched against staff.email (Wence, 2026-07-29 — attribute direct Notes
// box edits automatically instead of requiring a manual "who's editing"
// field). Returns undefined if not logged in or no staff record matches.
async function currentStaffName(ctx: MutationCtx): Promise<string | undefined> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return undefined;
  const user = await ctx.db.get(userId);
  const email = (user as { email?: string } | null)?.email;
  if (!email) return undefined;
  const staff = await ctx.db
    .query("staff")
    .filter(q => q.eq(q.field("email"), email))
    .first();
  return staff?.name;
}

// Patient ID lock exception (Wence, 2026-09-17: "only me can edit") — only
// Wence's own login can change a Patient ID after it's already been set.
// Deliberately narrower than the existing 4-admin RESTRICTED_ACTION_EMAILS
// allowlist in permissions.ts; kept separate on purpose so a future change
// to that allowlist doesn't silently widen who can edit a locked Patient ID.
const PATIENT_ID_LOCK_EXEMPT_EMAIL = "virtualstaff.wenceslao.011325@gmail.com";

async function isPatientIdLockExemptUser(ctx: MutationCtx): Promise<boolean> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return false;
  const user = await ctx.db.get(userId);
  const email = (user as { email?: string } | null)?.email?.toLowerCase().trim();
  return email === PATIENT_ID_LOCK_EXEMPT_EMAIL;
}

async function isRestrictedActionUser(ctx: QueryCtx | MutationCtx): Promise<boolean> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return false;
  const user = await ctx.db.get(userId);
  const email = (user as { email?: string } | null)?.email?.toLowerCase().trim();
  return !!email && RESTRICTED_ACTION_EMAILS.includes(email);
}

// ─── Queries ────────────────────────────────────────────────────────────────

export const listAll = query({
  args: {},
  handler: async ctx => {
    return await ctx.db.query("cases").collect();
  },
});

// ─── Mutations ──────────────────────────────────────────────────────────────

const caseFields = {
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
  insuranceProvider: v.optional(v.string()),
  authorizationNumber: v.optional(v.string()),
  authStatus: v.optional(v.string()),
  provider: v.optional(v.string()),
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
};

export const addCase = mutation({
  args: { clientId: v.string(), ...caseFields },
  handler: async (ctx, { clientId, ...fields }) => {
    // clientId is the app-level id string; store it as patientId context
    // Auth Status "cancelled" gets a server-side timestamp — productivity
    // counts notes added on/after this date as On-going even on a Completed
    // case (Wence, 2026-09-02).
    const authCancelledAt =
      fields.authStatus === "cancelled" ? new Date().toISOString() : undefined;
    const _id = await ctx.db.insert("cases", { ...fields, authCancelledAt });
    return _id;
  },
});

export const updateCase = mutation({
  args: {
    _id: v.id("cases"),
    ...caseFields,
  },
  handler: async (ctx, { _id, ...fields }) => {
    const existing = await ctx.db.get(_id);
    // Patient ID is locked once set — once a case has a non-blank Patient ID,
    // it can never be changed again via this mutation (Wence, 2026-09-16),
    // EXCEPT Wence's own account, which stays able to correct it (Wence,
    // 2026-09-17: "only me can edit").
    let patientIdChangeToLog: { oldPatientId: string; newPatientId: string } | null = null;
    if (existing?.patientId && existing.patientId.trim()) {
      const canOverridePatientIdLock = await isPatientIdLockExemptUser(ctx);
      if (!canOverridePatientIdLock) {
        fields.patientId = existing.patientId;
      } else if (fields.patientId !== existing.patientId) {
        // Wence's exempt account changed an already-set Patient ID — log it
        // (Wence, 2026-09-17: "give me access to check the previous or edit
        // history"). Going-forward only, admins-only visibility.
        patientIdChangeToLog = {
          oldPatientId: existing.patientId,
          newPatientId: fields.patientId,
        };
      }
    }
    // Stamp authCancelledAt when Auth Status flips to "cancelled"; clear it
    // if the auth status later moves away from cancelled. Notes dated
    // on/after this stamp count as Pre-Cert On-going even when the case's
    // workflow Status is Completed (Wence, 2026-09-02).
    const cancelPatch: { authCancelledAt?: string | undefined } = {};
    if (fields.authStatus === "cancelled" && existing?.authStatus !== "cancelled") {
      cancelPatch.authCancelledAt = new Date().toISOString();
    } else if (fields.authStatus !== "cancelled" && existing?.authCancelledAt) {
      cancelPatch.authCancelledAt = undefined;
    }
    const notesChanged =
      existing !== null && existing.notes !== fields.notes;
    let patched = false;
    if (notesChanged) {
      const staffName = await currentStaffName(ctx);
      if (staffName) {
        await ctx.db.patch(_id, {
          ...fields,
          ...cancelPatch,
          notesUpdatedAt: new Date().toISOString(),
          notesUpdatedBy: staffName,
        });
        patched = true;
      }
    }
    if (!patched) {
      await ctx.db.patch(_id, { ...fields, ...cancelPatch });
    }
    if (patientIdChangeToLog) {
      const staffName = await currentStaffName(ctx);
      await ctx.db.insert("patientIdHistory", {
        caseId: _id,
        oldPatientId: patientIdChangeToLog.oldPatientId,
        newPatientId: patientIdChangeToLog.newPatientId,
        changedBy: staffName,
        changedAt: new Date().toISOString(),
      });
    }
  },
});

// Patient ID history for one case — admins only (Wence, 2026-09-17).
export const listPatientIdHistory = query({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    if (!(await isRestrictedActionUser(ctx))) {
      throw new Error("You don't have permission to view Patient ID history.");
    }
    const rows = await ctx.db
      .query("patientIdHistory")
      .withIndex("by_caseId", q => q.eq("caseId", caseId))
      .collect();
    return rows.sort((a, b) => b.changedAt.localeCompare(a.changedAt));
  },
});

// Explicit correction path for cases accidentally marked Completed. Keeping
// this separate from updateCase lets us remove the completion timestamp rather
// than leave a stale completedAt value behind.
export const restoreToInProgress = mutation({
  args: { _id: v.id("cases"), updatedAt: v.string() },
  handler: async (ctx, { _id, updatedAt }) => {
    await ctx.db.patch(_id, {
      status: "in_progress",
      completedAt: undefined,
      updatedAt,
    });
  },
});

// Multi "audit bookmark" for the Completed tab's Matching Cases
// (Wence, 2026-07-28): clicking a Patient ID marks it as reviewed/highlighted.
// Multiple patients can be bookmarked at once (changed from the original
// single-moving-highlight behavior — Wence, 2026-07-28). Clicking an
// already-bookmarked patient un-marks it.
export const setAuditBookmark = mutation({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const target = await ctx.db.get(caseId);
    if (!target) return;
    const previouslyBookmarked = target.auditBookmarked === true;
    await ctx.db.patch(caseId, { auditBookmarked: !previouslyBookmarked });
  },
});

// Documentation Audit / QA review (Wence, 2026-09-11): manually mark a
// Completed case's documentation as "Documentation Reviewed" or "Audited"
// after checking it. This is purely a QA record — it never touches the
// case's own workflow `status`/`completedAt`. Passing `status: null` clears
// it back to Not Audited (auditedBy/auditedAt/notes all cleared too).
export const setDocumentationAudit = mutation({
  args: {
    caseId: v.id("cases"),
    status: v.union(v.literal("reviewed"), v.literal("audited"), v.null()),
    auditedBy: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { caseId, status, auditedBy, notes }) => {
    const target = await ctx.db.get(caseId);
    if (!target) return;
    if (status === null) {
      await ctx.db.patch(caseId, {
        docAuditStatus: undefined,
        docAuditedBy: undefined,
        docAuditedAt: undefined,
        docAuditNotes: undefined,
      });
      return;
    }
    await ctx.db.patch(caseId, {
      docAuditStatus: status,
      docAuditedBy: auditedBy?.trim() || undefined,
      docAuditedAt: new Date().toISOString(),
      docAuditNotes: notes?.trim() || undefined,
    });
  },
});

export const deleteCase = mutation({
  args: { _id: v.id("cases") },
  handler: async (ctx, { _id }) => {
    await ctx.db.delete(_id);
  },
});

/** Called only by the Viktor notification cron to mark a trigger as sent. */
export const markNotified = mutation({
  args: {
    _id: v.id("cases"),
    field: v.union(
      v.literal("notifiedAssigned"),
      v.literal("notifiedExpiringSoon"),
      v.literal("notifiedOverdue"),
    ),
  },
  handler: async (ctx, { _id, field }) => {
    await ctx.db.patch(_id, { [field]: true });
  },
});

export const markUpdateNotified = mutation({
  args: { _id: v.id("cases"), updatedAt: v.string() },
  handler: async (ctx, { _id, updatedAt }) => {
    await ctx.db.patch(_id, { lastNotifiedUpdateAt: updatedAt });
  },
});

/**
 * One-time backfill helper: marks all existing cases as already having sent
 * the "assigned" notification, so turning on the cron doesn't blast every
 * pre-existing case as a "new case" email. Safe to rerun (no-op on cases
 * already flagged). Does not touch expiring/overdue flags.
 */
export const backfillNotifiedAssigned = mutation({
  args: {},
  handler: async ctx => {
    const all = await ctx.db.query("cases").collect();
    let count = 0;
    for (const c of all) {
      const patch: Record<string, unknown> = {};
      if (!c.notifiedAssigned) patch.notifiedAssigned = true;
      if (c.lastNotifiedUpdateAt !== c.updatedAt) patch.lastNotifiedUpdateAt = c.updatedAt;
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(c._id, patch);
        count++;
      }
    }
    return { patched: count };
  },
});

// One-off migration (2026-07-22 per Wence): "pending"/"approved"/
// "partial_approval"/"denied" removed from the general Status field —
// Approved/Partial Approval/Denied are now tracked via the separate Auth
// Status field. Moves any lingering legacy status values to their closest
// modern equivalent so no case is left with an invalid Status.
export const migrateLegacyStatuses = mutation({
  args: {},
  handler: async ctx => {
    const all = await ctx.db.query("cases").collect();
    let pendingToNew = 0;
    let approvedToCompleted = 0;
    for (const c of all) {
      if (c.status === "pending") {
        await ctx.db.patch(c._id, { status: "new" });
        pendingToNew++;
      } else if (c.status === "approved" || c.status === "partial_approval") {
        const patch: Record<string, unknown> = { status: "completed" };
        // Preserve the approval outcome on Auth Status if it isn't already set.
        if (!c.authStatus) patch.authStatus = c.status;
        await ctx.db.patch(c._id, patch);
        approvedToCompleted++;
      } else if (c.status === "denied") {
        const patch: Record<string, unknown> = { status: "cancelled" };
        if (!c.authStatus) patch.authStatus = "denied";
        await ctx.db.patch(c._id, patch);
      }
    }
    return { pendingToNew, approvedToCompleted, total: all.length };
  },
});

// One-off backfill (Wence, 2026-07-28): approvedAt was only ever stamped when
// authStatus === "approved", never for "partial_approval", so Partial
// Approval cases were invisible to the Approved productivity counts even
// after those counts were fixed to include partial_approval. Backfills the
// missing approvedAt using completedAt (or updatedAt as fallback) for any
// partial_approval case that's missing it.
export const backfillPartialApprovalApprovedAt = mutation({
  args: {},
  handler: async ctx => {
    const all = await ctx.db.query("cases").collect();
    let fixed = 0;
    for (const c of all) {
      if (c.authStatus === "partial_approval" && !c.approvedAt) {
        const ts = c.completedAt ?? c.updatedAt;
        await ctx.db.patch(c._id, { approvedAt: ts });
        fixed++;
      }
    }
    return { fixed, total: all.length };
  },
});

export const updateNotes = mutation({
  args: {
    _id: v.id("cases"),
    noteLog: v.array(
      v.object({
        id: v.string(),
        text: v.string(),
        addedAt: v.string(),
        addedBy: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { _id, noteLog }) => {
    await ctx.db.patch(_id, { noteLog });
  },
});

// One-off migration (2026-07-28 per Wence): Created By was previously
// auto-copied from Assigned To at creation time, which is wrong whenever the
// person logging the case isn't the person it's assigned to. That data is
// unreliable, so this clears createdBy on every existing case — Created By
// starts showing "—" until re-entered accurately via the new dedicated field
// on the Add Case form. Safe to rerun (no-op once already cleared).
export const clearInaccurateCreatedBy = mutation({
  args: {},
  handler: async ctx => {
    const all = await ctx.db.query("cases").collect();
    let cleared = 0;
    for (const c of all) {
      if (c.createdBy !== undefined) {
        await ctx.db.patch(c._id, { createdBy: undefined });
        cleared++;
      }
    }
    return { cleared, total: all.length };
  },
});

export const deleteAll = mutation({
  args: {},
  handler: async ctx => {
    const all = await ctx.db.query("cases").collect();
    await Promise.all(all.map(c => ctx.db.delete(c._id)));
  },
});
