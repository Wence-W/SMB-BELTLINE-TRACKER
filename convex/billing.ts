// Billing: Activity Log entries. Behaviour ported from the original
// convex/billing.ts: count clamped to max(1, round(count)), inline edit
// replaces staff/date/category/count, delete is a hard delete of one row.
//
// Differences (plan section 4.2 and PHASE2.md):
// - Every function requires a signed-in, active account.
// - Staff is chosen by person id and must be an active Billing team member;
//   the row still stores the name string, as the original did.
// - `createdAt` is stamped by the server; category must be one of the four
//   Billing categories; dates must be YYYY-MM-DD.
// - The Billing Staff roster is the `people` table (access.listTeam), edited
//   by admins only (D5); the original's billingStaff add/delete/seed are gone.
// - Deleting one entry stays open to staff (D5: single-row edits stay open).
import { ConvexError, v } from "convex/values";
import { billingCategoryValidator } from "./lib/enums";
import { authedMutation, authedQuery } from "./lib/functions";
import { clampTaskCount, requireIsoDate, requireTeamMember } from "./lib/staff";
import { nowIso } from "./lib/time";

export const listEntries = authedQuery({
  args: {},
  // Insertion order, like the original's `.collect()`; the screen sorts.
  handler: async ctx =>
    (await ctx.db.query("billingEntries").collect()).map(e => ({
      _id: e._id,
      staff: e.staff,
      date: e.date,
      category: e.category,
      tasksCompleted: e.tasksCompleted,
    })),
});

export const addEntry = authedMutation({
  args: {
    staffPersonId: v.id("people"),
    date: v.string(),
    category: billingCategoryValidator,
    count: v.optional(v.number()),
  },
  handler: async (ctx, { staffPersonId, date, category, count }) => {
    const person = await requireTeamMember(ctx, staffPersonId, "billing");
    return await ctx.db.insert("billingEntries", {
      staff: person.displayName,
      staffPersonId,
      date: requireIsoDate(date),
      category,
      tasksCompleted: clampTaskCount(count),
      createdAt: nowIso(),
    });
  },
});

export const updateEntry = authedMutation({
  args: {
    id: v.id("billingEntries"),
    // Omitted = keep the row's current staff. Lets a migrated row whose name
    // is no longer on the roster be edited without reassigning it (the
    // original's picker could not show such a name).
    staffPersonId: v.optional(v.id("people")),
    date: v.string(),
    category: billingCategoryValidator,
    count: v.number(),
  },
  handler: async (ctx, { id, staffPersonId, date, category, count }) => {
    const entry = await ctx.db.get(id);
    if (!entry) throw new ConvexError({ code: "NOT_FOUND" });
    const staff = staffPersonId
      ? { staff: (await requireTeamMember(ctx, staffPersonId, "billing")).displayName, staffPersonId }
      : {};
    await ctx.db.patch(id, {
      ...staff,
      date: requireIsoDate(date),
      category,
      tasksCompleted: clampTaskCount(count),
    });
  },
});

export const deleteEntry = authedMutation({
  args: { id: v.id("billingEntries") },
  handler: async (ctx, { id }) => {
    if (!(await ctx.db.get(id))) throw new ConvexError({ code: "NOT_FOUND" });
    await ctx.db.delete(id);
  },
});
