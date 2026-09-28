import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ─── Queries ────────────────────────────────────────────────────────────────

export const listAll = query({
  args: {},
  handler: async ctx => {
    return await ctx.db.query("tasks").collect();
  },
});

// ─── Mutations ──────────────────────────────────────────────────────────────

const taskFields = {
  title: v.string(),
  assignedTo: v.string(),
  createdDate: v.string(),
  dueDate: v.optional(v.string()),
  expirationDate: v.optional(v.string()),
  priority: v.string(),
  status: v.string(),
  notes: v.string(),
  completedAt: v.optional(v.string()),
  updatedAt: v.string(),
};

export const addTask = mutation({
  args: { ...taskFields },
  handler: async (ctx, fields) => {
    return await ctx.db.insert("tasks", { ...fields });
  },
});

export const updateTask = mutation({
  args: {
    _id: v.id("tasks"),
    ...taskFields,
  },
  handler: async (ctx, { _id, ...fields }) => {
    const existing = await ctx.db.get(_id);
    const resets: Record<string, boolean> = {};
    if (existing) {
      if (existing.assignedTo !== fields.assignedTo) {
        resets.notifiedAssigned = false;
      }
      if (
        existing.dueDate !== fields.dueDate ||
        existing.status !== fields.status
      ) {
        resets.notifiedDueSoon = false;
        resets.notifiedOverdue = false;
      }
      if (existing.expirationDate !== fields.expirationDate) {
        resets.notifiedExpiringSoon = false;
      }
    }
    await ctx.db.patch(_id, { ...fields, ...resets });
  },
});

/** Called by the Viktor notification cron after sending an "updated" email;
 * stores the updatedAt value it notified for so it re-fires next time the
 * task changes again. */
export const markUpdateNotified = mutation({
  args: { _id: v.id("tasks"), updatedAt: v.string() },
  handler: async (ctx, { _id, updatedAt }) => {
    await ctx.db.patch(_id, { lastNotifiedUpdateAt: updatedAt });
  },
});

/** Called only by the Viktor notification cron to mark a trigger as sent. */
export const markNotified = mutation({
  args: {
    _id: v.id("tasks"),
    field: v.union(
      v.literal("notifiedAssigned"),
      v.literal("notifiedDueSoon"),
      v.literal("notifiedExpiringSoon"),
      v.literal("notifiedOverdue"),
      v.literal("notifiedCompleted"),
    ),
  },
  handler: async (ctx, { _id, field }) => {
    await ctx.db.patch(_id, { [field]: true });
  },
});

// Single moving "audit bookmark" for Completed Tasks (Wence, 2026-07-28):
// clicking a task marks it as "last reviewed", clearing any prior mark so
// only one task is ever bookmarked at a time. Clicking the bookmarked task
// again clears it.
export const setAuditBookmark = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const target = await ctx.db.get(taskId);
    if (!target) return;
    const previouslyBookmarked = target.auditBookmarked === true;
    const existing = await ctx.db
      .query("tasks")
      .withIndex("by_auditBookmarked", q => q.eq("auditBookmarked", true))
      .collect();
    for (const t of existing) {
      if (t._id !== taskId) await ctx.db.patch(t._id, { auditBookmarked: false });
    }
    await ctx.db.patch(taskId, { auditBookmarked: !previouslyBookmarked });
  },
});

export const deleteTask = mutation({
  args: { _id: v.id("tasks") },
  handler: async (ctx, { _id }) => {
    await ctx.db.delete(_id);
  },
});

export const deleteAll = mutation({
  args: {},
  handler: async ctx => {
    const all = await ctx.db.query("tasks").collect();
    await Promise.all(all.map(t => ctx.db.delete(t._id)));
  },
});
