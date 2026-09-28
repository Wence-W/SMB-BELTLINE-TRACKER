import type { Id } from "../../convex/_generated/dataModel";

export interface AuditRating {
  group: string;
  criterion: string;
  rating: number;
}

export interface CallAudit {
  _id: Id<"callAudits">;
  _creationTime: number;
  dateReviewed: string;
  callDate: string;
  verifierName: string;
  auditorName: string;
  callDuration?: string;
  patientId?: string;
  callCategory: string;
  status: string;
  videoStorageId?: Id<"_storage">;
  ratings: AuditRating[];
  notes?: string;
  coachingStrengths?: string;
  coachingImprovements?: string;
  coachingRecommendation?: string;
  docNotesIncomplete?: boolean;
  docNotesComplete?: boolean;
  docMissingIssues?: string;
  score: number;
  createdAt: number;
  updatedAt: number;
}

export type RecordingSession = {
  url: string;
  dispose: () => void;
};

function recordingEndpoint(id: Id<"callAudits">): string {
  const base = import.meta.env.VITE_CONVEX_SITE_URL as string;
  return `${base}/call-audit-recording?id=${encodeURIComponent(id)}`;
}

/**
 * Recordings are served through an authenticated HTTP action, never by
 * returning a Convex Storage bearer URL in an audit query. A blob URL keeps the
 * browser from retaining the signed request URL in the DOM or link history.
 *
 * Convex HTTP actions cap a single response at 20 MiB, but recordings run
 * 40-750 MB, so we always pull the file as a sequence of HTTP range chunks
 * (server enforces <=15 MiB per chunk regardless of what's requested) and
 * reassemble them client-side into one Blob before handing back an object URL.
 */
async function fetchRangeChunk(
  id: Id<"callAudits">,
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
  const contentRange = response.headers.get("content-range"); // "bytes start-end/total"
  const total = contentRange ? Number(contentRange.split("/")[1]) : undefined;
  if (total === undefined || Number.isNaN(total)) {
    throw new Error("Recording is unavailable.");
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    totalSize: total,
    contentType: response.headers.get("content-type") ?? "video/mp4",
  };
}

export async function openAuthenticatedRecording(
  id: Id<"callAudits">,
  token: string | null,
): Promise<RecordingSession> {
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const parts: Uint8Array[] = [];
  let offset = 0;
  let contentType = "video/mp4";
  for (;;) {
    const chunk = await fetchRangeChunk(id, token, offset);
    parts.push(chunk.bytes);
    contentType = chunk.contentType;
    offset += chunk.bytes.length;
    if (chunk.bytes.length === 0 || offset >= chunk.totalSize) break;
  }
  const url = URL.createObjectURL(new Blob(parts as BlobPart[], { type: contentType }));
  return { url, dispose: () => URL.revokeObjectURL(url) };
}

export const CALL_CATEGORIES = [
  "Insurance Verification",
  "Pre-certification",
] as const;

export const AUDIT_STATUSES = [
  "Not Started",
  "Recording Downloaded",
  "In Progress",
  "Completed",
] as const;

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

// Precertification audits use the same quality rubric as Insurance Verification,
// except that the explanation checkpoint is specific to prior authorization.
export const PRECERTIFICATION_QUALITY_RUBRIC = QUALITY_RUBRIC.map(group =>
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

export function qualityRubricForCallCategory(callCategory: string) {
  return callCategory === "Pre-certification"
    ? PRECERTIFICATION_QUALITY_RUBRIC
    : QUALITY_RUBRIC;
}

// Retain an existing rating when an older Precertification audit is opened, or
// when an auditor changes the category before saving. The two labels represent
// the same rubric position for their respective call categories.
export function normalizeCriterionForCallCategory(
  callCategory: string,
  criterion: string,
) {
  if (
    criterion === COVERAGE_EXPLANATION_CRITERION ||
    criterion === PRIOR_AUTH_EXPLANATION_CRITERION
  ) {
    return callCategory === "Pre-certification"
      ? PRIOR_AUTH_EXPLANATION_CRITERION
      : COVERAGE_EXPLANATION_CRITERION;
  }
  return criterion;
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "Recording Downloaded":
      return "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-300";
    case "In Progress":
      return "bg-amber-500/15 text-amber-800 border-amber-500/30 dark:text-amber-300";
    case "Completed":
      return "bg-emerald-500/15 text-emerald-800 border-emerald-500/30 dark:text-emerald-300";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function scoreBadgeClass(score: number): string {
  if (score >= 90) {
    return "bg-emerald-500/15 text-emerald-800 border-emerald-500/30 dark:text-emerald-300";
  }
  if (score >= 75) {
    return "bg-amber-500/15 text-amber-800 border-amber-500/30 dark:text-amber-300";
  }
  return "bg-rose-500/15 text-rose-800 border-rose-500/30 dark:text-rose-300";
}
