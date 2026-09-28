import { useEffect, useRef, useState } from "react";
import type { CaseNote } from "../../lib/types";
import { formatDateTimeEST } from "../../lib/dateFormat";

const LAST_STAFF_KEY = "bari-notes-last-added-by";

interface Props {
  open: boolean;
  caseId: string;
  patientId: string;
  existingNotes: CaseNote[];
  staffOptions: string[];
  onSave: (caseId: string, notes: CaseNote[]) => void;
  onClose: () => void;
}

function formatDateTime(iso: string): string {
  return formatDateTimeEST(iso);
}

export function CaseNotesModal({
  open,
  caseId,
  patientId,
  existingNotes,
  staffOptions,
  onSave,
  onClose,
}: Props) {
  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [newText, setNewText] = useState("");
  const [addedBy, setAddedBy] = useState("");
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setNotes(existingNotes ? [...existingNotes] : []);
      setNewText("");
      setError("");
      const lastStaff = localStorage.getItem(LAST_STAFF_KEY) ?? "";
      setAddedBy(lastStaff && staffOptions.includes(lastStaff) ? lastStaff : staffOptions[0] ?? "");
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open, existingNotes, staffOptions]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  function handleAdd() {
    if (!newText.trim()) {
      setError("Please enter a note.");
      return;
    }
    if (!addedBy) {
      setError("Please select who's adding this note.");
      return;
    }
    localStorage.setItem(LAST_STAFF_KEY, addedBy);
    const note: CaseNote = {
      id: crypto.randomUUID(),
      text: newText.trim(),
      addedAt: new Date().toISOString(),
      addedBy,
    };
    const updated = [note, ...notes];
    setNotes(updated);
    setNewText("");
    setError("");
    onSave(caseId, updated);
  }

  function handleDelete(id: string) {
    const updated = notes.filter(n => n.id !== id);
    setNotes(updated);
    onSave(caseId, updated);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notes-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 id="notes-modal-title" className="text-base font-semibold text-foreground">
              Case Notes
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Patient ID: <span className="font-mono text-foreground">{patientId}</span></p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted/50"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Add Note */}
        <div className="px-6 py-4 border-b border-border">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Added by</label>
          <select
            value={addedBy}
            onChange={e => { setAddedBy(e.target.value); setError(""); }}
            className="w-full mb-3 bg-card border border-input text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value="">Select...</option>
            {staffOptions.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Add a note</label>
          <textarea
            ref={textareaRef}
            value={newText}
            onChange={e => { setNewText(e.target.value); setError(""); }}
            onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAdd(); }}
            placeholder="Type your note here… (Ctrl+Enter to save)"
            rows={3}
            className={`w-full bg-card border ${error ? "border-rose-500" : "border-input"} text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none placeholder:text-muted-foreground`}
          />
          {error && <p className="text-rose-700 text-[11px] mt-1">{error}</p>}
          <button
            onClick={handleAdd}
            className="mt-2 px-4 py-2 bg-primary hover:bg-primary text-white text-sm font-medium rounded-lg transition-colors"
          >
            + Add Note
          </button>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {notes.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">No notes yet. Add one above.</p>
          ) : (
            notes.map((n, i) => (
              <div
                key={n.id}
                className="bg-muted border border-border rounded-lg px-4 py-3 group"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-muted-foreground leading-relaxed flex-1 whitespace-pre-wrap">{n.text}</p>
                  <button
                    onClick={() => handleDelete(n.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-rose-700 flex-shrink-0 mt-0.5"
                    aria-label="Delete note"
                    title="Delete note"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {i === 0 ? "📌 Latest · " : ""}{formatDateTime(n.addedAt)}{n.addedBy ? ` · ${n.addedBy}` : ""}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border flex justify-between items-center">
          <span className="text-xs text-muted-foreground">{notes.length} note{notes.length !== 1 ? "s" : ""}</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-muted hover:bg-foreground text-foreground text-sm rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
