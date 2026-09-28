import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import {
  assertCallAuditAdmin,
  assertIntakeAssignedAuditor,
  getCallAuditUser,
  isCallAuditAccessEmail,
} from "./callAuditPermissions";
import { RESTRICTED_ACTION_EMAILS } from "./permissions";

// Intake Call Audits — migrated from the Base44 `intake-call-audits` app
// (2026-08-17, Wence picked "two tabs" over one merged table). Access rules are
// identical to Verification Call Audits: only approved Tracker accounts can
// read/write, only the four Tracker admins can delete.

const MAX_VIDEO_BYTES = 750 * 1024 * 1024;
// Intake call recordings are audio (Base44 stored MP3s); the team may also
// upload screen recordings, so both media families are accepted here.
const ACCEPTED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
]);

export const INTAKE_CALL_CATEGORIES = [
  "Inbound - Appt Concern",
  "Inbound - MA Concern",
  "Inbound - Billing Concern",
  "Inbound - Others",
] as const;

export const INTAKE_AUDIT_STATUSES = ["Open", "In Progress", "Completed"] as const;
export const INTAKE_RESULTS = ["Pass", "Fail"] as const;
export const INTAKE_RISK_LEVELS = [
  "Low Risk",
  "Moderate Risk",
  "High Risk",
] as const;

const scoreValidator = v.optional(
  v.object({
    greetingProfessionalOpening: v.optional(v.number()),
    greetingIntroducedSelf: v.optional(v.number()),
    greetingAcknowledgment: v.optional(v.number()),
    communicationClearExplanation: v.optional(v.number()),
    communicationActiveListening: v.optional(v.number()),
    communicationEmpathy: v.optional(v.number()),
    communicationProfessionalTone: v.optional(v.number()),
    communicationAvoidedInterruptions: v.optional(v.number()),
    handlingAccurateInfo: v.optional(v.number()),
    handlingConfirmedDetails: v.optional(v.number()),
    handlingEfficientFlow: v.optional(v.number()),
    handlingProperScheduling: v.optional(v.number()),
    closingSummarizedNextSteps: v.optional(v.number()),
    closingAskedAdditionalAssistance: v.optional(v.number()),
    closingRightDepartment: v.optional(v.number()),
    closingProfessionalClosing: v.optional(v.number()),
    closingDocumentation: v.optional(v.number()),
    hipaaVerifiedIdentity: v.optional(v.number()),
    hipaaProtectedInfo: v.optional(v.number()),
  }),
);

const documentationValidator = v.optional(
  v.object({
    chartUpdated: v.optional(v.boolean()),
    notesComplete: v.optional(v.boolean()),
    followupDocumented: v.optional(v.boolean()),
    missingIssues: v.optional(v.string()),
  }),
);

const coachingValidator = v.optional(
  v.object({
    strengths: v.optional(v.string()),
    improvements: v.optional(v.string()),
    recommendation: v.optional(v.string()),
    notes: v.optional(v.string()),
  }),
);

const auditInput = {
  callDate: v.string(),
  intakeSpecialist: v.string(),
  auditor: v.string(),
  callCategory: v.string(),
  duration: v.optional(v.string()),
  // QA/Compliance are derived server-side from the star rubric (see
  // computeQaScore/computeComplianceScore below), same as Base44's
  // auto-calc. Kept optional here for backward compatibility with old
  // client payloads; whatever is sent is ignored and recomputed.
  qaScore: v.optional(v.number()),
  complianceScore: v.optional(v.number()),
  finalResult: v.string(),
  // Derived server-side from complianceScore (see computeRiskLevel below),
  // same Base44-parity treatment as qaScore/complianceScore. Optional for
  // backward compatibility with old client payloads; ignored and recomputed.
  riskLevel: v.optional(v.string()),
  status: v.string(),
  notes: v.optional(v.string()),
  chart: v.optional(v.string()),
  dateReviewed: v.optional(v.string()),
  scores: scoreValidator,
  documentation: documentationValidator,
  coaching: coachingValidator,
};

