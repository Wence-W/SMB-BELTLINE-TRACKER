// Restricted-action allowlist (Wence, 2026-08-06). Only these 4 accounts
// may: Booked Tracker Import/Export/Reset, Activity Log Export/Reset,
// Intake Staff Team Add/Remove, Report Badge Access. Mirrored in
// src/lib/permissions.ts for the client-side UI gate (hide/disable
// buttons) — this file is the server-side enforcement so the mutations
// themselves reject anyone else, not just the UI.
import { getAuthUserId } from "@convex-dev/auth/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export const RESTRICTED_ACTION_EMAILS = [
  "virtualstaff.benedicto.05202024@gmail.com",
  "smbphvs.langit.mitzi@gmail.com",
  "virtualstaff.wenceslao.011325@gmail.com",
  "youroutsourcedexpert@gmail.com",
];

export async function assertRestrictedActionAllowed(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  const user = userId ? await ctx.db.get(userId) : null;
  const email = user?.email?.toLowerCase().trim();
  if (!email || !RESTRICTED_ACTION_EMAILS.includes(email)) {
    throw new Error("You don't have permission to perform this action.");
  }
}
