import type { Id } from "../../convex/_generated/dataModel";
import type { RecordingSession } from "./callAuditTypes";

export interface IntakeCallAudit {
  _id: Id<"intakeCallAudits">;
  _creationTime: number;
  sourceAuditId?: string;
  callDate: string;
  intakeSpecialist: string;
  auditor: string;
  callCategory: string;
  duration?: string;
  qaScore: number;
  complianceScore: number;
  finalResult: string;
  riskLevel: string;
  status: string;
  notes?: string;
  chart?: string;
  dateReviewed?: string;
  scores?: Partial<Record<RubricKey, number>>;
  documentation?: {
    chartUpdated?: boolean;
    notesComplete?: boolean;
    followupDocumented?: boolean;
    missingIssues?: string;
  };
  coaching?: {
    strengths?: string;
    improvements?: string;
    recommendation?: string;
    notes?: string;
  };
  videoStorageId?: Id<"_storage">;
  createdAt: number;
  updatedAt: number;
  reactions?: Partial<Record<AuditReactionEmoji, { count: number; names: string[] }>>;
  myReaction?: AuditReactionEmoji | null;
}

/**
 * Emoji reactions on the Intake Audits list (copied from Base44, 2026-08-18).
 * Any approved Call Audits user may pick exactly one of these per audit row;
 * "bulb" is the Learning Point reaction Wence pointed out.
 */
export type AuditReactionEmoji = "thumbsup" | "star" | "clap" | "heart" | "bulb";

export const AUDIT_REACTIONS: { key: AuditReactionEmoji; emoji: string; label: string }[] = [
  { key: "thumbsup", emoji: "👍", label: "Nice work" },
  { key: "star", emoji: "⭐", label: "Star" },
  { key: "clap", emoji: "🙌", label: "Great job" },
  { key: "heart", emoji: "❤️", label: "Love it" },
  { key: "bulb", emoji: "💡", label: "Learning Point" },
];

/**
 * The Base44 QA rubric, in the order auditors scored it (1-5 per criterion).
 * Kept as data so the detail view stays in sync with the migrated records.
 */
export const RUBRIC_SECTIONS = [
  {
    title: "Greeting",
    items: [
      ["greetingProfessionalOpening", "Professional opening"],
      ["greetingAcknowledgment", "Appropriate acknowledgment"],
      ["greetingIntroducedSelf", "Introduced self and clinic"],
    ],
  },
  {
    title: "Communication",
    items: [
      ["communicationActiveListening", "Active listening"],
      ["communicationEmpathy", "Empathy"],
      ["communicationClearExplanation", "Clear explanation"],
      ["communicationProfessionalTone", "Professional tone"],
      ["communicationAvoidedInterruptions", "Avoided interruptions"],
    ],
  },
  {
    title: "HIPAA Compliance",
    items: [
      ["hipaaVerifiedIdentity", "Verified patient identity correctly"],
      ["hipaaProtectedInfo", "Protected patient information"],
    ],
  },
  {
    title: "Call Handling",
    items: [
      ["handlingEfficientFlow", "Efficient call flow"],
      ["handlingAccurateInfo", "Accurate information provided"],
      ["handlingProperScheduling", "Proper scheduling process"],
      ["handlingConfirmedDetails", "Confirmed patient details"],
    ],
  },
  {
    title: "Closing/Transfer",
    items: [
      ["closingSummarizedNextSteps", "Summarized next steps"],
      ["closingAskedAdditionalAssistance", "Asked if additional assistance needed"],
      ["closingProfessionalClosing", "Professional closing statement"],
      ["closingRightDepartment", "Transferred to the right department"],
      ["closingDocumentation", "Documentation"],
    ],
  },
] as const;

export type RubricKey = (typeof RUBRIC_SECTIONS)[number]["items"][number][0];

const ALL_RUBRIC_KEYS: RubricKey[] = RUBRIC_SECTIONS.flatMap(section =>
  section.items.map(([key]) => key as RubricKey),
);
const HIPAA_RUBRIC_KEYS: RubricKey[] = RUBRIC_SECTIONS.find(
  section => section.title === "HIPAA Compliance",
)!.items.map(([key]) => key as RubricKey);

/**
 * Mirrors `computeQaScore`/`computeComplianceScore` in
 * `convex/intakeCallAudits.ts` (the server always recomputes and is the
 * source of truth) — used here only for live preview while rating stars.
 * A 0/unset rating means "not applicable" and is excluded from the average,
 * matching Base44's auto-calc. [reverse-engineered from migrated data, 2026-08-20]
 */
function averageRubricPercent(
  scores: Partial<Record<RubricKey, number>>,
  keys: RubricKey[],
): number {
  const rated = keys
    .map(key => scores[key])
    .filter((value): value is number => typeof value === "number" && value > 0);
  if (rated.length === 0) return 0;
  const sum = rated.reduce((total, value) => total + value, 0);
  return Math.round((sum / (rated.length * 5)) * 100);
}

