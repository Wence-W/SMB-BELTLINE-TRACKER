// Managed dropdown lists: Pre-Cert Provider, Reverification "Request by", and
// Piedmont: Epic "To Provider". Behaviour ported from the original's
// precertProviders.ts, reverificationRequesters.ts and piedmontReferrals.ts:
// trim, reject blank, reject an exact-duplicate name, delete by id (saved
// records keep their value; nothing cascades).
//
// Access: everyone signed in can read. Editing is admin-only for all three.
// For the Piedmont list that matches production; for the Pre-Cert and
// Request-by lists it is plan decision D5 (production lets any user edit).
import { ConvexError, v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { authedQuery, capabilityMutation } from "./lib/functions";

export const MANAGED_LISTS = ["precertProviders", "reverificationRequesters", "piedmontEpicProviders"] as const;
export type ManagedList = (typeof MANAGED_LISTS)[number];
const listValidator = v.union(...MANAGED_LISTS.map(list => v.literal(list)));

export const list = authedQuery({
  args: { list: listValidator },
  // Returned in insertion order, like the original's `.collect()`.
  handler: async (ctx, { list }) => await ctx.db.query(list).collect(),
});

async function addName(ctx: MutationCtx, list: ManagedList, rawName: string) {
  const name = rawName.trim();
  if (!name) throw new ConvexError({ code: "NAME_REQUIRED" });
  const existing = await ctx.db
    .query(list)
    .withIndex("by_name", q => q.eq("name", name))
    .first();
  if (existing) throw new ConvexError({ code: "ALREADY_EXISTS" });
  return await ctx.db.insert(list, { name });
}

export const add = capabilityMutation("admin")({
  args: { list: listValidator, name: v.string() },
  handler: async (ctx, { list, name }) => await addName(ctx, list, name),
});

export const remove = capabilityMutation("admin")({
  args: { list: listValidator, id: v.string() },
  handler: async (ctx, { list, id }) => {
    const docId = ctx.db.normalizeId(list, id);
    if (!docId) throw new ConvexError({ code: "NOT_FOUND" });
    await ctx.db.delete(docId);
  },
});
