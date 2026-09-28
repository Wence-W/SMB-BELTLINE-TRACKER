// Import/Export activity log surfaced via the Booked Tracker's "Report"
// badge next to Notifications (Gretchen, 2026-08-05). Every Export or
// Import records who did it, when, how many rows, a short description of
// what was exported/imported, and (2026-08-05 update) which source group
// (SMB/Boost/Mixed) it covered. Import entries also carry the exact
// appointment ids they created, so they can be undone individually via
// "Remove imported data" without touching any other appointment.
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { assertRestrictedActionAllowed } from "./permissions";
import { mutation, query } from "./_generated/server";

export const logReportEvent = mutation({
  args: {
    action: v.union(v.literal("import"), v.literal("export"), v.literal("reset")),
    recordCount: v.number(),
    details: v.string(),
    source: v.optional(v.union(v.literal("SMB"), v.literal("Boost"), v.literal("Mixed"))),
    importedIds: v.optional(v.array(v.id("appointments"))),
  },
  handler: async (ctx, { action, recordCount, details, source, importedIds }) => {
    const userId = await getAuthUserId(ctx);
    const user = userId ? await ctx.db.get(userId) : null;
    const userName = user?.name || user?.email?.split("@")[0] || "Unknown user";
    await ctx.db.insert("reports", {
      action,
      userName,
      recordCount,
      details,
      createdAt: Date.now(),
      source,
      importedIds,
    });
  },
});

export const listReports = query({
  args: {},
  handler: async ctx => {
    const rows = await ctx.db.query("reports").withIndex("by_createdAt").order("desc").take(100);
    // Closed entries drop out of the Report badge's list entirely (Wence,
    // 2026-08-06) — Close is a one-way archive action, not a filter toggle.
    return rows.filter(r => !r.closedAt);
  },
});

// Close a report entry: removes it from the Report badge's list (Wence,
// 2026-08-06). Restricted to the same allowlist that can access the Report
// badge at all — everyone else never sees the Close button client-side,
// this is the server-side backstop.
export const closeReport = mutation({
  args: { reportId: v.id("reports") },
  handler: async (ctx, { reportId }) => {
    await assertRestrictedActionAllowed(ctx);
    const report = await ctx.db.get(reportId);
    if (!report) throw new Error("Report entry not found.");
    await ctx.db.patch(reportId, { closedAt: Date.now() });
  },
});

// Undo one specific import batch: deletes only the appointment rows that
// import created (tracked via `importedIds`), leaving every other
// appointment — including ones added before/after or via a different
// import — untouched. Marks the report entry as removed so the "Remove
// imported data" action can't be run twice on it (Gretchen, 2026-08-05).
export const removeImportedData = mutation({
  args: { reportId: v.id("reports") },
  handler: async (ctx, { reportId }) => {
    await assertRestrictedActionAllowed(ctx);
    const report = await ctx.db.get(reportId);
    if (!report) throw new Error("Report entry not found.");
    if (report.action !== "import") throw new Error("Only import entries can be removed.");
    if (report.removedAt) throw new Error("This import has already been removed.");
    if (!report.importedIds || report.importedIds.length === 0) {
      throw new Error("No tracked rows to remove for this import.");
    }
    let removed = 0;
    for (const id of report.importedIds) {
      const row = await ctx.db.get(id);
      if (row) {
        await ctx.db.delete(id);
        removed++;
      }
    }
    await ctx.db.patch(reportId, { removedAt: Date.now() });
    return { removed };
  },
});

// Undo a Reset (Wence, 2026-08-12): re-inserts every appointment row that
// was deleted by this specific reset from its saved `deletedSnapshot`, then
// marks the entry as undone so it can't be replayed twice from the same
// Queue entry. Restored rows land back in the same live `appointments`
// query every tab/filter already reads from, so they reappear immediately.
export const undoReset = mutation({
  args: { reportId: v.id("reports") },
  handler: async (ctx, { reportId }) => {
    await assertRestrictedActionAllowed(ctx);
    const report = await ctx.db.get(reportId);
    if (!report) throw new Error("Report entry not found.");
    if (report.action !== "reset") throw new Error("Only reset entries can be undone.");
    if (report.undoneAt) throw new Error("This reset has already been undone.");
    if (!report.deletedSnapshot || report.deletedSnapshot.length === 0) {
      throw new Error("No snapshot available to restore for this reset.");
    }
    let restored = 0;
    for (const row of report.deletedSnapshot) {
      await ctx.db.insert("appointments", row);
      restored++;
    }
    await ctx.db.patch(reportId, { undoneAt: Date.now() });
    return { restored };
  },
});
