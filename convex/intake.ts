// Intake: the Activity Log (log form, Intake Log, entry details, reset,
// export) and the Raw Entries metric rows. Behaviour ported from the original
// convex/intake.ts plus the rules its browser code applied (IntakeTeamTab
// handleSave), which now run on the server:
// - Count > 0 needs a category. A category with Count 0 logs no entry.
// - At least one of a category count or a metric value must be given.
// - A Boost category never keeps a Result; direction comes from the category.
// - The day's metrics row is REPLACED by the five values (plan IN-03, parity).
// - Every entry counts once in the log but `count` times in reports (IN-01).
//
// Differences (PHASE3.md): staff is an active Intake team member picked by id;
// categories/results must be valid for the direction; counts and metrics are
// whole numbers >= 0; createdAt is server time; Reset and Export are
// admin-only on the server and Export is built and logged here.
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { intakeCategoryValidator } from "./lib/enums";
import { logAccess } from "./lib/audit";
import { auditedInternalMutation, authedMutation, authedQuery, capabilityMutation } from "./lib/functions";
import { filterByExportRange, intakeLogRows } from "./lib/intakeLog";
import {
  ACTIVE_INTAKE_CATEGORY_OPTIONS,
  categoryDirection,
  isBoostCategory,
  resultOptionsForDirection,
} from "./lib/intakeTaxonomy";
import { requireIsoDate, requireTally, requireTeamMember } from "./lib/staff";
import { nowIso } from "./lib/time";

const METRIC_KEYS = ["emailsSent", "ghlChats", "newPatientIntake", "callAudits", "faxDocs"] as const;

function entryView(e: Doc<"intakeEntries">) {
  return {
    _id: e._id,
    staff: e.staff,
    date: e.date,
    direction: e.direction,
    category: e.category,
    result: e.result,
    count: e.count,
    notes: e.notes,
    createdAt: e.createdAt,
    patientId: e.patientId,
    otherInfo: e.otherInfo,
  };
}

export const listEntries = authedQuery({
  args: {},
  handler: async ctx => (await ctx.db.query("intakeEntries").collect()).map(entryView),
});

function requireResultFor(direction: "inbound" | "outbound", result: string): string {
  if (!resultOptionsForDirection(direction).some(r => r.value === result)) {
    throw new ConvexError({ code: "INVALID_RESULT" });
  }
  return result;
}

/** "+ Log Activity": an Intake entry and/or the day's metrics, in one save. */
export const logActivity = authedMutation({
  args: {
    staffPersonId: v.id("people"),
    date: v.string(),
    category: v.optional(intakeCategoryValidator), // absent = "— None —"
    result: v.optional(v.string()), // "" or absent = none
    count: v.number(),
    notes: v.optional(v.string()),
    patientId: v.optional(v.string()),
    otherInfo: v.optional(v.string()),
    metrics: v.object({
      emailsSent: v.number(),
      ghlChats: v.number(),
      newPatientIntake: v.number(),
      callAudits: v.number(),
      faxDocs: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const person = await requireTeamMember(ctx, args.staffPersonId, "intake");
    const date = requireIsoDate(args.date);
    const count = requireTally(args.count);
    for (const key of METRIC_KEYS) requireTally(args.metrics[key]);
    const metricsFilled = METRIC_KEYS.some(key => args.metrics[key] > 0);
    const loggingCategory = count > 0 && !!args.category;
    if (count > 0 && !args.category) throw new ConvexError({ code: "CATEGORY_REQUIRED" });
    if (!loggingCategory && !metricsFilled) throw new ConvexError({ code: "NOTHING_TO_SAVE" });

    let entryId = null;
    if (loggingCategory && args.category) {
      const direction = categoryDirection(args.category);
      const keepResult = !isBoostCategory(args.category) && !!args.result;
      entryId = await ctx.db.insert("intakeEntries", {
        staff: person.displayName,
        staffPersonId: person._id,
        date,
        direction,
        category: args.category,
        ...(keepResult && args.result ? { result: requireResultFor(direction, args.result) as never } : {}),
        count,
        ...(args.notes ? { notes: args.notes } : {}),
        createdAt: nowIso(),
        ...(args.patientId ? { patientId: args.patientId } : {}),
        ...(args.otherInfo ? { otherInfo: args.otherInfo } : {}),
      });
    }

    let metricId = null;
    if (metricsFilled) {
      const row = { ...args.metrics, updatedAt: nowIso() };
      const existing = await ctx.db
        .query("intakeDailyMetrics")
        .withIndex("by_staff_date", q => q.eq("staff", person.displayName).eq("date", date))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, row);
        metricId = existing._id;
      } else {
        metricId = await ctx.db.insert("intakeDailyMetrics", {
          staff: person.displayName,
          staffPersonId: person._id,
          date,
          ...row,
        });
      }
    }
    return { entryId, metricId };
  },
});

