import { getAuthUserId } from "@convex-dev/auth/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { RESTRICTED_ACTION_EMAILS } from "./permissions";

type AuthCtx = QueryCtx | MutationCtx;

const CALL_AUDIT_ACCESS_EMAILS = [
  // All established SMB Beltline Tracker accounts at the VCA migration
  // boundary. This deliberately does not auto-admit future self-signups.
  "virtualstaff.salvidar.050825@gmail.com",
  "virtualstaff.barrameda.07102026@gmail.com",
  "virtualstaff.quijano.031826@gmail.com",
  "virtualstaff.mercurio.100724@gmail.com",
  "cha@bariops.local",
  "felix@bariops.local",
  "angel@bariops.local",
  "wence@bariops.local",
  "demo@bariops.local",
  "demo2@bariops.local",
  "test3@bariops.local",
  "virtualstaff.benedicto.05202024@gmail.com",
  "smbphvs.langit.mitzi@gmail.com",
  "virtualstaff.wenceslao.011325@gmail.com",
  "youroutsourcedexpert@gmail.com",
  "virtualstaff.miranda.09042024@gmail.com",
  "virtualstaff.manlangit.angel.0319@gmail.com",
  "virtualstaff.timbang.082525@gmail.com",
  "virtualstaff.payuno.fatima.040124@gmail.com",
  "virtualstaff.reguerra.07102026@gmail.com",
  "virtualstaff.loyola.010625@gmail.com",
] as const;

export function normalizeCallAuditName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeCallAuditEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isCallAuditAccessEmail(email: string): boolean {
  return CALL_AUDIT_ACCESS_EMAILS.includes(
    normalizeCallAuditEmail(email) as (typeof CALL_AUDIT_ACCESS_EMAILS)[number],
  );
}

export async function getCallAuditUser(ctx: AuthCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("You must be signed in to use Call Audits.");

  const user = await ctx.db.get(userId);
  const email = user?.email ? normalizeCallAuditEmail(user.email) : "";
  if (!email) throw new Error("Your Tracker account does not have an email address.");

  // Call Audits carries patient identifiers, notes, and protected recordings.
  // A valid Tracker login alone is not sufficient: access is limited to the
  // established Tracker accounts that Wence approved for Call Audits. This
  // list deliberately includes the four Tracker admins, including Mitzi and
  // the owner account, even though they are not assigned-auditor roster rows.
  if (!isCallAuditAccessEmail(email)) {
    throw new Error("Your Tracker account is not authorized for Call Audits.");
  }

  return { userId, email, name: user?.name?.trim() ?? "" };
}

export async function assertCallAuditAdmin(ctx: AuthCtx) {
  const user = await getCallAuditUser(ctx);
  if (!RESTRICTED_ACTION_EMAILS.includes(user.email)) {
    throw new Error("Only Tracker admins can manage or delete Call Audits.");
  }
  return user;
}

export async function assertAssignedAuditor(
  ctx: AuthCtx,
  auditorName: string,
) {
  const user = await getCallAuditUser(ctx);
  const roster = await ctx.db
    .query("callAuditRoster")
    .withIndex("by_email", q => q.eq("userEmail", user.email))
    .unique();

  if (
    !roster ||
    !roster.active ||
    roster.normalizedName !== normalizeCallAuditName(auditorName)
  ) {
    throw new Error(
      `Only the assigned Auditor (${auditorName}) can edit this audit's restricted feedback.`,
    );
  }

  return user;
}

// Intake auditors sign their Base44 audits with a last-name initial ("Rose B.",
// "Mitzi L.") while the Verification roster stores first names only, and Mitzi
// is an admin without a roster row. This map is the bridge; anyone else falls
// back to a roster match so future intake auditors work without a code change.
const INTAKE_AUDITOR_EMAILS: Record<string, string> = {
  "rose b.": "virtualstaff.benedicto.05202024@gmail.com",
  "mitzi l.": "smbphvs.langit.mitzi@gmail.com",
};

export async function assertIntakeAssignedAuditor(
  ctx: AuthCtx,
  auditorName: string,
) {
  const user = await getCallAuditUser(ctx);
  const wanted = normalizeCallAuditName(auditorName);
  const mappedEmail = INTAKE_AUDITOR_EMAILS[wanted];

  if (mappedEmail) {
    if (mappedEmail === user.email) return user;
  } else {
    // "Cha T." should still match roster row "Cha".
    const withoutInitial = wanted.replace(/\s+[a-z]\.?$/, "");
    const roster = await ctx.db
      .query("callAuditRoster")
      .withIndex("by_email", q => q.eq("userEmail", user.email))
      .unique();
    if (
      roster?.active &&
      (roster.normalizedName === wanted ||
        roster.normalizedName === withoutInitial)
    ) {
      return user;
    }
  }

  throw new Error(
    `Only the assigned Auditor (${auditorName}) can edit this audit's restricted feedback.`,
  );
}
