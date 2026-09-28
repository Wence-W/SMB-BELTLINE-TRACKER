// Documentation Audit / QA review helpers (Wence, 2026-09-11).
// Purely a documentation-review/QA marker for Completed records — separate
// from the case's own workflow status and from the pre-existing
// `auditBookmarked` "last clicked" marker.

export type DocAuditStatus = "reviewed" | "audited";

export const DOC_AUDIT_LABELS: Record<DocAuditStatus, string> = {
  reviewed: "In Progress",
  audited: "Audited",
};

export const DOC_AUDIT_BADGE_STYLES: Record<DocAuditStatus, string> = {
  reviewed: "bg-sky-100 text-sky-700 border-sky-300",
  audited: "bg-emerald-100 text-emerald-700 border-emerald-300",
};

// Row/Patient ID highlight — distinct from the blue auditBookmarked highlight.
export const DOC_AUDIT_ROW_STYLES: Record<DocAuditStatus, string> = {
  reviewed: "bg-sky-50 hover:bg-sky-100",
  audited: "bg-emerald-50 hover:bg-emerald-100",
};

export type DocAuditFilter = "all" | "audited" | "not_audited";

export interface DocAuditable {
  docAuditStatus?: DocAuditStatus;
}

export function matchesDocAuditFilter(
  record: DocAuditable,
  filter: DocAuditFilter,
): boolean {
  if (filter === "all") return true;
  const isAudited = record.docAuditStatus != null;
  return filter === "audited" ? isAudited : !isAudited;
}

export function formatAuditDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
