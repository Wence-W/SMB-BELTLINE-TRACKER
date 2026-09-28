import type { BariCase, CaseType } from "@/lib/types";
import {
  DOC_AUDIT_BADGE_STYLES,
  DOC_AUDIT_LABELS,
  DOC_AUDIT_ROW_STYLES,
  formatAuditDate,
} from "@/lib/docAudit";

const CASE_TYPE_LABELS: Record<BariCase["caseType"], string> = {
  urgent: "Urgent",
  initial_consult: "Initial Consult",
  followup_consult: "Follow-Up",
  no_appointment: "No Appt",
  reverification: "Reverif.",
  predetermination: "Predeterm.",
  precert_bari: "PC Bari",
  precert_veins: "PC Veins",
  precert_general: "PC General",
  precert_modified_urgent: "PC Modified/Urgent",
  precert_egd: "PC EGD",
};

const PRECERT_TYPES = new Set<CaseType>([
  "precert_bari",
  "precert_veins",
  "precert_general",
  "precert_modified_urgent",
  "precert_egd",
]);

function isPrecert(c: BariCase): boolean {
  return PRECERT_TYPES.has(c.caseType);
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
  } catch {
    return "—";
  }
}

interface Props {
  cases: BariCase[];
  onViewInCases: () => void;
  emptyLabel: string;
  // Click a Patient ID to jump straight to the Cases tab with that case's
  // edit modal already open (Wence, 2026-07-27 — Priority/Urgent/Expiring).
  onEditCase?: (c: BariCase) => void;
  // Bold the Patient ID column extra heavy — Completed tab only (Wence, 2026-07-28).
  boldPatientId?: boolean;
  // Completed tab audit bookmark (Wence, 2026-07-28): clicking a Patient ID
  // also marks that row "last clicked" — a single moving highlight, in
  // addition to onEditCase's normal jump-to-Cases-tab behavior.
  onBookmarkClick?: (c: BariCase) => void;
  // Render "Other Cases" before "Pre-Cert Cases" — Completed tab only
  // (Wence, 2026-07-28).
  otherCasesFirst?: boolean;
  // Documentation Audit / QA review (Wence, 2026-09-11) — Completed tab
  // only. Adds an Audit column + badge, highlights the Patient ID/row when
  // audited, and opens the Documentation Audit modal on click.
  docAuditEnabled?: boolean;
  onDocAuditClick?: (c: BariCase) => void;
}

interface TableProps {
  title: string;
  cases: BariCase[];
  onEditCase?: (c: BariCase) => void;
  emptyText: string;
  boldPatientId?: boolean;
  onBookmarkClick?: (c: BariCase) => void;
  docAuditEnabled?: boolean;
  onDocAuditClick?: (c: BariCase) => void;
}

