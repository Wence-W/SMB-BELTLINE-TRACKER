/**
 * Convex surfaces mutation errors as a full server stack trace. Staff should
 * only ever see the sentence we threw (e.g. the assigned-auditor lock message).
 */
export function friendlyErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : "";
  if (!raw) return fallback;
  const afterUncaught = raw.split("Uncaught Error:").pop() ?? raw;
  const cleaned = afterUncaught.split(/\s+at\s+\S+\s+\(/)[0].trim();
  return cleaned || fallback;
}