export function computeQaScorePreview(scores: Partial<Record<RubricKey, number>>): number {
  return averageRubricPercent(scores, ALL_RUBRIC_KEYS);
}

export function computeComplianceScorePreview(
  scores: Partial<Record<RubricKey, number>>,
): number {
  return averageRubricPercent(scores, HIPAA_RUBRIC_KEYS);
}

export const INTAKE_CALL_CATEGORIES = [
  "Inbound - Appt Concern",
  "Inbound - MA Concern",
  "Inbound - Billing Concern",
  "Inbound - Others",
] as const;

// Fixed dropdown choices on the New/Edit Intake Audit form [source: Wence, 2026-08-20]
export const INTAKE_SPECIALISTS = [
  "Mitzi L.",
  "Rose B.",
  "Jhaysen M.",
  "Claire Q.",
  "Kat B.",
] as const;

export const INTAKE_AUDITORS = ["Mitzi L.", "Rose B."] as const;

export const INTAKE_AUDIT_STATUSES = ["Open", "In Progress", "Completed"] as const;
export const INTAKE_RESULTS = ["Pass", "Fail"] as const;
export const INTAKE_RISK_LEVELS = [
  "Low Risk",
  "Moderate Risk",
  "High Risk",
] as const;

/**
 * Mirrors `computeRiskLevel` in `convex/intakeCallAudits.ts` — used here only
 * for live preview while rating stars; the server always recomputes.
 * [reverse-engineered from migrated data, 2026-08-20]
 */
export function computeRiskLevelPreview(
  complianceScore: number,
): (typeof INTAKE_RISK_LEVELS)[number] {
  if (complianceScore >= 100) return "Low Risk";
  if (complianceScore >= 60) return "Moderate Risk";
  return "High Risk";
}

export function intakeStatusBadgeClass(status: string): string {
  switch (status) {
    case "In Progress":
      return "bg-amber-500/15 text-amber-800 border-amber-500/30 dark:text-amber-300";
    case "Completed":
      return "bg-emerald-500/15 text-emerald-800 border-emerald-500/30 dark:text-emerald-300";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function resultBadgeClass(result: string): string {
  return result === "Pass"
    ? "bg-emerald-500/15 text-emerald-800 border-emerald-500/30 dark:text-emerald-300"
    : "bg-rose-500/15 text-rose-800 border-rose-500/30 dark:text-rose-300";
}

export function riskBadgeClass(risk: string): string {
  switch (risk) {
    case "High Risk":
      return "bg-rose-500/15 text-rose-800 border-rose-500/30 dark:text-rose-300";
    case "Moderate Risk":
      return "bg-amber-500/15 text-amber-800 border-amber-500/30 dark:text-amber-300";
    default:
      return "bg-emerald-500/15 text-emerald-800 border-emerald-500/30 dark:text-emerald-300";
  }
}

export function intakeScoreBadgeClass(score: number): string {
  if (score >= 90) {
    return "bg-emerald-500/15 text-emerald-800 border-emerald-500/30 dark:text-emerald-300";
  }
  if (score >= 75) {
    return "bg-amber-500/15 text-amber-800 border-amber-500/30 dark:text-amber-300";
  }
  return "bg-rose-500/15 text-rose-800 border-rose-500/30 dark:text-rose-300";
}

/**
 * Same protected-media path as Verification recordings: an Authorization-header
 * HTTP action streamed in <=15 MiB range chunks, never a public storage URL.
 */
function recordingEndpoint(id: Id<"intakeCallAudits">): string {
  const base = import.meta.env.VITE_CONVEX_SITE_URL as string;
  return `${base}/call-audit-recording?kind=intake&id=${encodeURIComponent(id)}`;
}

async function fetchRangeChunk(
  id: Id<"intakeCallAudits">,
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
    contentType: response.headers.get("content-type") ?? "video/mp4",
  };
}

export interface IntakeRecordingSession extends RecordingSession {
  /** Migrated Base44 call recordings are MP3 audio; uploads may be video. */
  isAudio: boolean;
}

export async function openAuthenticatedIntakeRecording(
  id: Id<"intakeCallAudits">,
  token: string | null,
): Promise<IntakeRecordingSession> {
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
  return {
    url,
    isAudio: contentType.startsWith("audio/"),
    dispose: () => URL.revokeObjectURL(url),
  };
}

/** Base44 renders the detail-header tiles as coloured text, not badges. */
export function scoreTextClass(score: number): string {
  if (score >= 90) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 75) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

export function resultTextClass(result: string): string {
  return result === "Pass"
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-600 dark:text-rose-400";
}

export function riskTextClass(risk: string): string {
  switch (risk) {
    case "High Risk":
      return "text-rose-600 dark:text-rose-400";
    case "Moderate Risk":
      return "text-amber-600 dark:text-amber-400";
    default:
      return "text-emerald-600 dark:text-emerald-400";
  }
}
