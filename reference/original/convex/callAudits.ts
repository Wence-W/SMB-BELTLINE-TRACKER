import { v } from "convex/values";
import {
  action,
  internalQuery,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import {
  assertAssignedAuditor,
  assertCallAuditAdmin,
  getCallAuditUser,
  isCallAuditAccessEmail,
  normalizeCallAuditEmail,
  normalizeCallAuditName,
} from "./callAuditPermissions";

const MAX_VIDEO_BYTES = 750 * 1024 * 1024;
const ACCEPTED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const AUDIT_STATUSES = [
  "Not Started",
  "Recording Downloaded",
  "In Progress",
  "Completed",
] as const;

const VERIFIED_SOURCE_ROSTER = [
  { name: "Rose", userEmail: "virtualstaff.benedicto.05202024@gmail.com" },
  { name: "Wence", userEmail: "virtualstaff.wenceslao.011325@gmail.com" },
  { name: "Gretchen", userEmail: "virtualstaff.miranda.09042024@gmail.com" },
  { name: "Angel", userEmail: "virtualstaff.manlangit.angel.0319@gmail.com" },
  { name: "Cha", userEmail: "virtualstaff.timbang.082525@gmail.com" },
  { name: "Fatima", userEmail: "virtualstaff.payuno.fatima.040124@gmail.com" },
  { name: "Felix", userEmail: "virtualstaff.reguerra.07102026@gmail.com" },
  { name: "Lee", userEmail: "virtualstaff.loyola.010625@gmail.com" },
] as const;

const ratingValidator = v.object({
  group: v.string(),
  criterion: v.string(),
  rating: v.number(),
});

const auditInput = {
  dateReviewed: v.string(),
  callDate: v.string(),
  verifierName: v.string(),
  auditorName: v.string(),
  callDuration: v.optional(v.string()),
  patientId: v.optional(v.string()),
  callCategory: v.string(),
  status: v.string(),
  videoStorageId: v.optional(v.id("_storage")),
  ratings: v.array(ratingValidator),
  notes: v.optional(v.string()),
  coachingStrengths: v.optional(v.string()),
  coachingImprovements: v.optional(v.string()),
  coachingRecommendation: v.optional(v.string()),
  docNotesIncomplete: v.optional(v.boolean()),
  docNotesComplete: v.optional(v.boolean()),
  docMissingIssues: v.optional(v.string()),
};

function cleanRequired(value: string, field: string): string {
  const cleaned = value.trim();
  if (!cleaned) throw new Error(`${field} is required.`);
  return cleaned;
}

function validateDate(value: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must use YYYY-MM-DD.`);
  }
  return value;
}

function validateStatus(value: string): string {
  if (!AUDIT_STATUSES.includes(value as (typeof AUDIT_STATUSES)[number])) {
    throw new Error("Invalid audit status.");
  }
  return value;
}

const COVERAGE_EXPLANATION_CRITERION = "Clear explanation of coverage/benefits";
const PRIOR_AUTH_EXPLANATION_CRITERION = "Clear explanation of prior auth";

export const QUALITY_RUBRIC = [
  {
    group: "Greeting",
    criteria: [
      "Professional opening",
      "Appropriate acknowledgment",
      "Introduced self and clinic",
    ],
  },
  {
    group: "Verification Accuracy",
    criteria: [
      "Confirmed patient identity & DOB",
      "Verified correct insurance/policy details",
      "Accurately confirmed authorization/precert requirements",
      "Verified whether the patient has any other active insurance coverage on file",
    ],
  },
  {
    group: "Communication & Professionalism",
    criteria: [
      COVERAGE_EXPLANATION_CRITERION,
      "Active listening / avoided repeat questions",
      "Appropriate tone and empathy",
    ],
  },
  {
    group: "Compliance & Documentation",
    criteria: [
      "Maintained HIPAA compliance",
      "Properly documented call notes/chart",
      "Followed script/protocol",
    ],
  },
  {
    group: "Closing",
    criteria: [
      "Summarized next steps",
      "Provided reference/callback info",
      "Professional closing",
    ],
  },
] as const;

const PRECERTIFICATION_QUALITY_RUBRIC = QUALITY_RUBRIC.map(group =>
  group.group === "Communication & Professionalism"
    ? {
        ...group,
        criteria: [
          PRIOR_AUTH_EXPLANATION_CRITERION,
          "Active listening / avoided repeat questions",
          "Appropriate tone and empathy",
        ],
      }
    : group,
);

function expectedRatingKeys(callCategory: string) {
  const rubric =
    callCategory === "Pre-certification"
      ? PRECERTIFICATION_QUALITY_RUBRIC
      : QUALITY_RUBRIC;
  return new Set(
    rubric.flatMap(group =>
    group.criteria.map(criterion => `${group.group}::${criterion}`),
    ),
  );
}

function validateRatings(
  callCategory: string,
  ratings: { group: string; criterion: string; rating: number }[],
) {
  const expectedKeys = expectedRatingKeys(callCategory);
  if (ratings.length !== expectedKeys.size) {
    throw new Error(`All ${expectedKeys.size} call-quality criteria are required.`);
  }
  const seen = new Set<string>();
  for (const rating of ratings) {
    const key = `${rating.group}::${rating.criterion}`;
    if (!expectedKeys.has(key) || seen.has(key)) {
      throw new Error("Ratings must use the required quality rubric criteria.");
    }
    if (!Number.isInteger(rating.rating) || rating.rating < 0 || rating.rating > 5) {
      throw new Error("Ratings must be whole numbers from 0 to 5.");
    }
    seen.add(key);
  }
  if (seen.size !== expectedKeys.size) {
    throw new Error("All required call-quality criteria must be provided.");
  }
}

function calculateScore(ratings: { rating: number }[]): number {
  const rated = ratings.filter(r => r.rating > 0);
  if (!rated.length) return 0;
  return Math.round(
    (rated.reduce((total, rating) => total + rating.rating, 0) / rated.length / 5) *
      100,
  );
}

function validateAuditInput(input: {
  dateReviewed: string;
  callDate: string;
  verifierName: string;
  auditorName: string;
  callDuration?: string;
  patientId?: string;
  callCategory: string;
  status: string;
  ratings: { group: string; criterion: string; rating: number }[];
}) {
  return {
    dateReviewed: validateDate(input.dateReviewed, "Date reviewed"),
    callDate: validateDate(input.callDate, "Call date"),
    verifierName: cleanRequired(input.verifierName, "Verifier"),
    auditorName: cleanRequired(input.auditorName, "Auditor"),
    callDuration: input.callDuration?.trim() || undefined,
    patientId: input.patientId?.trim() || undefined,
    callCategory: cleanRequired(input.callCategory, "Call category"),
    status: validateStatus(input.status),
  };
}

async function getCallAuditActionUser(ctx: ActionCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("You must be signed in to use Call Audits.");
  const user = await ctx.runQuery(internal.callAudits.getUserForMigration, { userId });
  if (!user?.email) throw new Error("Your Tracker account does not have an email address.");
  if (!isCallAuditAccessEmail(user.email)) {
    throw new Error("Your Tracker account is not authorized for Call Audits.");
  }
  return user;
}

export const list = query({
  args: {},
  handler: async ctx => {
    await getCallAuditUser(ctx);
    return await ctx.db.query("callAudits").order("desc").collect();
  },
});

// Count-only roll-up for the Ins Verifiers Staff Workload cards (Wence,
// 2026-08-13): the card's Call Audits number now comes from real audit
// records instead of the manually typed Intake Daily Metrics field. Any
// signed-in Tracker user can read this because it returns nothing but
// auditor names, review dates, and counts — no patient identifiers, notes,
// or recording links. Full records stay behind getCallAuditUser (list/get).
export const countsByAuditor = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const audits = await ctx.db.query("callAudits").collect();
    const byKey: Record<string, { auditorName: string; dateReviewed: string; count: number }> = {};
    for (const a of audits) {
      // Qualified Activities Total should only count finished audits, not
      // ones still Not Started/In Progress/etc. (Wence, 2026-08-26).
      if (a.status !== "Completed") continue;
      const auditorName = (a.auditorName ?? "").trim();
      if (!auditorName) continue;
      const dateReviewed = (a.dateReviewed ?? "").slice(0, 10);
      const key = `${auditorName.toLowerCase()}|${dateReviewed}`;
      byKey[key] ??= { auditorName, dateReviewed, count: 0 };
      byKey[key].count += 1;
    }
    return Object.values(byKey);
  },
});

export const get = query({
  args: { id: v.id("callAudits") },
  handler: async (ctx, args) => {
    await getCallAuditUser(ctx);
    return await ctx.db.get(args.id);
  },
});

export const listRoster = query({
  args: {},
  handler: async ctx => {
    await getCallAuditUser(ctx);
    const roster = await ctx.db.query("callAuditRoster").order("asc").collect();
    // Staff need names for audit assignment, not their colleagues' login
    // addresses. The address-to-name map remains admin-only.
    return roster.map(({ userEmail: _userEmail, ...member }) => member);
  },
});

export const listRosterAdmin = query({
  args: {},
  handler: async ctx => {
    await assertCallAuditAdmin(ctx);
    return await ctx.db.query("callAuditRoster").order("asc").collect();
  },
});

export const getMyRosterIdentity = query({
  args: {},
  handler: async ctx => {
    const user = await getCallAuditUser(ctx);
    return await ctx.db
      .query("callAuditRoster")
      .withIndex("by_email", q => q.eq("userEmail", user.email))
      .unique();
  },
});

// Action contexts cannot query the database directly. This remains internal,
// so the operational migration action can confirm the authenticated user
// against the same canonical accounts table without opening a public lookup.
export const getUserForMigration = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const email = user?.email ? normalizeCallAuditEmail(user.email) : "";
    if (!email) return null;
    return isCallAuditAccessEmail(email) ? { email } : null;
  },
});

// Keep action/HTTP callers on the same established Tracker-staff boundary as
// ordinary Call Audit queries. This is internal so staff emails are never
// exposed to browser clients.
export const getMigrationLedgerEntry = internalQuery({
  args: { sourceAuditId: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("callAuditMigrationLedger")
      .withIndex("by_sourceAuditId", q => q.eq("sourceAuditId", args.sourceAuditId))
      .unique(),
});

export const checkpointMigration = internalMutation({
  args: {
    sourceAuditId: v.string(),
    state: v.string(),
    targetAuditId: v.optional(v.id("callAudits")),
    recordingStorageId: v.optional(v.id("_storage")),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("callAuditMigrationLedger")
      .withIndex("by_sourceAuditId", q => q.eq("sourceAuditId", args.sourceAuditId))
      .unique();
    const value = { ...args, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, value);
      return existing._id;
    }
    return await ctx.db.insert("callAuditMigrationLedger", value);
  },
});

export const create = mutation({
  args: auditInput,
  handler: async (ctx, args) => {
    const user = await getCallAuditUser(ctx);
    const normalized = validateAuditInput(args);
    validateRatings(normalized.callCategory, args.ratings);
    const includesRestrictedFeedback = Boolean(
      args.notes?.trim() ||
        args.coachingStrengths?.trim() ||
        args.coachingImprovements?.trim() ||
        args.coachingRecommendation?.trim() ||
        args.docMissingIssues?.trim(),
    );
    if (includesRestrictedFeedback) {
      await assertAssignedAuditor(ctx, normalized.auditorName);
    }

    const now = Date.now();
    return await ctx.db.insert("callAudits", {
      ...args,
      ...normalized,
      score: calculateScore(args.ratings),
      createdAt: now,
      updatedAt: now,
      createdByEmail: user.email,
      updatedByEmail: user.email,
    });
  },
});

export const update = mutation({
  args: { id: v.id("callAudits"), ...auditInput },
  handler: async (ctx, { id, ...args }) => {
    const user = await getCallAuditUser(ctx);
    const current = await ctx.db.get(id);
    if (!current) throw new Error("Audit not found.");

    const normalized = validateAuditInput(args);
    validateRatings(normalized.callCategory, args.ratings);
    const restrictedFeedbackChanged =
      (args.notes ?? "") !== (current.notes ?? "") ||
      (args.coachingStrengths ?? "") !== (current.coachingStrengths ?? "") ||
      (args.coachingImprovements ?? "") !==
        (current.coachingImprovements ?? "") ||
      (args.coachingRecommendation ?? "") !==
        (current.coachingRecommendation ?? "") ||
      (args.docMissingIssues ?? "") !== (current.docMissingIssues ?? "");

    if (restrictedFeedbackChanged) {
      await assertAssignedAuditor(ctx, current.auditorName);
    }

    await ctx.db.patch(id, {
      ...args,
      ...normalized,
      score: calculateScore(args.ratings),
      updatedAt: Date.now(),
      updatedByEmail: user.email,
    });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("callAudits") },
  handler: async (ctx, args) => {
    await assertCallAuditAdmin(ctx);
    const audit = await ctx.db.get(args.id);
    if (!audit) return null;
    if (audit.videoStorageId) await ctx.storage.delete(audit.videoStorageId);
    await ctx.db.delete(args.id);
    return null;
  },
});

// A raw Convex upload URL is bearer-like, but any authorized Call Audit user
// needs to be able to attach their own recordings (only deleting audits is
// admin-only). Require a valid Call Audit login; the follow-up action
// re-validates the same access before attaching.
export const generateUploadUrl = mutation({
  args: {},
  handler: async ctx => {
    await getCallAuditUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const attachUploadedVideo = action({
  args: {
    id: v.id("callAudits"),
    storageId: v.id("_storage"),
    contentType: v.string(),
    sizeBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCallAuditActionUser(ctx);
    const metadata = await ctx.storage.getMetadata(args.storageId);
    const blob = await ctx.storage.get(args.storageId);
    const invalid = async (message: string) => {
      await ctx.storage.delete(args.storageId);
      throw new Error(message);
    };

    if (
      !metadata ||
      !blob ||
      !metadata.contentType ||
      !ACCEPTED_VIDEO_TYPES.has(metadata.contentType) ||
      metadata.size <= 0 ||
      metadata.size > MAX_VIDEO_BYTES ||
      !Number.isFinite(args.sizeBytes) ||
      args.sizeBytes !== metadata.size ||
      args.contentType !== metadata.contentType
    ) {
      return await invalid("Uploaded recording must be an MP4, WebM, or QuickTime video no larger than 750 MB.");
    }

    // Read only the first streamed chunk, rather than buffering a potentially
    // 750 MB upload just to inspect its file signature.
    const reader = blob.stream().getReader();
    const firstChunk = await reader.read();
    await reader.cancel();
    const signature = firstChunk.value?.subarray(0, 16) ?? new Uint8Array();
    const hasMp4Signature =
      signature.length >= 8 &&
      String.fromCharCode(...signature.slice(4, 8)) === "ftyp";
    const hasWebmSignature =
      signature.length >= 4 &&
      signature[0] === 0x1a &&
      signature[1] === 0x45 &&
      signature[2] === 0xdf &&
      signature[3] === 0xa3;
    if (!hasMp4Signature && !hasWebmSignature) {
      return await invalid("Uploaded recording content is not a supported video file.");
    }

    await ctx.runMutation(internal.callAudits.attachVerifiedVideo, {
      id: args.id,
      storageId: args.storageId,
      updatedByEmail: user.email,
    });
    return null;
  },
});

export const getRecordingForHttp = internalQuery({
  args: { id: v.id("callAudits") },
  handler: async (ctx, args) => {
    const audit = await ctx.db.get(args.id);
    return audit
      ? { videoStorageId: audit.videoStorageId }
      : null;
  },
});

export const attachVerifiedVideo = internalMutation({
  args: {
    id: v.id("callAudits"),
    storageId: v.id("_storage"),
    updatedByEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const audit = await ctx.db.get(args.id);
    if (!audit) throw new Error("Audit not found.");
    if (audit.videoStorageId && audit.videoStorageId !== args.storageId) {
      await ctx.storage.delete(audit.videoStorageId);
    }
    await ctx.db.patch(args.id, {
      videoStorageId: args.storageId,
      updatedAt: Date.now(),
      updatedByEmail: args.updatedByEmail,
    });
    return null;
  },
});

export const addRosterMember = mutation({
  args: { name: v.string(), userEmail: v.string() },
  handler: async (ctx, args) => {
    const admin = await assertCallAuditAdmin(ctx);
    const name = cleanRequired(args.name, "Name");
    const userEmail = normalizeCallAuditEmail(args.userEmail);
    if (!userEmail.includes("@")) throw new Error("A valid Tracker email is required.");

    const existingName = await ctx.db
      .query("callAuditRoster")
      .withIndex("by_name", q => q.eq("normalizedName", normalizeCallAuditName(name)))
      .unique();
    const existingEmail = await ctx.db
      .query("callAuditRoster")
      .withIndex("by_email", q => q.eq("userEmail", userEmail))
      .unique();
    if (existingName || existingEmail) {
      throw new Error("That roster name or Tracker email is already mapped.");
    }

    const trackerStaff = (await ctx.db.query("staff").collect()).find(
      staff => normalizeCallAuditEmail(staff.email ?? "") === userEmail,
    );
    if (!trackerStaff) {
      throw new Error("That email is not in the SMB Beltline Tracker staff directory.");
    }

    const now = Date.now();
    const rosterId = await ctx.db.insert("callAuditRoster", {
      name,
      normalizedName: normalizeCallAuditName(name),
      userEmail,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("callAuditRosterChanges", {
      action: "added",
      rosterName: name,
      userEmail,
      performedByEmail: admin.email,
      createdAt: now,
    });
    return rosterId;
  },
});

export const deactivateRosterMember = mutation({
  args: { id: v.id("callAuditRoster") },
  handler: async (ctx, args) => {
    const admin = await assertCallAuditAdmin(ctx);
    const roster = await ctx.db.get(args.id);
    if (!roster) throw new Error("Roster member not found.");
    if (!roster.active) return null;

    const now = Date.now();
    await ctx.db.patch(args.id, { active: false, updatedAt: now });
    await ctx.db.insert("callAuditRosterChanges", {
      action: "deactivated",
      rosterName: roster.name,
      userEmail: roster.userEmail,
      performedByEmail: admin.email,
      createdAt: now,
    });
    return null;
  },
});

// One-time convenience seed: these eight mappings were reconciled against
// the Tracker staff directory and existing accounts before the migration.
// It is admin-only and additive—never overwrites an admin's later mapping.
export const seedVerifiedRoster = mutation({
  args: {},
  handler: async ctx => {
    const admin = await assertCallAuditAdmin(ctx);
    const existing = await ctx.db.query("callAuditRoster").collect();
    if (existing.length > 0) {
      throw new Error("Call Audit roster already has entries; use roster management instead.");
    }

    const staff = await ctx.db.query("staff").collect();
    const knownEmails = new Set(
      staff.map(member => normalizeCallAuditEmail(member.email ?? "")),
    );
    for (const member of VERIFIED_SOURCE_ROSTER) {
      if (!knownEmails.has(member.userEmail)) {
        throw new Error("A verified roster email is missing from the Tracker directory.");
      }
    }

    const now = Date.now();
    for (const member of VERIFIED_SOURCE_ROSTER) {
      await ctx.db.insert("callAuditRoster", {
        name: member.name,
        normalizedName: normalizeCallAuditName(member.name),
        userEmail: member.userEmail,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("callAuditRosterChanges", {
        action: "initialVerifiedSeed",
        rosterName: member.name,
        userEmail: member.userEmail,
        performedByEmail: admin.email,
        createdAt: now,
      });
    }
    return { seeded: VERIFIED_SOURCE_ROSTER.length };
  },
});

// Internal migration-only upsert. It cannot be reached from a browser and is
// deliberately separated from staff-facing audit creation/update functions.
export const importSourceAudit = internalMutation({
  args: {
    sourceAuditId: v.string(),
    dateReviewed: v.string(),
    callDate: v.string(),
    verifierName: v.string(),
    auditorName: v.string(),
    callDuration: v.optional(v.string()),
    patientId: v.optional(v.string()),
    callCategory: v.string(),
    status: v.string(),
    videoStorageId: v.optional(v.id("_storage")),
    ratings: v.array(ratingValidator),
    notes: v.optional(v.string()),
    coachingStrengths: v.optional(v.string()),
    coachingImprovements: v.optional(v.string()),
    coachingRecommendation: v.optional(v.string()),
    docNotesIncomplete: v.optional(v.boolean()),
    docNotesComplete: v.optional(v.boolean()),
    docMissingIssues: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const normalized = validateAuditInput(args);
    validateRatings(normalized.callCategory, args.ratings);
    const existing = await ctx.db
      .query("callAudits")
      .withIndex("by_sourceAuditId", q => q.eq("sourceAuditId", args.sourceAuditId))
      .unique();
    const value = {
      ...args,
      ...normalized,
      score: calculateScore(args.ratings),
      migratedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, value);
      return existing._id;
    }
    return await ctx.db.insert("callAudits", value);
  },
});
