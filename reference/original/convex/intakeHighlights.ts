import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  assertCallAuditAdmin,
  getCallAuditUser,
  isCallAuditAccessEmail,
  normalizeCallAuditEmail,
} from "./callAuditPermissions";

// Intake Highlights — migrated from the Base44 `intake-call-audits` Highlights
// page (2026-08-18). Same access boundary as Intake Call Audits: only approved
// Tracker accounts can read/create, only the four Tracker admins can purge.
// Audio clips are protected media served through the /call-audit-recording
// HTTP action (kind=highlight), never a public URL.

const MAX_AUDIO_BYTES = 750 * 1024 * 1024;
const ACCEPTED_AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

// Base44 offered 8 categories on the Highlights page (Inbound + Outbound),
// wider than the 4 Inbound-only categories used for Intake audits.
export const HIGHLIGHT_CALL_CATEGORIES = [
  "Inbound - Appt Concern",
  "Inbound - MA Concern",
  "Inbound - Billing Concern",
  "Inbound - Others",
  "Outbound - Confirming Appt",
  "Outbound - Prioritylist",
  "Outbound - Leads",
  "Outbound - Others",
] as const;

export const HIGHLIGHT_SPECIALISTS = [
  "Wence",
  "Lili M.",
  "Mitzi L.",
  "Katrina B.",
  "Claire Q.",
  "Jhaysen M.",
  "Rose B.",
] as const;

async function getHighlightActionUser(ctx: ActionCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("You must be signed in to use Highlights.");
  const user = await ctx.runQuery(internal.callAudits.getUserForMigration, {
    userId,
  });
  const email = user?.email ? normalizeCallAuditEmail(user.email) : "";
  if (!email || !isCallAuditAccessEmail(email)) {
    throw new Error("Your Tracker account is not authorized for Call Audits.");
  }
  return { userId, email };
}

