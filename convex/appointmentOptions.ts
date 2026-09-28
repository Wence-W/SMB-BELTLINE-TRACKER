// Booked Tracker Scheduler / Provider dropdown choices. Read: any signed-in
// user (the Appointment form needs them). Add/remove: admin-only, as in
// production. Logic lives in lib/appointmentOptions.ts (parity-tested).
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import {
  effectiveOptions,
  type OptionRow,
  optionKey,
  planOptionChange,
  validateOptionArgs,
} from "./lib/appointmentOptions";
import { authedQuery, capabilityMutation } from "./lib/functions";

const optionArgs = {
  optionType: v.union(v.literal("scheduler"), v.literal("provider")),
  value: v.string(),
  location: v.optional(v.string()),
};

function toRow(doc: OptionRow): OptionRow {
  const { optionType, value, location, optionKey: key, active, builtIn, order } = doc;
  return { optionType, value, location, optionKey: key, active, builtIn, order };
}

export const list = authedQuery({
  args: {},
  handler: async ctx => effectiveOptions((await ctx.db.query("appointmentDropdownOptions").collect()).map(toRow)),
});

async function change(
  ctx: MutationCtx,
  args: { optionType: "scheduler" | "provider"; value: string; location?: string },
  active: boolean,
) {
  const { value, location } = validateOptionArgs(args, "VALUE_REQUIRED");
  const existing = await ctx.db
    .query("appointmentDropdownOptions")
    .withIndex("by_optionKey", q => q.eq("optionKey", optionKey(args.optionType, value, location)))
    .unique();
  const all = await ctx.db.query("appointmentDropdownOptions").collect();
  const nextOrder = all.reduce((max, row) => Math.max(max, row.order), -1) + 1;
  const plan = planOptionChange(existing ? toRow(existing) : null, args, active, nextOrder);
  if (plan.kind === "patch" && existing) await ctx.db.patch(existing._id, plan.patch);
  else if (plan.kind === "insert") await ctx.db.insert("appointmentDropdownOptions", plan.row);
}

/** Adds a new choice, or reactivates one an admin removed. */
export const add = capabilityMutation("admin")({
  args: optionArgs,
  handler: async (ctx, args) => await change(ctx, args, true),
});

/** Hides a choice from the form; saved appointments keep their value. */
export const remove = capabilityMutation("admin")({
  args: optionArgs,
  handler: async (ctx, args) => await change(ctx, args, false),
});
