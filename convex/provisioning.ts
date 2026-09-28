// Admin-provisioned accounts (plan D4): there is no self-signup. An admin
// creates the account; it starts UNVERIFIED with an unknowable random
// password; the person sets their own password with the emailed code, which
// verifies the email. Only then do they get any access (lib/functions.ts).
import { createAccount } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type ActionCtx, internalAction, internalQuery } from "./_generated/server";
import { logAccess } from "./lib/audit";
import { teamValidator } from "./lib/enums";
import { auditedInternalMutation, capabilityAction } from "./lib/functions";
import { normalizeEmail, nowIso } from "./lib/time";

const provisionArgs = {
  email: v.string(),
  displayName: v.string(),
  teams: v.array(teamValidator),
};

function randomUnusablePassword(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

async function provision(
  ctx: ActionCtx,
  args: { email: string; displayName: string; teams: ("verification" | "intake" | "billing")[] },
  actorUserId: Id<"users"> | undefined,
): Promise<Id<"people">> {
  const email = normalizeEmail(args.email);
  const displayName = args.displayName.trim();
  if (!email.includes("@")) throw new ConvexError({ code: "INVALID_EMAIL" });
  if (!displayName) throw new ConvexError({ code: "DISPLAY_NAME_REQUIRED" });
  const existing = await ctx.runQuery(internal.provisioning.personByEmail, { email });
  if (existing) throw new ConvexError({ code: "ALREADY_PROVISIONED" });

  const { user } = await createAccount(ctx, {
    provider: "password",
    account: { id: email, secret: randomUnusablePassword() },
    // No emailVerified here: the account stays unverified until the person
    // completes the emailed-code password setup.
    profile: { email, name: displayName },
    shouldLinkViaEmail: false,
  });

  return await ctx.runMutation(internal.provisioning.recordPerson, {
    email,
    displayName,
    teams: args.teams,
    userId: user._id,
    actorUserId,
  });
}

/** Admin UI path. */
export const provisionPerson = capabilityAction("admin")({
  args: provisionArgs,
  handler: async (ctx, args) => await provision(ctx, args, ctx.viewer.userId),
});

/** CLI path, for bootstrapping the very first accounts before any admin exists. */
export const provisionAccount = internalAction({
  args: provisionArgs,
  handler: async (ctx, args) => await provision(ctx, args, undefined),
});

export const personByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) =>
    await ctx.db
      .query("people")
      .withIndex("by_email", q => q.eq("email", email))
      .unique(),
});

export const recordPerson = auditedInternalMutation({
  args: {
    email: v.string(),
    displayName: v.string(),
    teams: v.array(teamValidator),
    userId: v.id("users"),
    actorUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { actorUserId, ...person }) => {
    const now = nowIso();
    const personId = await ctx.db.insert("people", {
      ...person,
      teams: [...new Set(person.teams)],
      active: true,
      legacyNames: [person.displayName],
      createdAt: now,
      updatedAt: now,
    });
    if (actorUserId) {
      await logAccess(ctx.db, actorUserId, { action: "provision", table: "people", docId: personId });
    }
    return personId;
  },
});

/**
 * One-time CLI bootstrap: makes an already-provisioned person the owner and
 * an admin. Refuses once any owner exists, so it can never become a second
 * privilege path (the original's retired callAuditBootstrap had the same aim).
 */
export const bootstrapOwner = auditedInternalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const anyOwner = await ctx.db
      .query("roles")
      .filter(q => q.eq(q.field("capability"), "owner"))
      .first();
    if (anyOwner) throw new ConvexError({ code: "OWNER_EXISTS" });
    const person = await ctx.db
      .query("people")
      .withIndex("by_email", q => q.eq("email", normalizeEmail(email)))
      .unique();
    if (!person?.userId) throw new ConvexError({ code: "NOT_PROVISIONED" });
    const now = nowIso();
    for (const capability of ["owner", "admin"] as const) {
      await ctx.db.insert("roles", { userId: person.userId, capability, grantedAt: now });
    }
  },
});
