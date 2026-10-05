// Daily metrics: one row per (staff name, date), shared by the Billing tab
// (Fax Docs / New Patient Chart) and, from Phase 3, the Intake Team tab.
//
// The original exposed one `upsertDailyMetric` that replaced the whole row
// with values the browser read a moment earlier. Here each screen gets its own
// mutation that writes only its own fields and keeps the rest from the stored
// row, on the server. The stored result is the same as the original's for the
// same inputs, without the chance of overwriting a concurrent edit.
import { ConvexError, v } from "convex/values";
import { authedMutation, authedQuery } from "./lib/functions";
import { requireIsoDate, requireTally, requireTeamMember } from "./lib/staff";
import { nowIso } from "./lib/time";

export const list = authedQuery({
  args: {},
  handler: async ctx =>
    (await ctx.db.query("intakeDailyMetrics").collect()).map(m => ({
      _id: m._id,
      staff: m.staff,
      date: m.date,
      emailsSent: m.emailsSent,
      ghlChats: m.ghlChats,
      newPatientIntake: m.newPatientIntake,
      callAudits: m.callAudits,
      faxDocs: m.faxDocs,
    })),
});

/**
 * Billing's "Log Fax Docs / New Patient Chart" Save. As in the original, the
 * two values REPLACE that day's stored values (they are not added), and the
 * day's emails, GHL chats and call audits are kept.
 */
export const setBillingCounts = authedMutation({
  args: {
    staffPersonId: v.id("people"),
    date: v.string(),
    faxDocs: v.number(),
    newPatientIntake: v.number(),
  },
  handler: async (ctx, args) => {
    const person = await requireTeamMember(ctx, args.staffPersonId, "billing");
    const date = requireIsoDate(args.date);
    const counts = {
      faxDocs: requireTally(args.faxDocs),
      newPatientIntake: requireTally(args.newPatientIntake),
      updatedAt: nowIso(),
    };
    const existing = await ctx.db
      .query("intakeDailyMetrics")
      .withIndex("by_staff_date", q => q.eq("staff", person.displayName).eq("date", date))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, counts);
      return existing._id;
    }
    return await ctx.db.insert("intakeDailyMetrics", {
      staff: person.displayName,
      staffPersonId: person._id,
      date,
      emailsSent: 0,
      ghlChats: 0,
      callAudits: 0,
      ...counts,
    });
  },
});

/**
 * Raw Entries "Delete". As in the original, this deletes the WHOLE day's
 * metrics row for that person, not just the one metric line clicked (plan
 * IN-04, parity; the screen now asks for confirmation and says so).
 */
export const deleteMetric = authedMutation({
  args: { id: v.id("intakeDailyMetrics") },
  handler: async (ctx, { id }) => {
    if (!(await ctx.db.get(id))) throw new ConvexError({ code: "NOT_FOUND" });
    await ctx.db.delete(id);
  },
});
