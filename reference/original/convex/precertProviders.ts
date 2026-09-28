import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Ordering/referring physicians for the Pre-Cert form's Provider dropdown —
// dynamic list, staff can add/remove from the Add/Edit Case modal
// (Wence, 2026-08-04).
const DEFAULT_PROVIDERS: Array<{ name: string }> = [
  { name: "Dr. Procter" },
  { name: "Dr. Danthuluri" },
];

export const listAll = query({
  args: {},
  handler: async ctx => {
    return await ctx.db.query("precertProviders").collect();
  },
});

/** Seed default providers if the table is empty (called once from the client). */
export const seedDefaults = mutation({
  args: {},
  handler: async ctx => {
    const existing = await ctx.db.query("precertProviders").collect();
    if (existing.length > 0) return;
    for (const p of DEFAULT_PROVIDERS) {
      await ctx.db.insert("precertProviders", p);
    }
  },
});

export const addProvider = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Name is required");
    const existing = await ctx.db
      .query("precertProviders")
      .withIndex("by_name", q => q.eq("name", trimmed))
      .first();
    if (existing) throw new Error("Provider already exists");
    return await ctx.db.insert("precertProviders", { name: trimmed });
  },
});

export const deleteProvider = mutation({
  args: { _id: v.id("precertProviders") },
  handler: async (ctx, { _id }) => {
    await ctx.db.delete(_id);
  },
});
