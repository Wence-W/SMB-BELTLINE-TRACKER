import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const DEFAULT_STAFF: Array<{ name: string; color: string }> = [
  { name: "Rose", color: "pink" },
  { name: "Cha", color: "blue" },
  { name: "Wence", color: "green" },
  { name: "Angel", color: "purple" },
  { name: "Felix", color: "yellow" },
  { name: "Fatima", color: "cyan" },
  { name: "Gretchen", color: "orange" },
  { name: "Lee", color: "red" },
];

export const listAll = query({
  args: {},
  handler: async ctx => {
    return await ctx.db.query("staff").collect();
  },
});

/** Seed default staff if the table is empty (called once from the client). */
export const seedDefaults = mutation({
  args: {},
  handler: async ctx => {
    const existing = await ctx.db.query("staff").collect();
    if (existing.length > 0) return;
    for (const s of DEFAULT_STAFF) {
      await ctx.db.insert("staff", s);
    }
  },
});

export const addStaff = mutation({
  args: { name: v.string(), color: v.string(), email: v.optional(v.string()) },
  handler: async (ctx, { name, color, email }) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Name is required");
    const existing = await ctx.db
      .query("staff")
      .withIndex("by_name", q => q.eq("name", trimmed))
      .first();
    if (existing) throw new Error("Staff member already exists");
    return await ctx.db.insert("staff", {
      name: trimmed,
      color,
      email: email?.trim() || undefined,
    });
  },
});

export const updateStaffEmail = mutation({
  args: { _id: v.id("staff"), email: v.string() },
  handler: async (ctx, { _id, email }) => {
    await ctx.db.patch(_id, { email: email.trim() || undefined });
  },
});

export const deleteStaff = mutation({
  args: { _id: v.id("staff") },
  handler: async (ctx, { _id }) => {
    await ctx.db.delete(_id);
  },
});
