import { httpRouter } from "convex/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { RESTRICTED_ACTION_EMAILS } from "./permissions";
import type { Id } from "./_generated/dataModel";
import { auth } from "./auth";

declare const process: { env: Record<string, string | undefined> };

const http = httpRouter();
// Registers Convex Auth's routes, including the OAuth endpoints used by
// "Sign in with Viktor": /api/auth/signin/viktor and /api/auth/callback/viktor.
auth.addHttpRoutes(http);

const allowedRecordingOrigins = new Set(
  [
    process.env.SITE_URL,
    "https://preview-bari-ops-tracker-71df83dd.viktor.space",
    "https://bari-ops-tracker-71df83dd.viktor.space",
  ].filter((origin): origin is string => !!origin),
);

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  return origin && allowedRecordingOrigins.has(origin)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Authorization, Content-Type, Range",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        // Range-chunk downloads need client JS to read these on the actual
        // (non-preflight) response, which CORS hides by default.
        "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
        Vary: "Origin",
      }
    : {};
}

const recording = httpAction(async (ctx, request) => {
  const cors = corsHeaders(request);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return new Response("Unauthorized", { status: 401, headers: cors });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return new Response("Not found", { status: 404, headers: cors });
  }

  try {
    // A valid JWT is not enough by itself: require that its subject still
    // resolves to a Tracker account with an email before releasing any media.
    const user = await ctx.runQuery(internal.callAudits.getUserForMigration, {
      userId,
    });
    if (!user?.email) {
      return new Response("Unauthorized", { status: 401, headers: cors });
    }
    // `kind=intake` serves recordings attached to migrated Base44 Intake
    // audits (separate table, same auth boundary). Default stays Verification.
    const kind = new URL(request.url).searchParams.get("kind");
    if (
      kind === "intake" &&
      !RESTRICTED_ACTION_EMAILS.includes(user.email.toLowerCase().trim())
    ) {
      return new Response("Forbidden", { status: 403, headers: cors });
    }
    const audit =
      kind === "highlight"
        ? await ctx.runQuery(internal.intakeHighlights.getRecordingForHttp, {
            id: id as Id<"intakeHighlights">,
          })
        : kind === "intake"
        ? await ctx.runQuery(internal.intakeCallAudits.getRecordingForHttp, {
            id: id as Id<"intakeCallAudits">,
          })
        : await ctx.runQuery(internal.callAudits.getRecordingForHttp, {
            // The internal query only accepts a generated Convex ID. Any
            // malformed value is rejected by Convex's argument validator and
            // becomes the same generic 404 response below.
            id: id as Id<"callAudits">,
          });
    if (!audit?.videoStorageId) {
      return new Response("Not found", { status: 404, headers: cors });
    }
    const [blob, metadata] = await Promise.all([
      ctx.storage.get(audit.videoStorageId),
      ctx.storage.getMetadata(audit.videoStorageId),
    ]);
    if (!blob) {
      return new Response("Not found", { status: 404, headers: cors });
    }
    const contentType = metadata?.contentType ?? "application/octet-stream";
    const totalSize = blob.size;

    // Convex HTTP actions cap responses at 20 MiB. Recordings routinely run
    // 40-750 MB, so the whole file can never be one response: always serve
    // via HTTP range chunks (well under the cap) and require the client to
    // loop range requests to assemble the full file. This mirrors what a
    // <video> tag's native range-based streaming would do, but keeps the
    // Authorization-header auth model (no signed URL in the DOM/history).
    const MAX_CHUNK = 15 * 1024 * 1024; // 15 MiB, safely under the 20 MiB cap
    const rangeHeader = request.headers.get("range");
    let start = 0;
    let end = Math.min(MAX_CHUNK, totalSize) - 1;
    if (rangeHeader) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader.trim());
      if (match) {
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), totalSize - 1) : totalSize - 1;
      }
    }
    if (start >= totalSize || start > end) {
      return new Response("Range not satisfiable", {
        status: 416,
        headers: { ...cors, "Content-Range": `bytes */${totalSize}` },
      });
    }
    end = Math.min(end, start + MAX_CHUNK - 1, totalSize - 1);
    const chunk = blob.slice(start, end + 1, contentType);
    return new Response(chunk, {
      status: 206,
      headers: {
        ...cors,
        "Cache-Control": "no-store, private",
        "Content-Type": contentType,
        "Content-Range": `bytes ${start}-${end}/${totalSize}`,
        "Content-Length": String(end - start + 1),
        "Accept-Ranges": "bytes",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    // Do not disclose whether a malformed ID maps to an audit record.
    return new Response("Not found", { status: 404, headers: cors });
  }
});

http.route({
  path: "/call-audit-recording",
  method: "GET",
  handler: recording,
});
http.route({
  path: "/call-audit-recording",
  method: "OPTIONS",
  handler: recording,
});

export default http;
