import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { sourceGroup } from "./appointmentOptions";
import { assertRestrictedActionAllowed } from "./permissions";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

export const appointmentFields = {
  patientId: v.string(),
  fullName: v.optional(v.string()),
  phone: v.string(),
  email: v.string(),
  source: v.string(),
  apptDateTime: v.string(),
  appointmentType: v.string(),
  serviceType: v.string(),
  clinicLocation: v.string(),
  provider: v.string(),
  status: v.string(),
  scheduler: v.optional(v.string()),
  // "Update Synchronization" checklist (Wence, 2026-08-06).
  patientPortalAccess: v.optional(v.boolean()),
  insuranceVerificationTask: v.optional(v.boolean()),
  sendToBoost: v.optional(v.boolean()),
  sendToPipelineDash: v.optional(v.boolean()),
};

function qualifiesForYtdConsultSnapshot(fields: {
  apptDateTime: string;
  appointmentType: string;
  serviceType: string;
}): boolean {
  return (
    fields.appointmentType === "Consult" &&
    fields.serviceType !== "Medical Weight Loss" &&
    fields.apptDateTime.slice(0, 4) ===
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        year: "numeric",
      }).format(new Date())
  );
}

async function currentUserName(ctx: MutationCtx): Promise<string | undefined> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return undefined;
  const user = await ctx.db.get(userId);
  // Always resolve to a display name, never the raw email address, per
  // Gretchen's 2026-08-05 request for the Appointment Details view.
  return user?.name || user?.email?.split("@")[0] || undefined;
}

export const list = query({
  args: {},
  handler: async ctx => {
    return await ctx.db.query("appointments").order("desc").collect();
  },
});

export const create = mutation({
  args: appointmentFields,
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const userName = await currentUserName(ctx);
    const ytdConsultStatus = qualifiesForYtdConsultSnapshot(args)
      ? args.status
      : undefined;
    return await ctx.db.insert("appointments", {
      ...args,
      createdDate: now,
      updatedAt: now,
      createdByName: userName,
      updatedByName: userName,
      ...(ytdConsultStatus !== undefined ? { ytdConsultStatus } : {}),
    });
  },
});

export const update = mutation({
  args: { _id: v.id("appointments"), ...appointmentFields },
  handler: async (ctx, { _id, ...fields }) => {
    const existing = await ctx.db.get(_id);
    const userName = await currentUserName(ctx);
    // Once captured, the YTD status is intentionally immutable. For older
    // rows created before this feature, capture the current status the first
    // time the row is touched while it qualifies.
    const ytdConsultStatus =
      existing?.ytdConsultStatus ??
      (existing && qualifiesForYtdConsultSnapshot(existing)
        ? existing.status
        : qualifiesForYtdConsultSnapshot(fields)
          ? fields.status
          : undefined);
    await ctx.db.patch(_id, {
      ...fields,
      updatedAt: new Date().toISOString(),
      updatedByName: userName,
      ...(ytdConsultStatus !== undefined ? { ytdConsultStatus } : {}),
    });
  },
});

// Instant, standalone toggle for the "Update Synchronization" checklist
// (Wence, 2026-08-06 follow-up) — fires the moment a checkbox is
// clicked in the Appointment Details drawer, independent of the
// Edit/Save Changes flow, so it persists immediately and the live
// `appointments.list` query pushes the change to every open drawer/table
// without a page refresh.
export const updateSyncFlags = mutation({
  args: {
    _id: v.id("appointments"),
    patientPortalAccess: v.optional(v.boolean()),
    insuranceVerificationTask: v.optional(v.boolean()),
    sendToBoost: v.optional(v.boolean()),
    sendToPipelineDash: v.optional(v.boolean()),
  },
  handler: async (ctx, { _id, ...fields }) => {
    const userName = await currentUserName(ctx);
    await ctx.db.patch(_id, {
      ...fields,
      updatedAt: new Date().toISOString(),
      updatedByName: userName,
    });
  },
});

