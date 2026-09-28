// The ONLY place raw Convex function builders may be imported from
// `_generated/server`. Every exported function in `convex/` must be built from
// the wrappers below (enforced by scripts/check-function-wrappers.ts), so no
// public function can ever be called without a signed-in, verified, active
// staff account (plan section 4.1; closes Inventory finding S1).
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { customAction, customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";
import { internal } from "../_generated/api";
import type { DataModel, Id } from "../_generated/dataModel";
import {
  type MutationCtx,
  type QueryCtx,
  action as rawAction,
  internalMutation as rawInternalMutation,
  mutation as rawMutation,
  query as rawQuery,
} from "../_generated/server";
import { AUDITED_TABLES, writeAuditForChange } from "./audit";
import type { Capability } from "./enums";

export type Viewer = {
  userId: Id<"users">;
  personId: Id<"people">;
  email: string;
  displayName: string;
  capabilities: Capability[];
};

// Error codes only: messages never echo argument or document values, so no
// PHI can reach client error logs or server logs (plan SEC-05).
export type AccessErrorCode = "UNAUTHENTICATED" | "EMAIL_NOT_VERIFIED" | "NOT_PROVISIONED" | "FORBIDDEN";

export function accessError(code: AccessErrorCode): ConvexError<{ code: AccessErrorCode }> {
  return new ConvexError({ code });
}

export async function loadViewer(ctx: QueryCtx): Promise<Viewer> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw accessError("UNAUTHENTICATED");
  const user = await ctx.db.get(userId);
  if (!user) throw accessError("UNAUTHENTICATED");
  // An account is verified by completing the emailed-code password setup;
  // admin-provisioned accounts start unverified (plan SEC-03).
  if (!user.emailVerificationTime) throw accessError("EMAIL_NOT_VERIFIED");
  const person = await ctx.db
    .query("people")
    .withIndex("by_userId", q => q.eq("userId", userId))
    .unique();
  if (!person?.active) throw accessError("NOT_PROVISIONED");
  const roles = await ctx.db
    .query("roles")
    .withIndex("by_user", q => q.eq("userId", userId))
    .collect();
  return {
    userId,
    personId: person._id,
    email: person.email,
    displayName: person.displayName,
    capabilities: [...new Set(roles.map(role => role.capability))],
  };
}

export function hasCapability(viewer: Viewer, capability: Capability): boolean {
  return viewer.capabilities.includes(capability);
}

export function requireCapability(viewer: Viewer, capability: Capability): void {
  if (!hasCapability(viewer, capability)) throw accessError("FORBIDDEN");
}

// ─── Audit triggers ──────────────────────────────────────────────────────────

type TriggerCtx = MutationCtx & { viewer?: Viewer };
const triggers = new Triggers<DataModel, TriggerCtx>();
for (const table of AUDITED_TABLES) {
  triggers.register(table, async (ctx, change) => {
    await writeAuditForChange(ctx.innerDb, ctx.viewer?.userId, table, change);
  });
}

// ─── Wrappers ────────────────────────────────────────────────────────────────

export const authedQuery = customQuery(
  rawQuery,
  customCtx(async ctx => ({ viewer: await loadViewer(ctx) })),
);

export const authedMutation = customMutation(
  rawMutation,
  customCtx(async ctx => {
    const viewer = await loadViewer(ctx);
    return { ...triggers.wrapDB({ ...ctx, viewer }), viewer };
  }),
);

export function capabilityQuery(capability: Capability) {
  return customQuery(
    rawQuery,
    customCtx(async ctx => {
      const viewer = await loadViewer(ctx);
      requireCapability(viewer, capability);
      return { viewer };
    }),
  );
}

export function capabilityMutation(capability: Capability) {
  return customMutation(
    rawMutation,
    customCtx(async ctx => {
      const viewer = await loadViewer(ctx);
      requireCapability(viewer, capability);
      return { ...triggers.wrapDB({ ...ctx, viewer }), viewer };
    }),
  );
}

// Actions can't read the database directly; the viewer is resolved through an
// internal query with the same rules.
export function capabilityAction(capability: Capability) {
  return customAction(
    rawAction,
    customCtx(async ctx => {
      const viewer: Viewer = await ctx.runQuery(internal.access.viewerForAction, {});
      requireCapability(viewer, capability);
      return { viewer };
    }),
  );
}

// Internal (never browser-callable) mutations still get audit rows, with no
// actor, so migrations and crons leave a trail too.
export const auditedInternalMutation = customMutation(
  rawInternalMutation,
  customCtx(async ctx => triggers.wrapDB({ ...ctx })),
);
