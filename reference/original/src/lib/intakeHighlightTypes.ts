import type { Id } from "../../convex/_generated/dataModel";
import type { RecordingSession } from "./callAuditTypes";

export interface IntakeHighlight {
  _id: Id<"intakeHighlights">;
  _creationTime: number;
  sourceHighlightId?: string;
  intakeSpecialist: string;
  callCategory: string;
  audioStorageId?: Id<"_storage">;
  submittedByEmail?: string;
  submittedByName?: string;
  submittedAt: number;
  createdAt: number;
  updatedAt: number;
  reactionCount: number;
  reactedByMe: boolean;
  reactionNames: string[];
}

// Mirrors the Base44 Highlights dropdowns (8 categories, Inbound + Outbound).
export const HIGHLIGHT_CALL_CATEGORIES = [
  "Inbound - Appt Concern",
  "Inbound - MA Concern",
  "Inbound - Billing Concern",
  "Inbound - Others",
  "Outbound - Confirming Appt",
  "Outbound - Prioritylist",
  "Outbound - Leads",
  "Outbound - Others",
] as const;

export const HIGHLIGHT_SPECIALISTS = [
  "Wence",
  "Lili M.",
  "Mitzi L.",
  "Katrina B.",
  "Claire Q.",
  "Jhaysen M.",
  "Rose B.",
] as const;

/**
 * Same protected-media path as Intake/Verification recordings: an
 * Authorization-header HTTP action streamed in <=15 MiB range chunks, never a
 * public storage URL. `kind=highlight` routes to the intakeHighlights table.
 */
function recordingEndpoint(id: Id<"intakeHighlights">): string {
  const base = import.meta.env.VITE_CONVEX_SITE_URL as string;
  return `${base}/call-audit-recording?kind=highlight&id=${encodeURIComponent(id)}`;
}

async function fetchRangeChunk(
  id: Id<"intakeHighlights">,
  token: string,
  start: number,
): Promise<{ bytes: Uint8Array; totalSize: number; contentType: string }> {
  const response = await fetch(recordingEndpoint(id), {
    headers: { Authorization: `Bearer ${token}`, Range: `bytes=${start}-` },
    credentials: "omit",
  });
  if (!response.ok && response.status !== 206) {
    throw new Error(
      response.status === 401
        ? "Your session has expired. Please sign in again."
        : "Recording is unavailable.",
    );
  }
  const contentRange = response.headers.get("content-range");
  const total = contentRange ? Number(contentRange.split("/")[1]) : undefined;
  if (total === undefined || Number.isNaN(total)) {
    throw new Error("Recording is unavailable.");
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    totalSize: total,
    contentType: response.headers.get("content-type") ?? "audio/mpeg",
  };
}

export async function openAuthenticatedHighlightRecording(
  id: Id<"intakeHighlights">,
  token: string | null,
): Promise<RecordingSession> {
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const parts: Uint8Array[] = [];
  let offset = 0;
  let contentType = "audio/mpeg";
  for (;;) {
    const chunk = await fetchRangeChunk(id, token, offset);
    parts.push(chunk.bytes);
    contentType = chunk.contentType;
    offset += chunk.bytes.length;
    if (chunk.bytes.length === 0 || offset >= chunk.totalSize) break;
  }
  const url = URL.createObjectURL(
    new Blob(parts as BlobPart[], { type: contentType }),
  );
  return {
    url,
    dispose: () => URL.revokeObjectURL(url),
  };
}

export function highlightCategoryBadgeClass(category: string): string {
  return category.startsWith("Outbound")
    ? "bg-sky-500/15 text-sky-800 border-sky-500/30 dark:text-sky-300"
    : "bg-violet-500/15 text-violet-800 border-violet-500/30 dark:text-violet-300";
}
