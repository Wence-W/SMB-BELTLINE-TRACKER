import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const DEFAULT_BILLING_STAFF: Array<{ name: string; email: string }> = [
  { name: "Jen", email: "virtualstaff.salvidar.050825@gmail.com" },
];

export const listStaff = query({
  args: {},
  handler: async ctx => {
    return await ctx.db.query("billingStaff").collect();
  },
});

export const seedStaffDefaults = mutation({
  args: {},
  handler: async ctx => {
    const existing = await ctx.db.query("billingStaff").collect();
    if (existing.length > 0) return;
    for (const s of DEFAULT_BILLING_STAFF) {
      await ctx.db.insert("billingStaff", s);
    }
  },
});

export const addStaff = mutation({
  args: { name: v.string(), email: v.string() },
  handler: async (ctx, { name, email }) => {
    return await ctx.db.insert("billingStaff", {
      name: name.trim(),
      email: email.trim(),
    });
  },
});

export const deleteStaff = mutation({
  args: { _id: v.id("billingStaff") },
  handler: async (ctx, { _id }) => {
    await ctx.db.delete(_id);
  },
});

export const listEntries = query({
  args: {},
  handler: async ctx => {
    return await ctx.db.query("billingEntries").collect();
  },
});

const entryFields = {
  staff: v.string(),
  date: v.string(),
  category: v.string(),
  createdAt: v.string(),
};

export const addEntry = mutation({
  args: { ...entryFields, count: v.optional(v.number()) },
  handler: async (ctx, { count, ...fields }) => {
    // `tasksCompleted` holds the count for this submission (defaults to 1
    // for a single completed activity). Kept as the same field for
    // compatibility with historical aggregate entries and the Staff Daily
    // Productivity rollup.
    const tasksCompleted = Math.max(1, Math.round(count ?? 1));
    return await ctx.db.insert("billingEntries", { ...fields, tasksCompleted });
  },
});

export const updateEntry = mutation({
  args: {
    _id: v.id("billingEntries"),
    staff: v.string(),
    date: v.string(),
    category: v.string(),
    count: v.number(),
  },
  handler: async (ctx, { _id, staff, date, category, count }) => {
    await ctx.db.patch(_id, {
      staff,
      date,
      category,
      tasksCompleted: Math.max(1, Math.round(count)),
    });
  },
});

export const deleteEntry = mutation({
  args: { _id: v.id("billingEntries") },
  handler: async (ctx, { _id }) => {
    await ctx.db.delete(_id);
  },
});
