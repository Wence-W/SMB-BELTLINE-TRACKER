// Piedmont: Epic referral log. Behaviour ported from the original
// convex/piedmontReferrals.ts plus its panel's rules: fields are trimmed,
// at least one of Reference ID, MR# or Chart is required, newest first.
//
// Differences (PHASE3.md): every function requires a signed-in account;
// Reset and Export are admin-only on the server (the original gated Reset
// on the server and Export only in the UI); Export is built and logged here;
// To Provider must come from the managed list (or keep the row's value);
// dates must be YYYY-MM-DD. The To Provider list itself is managedLists
// ("piedmontEpicProviders"). The original's unused deleteEntry is not carried.
import { ConvexError, v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { logAccess } from "./lib/audit";
import { auditedInternalMutation, authedMutation, authedQuery, capabilityMutation } from "./lib/functions";
import { requireIsoDate } from "./lib/staff";
import { nowIso } from "./lib/time";

const referralFields = {
  date: v.string(),
  refId: v.string(),
  mrNumber: v.string(),
  chart: v.string(),
  toProvider: v.string(),
  referringProvider: v.string(),
};
type ReferralInput = {
  date: string;
  refId: string;
  mrNumber: string;
  chart: string;
  toProvider: string;
  referringProvider: string;
};

async function cleanReferral(ctx: MutationCtx, input: ReferralInput, currentToProvider?: string) {
  const row = {
    date: requireIsoDate(input.date),
    refId: input.refId.trim(),
    mrNumber: input.mrNumber.trim(),
    chart: input.chart.trim(),
    toProvider: input.toProvider.trim(),
    referringProvider: input.referringProvider.trim(),
  };
  if (!row.refId && !row.mrNumber && !row.chart) throw new ConvexError({ code: "REFERRAL_ID_REQUIRED" });
  if (row.toProvider && row.toProvider !== currentToProvider) {
    const listed = await ctx.db
      .query("piedmontEpicProviders")
      .withIndex("by_name", q => q.eq("name", row.toProvider))
      .first();
    if (!listed) throw new ConvexError({ code: "INVALID_PROVIDER" });
  }
  return row;
}

export const listEntries = authedQuery({
  args: {},
  handler: async ctx =>
    (await ctx.db.query("piedmontEpicReferrals").order("desc").collect()).map(r => ({
      _id: r._id,
      date: r.date,
      refId: r.refId,
      mrNumber: r.mrNumber,
      chart: r.chart,
      toProvider: r.toProvider,
      referringProvider: r.referringProvider,
    })),
});

export const addEntry = authedMutation({
  args: referralFields,
  handler: async (ctx, args) =>
    await ctx.db.insert("piedmontEpicReferrals", { ...(await cleanReferral(ctx, args)), createdAt: nowIso() }),
});

export const updateEntry = authedMutation({
  args: { id: v.id("piedmontEpicReferrals"), ...referralFields },
  handler: async (ctx, { id, ...fields }) => {
    const existing = await ctx.db.get(id);
    if (!existing) throw new ConvexError({ code: "NOT_FOUND" });
    await ctx.db.patch(id, await cleanReferral(ctx, fields, existing.toProvider));
  },
});

const RESET_BATCH = 500;

export const resetEntries = capabilityMutation("admin")({
  args: {},
  handler: async ctx => {
    await logAccess(ctx.db, ctx.viewer.userId, { action: "reset", table: "piedmontEpicReferrals" });
    await ctx.scheduler.runAfter(0, internal.piedmont.resetBatch, {});
  },
});

export const resetBatch = auditedInternalMutation({
  args: {},
  handler: async ctx => {
    const batch = await ctx.db.query("piedmontEpicReferrals").take(RESET_BATCH);
    for (const r of batch) await ctx.db.delete(r._id);
    if (batch.length === RESET_BATCH) await ctx.scheduler.runAfter(0, internal.piedmont.resetBatch, {});
  },
});

/** Export Excel (admin): every referral, newest first, with all six columns. */
export const exportEntries = capabilityMutation("admin")({
  args: {},
  handler: async ctx => {
    const rows = await ctx.db.query("piedmontEpicReferrals").order("desc").collect();
    await logAccess(ctx.db, ctx.viewer.userId, {
      action: "export",
      table: "piedmontEpicReferrals",
      fields: ["date", "refId", "mrNumber", "chart", "toProvider", "referringProvider"],
    });
    return rows.map(r => ({
      date: r.date,
      refId: r.refId,
      mrNumber: r.mrNumber,
      chart: r.chart,
      toProvider: r.toProvider,
      referringProvider: r.referringProvider,
    }));
  },
});
