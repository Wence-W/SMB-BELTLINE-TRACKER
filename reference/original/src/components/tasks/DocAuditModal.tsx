import { useEffect, useState } from "react";
import type { BariCase } from "@/lib/types";
import { DOC_AUDIT_LABELS, type DocAuditStatus } from "@/lib/docAudit";

interface Props {
  open: boolean;
  targetCase: BariCase | null;
  staffNames: string[];
  onSave: (args: {
    status: DocAuditStatus | null;
    auditedBy: string;
    notes: string;
  }) => void;
  onCancel: () => void;
}

/**
 * Documentation Audit / QA review modal (Wence, 2026-09-11). Lets a staff
 * member manually mark a Completed record's documentation as "Documentation
 * Reviewed" or "Audited" after checking it, capturing auditor name, audit
 * date (stamped server-side), and optional notes. This is a QA marker only —
 * it never changes the case's own workflow status.
 */
export function DocAuditModal({
  open,
  targetCase,
  staffNames,
  onSave,
  onCancel,
}: Props) {
  const [status, setStatus] = useState<DocAuditStatus>("reviewed");
  const [auditedBy, setAuditedBy] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!targetCase) return;
    setStatus(targetCase.docAuditStatus ?? "reviewed");
    setAuditedBy(targetCase.docAuditedBy ?? "");
    setNotes(targetCase.docAuditNotes ?? "");
  }, [targetCase]);

  if (!open || !targetCase) return null;

  const alreadyAudited = targetCase.docAuditStatus != null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Documentation Audit"
    >
      <div
        role="button"
        tabIndex={0}
        aria-label="Close"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") onCancel();
        }}
      />
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4">
        <div>
          <h2 className="font-bold text-foreground text-base">
            Documentation Audit
          </h2>
          <p className="text-muted-foreground text-xs mt-0.5">
            Patient ID:{" "}
            <span className="font-semibold text-foreground">
              {targetCase.patientId}
            </span>
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Status
          </label>
          <div className="flex gap-2">
            {(["reviewed", "audited"] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  status === s
                    ? "bg-primary text-white border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                {DOC_AUDIT_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Auditor Name
          </label>
          <input
            list="doc-audit-staff-names"
            value={auditedBy}
            onChange={e => setAuditedBy(e.target.value)}
            placeholder="Type or pick a name"
            className="w-full bg-card border border-input/60 text-sm text-foreground rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
          <datalist id="doc-audit-staff-names">
            {staffNames.map(name => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Documentation review notes..."
            className="w-full bg-card border border-input/60 text-sm text-foreground rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
          />
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          {alreadyAudited ? (
            <button
              type="button"
              onClick={() => onSave({ status: null, auditedBy: "", notes: "" })}
              className="text-xs text-rose-500 hover:text-rose-700 font-medium"
            >
              Clear audit (Not Audited)
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() =>
                onSave({ status, auditedBy: auditedBy.trim(), notes: notes.trim() })
              }
              disabled={!auditedBy.trim()}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-primary hover:bg-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