function CasesTableBlock({
  title,
  cases,
  onEditCase,
  emptyText,
  boldPatientId,
  onBookmarkClick,
  docAuditEnabled,
  onDocAuditClick,
}: TableProps) {
  return (
    <div>
      <h4 className="px-4 pt-3 pb-2 text-xs font-semibold text-muted-foreground uppercase">
        {title} ({cases.length})
      </h4>
      {cases.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">Patient ID</th>
                <th className="text-left px-4 py-2">Case Type</th>
                <th className="text-left px-4 py-2">Insurance</th>
                <th className="text-left px-4 py-2">DOS</th>
                <th className="text-left px-4 py-2">Assigned To</th>
                {docAuditEnabled && (
                  <th className="text-left px-4 py-2">Documentation Audit</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cases.map(c => {
                const auditStatus = c.docAuditStatus;
                const rowClass = auditStatus
                  ? DOC_AUDIT_ROW_STYLES[auditStatus]
                  : c.auditBookmarked
                    ? "bg-blue-50 hover:bg-blue-100"
                    : "hover:bg-muted";
                return (
                  <tr key={c.id} className={rowClass}>
                    <td
                      className={`px-4 py-2 ${
                        auditStatus
                          ? "font-bold text-foreground"
                          : boldPatientId
                            ? "font-bold text-foreground"
                            : "font-medium text-foreground"
                      }`}
                    >
                      {onEditCase || onBookmarkClick ? (
                        <button
                          type="button"
                          onClick={() => {
                            onEditCase?.(c);
                            onBookmarkClick?.(c);
                          }}
                          className={
                            onEditCase
                              ? "text-primary hover:underline"
                              : "hover:underline"
                          }
                        >
                          {c.patientId}
                        </button>
                      ) : (
                        c.patientId
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {CASE_TYPE_LABELS[c.caseType]}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {c.insuranceProvider || "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {formatDate(c.dos)}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {c.assignedTo}
                    </td>
                    {docAuditEnabled && (
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => onDocAuditClick?.(c)}
                          className="inline-flex items-center gap-1.5 group"
                          title={
                            auditStatus
                              ? `${DOC_AUDIT_LABELS[auditStatus]} by ${c.docAuditedBy ?? "—"} on ${formatAuditDate(c.docAuditedAt)}${c.docAuditNotes ? ` — ${c.docAuditNotes}` : ""}`
                              : "Click to mark In Progress / Audited"
                          }
                        >
                          {auditStatus ? (
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold ${DOC_AUDIT_BADGE_STYLES[auditStatus]}`}
                            >
                              {DOC_AUDIT_LABELS[auditStatus]}
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full border border-border text-[11px] font-medium text-muted-foreground group-hover:border-primary group-hover:text-primary transition-colors">
                              Not Audited
                            </span>
                          )}
                        </button>
                        {auditStatus && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {c.docAuditedBy} · {formatAuditDate(c.docAuditedAt)}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Mirror of matching Cases inside a Task tab (Priority/Urgent/Expiring/
 * Completed). Split into two separate sections — Pre-Cert Cases and Other
 * Cases — instead of one combined list (Wence, 2026-07-27), since Pre-Cert
 * work is tracked/reported on separately from regular Bari cases elsewhere
 * in the app. Clicking a Patient ID (when `onEditCase` is provided) jumps to
 * the Cases tab and opens that case for editing; deleting a case still only
 * happens from the Cases tab itself.
 */
export function MiniCasesList({
  cases,
  onViewInCases,
  emptyLabel,
  onEditCase,
  boldPatientId,
  onBookmarkClick,
  otherCasesFirst,
  docAuditEnabled,
  onDocAuditClick,
}: Props) {
  if (cases.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm px-5 py-6 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  const precertCases = cases.filter(isPrecert);
  const otherCases = cases.filter(c => !isPrecert(c));

  const precertBlock = (
    <CasesTableBlock
      key="precert"
      title="Pre-Cert Cases"
      cases={precertCases}
      onEditCase={onEditCase}
      emptyText="No matching Pre-Cert cases."
      boldPatientId={boldPatientId}
      onBookmarkClick={onBookmarkClick}
      docAuditEnabled={docAuditEnabled}
      onDocAuditClick={onDocAuditClick}
    />
  );
  const otherBlock = (
    <CasesTableBlock
      key="other"
      title="Other Cases"
      cases={otherCases}
      onEditCase={onEditCase}
      emptyText="No other matching cases."
      boldPatientId={boldPatientId}
      onBookmarkClick={onBookmarkClick}
      docAuditEnabled={docAuditEnabled}
      onDocAuditClick={onDocAuditClick}
    />
  );

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Matching Cases ({cases.length})
        </h3>
        <button
          onClick={onViewInCases}
          className="text-xs font-medium text-primary hover:text-primary"
        >
          View in Cases →
        </button>
      </div>
      <div className="divide-y divide-border">
        {otherCasesFirst ? (
          <>
            {otherBlock}
            {precertBlock}
          </>
        ) : (
          <>
            {precertBlock}
            {otherBlock}
          </>
        )}
      </div>
    </div>
  );
}
