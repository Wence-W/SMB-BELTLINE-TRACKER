"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { RESTRICTED_ACTION_EMAILS } from "./permissions";

const SOURCE_CONVEX_URL = "https://quaint-parrot-788.convex.cloud";
const SOURCE_AUDITS_FUNCTION = "callAudits:listAll";
const MAX_VIDEO_BYTES = 750 * 1024 * 1024;
const ACCEPTED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

type SourceRating = { group: string; criterion: string; rating: number };
type SourceAudit = {
  _id: string;
  dateReviewed: string;
  callDate: string;
  verifierName: string;
  auditorName: string;
  callDuration?: string;
  chartNumber?: string;
  callCategory: string;
  status: string;
  ratings: SourceRating[];
  notes?: string;
  coachingStrengths?: string;
  coachingImprovements?: string;
  coachingRecommendation?: string;
  docChartUpdated?: boolean;
  docNotesComplete?: boolean;
  docMissingIssues?: string;
  createdAt: number;
  updatedAt: number;
  videoUrl?: string | null;
};

async function sourceAudits(): Promise<SourceAudit[]> {
  const response = await fetch(`${SOURCE_CONVEX_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: SOURCE_AUDITS_FUNCTION,
      args: {},
      format: "json",
    }),
  });
  if (!response.ok) throw new Error(`Source inventory request failed (${response.status}).`);
  const body = (await response.json()) as { status?: string; value?: SourceAudit[] };
  if (body.status !== "success" || !Array.isArray(body.value)) {
    throw new Error("Source inventory response was invalid.");
  }
  return body.value;
}

function assertSourceRecordingUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.origin !== SOURCE_CONVEX_URL ||
    !/^\/api\/storage\/[0-9a-f-]{36}$/i.test(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new Error("Source recording URL failed the migration allowlist.");
  }
  return url;
}

async function copySourceRecording(
  ctx: ActionCtx,
  sourceUrl: string,
) {
  // `videoUrl` comes from an old, broadly public deployment. Pinning its
  // origin/path prevents a poisoned source row from turning migration into an
  // arbitrary internal fetch (SSRF).
  const recording = await fetch(assertSourceRecordingUrl(sourceUrl), {
    redirect: "error",
  });
  const contentLength = Number(recording.headers.get("content-length") ?? "0");
  const contentType = recording.headers.get("content-type")?.split(";")[0] ?? "";
  if (
    !recording.ok ||
    !recording.body ||
    !ACCEPTED_VIDEO_TYPES.has(contentType) ||
    !Number.isFinite(contentLength) ||
    contentLength <= 0 ||
    contentLength > MAX_VIDEO_BYTES
  ) {
    throw new Error("Source recording validation failed.");
  }

  const reader = recording.body.getReader();
  const buffered: Uint8Array[] = [];
  let bufferedBytes = 0;
  while (bufferedBytes < 16) {
    const next = await reader.read();
    if (next.done || !next.value?.byteLength) break;
    buffered.push(next.value);
    bufferedBytes += next.value.byteLength;
  }
  const firstBytes = new Uint8Array(bufferedBytes);
  let offset = 0;
  for (const chunk of buffered) {
    firstBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const hasMp4Signature =
    firstBytes.length >= 8 &&
    String.fromCharCode(...firstBytes.slice(4, 8)) === "ftyp";
  const hasWebmSignature =
    firstBytes.length >= 4 &&
    firstBytes[0] === 0x1a &&
    firstBytes[1] === 0x45 &&
    firstBytes[2] === 0xdf &&
    firstBytes[3] === 0xa3;
  if (!hasMp4Signature && !hasWebmSignature) {
    await reader.cancel();
    throw new Error("Source recording content is not a supported video file.");
  }

  let streamedBytes = bufferedBytes;
  const checkedBody = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of buffered) controller.enqueue(chunk);
    },
    async pull(controller) {
      const next = await reader.read();
      if (next.done) {
        controller.close();
        return;
      }
      streamedBytes += next.value.byteLength;
      if (streamedBytes > MAX_VIDEO_BYTES) {
        await reader.cancel();
        controller.error(new Error("Source recording exceeds the 750 MB limit."));
        return;
      }
      controller.enqueue(next.value);
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });

  const uploadUrl = await ctx.storage.generateUploadUrl();
  const upload = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: checkedBody,
    // @ts-expect-error Node fetch requires duplex for streamed request bodies.
    duplex: "half",
  });
  if (!upload.ok) throw new Error("Target recording upload failed.");
  const uploaded = (await upload.json()) as {
    storageId?: import("./_generated/dataModel").Id<"_storage">;
  };
  if (!uploaded.storageId) throw new Error("Target recording upload returned no ID.");
  if (streamedBytes !== contentLength) {
    await ctx.storage.delete(uploaded.storageId);
    throw new Error("Source recording size changed during migration.");
  }
  return uploaded.storageId;
}

export const migrateAll = action({
  args: {},
  returns: v.object({
    imported: v.number(),
    skipped: v.number(),
    recordingsCopied: v.number(),
    failed: v.number(),
  }),
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("You must be signed in to run migration.");
    const user = await ctx.runQuery(internal.callAudits.getUserForMigration, {
      userId,
    });
    if (!user?.email || !RESTRICTED_ACTION_EMAILS.includes(user.email)) {
      throw new Error("Only Tracker admins may run migration.");
    }
    const audits = await sourceAudits();
    let imported = 0;
    let skipped = 0;
    let recordingsCopied = 0;
    let failed = 0;

    for (const source of audits) {
      try {
        const ledger = await ctx.runQuery(internal.callAudits.getMigrationLedgerEntry, {
          sourceAuditId: source._id,
        });
        if (ledger?.state === "complete" && ledger.targetAuditId) {
          skipped += 1;
          continue;
        }

        await ctx.runMutation(internal.callAudits.checkpointMigration, {
          sourceAuditId: source._id,
          state: "copying",
        });

        let recordingStorageId = ledger?.recordingStorageId;
        if (!recordingStorageId && source.videoUrl) {
          recordingStorageId = await copySourceRecording(ctx, source.videoUrl);
          recordingsCopied += 1;
          await ctx.runMutation(internal.callAudits.checkpointMigration, {
            sourceAuditId: source._id,
            state: "recordingCopied",
            recordingStorageId,
          });
        }

        const targetAuditId = await ctx.runMutation(internal.callAudits.importSourceAudit, {
          sourceAuditId: source._id,
          dateReviewed: source.dateReviewed,
          callDate: source.callDate,
          verifierName: source.verifierName,
          auditorName: source.auditorName,
          callDuration: source.callDuration,
          patientId: source.chartNumber,
          callCategory: source.callCategory,
          status: source.status,
          videoStorageId: recordingStorageId,
          ratings: source.ratings,
          notes: source.notes,
          coachingStrengths: source.coachingStrengths,
          coachingImprovements: source.coachingImprovements,
          coachingRecommendation: source.coachingRecommendation,
          docNotesIncomplete: source.docChartUpdated,
          docNotesComplete: source.docNotesComplete,
          docMissingIssues: source.docMissingIssues,
          createdAt: source.createdAt,
          updatedAt: source.updatedAt,
        });
        await ctx.runMutation(internal.callAudits.checkpointMigration, {
          sourceAuditId: source._id,
          state: "complete",
          targetAuditId,
          recordingStorageId,
        });
        imported += 1;
      } catch {
        failed += 1;
        // Never store or surface record details, patient data, or media URLs in
        // operational error state. A pre-existing copied recording is retained
        // in the ledger and reused by retry rather than copied again.
        await ctx.runMutation(internal.callAudits.checkpointMigration, {
          sourceAuditId: source._id,
          state: "failed",
          lastError: "Migration step failed; retry after operator review.",
        });
      }
    }

    return { imported, skipped, recordingsCopied, failed };
  },
});
