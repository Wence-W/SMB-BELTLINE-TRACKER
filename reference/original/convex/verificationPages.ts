// Backs the Verification Workflow Process and Verification Guidelines tabs
// under Ins Verifiers (Wence, 2026-09-23):
//   1. An "Updates" log per tab — any signed-in staff can post a text note
//      and/or a screenshot (pasted or uploaded), shown newest-first with
//      who/when.
//   2. A per-tab "I acknowledge" checkbox — one click per verifier per tab,
//      logged with their name/email + timestamp. Track-only: it never
//      blocks access to the tab or the rest of the Tracker, and the list of
//      who acknowledged is visible to everyone (per Wence's answers).
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";

const pageValidator = v.union(v.literal("process"), v.literal("guidelines"));

async function currentUserIdentity(
  ctx: MutationCtx,
): Promise<{ userId: import("./_generated/dataModel").Id<"users">; name?: string; email?: string } | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  if (!user) return null;
  const email = (user as { email?: string }).email;
  const staff = email
    ? await ctx.db
        .query("staff")
        .filter(q => q.eq(q.field("email"), email))
        .first()
    : null;
  const name = staff?.name ?? (user as { name?: string }).name;
  return { userId, name, email };
}

// ─── Updates log ────────────────────────────────────────────────────────────

export const listUpdates = query({
  args: { page: pageValidator },
  handler: async (ctx, { page }) => {
    const rows = await ctx.db
      .query("verificationPageUpdates")
      .withIndex("by_page", q => q.eq("page", page))
      .order("desc")
      .collect();
    return await Promise.all(
      rows.map(async row => ({
        _id: row._id,
        text: row.text,
        createdByName: row.createdByName,
        createdByEmail: row.createdByEmail,
        createdAt: row.createdAt,
        screenshotUrl: row.screenshotStorageId
          ? await ctx.storage.getUrl(row.screenshotStorageId)
          : null,
      })),
    );
  },
});

export const generateUpdateUploadUrl = mutation({
  args: {},
  handler: async ctx => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const addUpdate = mutation({
  args: {
    page: pageValidator,
    text: v.optional(v.string()),
    screenshotStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, { page, text, screenshotStorageId }) => {
    const trimmed = text?.trim();
    if (!trimmed && !screenshotStorageId) {
      throw new Error("Add a note or a screenshot before posting an update.");
    }
    const who = await currentUserIdentity(ctx);
    await ctx.db.insert("verificationPageUpdates", {
      page,
      text: trimmed || undefined,
      screenshotStorageId,
      createdByName: who?.name,
      createdByEmail: who?.email,
      createdAt: new Date().toISOString(),
    });
  },
});

// ─── Acknowledgements ───────────────────────────────────────────────────────

export const listAcknowledgements = query({
  args: { page: pageValidator },
  handler: async (ctx, { page }) => {
    const rows = await ctx.db
      .query("verificationPageAcknowledgements")
      .withIndex("by_page", q => q.eq("page", page))
      .order("desc")
      .collect();
    return rows.map(row => ({
      _id: row._id,
      name: row.name,
      email: row.email,
      acknowledgedAt: row.acknowledgedAt,
    }));
  },
});

export const myAcknowledgement = query({
  args: { page: pageValidator },
  handler: async (ctx, { page }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db
      .query("verificationPageAcknowledgements")
      .withIndex("by_page_user", q => q.eq("page", page).eq("userId", userId))
      .first();
    return row ? { acknowledgedAt: row.acknowledgedAt } : null;
  },
});

export const acknowledge = mutation({
  args: { page: pageValidator },
  handler: async (ctx, { page }) => {
    const who = await currentUserIdentity(ctx);
    if (!who) throw new Error("You must be signed in to acknowledge.");
    const existing = await ctx.db
      .query("verificationPageAcknowledgements")
      .withIndex("by_page_user", q => q.eq("page", page).eq("userId", who.userId))
      .first();
    if (existing) return; // already acknowledged — click is a no-op, not an error
    await ctx.db.insert("verificationPageAcknowledgements", {
      page,
      userId: who.userId,
      name: who.name,
      email: who.email,
      acknowledgedAt: new Date().toISOString(),
    });
  },
});
