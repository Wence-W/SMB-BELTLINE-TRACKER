import { v } from "convex/values";
import { assertRestrictedActionAllowed } from "./permissions";
import { mutation, query } from "./_generated/server";

// ─── To Provider dropdown (Wence, 2026-09-10) ───────────────────────────────

const DEFAULT_TO_PROVIDERS: Array<{ name: string }> = [
  { name: "Charles D. Procter JR, M.D" },
  { name: "Vishwanath Raju Danthuluri, M.D" },
  { name: "Kathryn Fuss, PA-C" },
  { name: "Jessica Harry, NP" },
  { name: "Mary Florio, NP" },
];

export const listToProviders = query({
  args: {},
  handler: async ctx => {
    return await ctx.db.query("piedmontEpicProviders").collect();
  },
});

/** Seed the 5 default To Provider options if the table is empty. */
export const seedToProviderDefaults = mutation({
  args: {},
  handler: async ctx => {
    const existing = await ctx.db.query("piedmontEpicProviders").collect();
    if (existing.length > 0) return;
    for (const p of DEFAULT_TO_PROVIDERS) {
      await ctx.db.insert("piedmontEpicProviders", p);
    }
  },
});

// Add/remove restricted to the same allowlist as the Booked Tracker
// Scheduler/Provider dropdowns (Wence, 2026-08-12 pattern) until Wence says
// who else should manage this list.
export const addToProvider = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    await assertRestrictedActionAllowed(ctx);
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Name is required");
    const existing = await ctx.db
      .query("piedmontEpicProviders")
      .withIndex("by_name", q => q.eq("name", trimmed))
      .first();
    if (existing) throw new Error("Provider already exists");
    return await ctx.db.insert("piedmontEpicProviders", { name: trimmed });
  },
});

export const deleteToProvider = mutation({
  args: { _id: v.id("piedmontEpicProviders") },
  handler: async (ctx, { _id }) => {
    await assertRestrictedActionAllowed(ctx);
    await ctx.db.delete(_id);
  },
});

// ─── Piedmont: Epic referral log ────────────────────────────────────────────
// Standalone widget + table added to the Activity Log tab bar (Wence,
// 2026-09-10), separate from intakeEntries — Log Epic Referral form feeds a
// dedicated table with its own Export Excel / Reset toolbar.

export const listEntries = query({
  args: {},
  handler: async ctx => {
    return await ctx.db.query("piedmontEpicReferrals").order("desc").collect();
  },
});

export const addEntry = mutation({
  args: {
    date: v.string(),
    refId: v.string(),
    mrNumber: v.string(),
    chart: v.string(),
    toProvider: v.string(),
    referringProvider: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("piedmontEpicReferrals", {
      ...args,
      createdAt: new Date().toISOString(),
    });
  },
});

export const deleteEntry = mutation({
  args: { _id: v.id("piedmontEpicReferrals") },
  handler: async (ctx, { _id }) => {
    await ctx.db.delete(_id);
  },
});

// Click-to-edit miniwindow (Wence, 2026-09-10 follow-up) — same permission
// level as addEntry (any signed-in user), no restricted-action gate.
export const updateEntry = mutation({
  args: {
    _id: v.id("piedmontEpicReferrals"),
    date: v.string(),
    refId: v.string(),
    mrNumber: v.string(),
    chart: v.string(),
    toProvider: v.string(),
    referringProvider: v.string(),
  },
  handler: async (ctx, { _id, ...fields }) => {
    await ctx.db.patch(_id, fields);
  },
});

// Reset button on the Piedmont: Epic toolbar — restricted to the same
// allowlist as the Intake Log Reset (Wence, 2026-08-06 pattern).
export const deleteAllEntries = mutation({
  args: {},
  handler: async ctx => {
    await assertRestrictedActionAllowed(ctx);
    const all = await ctx.db.query("piedmontEpicReferrals").collect();
    await Promise.all(all.map(e => ctx.db.delete(e._id)));
  },
});
