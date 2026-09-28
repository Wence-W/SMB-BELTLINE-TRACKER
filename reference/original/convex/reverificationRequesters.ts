import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Requesters for the Reverification case form. This list is intentionally
// stored in Convex so authorized staff can manage it without a code change.
const DEFAULT_REQUESTERS = [
  "Keisha",
  "Micky",
  "Al-Nisa",
  "Regina",
  "Miriam",
  "Mitzi",
  "Jhaysen",
  "Rose",
  "Claire",
  "Kath",
  "Chante",
  "Donna",
  "Wendy",
  "Stacey",
  "Taquoya",
  "Diana",
];

export const listAll = query({
  args: {},
  handler: async ctx => {
    return await ctx.db.query("reverificationRequesters").collect();
  },
});

/** Seed the requested defaults once when the table is empty. */
export const seedDefaults = mutation({
  args: {},
  handler: async ctx => {
    const existing = await ctx.db.query("reverificationRequesters").collect();
    if (existing.length > 0) return;
    for (const name of DEFAULT_REQUESTERS) {
      await ctx.db.insert("reverificationRequesters", { name });
    }
  },
});

export const addRequester = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Name is required");
    const existing = await ctx.db
      .query("reverificationRequesters")
      .withIndex("by_name", q => q.eq("name", trimmed))
      .first();
    if (existing) throw new Error("Requester already exists");
    return await ctx.db.insert("reverificationRequesters", { name: trimmed });
  },
});

export const deleteRequester = mutation({
  args: { _id: v.id("reverificationRequesters") },
  handler: async (ctx, { _id }) => {
    // Removing a choice only hides it from future form selections. Existing
    // cases keep their saved requestBy value.
    await ctx.db.delete(_id);
  },
});
