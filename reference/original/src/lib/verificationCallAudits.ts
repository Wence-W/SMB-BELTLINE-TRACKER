import { ConvexHttpClient } from "convex/browser";
import { useEffect, useState } from "react";
import { makeFunctionReference } from "convex/server";

// The Verification Call Audits app owns its own Convex deployment. This
// read-only, aggregate-only query deliberately exposes no patient or audit
// details to the Beltline Tracker.
const VERIFICATION_CALL_AUDITS_CONVEX_URL =
  "https://quaint-parrot-788.convex.cloud";
const auditSummaryQuery = makeFunctionReference<
  "query",
  Record<string, never>,
  VerificationCallAuditSummary
>("callAudits:summary");

export type VerificationCallAuditSummary = {
  total: number;
  notStarted: number;
  recordingDownloaded: number;
  inProgress: number;
  completed: number;
  active: number;
  updatedAt: number;
};

const EMPTY_SUMMARY: VerificationCallAuditSummary = {
  total: 0,
  notStarted: 0,
  recordingDownloaded: 0,
  inProgress: 0,
  completed: 0,
  active: 0,
  updatedAt: 0,
};

const client = new ConvexHttpClient(VERIFICATION_CALL_AUDITS_CONVEX_URL, {
  logger: false,
});

export function useVerificationCallAuditSummary() {
  const [summary, setSummary] =
    useState<VerificationCallAuditSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadSummary = async () => {
      try {
        const next = await client.query(auditSummaryQuery, {});
        if (!cancelled) setSummary(next);
      } catch {
        if (!cancelled) setSummary(EMPTY_SUMMARY);
      }
    };

    void loadSummary();
    // The audit app is a separate Convex deployment, so it cannot share this
    // app's real-time subscription. Refresh frequently while the tracker is
    // open to keep the workload count current.
    const refresh = window.setInterval(() => void loadSummary(), 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, []);

  return summary;
}