export const list = query({
  args: {},
  handler: async ctx => {
    const user = await getCallAuditUser(ctx);
    const rows = await ctx.db.query("intakeHighlights").collect();
    const out = [];
    for (const row of rows) {
      const reactions = await ctx.db
        .query("intakeHighlightReactions")
        .withIndex("by_highlight", q => q.eq("highlightId", row._id))
        .collect();
      out.push({
        ...row,
        reactionCount: reactions.length,
        reactedByMe: reactions.some(r => r.userKey === user.email),
        reactionNames: reactions.map(r => r.userName),
      });
    }
    out.sort((a, b) => b.submittedAt - a.submittedAt);
    return out;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async ctx => {
    await getCallAuditUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

// Client uploads the audio to storage, then calls this action so the file's
// content type/size/magic bytes can be validated before the row is created.
export const createWithAudio = action({
  args: {
    intakeSpecialist: v.string(),
    callCategory: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
    sizeBytes: v.number(),
  },
  handler: async (ctx, args): Promise<Id<"intakeHighlights">> => {
    const user = await getHighlightActionUser(ctx);
    const metadata = await ctx.storage.getMetadata(args.storageId);
    const blob = await ctx.storage.get(args.storageId);
    const invalid = async (message: string): Promise<never> => {
      await ctx.storage.delete(args.storageId);
      throw new Error(message);
    };
    if (
      !metadata ||
      !blob ||
      !metadata.contentType ||
      !ACCEPTED_AUDIO_TYPES.has(metadata.contentType) ||
      metadata.size <= 0 ||
      metadata.size > MAX_AUDIO_BYTES ||
      !Number.isFinite(args.sizeBytes) ||
      args.sizeBytes !== metadata.size ||
      args.contentType !== metadata.contentType
    ) {
      return await invalid(
        "Highlight audio must be an MP3, WAV, MP4, WebM, or QuickTime file no larger than 750 MB.",
      );
    }
    if (!args.intakeSpecialist.trim() || !args.callCategory.trim()) {
      return await invalid("Intake specialist and call category are required.");
    }
    return await ctx.runMutation(internal.intakeHighlights.insertHighlight, {
      intakeSpecialist: args.intakeSpecialist.trim(),
      callCategory: args.callCategory.trim(),
      audioStorageId: args.storageId,
      submittedByEmail: user.email,
      submittedByName: user.email,
    });
  },
});

export const insertHighlight = internalMutation({
  args: {
    intakeSpecialist: v.string(),
    callCategory: v.string(),
    audioStorageId: v.id("_storage"),
    submittedByEmail: v.string(),
    submittedByName: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"intakeHighlights">> => {
    const now = Date.now();
    return await ctx.db.insert("intakeHighlights", {
      intakeSpecialist: args.intakeSpecialist,
      callCategory: args.callCategory,
      audioStorageId: args.audioStorageId,
      submittedByEmail: args.submittedByEmail,
      submittedByName: args.submittedByName,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Admins only, matching the Call Audit delete boundary. Accepts one or many so
// the "Purge Selected" bulk action and a single-row delete share a path.
export const purge = mutation({
  args: { ids: v.array(v.id("intakeHighlights")) },
  handler: async (ctx, args) => {
    await assertCallAuditAdmin(ctx);
    let deleted = 0;
    for (const id of args.ids) {
      const row = await ctx.db.get(id);
      if (!row) continue;
      if (row.audioStorageId) await ctx.storage.delete(row.audioStorageId);
      const reactions = await ctx.db
        .query("intakeHighlightReactions")
        .withIndex("by_highlight", q => q.eq("highlightId", id))
        .collect();
      for (const r of reactions) await ctx.db.delete(r._id);
      await ctx.db.delete(id);
      deleted += 1;
    }
    return { deleted };
  },
});

export const toggleReaction = mutation({
  args: { highlightId: v.id("intakeHighlights") },
  handler: async (ctx, args) => {
    const user = await getCallAuditUser(ctx);
    const highlight = await ctx.db.get(args.highlightId);
    if (!highlight) throw new Error("Highlight not found.");
    const existing = await ctx.db
      .query("intakeHighlightReactions")
      .withIndex("by_highlight_user", q =>
        q.eq("highlightId", args.highlightId).eq("userKey", user.email),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { reacted: false };
    }
    await ctx.db.insert("intakeHighlightReactions", {
      highlightId: args.highlightId,
      userKey: user.email,
      userName: user.name || user.email,
      createdAt: Date.now(),
    });
    return { reacted: true };
  },
});

export const getRecordingForHttp = internalQuery({
  args: { id: v.id("intakeHighlights") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    return row ? { videoStorageId: row.audioStorageId } : null;
  },
});

// --- Base44 migration helpers -------------------------------------------
// Internal only: reachable from the Convex CLI during the one-time migration.

export const generateMigrationUploadUrl = internalMutation({
  args: {},
  handler: async ctx => await ctx.storage.generateUploadUrl(),
});

export const importHighlight = internalMutation({
  args: {
    sourceHighlightId: v.string(),
    intakeSpecialist: v.string(),
    callCategory: v.string(),
    submittedAt: v.number(),
    submittedByName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("intakeHighlights")
      .withIndex("by_sourceHighlightId", q =>
        q.eq("sourceHighlightId", args.sourceHighlightId),
      )
      .unique();
    if (existing) return { id: existing._id, inserted: false };
    const now = Date.now();
    const id = await ctx.db.insert("intakeHighlights", {
      sourceHighlightId: args.sourceHighlightId,
      intakeSpecialist: args.intakeSpecialist,
      callCategory: args.callCategory,
      submittedByName: args.submittedByName,
      submittedAt: args.submittedAt,
      createdAt: now,
      updatedAt: now,
      migratedAt: now,
    });
    return { id, inserted: true };
  },
});

export const attachMigratedAudio = internalMutation({
  args: { sourceHighlightId: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("intakeHighlights")
      .withIndex("by_sourceHighlightId", q =>
        q.eq("sourceHighlightId", args.sourceHighlightId),
      )
      .unique();
    if (!row) throw new Error(`No highlight for source ${args.sourceHighlightId}`);
    if (row.audioStorageId && row.audioStorageId !== args.storageId) {
      await ctx.storage.delete(row.audioStorageId);
    }
    await ctx.db.patch(row._id, {
      audioStorageId: args.storageId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const importReaction = internalMutation({
  args: {
    sourceHighlightId: v.string(),
    userKey: v.string(),
    userName: v.string(),
  },
  handler: async (ctx, args) => {
    const highlight = await ctx.db
      .query("intakeHighlights")
      .withIndex("by_sourceHighlightId", q =>
        q.eq("sourceHighlightId", args.sourceHighlightId),
      )
      .unique();
    if (!highlight) throw new Error(`No highlight for source ${args.sourceHighlightId}`);
    const existing = await ctx.db
      .query("intakeHighlightReactions")
      .withIndex("by_highlight_user", q =>
        q.eq("highlightId", highlight._id).eq("userKey", args.userKey),
      )
      .unique();
    if (existing) return { inserted: false };
    await ctx.db.insert("intakeHighlightReactions", {
      highlightId: highlight._id,
      userKey: args.userKey,
      userName: args.userName,
      createdAt: Date.now(),
    });
    return { inserted: true };
  },
});

export const purgeUntouchedImports = internalMutation({
  args: {},
  handler: async ctx => {
    const rows = await ctx.db.query("intakeHighlights").collect();
    let deleted = 0;
    let kept = 0;
    for (const row of rows) {
      if (row.migratedAt && !row.submittedByEmail) {
        if (row.audioStorageId) await ctx.storage.delete(row.audioStorageId);
        const reactions = await ctx.db
          .query("intakeHighlightReactions")
          .withIndex("by_highlight", q => q.eq("highlightId", row._id))
          .collect();
        for (const r of reactions) await ctx.db.delete(r._id);
        await ctx.db.delete(row._id);
        deleted += 1;
      } else {
        kept += 1;
      }
    }
    return { deleted, kept };
  },
});
