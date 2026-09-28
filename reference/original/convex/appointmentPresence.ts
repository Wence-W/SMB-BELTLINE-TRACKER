// Live "who's viewing this appointment" presence for the Booked Tracker's
// Appointment Details drawer (Wence, 2026-08-05). Client heartbeats every
// ~5s while the drawer is open; a viewer is considered gone once their
// heartbeat is older than STALE_MS (client closed/crashed/navigated away),
// so the indicator clears automatically without needing an explicit
// "leave" signal (though we also send one on clean unmount for snappier UX).
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const STALE_MS = 15_000;

export const heartbeat = mutation({
  args: { appointmentId: v.id("appointments") },
  handler: async (ctx, { appointmentId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;

    const user = await ctx.db.get(userId);
    const userName = user?.name || user?.email || "Someone";
    const now = Date.now();

    const existing = await ctx.db
      .query("appointmentPresence")
      .withIndex("by_appointment_user", q =>
        q.eq("appointmentId", appointmentId).eq("userId", userId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { lastSeen: now, userName });
    } else {
      await ctx.db.insert("appointmentPresence", {
        appointmentId,
        userId,
        userName,
        lastSeen: now,
      });
    }

    // Opportunistic cleanup of stale rows on this same appointment so the
    // table never accumulates dead rows from crashed/closed clients.
    const rows = await ctx.db
      .query("appointmentPresence")
      .withIndex("by_appointment", q => q.eq("appointmentId", appointmentId))
      .collect();
    for (const row of rows) {
      if (row.userId !== userId && now - row.lastSeen > STALE_MS) {
        await ctx.db.delete(row._id);
      }
    }
  },
});

export const leave = mutation({
  args: { appointmentId: v.id("appointments") },
  handler: async (ctx, { appointmentId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;

    const existing = await ctx.db
      .query("appointmentPresence")
      .withIndex("by_appointment_user", q =>
        q.eq("appointmentId", appointmentId).eq("userId", userId),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

// Other active viewers of this appointment (excludes the caller). Recency
// filter treats anything older than STALE_MS as gone, so even if a client
// never sends `leave` (tab closed, crash, etc.) the indicator disappears
// within one heartbeat interval.
export const listViewers = query({
  args: { appointmentId: v.id("appointments") },
  handler: async (ctx, { appointmentId }) => {
    const userId = await getAuthUserId(ctx);
    const now = Date.now();

    const rows = await ctx.db
      .query("appointmentPresence")
      .withIndex("by_appointment", q => q.eq("appointmentId", appointmentId))
      .collect();

    return rows
      .filter(r => r.userId !== userId && now - r.lastSeen <= STALE_MS)
      .map(r => ({ userId: r.userId, userName: r.userName }));
  },
});