type RubricScores = NonNullable<typeof scoreValidator.type>;
type DocumentationReview = NonNullable<typeof documentationValidator.type>;
type CoachingNotes = NonNullable<typeof coachingValidator.type>;

// Base44 stored every rubric criterion as 1-5 (or null when not scored).
function validateRubric(scores?: RubricScores): RubricScores | undefined {
  if (!scores) return undefined;
  for (const [key, value] of Object.entries(scores)) {
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value < 0 || value > 5) {
      throw new Error(`${key} must be between 0 and 5.`);
    }
  }
  return scores;
}

function trimmedOrUndefined(value?: string): string | undefined {
  return value?.trim() || undefined;
}

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

function oneOf(value: string, allowed: readonly string[], field: string): string {
  const cleaned = value.trim();
  if (!allowed.includes(cleaned)) throw new Error(`Invalid ${field}.`);
  return cleaned;
}

function validateScore(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${field} must be between 0 and 100.`);
  }
  return Math.round(value);
}

const ALL_RUBRIC_KEYS: (keyof RubricScores)[] = [
  "greetingProfessionalOpening",
  "greetingIntroducedSelf",
  "greetingAcknowledgment",
  "communicationClearExplanation",
  "communicationActiveListening",
  "communicationEmpathy",
  "communicationProfessionalTone",
  "communicationAvoidedInterruptions",
  "handlingAccurateInfo",
  "handlingConfirmedDetails",
  "handlingEfficientFlow",
  "handlingProperScheduling",
  "closingSummarizedNextSteps",
  "closingAskedAdditionalAssistance",
  "closingRightDepartment",
  "closingProfessionalClosing",
  "closingDocumentation",
  "hipaaVerifiedIdentity",
  "hipaaProtectedInfo",
];

const HIPAA_RUBRIC_KEYS: (keyof RubricScores)[] = [
  "hipaaVerifiedIdentity",
  "hipaaProtectedInfo",
];

// Base44 auto-calculated QA % and Compliance % from the 1-5 star rubric
// instead of taking manual numbers, and a 0 rating means "not applicable"
// (excluded from the average, not counted as a 0). Reverse-engineered from
// 24 of 25 migrated + manually-entered rows matching this exactly (the 25th
// was the broken EXAMPLE-ID record that had qaScore/complianceScore stuck at
// 0% because the old form left them as unfilled manual inputs) — see
// skills/users/u0bg75u1yue for the investigation. [2026-08-20]
function averageRubricPercent(scores: RubricScores | undefined, keys: (keyof RubricScores)[]) {
  if (!scores) return 0;
  const rated = keys
    .map(key => scores[key])
    .filter((value): value is number => typeof value === "number" && value > 0);
  if (rated.length === 0) return 0;
  const sum = rated.reduce((total, value) => total + value, 0);
  return Math.round((sum / (rated.length * 5)) * 100);
}

function computeQaScore(scores: RubricScores | undefined): number {
  return averageRubricPercent(scores, ALL_RUBRIC_KEYS);
}

function computeComplianceScore(scores: RubricScores | undefined): number {
  return averageRubricPercent(scores, HIPAA_RUBRIC_KEYS);
}

// A completed Intake Call Audit passes only when the QA score meets the
// 85-point floor and every Compliance item is satisfied (100%). This is
// calculated server-side so the saved outcome cannot be overridden by a form
// submission or a direct client mutation.
function calculateFinalResult(qaScore: number, complianceScore: number) {
  return qaScore >= 85 && complianceScore === 100 ? "Pass" : "Fail";
}

// Base44 also derived Risk Level from the Compliance % rather than a manual
// pick. Reverse-engineered from the migrated data: Compliance 100 -> Low,
// 60-99 -> Moderate, below 60 -> High. 24 of 25 rows matched exactly; the one
// exception (EXAMPLE-ID, Compliance 100 but manually flagged "Moderate Risk")
// is a human override we intentionally do not preserve — confirmed with
// Wence 2026-08-20 before switching this to full auto-calc. [2026-08-20]
function computeRiskLevel(complianceScore: number): (typeof INTAKE_RISK_LEVELS)[number] {
  if (complianceScore >= 100) return "Low Risk";
  if (complianceScore >= 60) return "Moderate Risk";
  return "High Risk";
}

function validateInput(input: {
  callDate: string;
  intakeSpecialist: string;
  auditor: string;
  callCategory: string;
  duration?: string;
  qaScore?: number;
  complianceScore?: number;
  finalResult: string;
  riskLevel?: string;
  status: string;
  notes?: string;
  chart?: string;
  dateReviewed?: string;
  scores?: RubricScores;
  documentation?: DocumentationReview;
  coaching?: CoachingNotes;
}) {
  const rubric = validateRubric(input.scores);
  // Always derived from the rubric server-side (Base44 parity) — any
  // qaScore/complianceScore a client sends is ignored.
  const qaScore = validateScore(computeQaScore(rubric), "QA score");
  const complianceScore = validateScore(
    computeComplianceScore(rubric),
    "Compliance score",
  );
  return {
    callDate: validateDate(input.callDate, "Call date"),
    intakeSpecialist: cleanRequired(input.intakeSpecialist, "Intake specialist"),
    auditor: cleanRequired(input.auditor, "Auditor"),
    callCategory: oneOf(input.callCategory, INTAKE_CALL_CATEGORIES, "call category"),
    duration: input.duration?.trim() || undefined,
    qaScore,
    complianceScore,
    finalResult: calculateFinalResult(qaScore, complianceScore),
    // Always derived from complianceScore server-side (Base44 parity) — any
    // riskLevel a client sends is ignored, same as qaScore/complianceScore.
    riskLevel: computeRiskLevel(complianceScore),
    status: oneOf(input.status, INTAKE_AUDIT_STATUSES, "status"),
    notes: trimmedOrUndefined(input.notes),
    chart: trimmedOrUndefined(input.chart),
    dateReviewed: input.dateReviewed
      ? validateDate(input.dateReviewed, "Date reviewed")
      : undefined,
    scores: rubric,
    documentation: input.documentation
      ? {
          ...input.documentation,
          missingIssues: trimmedOrUndefined(input.documentation.missingIssues),
        }
      : undefined,
    coaching: input.coaching
      ? {
          strengths: trimmedOrUndefined(input.coaching.strengths),
          improvements: trimmedOrUndefined(input.coaching.improvements),
          recommendation: trimmedOrUndefined(input.coaching.recommendation),
          notes: trimmedOrUndefined(input.coaching.notes),
        }
      : undefined,
  };
}

async function getIntakeAuditActionUser(ctx: ActionCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("You must be signed in to use Call Audits.");
  const user = await ctx.runQuery(internal.callAudits.getUserForMigration, {
    userId,
  });
  if (!user?.email) {
    throw new Error("Your Tracker account does not have an email address.");
  }
  if (!isCallAuditAccessEmail(user.email)) {
    throw new Error("Your Tracker account is not authorized for Call Audits.");
  }
  if (!RESTRICTED_ACTION_EMAILS.includes(user.email.toLowerCase().trim())) {
    throw new Error("Only Tracker admins can manage or delete Call Audits.");
  }
  return user;
}

/**
 * Restricted feedback mirrors Verification: the free-text coaching and notes
 * an auditor writes about a specialist. Scores and status stay open to any
 * Call Audits user.
 */
function restrictedFeedbackOf(row: {
  notes?: string;
  documentation?: DocumentationReview;
  coaching?: CoachingNotes;
}) {
  return [
    row.notes ?? "",
    row.documentation?.missingIssues ?? "",
    row.coaching?.strengths ?? "",
    row.coaching?.improvements ?? "",
    row.coaching?.recommendation ?? "",
    row.coaching?.notes ?? "",
  ].join("\u0000");
}

export const list = query({
  args: {},
  handler: async ctx => {
    const user = await getCallAuditUser(ctx);
    const rows = await ctx.db.query("intakeCallAudits").order("desc").collect();
    const out = [];
    for (const row of rows) {
      const reactions = await ctx.db
        .query("intakeCallAuditReactions")
        .withIndex("by_audit", q => q.eq("auditId", row._id))
        .collect();
      const byEmoji: Record<string, { count: number; names: string[] }> = {};
      let myReaction: string | null = null;
      for (const r of reactions) {
        let bucket = byEmoji[r.emoji];
        if (!bucket) {
          bucket = { count: 0, names: [] };
          byEmoji[r.emoji] = bucket;
        }
        bucket.count += 1;
        bucket.names.push(r.userName);
        if (r.userKey === user.email) myReaction = r.emoji;
      }
      out.push({ ...row, reactions: byEmoji, myReaction });
    }
    return out;
  },
});

export const get = query({
  args: { id: v.id("intakeCallAudits") },
  handler: async (ctx, args) => {
    await getCallAuditUser(ctx);
    return await ctx.db.get(args.id);
  },
});

// One reaction per user per audit (Wence, 2026-08-18: "only 1 react per 1
// user no multiple"). Clicking the emoji you already picked removes it;
// picking a different emoji swaps it. Any approved Call Audits user may
// react (Wence: "all users").
export const setReaction = mutation({
  args: {
    auditId: v.id("intakeCallAudits"),
    emoji: v.union(
      v.literal("thumbsup"),
      v.literal("star"),
      v.literal("clap"),
      v.literal("heart"),
      v.literal("bulb"),
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCallAuditUser(ctx);
    const audit = await ctx.db.get(args.auditId);
    if (!audit) throw new Error("Audit not found.");
    const existing = await ctx.db
      .query("intakeCallAuditReactions")
      .withIndex("by_audit_user", q =>
        q.eq("auditId", args.auditId).eq("userKey", user.email),
      )
      .unique();
    if (existing && existing.emoji === args.emoji) {
      await ctx.db.delete(existing._id);
      return { emoji: null };
    }
    if (existing) {
      await ctx.db.patch(existing._id, { emoji: args.emoji, createdAt: Date.now() });
      return { emoji: args.emoji };
    }
    await ctx.db.insert("intakeCallAuditReactions", {
      auditId: args.auditId,
      emoji: args.emoji,
      userKey: user.email,
      userName: user.name || user.email,
      createdAt: Date.now(),
    });
    return { emoji: args.emoji };
  },
});

export const create = mutation({
  args: auditInput,
  handler: async (ctx, args) => {
    const user = await assertCallAuditAdmin(ctx);
    const normalized = validateInput(args);
    if (restrictedFeedbackOf(normalized).trim()) {
      await assertIntakeAssignedAuditor(ctx, normalized.auditor);
    }
    const now = Date.now();
    return await ctx.db.insert("intakeCallAudits", {
      ...normalized,
      createdAt: now,
      updatedAt: now,
      createdByEmail: user.email,
      updatedByEmail: user.email,
    });
  },
});

export const update = mutation({
  args: { id: v.id("intakeCallAudits"), ...auditInput },
  handler: async (ctx, { id, ...args }) => {
    const user = await assertCallAuditAdmin(ctx);
    const current = await ctx.db.get(id);
    if (!current) throw new Error("Audit not found.");
    const normalized = validateInput(args);
    if (restrictedFeedbackOf(normalized) !== restrictedFeedbackOf(current)) {
      await assertIntakeAssignedAuditor(ctx, current.auditor);
    }
    await ctx.db.patch(id, {
      ...normalized,
      updatedAt: Date.now(),
      updatedByEmail: user.email,
    });
    return null;
  },
});

/** Update only the list-facing workflow status without opening the full audit. */
export const updateStatus = mutation({
  args: {
    id: v.id("intakeCallAudits"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await assertCallAuditAdmin(ctx);
    const status = oneOf(args.status, INTAKE_AUDIT_STATUSES, "status");
    const audit = await ctx.db.get(args.id);
    if (!audit) throw new Error("Audit not found.");
    await ctx.db.patch(args.id, {
      status,
      updatedAt: Date.now(),
      updatedByEmail: user.email,
    });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("intakeCallAudits") },
  handler: async (ctx, args) => {
    await assertCallAuditAdmin(ctx);
    const audit = await ctx.db.get(args.id);
    if (!audit) return null;
    if (audit.videoStorageId) await ctx.storage.delete(audit.videoStorageId);
    const reactions = await ctx.db
      .query("intakeCallAuditReactions")
      .withIndex("by_audit", q => q.eq("auditId", args.id))
      .collect();
    for (const r of reactions) await ctx.db.delete(r._id);
    await ctx.db.delete(args.id);
    return null;
  },
});

export const purgeSelected = mutation({
  args: {
    ids: v.array(v.id("intakeCallAudits")),
    area: v.union(
      v.literal("reactions"),
      v.literal("audits"),
      v.literal("both"),
    ),
  },
  handler: async (ctx, args) => {
    await assertCallAuditAdmin(ctx);
    const ids = [...new Set(args.ids)];
    if (ids.length === 0) throw new Error("Select at least one audit.");
    if (ids.length > 500) throw new Error("You can purge up to 500 audits at a time.");

    let auditsDeleted = 0;
    let reactionsDeleted = 0;
    for (const id of ids) {
      const audit = await ctx.db.get(id);
      if (!audit) continue;
      const reactions = await ctx.db
        .query("intakeCallAuditReactions")
        .withIndex("by_audit", q => q.eq("auditId", id))
        .collect();
      for (const reaction of reactions) {
        await ctx.db.delete(reaction._id);
        reactionsDeleted += 1;
      }
      if (args.area !== "reactions") {
        if (audit.videoStorageId) await ctx.storage.delete(audit.videoStorageId);
        await ctx.db.delete(id);
        auditsDeleted += 1;
      }
    }
    return { auditsDeleted, reactionsDeleted };
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async ctx => {
    await assertCallAuditAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const attachUploadedVideo = action({
  args: {
    id: v.id("intakeCallAudits"),
    storageId: v.id("_storage"),
    contentType: v.string(),
    sizeBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getIntakeAuditActionUser(ctx);
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
      return await invalid(
        "Uploaded recording must be an MP4, WebM, or QuickTime video no larger than 750 MB.",
      );
    }

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
    const hasMp3Signature =
      signature.length >= 3 &&
      ((signature[0] === 0x49 && signature[1] === 0x44 && signature[2] === 0x33) || // ID3
        (signature[0] === 0xff && (signature[1] & 0xe0) === 0xe0)); // MPEG frame sync
    const hasWavSignature =
      signature.length >= 12 &&
      String.fromCharCode(...signature.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...signature.slice(8, 12)) === "WAVE";
    if (
      !hasMp4Signature &&
      !hasWebmSignature &&
      !hasMp3Signature &&
      !hasWavSignature
    ) {
      return await invalid(
        "Uploaded recording content is not a supported audio or video file.",
      );
    }

    await ctx.runMutation(internal.intakeCallAudits.attachVerifiedVideo, {
      id: args.id,
      storageId: args.storageId,
      updatedByEmail: user.email,
    });
    return null;
  },
});

export const attachVerifiedVideo = internalMutation({
  args: {
    id: v.id("intakeCallAudits"),
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

export const getRecordingForHttp = internalQuery({
  args: { id: v.id("intakeCallAudits") },
  handler: async (ctx, args) => {
    const audit = await ctx.db.get(args.id);
    return audit ? { videoStorageId: audit.videoStorageId } : null;
  },
});

// --- Base44 migration helpers -------------------------------------------
// Internal only: reachable from the Convex CLI during the one-time migration,
// never from a browser client.

export const generateMigrationUploadUrl = internalMutation({
  args: {},
  handler: async ctx => await ctx.storage.generateUploadUrl(),
});

// One-time backfill (2026-08-20, Wence: "fix score not populating", then
// "yes" to auto-calculating Risk Level too): recomputes
// qaScore/complianceScore/finalResult/riskLevel from each row's star rubric
// now that those are server-derived instead of manual inputs. Idempotent —
// re-running is a no-op for rows already matching the formula. Note: this
// intentionally overwrites any manually-set riskLevel that disagreed with the
// formula (one migrated row, EXAMPLE-ID, had a manual "Moderate Risk" override
// at 100% compliance — Wence confirmed switching to full auto-calc anyway).
// Safe to call from the CLI once and forget.
export const recalculateAllScores = internalMutation({
  args: {},
  handler: async ctx => {
    const rows = await ctx.db.query("intakeCallAudits").collect();
    let updated = 0;
    for (const row of rows) {
      const qaScore = computeQaScore(row.scores);
      const complianceScore = computeComplianceScore(row.scores);
      const finalResult = calculateFinalResult(qaScore, complianceScore);
      const riskLevel = computeRiskLevel(complianceScore);
      if (
        qaScore !== row.qaScore ||
        complianceScore !== row.complianceScore ||
        finalResult !== row.finalResult ||
        riskLevel !== row.riskLevel
      ) {
        await ctx.db.patch(row._id, {
          qaScore,
          complianceScore,
          finalResult,
          riskLevel,
        });
        updated += 1;
      }
    }
    return { checked: rows.length, updated };
  },
});

export const attachMigratedRecording = internalMutation({
  args: { sourceAuditId: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const audit = await ctx.db
      .query("intakeCallAudits")
      .withIndex("by_sourceAuditId", q =>
        q.eq("sourceAuditId", args.sourceAuditId),
      )
      .unique();
    if (!audit) throw new Error(`No audit for source ${args.sourceAuditId}`);
    if (audit.videoStorageId && audit.videoStorageId !== args.storageId) {
      await ctx.storage.delete(audit.videoStorageId);
    }
    await ctx.db.patch(audit._id, {
      videoStorageId: args.storageId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

// Removes never-edited migrated rows so the import can be re-run from a better
// source. Anything a Tracker user touched (updatedByEmail set) is kept.
export const purgeUntouchedImports = internalMutation({
  args: {},
  handler: async ctx => {
    const rows = await ctx.db.query("intakeCallAudits").collect();
    let deleted = 0;
    let kept = 0;
    for (const row of rows) {
      if (row.migratedAt && !row.updatedByEmail) {
        if (row.videoStorageId) await ctx.storage.delete(row.videoStorageId);
        await ctx.db.delete(row._id);
        deleted += 1;
      } else {
        kept += 1;
      }
    }
    return { deleted, kept };
  },
});

// Idempotent import used once for the Base44 migration. Internal: runnable only
// from the Convex CLI/operator context, never from a browser client.
export const importRows = internalMutation({
  args: {
    rows: v.array(v.object({ sourceAuditId: v.string(), ...auditInput })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let inserted = 0;
    let skipped = 0;
    for (const row of args.rows) {
      const { sourceAuditId, ...rest } = row;
      const existing = await ctx.db
        .query("intakeCallAudits")
        .withIndex("by_sourceAuditId", q => q.eq("sourceAuditId", sourceAuditId))
        .unique();
      if (existing) {
        skipped += 1;
        continue;
      }
      await ctx.db.insert("intakeCallAudits", {
        sourceAuditId,
        ...validateInput(rest),
        createdAt: now,
        updatedAt: now,
        migratedAt: now,
      });
      inserted += 1;
    }
    const total = (await ctx.db.query("intakeCallAudits").collect()).length;
    return { inserted, skipped, total };
  },
});