/**
 * Entry details Save. As in the original, a field left out is untouched, the
 * direction never changes, and Resolution "" clears it. The Call Reason must
 * be an active category of the entry's direction, or the entry's current one.
 */
export const updateEntryDetails = authedMutation({
  args: {
    id: v.id("intakeEntries"),
    patientId: v.optional(v.string()),
    category: v.optional(v.string()),
    result: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { id, patientId, category, result, notes }) => {
    const entry = await ctx.db.get(id);
    if (!entry) throw new ConvexError({ code: "NOT_FOUND" });
    const patch: Partial<Doc<"intakeEntries">> = {};
    if (patientId !== undefined) patch.patientId = patientId;
    if (category !== undefined) {
      const allowed =
        category === entry.category ||
        ACTIVE_INTAKE_CATEGORY_OPTIONS.some(c => c.value === category && c.direction === entry.direction);
      if (!allowed) throw new ConvexError({ code: "INVALID_CATEGORY" });
      patch.category = category as Doc<"intakeEntries">["category"];
    }
    if (result !== undefined) {
      patch.result = (
        result === "" || result === entry.result ? result : requireResultFor(entry.direction, result)
      ) as Doc<"intakeEntries">["result"];
    }
    if (notes !== undefined) patch.notes = notes;
    await ctx.db.patch(id, patch);
  },
});

/** Delete one entry (from its details window; D5 keeps single-row deletes open). */
export const deleteEntry = authedMutation({
  args: { id: v.id("intakeEntries") },
  handler: async (ctx, { id }) => {
    if (!(await ctx.db.get(id))) throw new ConvexError({ code: "NOT_FOUND" });
    await ctx.db.delete(id);
  },
});

// Reset deletes Intake entries only (metrics and rosters stay, plan IN-07).
// Deleted in batches so a large log never exceeds one transaction's limits.
const RESET_BATCH = 500;

export const resetEntries = capabilityMutation("admin")({
  args: {},
  handler: async ctx => {
    await logAccess(ctx.db, ctx.viewer.userId, { action: "reset", table: "intakeEntries" });
    await ctx.scheduler.runAfter(0, internal.intake.resetBatch, {});
  },
});

// Each deleted row is audited (no actor: the "reset" row above names who).
export const resetBatch = auditedInternalMutation({
  args: {},
  handler: async ctx => {
    const batch = await ctx.db.query("intakeEntries").take(RESET_BATCH);
    for (const e of batch) await ctx.db.delete(e._id);
    if (batch.length === RESET_BATCH) {
      await ctx.scheduler.runAfter(0, internal.intake.resetBatch, {});
    }
  },
});

const directionFilter = v.union(v.literal(""), v.literal("inbound"), v.literal("outbound"));

/**
 * Export Excel (admin). Returns exactly the Intake Log rows on screen (same
 * filters), narrowed by the export From/To, with the original's six columns.
 * Built on the server so a non-admin can never pull the data, and logged.
 */
export const exportEntries = capabilityMutation("admin")({
  args: {
    filters: v.object({
      date: v.string(),
      from: v.string(),
      to: v.string(),
      staff: v.string(),
      direction: directionFilter,
    }),
    exportFrom: v.string(),
    exportTo: v.string(),
  },
  handler: async (ctx, { filters, exportFrom, exportTo }) => {
    const entries = await ctx.db.query("intakeEntries").collect();
    const rows = filterByExportRange(intakeLogRows(entries, filters), exportFrom, exportTo);
    await logAccess(ctx.db, ctx.viewer.userId, {
      action: "export",
      table: "intakeEntries",
      fields: ["patientId", "staff", "category", "result", "notes", "createdAt"],
    });
    return rows.map(r => ({
      patientId: r.patientId,
      staff: r.staff,
      category: r.category,
      result: r.result,
      notes: r.notes,
      date: r.date,
      createdAt: r.createdAt,
    }));
  },
});
