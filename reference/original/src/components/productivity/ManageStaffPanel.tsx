import { useState } from "react";

export interface SimpleStaffRecord {
  _id: string;
  name: string;
  email: string;
}

interface Props {
  title: string;
  staffList: SimpleStaffRecord[];
  onAddStaff: (name: string, email: string) => void;
  onDeleteStaff: (staff: SimpleStaffRecord) => void;
  /** Whether the current user can add/remove staff. Defaults to true for
   * callers that don't gate this (e.g. Billing's roster). Intake Team
   * Staff passes the restricted-access allowlist result (Wence,
   * 2026-08-06) — when false the whole Manage toggle is hidden, staff
   * names still show read-only. */
  canManage?: boolean;
  /** Whether to show/collect email (name + email row, email input on add).
   * Defaults to true. Intake Directory's "Intake Team" tab passes false —
   * Wence wants name-only there (2026-08-07). */
  showEmail?: boolean;
}

export function ManageStaffPanel({
  title,
  staffList,
  onAddStaff,
  onDeleteStaff,
  canManage = true,
  showEmail = true,
}: Props) {
  const [managing, setManaging] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<SimpleStaffRecord | null>(null);

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    onAddStaff(name, newEmail.trim());
    setNewName("");
    setNewEmail("");
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-foreground text-sm">{title}</h3>
        {canManage && (
        <button
          onClick={() => setManaging(m => !m)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
            managing
              ? "bg-primary text-white border-primary"
              : "bg-muted hover:bg-secondary text-foreground border-border"
          }`}
        >
          {managing ? "Done" : "⚙️ Manage Staff"}
        </button>
        )}
      </div>

      {canManage && managing && (
        <div className="mb-4 rounded-lg border border-border bg-muted p-3 space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
              placeholder="New staff member name…"
              className="flex-1 rounded-lg bg-card border border-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
            {showEmail && (
            <input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
              placeholder="Email (optional, for notifications)"
              className="flex-1 rounded-lg bg-card border border-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
            )}
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + Add
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Removing a staff member does not delete their logged activity.
          </p>

          <ul className="divide-y divide-slate-200 mt-2">
            {staffList.map(s => (
              <li key={s._id} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-foreground font-medium">{s.name}</span>
                {showEmail && (
                <span className="text-muted-foreground text-xs mr-2 truncate max-w-[220px]">
                  {s.email || "no email on file"}
                </span>
                )}
                <button
                  onClick={() => setConfirmDelete(s)}
                  className="text-rose-500 hover:text-rose-700 text-xs font-medium"
                >
                  Remove
                </button>
              </li>
            ))}
            {staffList.length === 0 && (
              <li className="py-2 text-xs text-muted-foreground">No staff yet — add one above.</li>
            )}
          </ul>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl">
            <h3 className="font-bold text-foreground text-base mb-2">
              Remove {confirmDelete.name}?
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {confirmDelete.name} will be removed from the staff list. Their
              already-logged activity will not be deleted.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 rounded-lg bg-muted hover:bg-secondary text-foreground text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteStaff(confirmDelete);
                  setConfirmDelete(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