export const remove = mutation({
  args: { _id: v.id("appointments") },
  handler: async (ctx, { _id }) => {
    await ctx.db.delete(_id);
  },
});

// Wipes appointments — either everything (SMB + Boost) or just one source
// group. Used by the Booked Tracker's "Reset" button, which is scoped to
// whichever tab is currently active: Reset on the SMB tab only deletes SMB
// rows, Reset on Boost only deletes Boost rows, and Reset on "All
// Appointments" deletes everything. Permanent, confirmed client-side before
// calling (2026-08-05, per Wence's spec; per-tab scoping added per
// Gretchen's 2026-08-05 request).
//
// Reset activity is now logged to the Queue badge the same way Import/Export
// are (Wence, 2026-08-12): who reset it, when, how many rows, and a full
// snapshot of the deleted rows so it can be Undone from the Queue popover.
export const deleteAll = mutation({
  args: { group: v.optional(v.union(v.literal("SMB"), v.literal("Boost"))) },
  handler: async (ctx, { group }) => {
    await assertRestrictedActionAllowed(ctx);
    const all = await ctx.db.query("appointments").collect();
    const targets = group ? all.filter(a => sourceGroup(a.source) === group) : all;
    const snapshot = targets.map(({ _id, _creationTime, ...rest }) => rest);
    await Promise.all(targets.map(a => ctx.db.delete(a._id)));

    const userName = (await currentUserName(ctx)) ?? "Unknown user";
    await ctx.db.insert("reports", {
      action: "reset",
      userName,
      recordCount: targets.length,
      details: group
        ? `Reset ${group} Appointments (${targets.length} record(s) deleted)`
        : `Reset All Appointments (${targets.length} record(s) deleted)`,
      createdAt: Date.now(),
      source: group ?? (targets.length > 0 ? "Mixed" : undefined),
      deletedSnapshot: snapshot,
    });
  },
});

// Bulk create from an Import file (Gretchen, 2026-08-05). Each row is
// validated/defaulted the same way a manual Add Appointment would be, and
// lands in `appointments` — the same live query the All/SMB/Boost tabs and
// filters already read from, so imported rows sync into the correct tab
// automatically as long as `source` is one of the known values.
export const bulkImport = mutation({
  args: { rows: v.array(v.object(appointmentFields)) },
  handler: async (ctx, { rows }) => {
    await assertRestrictedActionAllowed(ctx);
    const now = new Date().toISOString();
    const userName = await currentUserName(ctx);
    // Return every inserted row's id so the Report badge can log exactly
    // which rows this import created — needed to support "Remove imported
    // data" undoing only this batch (Gretchen, 2026-08-05).
    const ids = [];
    for (const row of rows) {
      if (!row.patientId && !row.apptDateTime) continue;
      const ytdConsultStatus = qualifiesForYtdConsultSnapshot(row)
        ? row.status
        : undefined;
      const id = await ctx.db.insert("appointments", {
        ...row,
        createdDate: now,
        updatedAt: now,
        createdByName: userName,
        updatedByName: userName,
        ...(ytdConsultStatus !== undefined ? { ytdConsultStatus } : {}),
      });
      ids.push(id);
    }
    return { count: ids.length, ids };
  },
});

// One-time (idempotent) data migration for the 2026-08-06 Service Type
// rename: "Veins" -> "Veins Treatment", "Bariatric" -> "Bariatric Surgery".
// Old rows keep the old label until this runs; safe to re-run (only
// touches rows still on the old exact strings).
const SERVICE_TYPE_RENAMES: Record<string, string> = {
  Veins: "Veins Treatment",
  Bariatric: "Bariatric Surgery",
};

export const migrateServiceTypeNames = mutation({
  args: {},
  handler: async ctx => {
    const all = await ctx.db.query("appointments").collect();
    let migrated = 0;
    for (const a of all) {
      const renamed = SERVICE_TYPE_RENAMES[a.serviceType];
      if (renamed) {
        await ctx.db.patch(a._id, { serviceType: renamed });
        migrated++;
      }
    }
    return { migrated };
  },
});
