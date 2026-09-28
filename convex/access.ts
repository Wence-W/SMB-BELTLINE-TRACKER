// Accounts, people and capabilities. Replaces the original's hard-coded email
// allowlists (RESTRICTED_ACTION_EMAILS, PATIENT_ID_LOCK_EXEMPT_EMAIL,
// CALL_AUDIT_ACCESS_EMAILS) with audited data (plan sections 3.1 and 4).
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { type Capability, capabilityValidator, teamValidator } from "./lib/enums";
import {
  accessError,
  authedQuery,
  capabilityMutation,
  capabilityQuery,
  hasCapability,
  loadViewer,
  type Viewer,
} from "./lib/functions";
import { nowIso } from "./lib/time";

// Only the owner may hand out (or take away) these two: owner itself, and the
// Patient ID override that the original tied to one hard-coded account.
const OWNER_ONLY: readonly Capability[] = ["owner", "patient_id_override"];

function assertMayManage(viewer: Viewer, capability: Capability) {
  if (OWNER_ONLY.includes(capability) && !hasCapability(viewer, "owner")) {
    throw accessError("FORBIDDEN");
  }
}

async function requirePersonForUser(ctx: QueryCtx, userId: Id<"users">) {
  const person = await ctx.db
    .query("people")
    .withIndex("by_userId", q => q.eq("userId", userId))
    .unique();
  if (!person) throw accessError("NOT_PROVISIONED");
  return person;
}

/** The signed-in person's own profile and capabilities. */
export const me = authedQuery({
  args: {},
  handler: async ctx => {
    const person = await ctx.db.get(ctx.viewer.personId);
    return {
      displayName: ctx.viewer.displayName,
      email: ctx.viewer.email,
      teams: person?.teams ?? [],
      capabilities: ctx.viewer.capabilities,
    };
  },
});

// Used by capabilityAction(): actions can't read the DB, so they resolve the
// viewer through here, with exactly the same rules.
export const viewerForAction = internalQuery({
  args: {},
  handler: async ctx => await loadViewer(ctx),
});

export const listPeople = capabilityQuery("admin")({
  args: {},
  handler: async ctx => {
    const people = await ctx.db.query("people").collect();
    return await Promise.all(
      people.map(async person => {
        const roles = person.userId
          ? await ctx.db
              .query("roles")
              .withIndex("by_user", q => q.eq("userId", person.userId as Id<"users">))
              .collect()
          : [];
        const user = person.userId ? await ctx.db.get(person.userId) : null;
        return {
          _id: person._id,
          userId: person.userId,
          displayName: person.displayName,
          email: person.email,
          teams: person.teams,
          active: person.active,
          verified: !!user?.emailVerificationTime,
          capabilities: roles.map(role => role.capability),
        };
      }),
    );
  },
});

export const setPersonActive = capabilityMutation("admin")({
  args: { personId: v.id("people"), active: v.boolean() },
  handler: async (ctx, { personId, active }) => {
    if (personId === ctx.viewer.personId && !active) throw accessError("FORBIDDEN");
    await ctx.db.patch(personId, { active, updatedAt: nowIso() });
  },
});

export const setPersonTeams = capabilityMutation("admin")({
  args: { personId: v.id("people"), teams: v.array(teamValidator) },
  handler: async (ctx, { personId, teams }) => {
    await ctx.db.patch(personId, { teams: [...new Set(teams)], updatedAt: nowIso() });
  },
});

export const grantCapability = capabilityMutation("admin")({
  args: { userId: v.id("users"), capability: capabilityValidator },
  handler: async (ctx, { userId, capability }) => {
    assertMayManage(ctx.viewer, capability);
    await requirePersonForUser(ctx, userId);
    const existing = await ctx.db
      .query("roles")
      .withIndex("by_user_capability", q => q.eq("userId", userId).eq("capability", capability))
      .unique();
    if (existing) return;
    await ctx.db.insert("roles", {
      userId,
      capability,
      grantedBy: ctx.viewer.userId,
      grantedAt: nowIso(),
    });
  },
});

export const revokeCapability = capabilityMutation("admin")({
  args: { userId: v.id("users"), capability: capabilityValidator },
  handler: async (ctx, { userId, capability }) => {
    assertMayManage(ctx.viewer, capability);
    // Nobody can lock themselves out of administration.
    if (userId === ctx.viewer.userId && (capability === "admin" || capability === "owner")) {
      throw accessError("FORBIDDEN");
    }
    const existing = await ctx.db
      .query("roles")
      .withIndex("by_user_capability", q => q.eq("userId", userId).eq("capability", capability))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});
