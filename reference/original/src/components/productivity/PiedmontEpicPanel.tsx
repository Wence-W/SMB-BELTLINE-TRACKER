import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { ConfirmModal } from "@/components/bari/ConfirmModal";
import { useHasRestrictedAccess } from "@/lib/permissions";
import { exportPiedmontEpicReferralsToXLSX } from "@/lib/exportUtils";

const inputCls =
  "w-full bg-card border border-input text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-primary";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_FORM = {
  date: todayISO(),
  refId: "",
  mrNumber: "",
  chart: "",
  toProvider: "",
  referringProvider: "",
};

// Piedmont: Epic referral log — third tab in the Activity Log tab bar
// (Wence, 2026-09-10). One widget ("Log Epic Referral") feeding a table
// below it, plus the same Export Excel / Reset toolbar used on Intake Log.
export function PiedmontEpicPanel() {
  const entries = useQuery(api.piedmontReferrals.listEntries);
  const addEntry = useMutation(api.piedmontReferrals.addEntry);
  const updateEntry = useMutation(api.piedmontReferrals.updateEntry);
  const deleteAllEntries = useMutation(api.piedmontReferrals.deleteAllEntries);
  const canManageRestricted = useHasRestrictedAccess();

  const toProviders = useQuery(api.piedmontReferrals.listToProviders);
  const seedToProviders = useMutation(api.piedmontReferrals.seedToProviderDefaults);
  const addToProvider = useMutation(api.piedmontReferrals.addToProvider);
  const deleteToProvider = useMutation(api.piedmontReferrals.deleteToProvider);
  const [manageProvidersOpen, setManageProvidersOpen] = useState(false);
  const [newProviderName, setNewProviderName] = useState("");

  useEffect(() => {
    if (toProviders && toProviders.length === 0) {
      seedToProviders({}).catch(() => {});
    }
  }, [toProviders, seedToProviders]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [resetConfirm, setResetConfirm] = useState(false);

  // Click-to-edit miniwindow (Wence, 2026-09-10 follow-up): clicking any
  // row in the table opens this modal, prefilled with that row's fields.
  const [editRow, setEditRow] = useState<Doc<"piedmontEpicReferrals"> | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);

  const rows = entries ?? [];
  const providerOptions = toProviders ?? [];

  const openEditModal = (row: Doc<"piedmontEpicReferrals">) => {
    setEditRow(row);
    setEditForm({
      date: row.date,
      refId: row.refId,
      mrNumber: row.mrNumber,
      chart: row.chart,
      toProvider: row.toProvider,
      referringProvider: row.referringProvider,
    });
  };

  const handleSaveEdit = () => {
    if (!editRow) return;
    updateEntry({
      _id: editRow._id,
      date: editForm.date,
      refId: editForm.refId.trim(),
      mrNumber: editForm.mrNumber.trim(),
      chart: editForm.chart.trim(),
      toProvider: editForm.toProvider.trim(),
      referringProvider: editForm.referringProvider.trim(),
    })
      .then(() => {
        toast.success("Referral updated");
        setEditRow(null);
      })
      .catch(() => toast.error("Failed to update referral"));
  };

  const handleLogReferral = () => {
    if (!form.refId.trim() && !form.mrNumber.trim() && !form.chart.trim()) {
      toast.error("Fill in at least REF ID, MR#, or CHART before logging.");
      return;
    }
    addEntry({
      date: form.date,
      refId: form.refId.trim(),
      mrNumber: form.mrNumber.trim(),
      chart: form.chart.trim(),
      toProvider: form.toProvider.trim(),
      referringProvider: form.referringProvider.trim(),
    })
      .then(() => {
        toast.success("Referral logged");
        setForm({ ...EMPTY_FORM, date: form.date });
      })
      .catch(() => toast.error("Failed to log referral"));
  };

  const handleReset = () => {
    deleteAllEntries({})
      .then(() => {
        setResetConfirm(false);
        toast.success("Piedmont: Epic log has been reset");
      })
      .catch(() => toast.error("Failed to reset log"));
  };

  return (
    <div className="space-y-6">
      {/* Log Epic Referral widget */}
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="font-semibold text-foreground text-sm mb-3">
          Log Epic Referral
        </h3>
        {/* Two-column layout (Wence, 2026-09-10 follow-up):
            col 1 = Date, Reference ID, MR#; col 2 = Chart, To Provider,
            Referring Provider. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mb-3">
          <div className="space-y-3">
            <div>
              <label className={labelCls} htmlFor="piedmont-date">Date</label>
              <input
                id="piedmont-date"
                type="date"
                className={inputCls}
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="piedmont-ref-id">Reference ID</label>
              <input
                id="piedmont-ref-id"
                type="text"
                className={inputCls}
                placeholder="e.g. R123456"
                value={form.refId}
                onChange={e => setForm(f => ({ ...f, refId: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="piedmont-mr">MR#</label>
              <input
                id="piedmont-mr"
                type="text"
                className={inputCls}
                placeholder="e.g. MR00123"
                value={form.mrNumber}
                onChange={e => setForm(f => ({ ...f, mrNumber: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className={labelCls} htmlFor="piedmont-chart">Chart</label>
              <input
                id="piedmont-chart"
                type="text"
                className={inputCls}
                placeholder="e.g. EXAMPLE-ID"
                value={form.chart}
                onChange={e => setForm(f => ({ ...f, chart: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="piedmont-to-provider">To Provider</label>
              <select
                id="piedmont-to-provider"
                className={inputCls}
                value={form.toProvider}
                onChange={e => setForm(f => ({ ...f, toProvider: e.target.value }))}
              >
                <option value="">Select provider</option>
                {providerOptions.map(p => (
                  <option key={p._id} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="piedmont-referring-provider">Referring Provider</label>
              <input
                id="piedmont-referring-provider"
                type="text"
                className={inputCls}
                placeholder="e.g. Dr. Smith"
                value={form.referringProvider}
                onChange={e => setForm(f => ({ ...f, referringProvider: e.target.value }))}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleLogReferral}
            className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors"
          >
            + Log Referrals
          </button>
          {/* Manage To Provider list — restricted to the same allowlist as
              the Booked Tracker Scheduler/Provider dropdowns (Wence,
              2026-09-10) until told otherwise. */}
          {canManageRestricted && (
            <button
              onClick={() => setManageProvidersOpen(o => !o)}
              className="text-xs text-primary hover:underline font-medium"
            >
              {manageProvidersOpen ? "Close provider manager" : "Manage To Provider list"}
            </button>
          )}
        </div>

        {canManageRestricted && manageProvidersOpen && (
          <div className="mt-3 border-t border-border pt-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                className={`${inputCls} max-w-xs`}
                placeholder="Add provider name"
                value={newProviderName}
                onChange={e => setNewProviderName(e.target.value)}
              />
              <button
                onClick={() => {
                  const trimmed = newProviderName.trim();
                  if (!trimmed) return;
                  addToProvider({ name: trimmed })
                    .then(() => setNewProviderName(""))
                    .catch(() => toast.error("Failed to add provider"));
                }}
                className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium"
              >
                Add
              </button>
            </div>
            <ul className="text-sm space-y-1">
              {providerOptions.map(p => (
                <li key={p._id} className="flex items-center justify-between border border-border rounded-lg px-3 py-1.5">
                  <span className="text-foreground">{p.name}</span>
                  <button
                    onClick={() => {
                      deleteToProvider({ _id: p._id }).catch(() => toast.error("Failed to remove provider"));
                    }}
                    className="text-rose-500 hover:text-rose-700 text-xs font-medium"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Piedmont: Epic table */}
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h3 className="font-semibold text-foreground text-sm">
            Piedmont: Epic Referrals ({rows.length})
          </h3>
          {/* Export/Reset restricted to the allowlist, same pattern as the
              Intake Log toolbar (Wence, 2026-08-06). */}
          {canManageRestricted && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => exportPiedmontEpicReferralsToXLSX(rows)}
                disabled={rows.length === 0}
                className="px-3 py-1.5 rounded-lg bg-emerald-700/40 hover:bg-emerald-700/70 text-emerald-700 border border-emerald-600/40 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Export Excel
              </button>
              <button
                onClick={() => setResetConfirm(true)}
                disabled={rows.length === 0}
                className="px-3 py-1.5 rounded-lg bg-orange-600/20 hover:bg-orange-600/40 text-orange-700 dark:text-orange-400 border border-orange-600/40 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Reset
              </button>
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">No referrals logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            {/* Reference ID and MR# columns are hidden from this table view
                per Wence (2026-09-10 follow-up) but stay in the Excel export
                below. Clicking a row opens the edit miniwindow. */}
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">CHART</th>
                  <th className="py-2 pr-3">TO PROVIDER</th>
                  <th className="py-2 pr-3">REFERRING PROVIDER</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr
                    key={row._id}
                    className="border-b border-border hover:bg-muted cursor-pointer"
                    onClick={() => openEditModal(row)}
                  >
                    <td className="py-2 pr-3 text-muted-foreground">{row.date}</td>
                    <td className="py-2 pr-3 text-foreground">{row.chart}</td>
                    <td className="py-2 pr-3 text-foreground">{row.toProvider}</td>
                    <td className="py-2 pr-3 text-foreground">{row.referringProvider}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={resetConfirm}
        title="Reset Piedmont: Epic Log"
        message="This will permanently delete all logged Epic referrals. This cannot be undone."
        confirmLabel="Reset Everything"
        onConfirm={handleReset}
        onCancel={() => setResetConfirm(false)}
      />

      {/* Click-to-edit miniwindow (Wence, 2026-09-10 follow-up): clicking
          any row opens this modal to edit all six fields. */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-xl shadow-lg p-5 w-full max-w-lg space-y-3">
            <h3 className="font-semibold text-foreground text-sm mb-1">
              Edit Epic Referral
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <label className={labelCls} htmlFor="edit-date">Date</label>
                <input
                  id="edit-date"
                  type="date"
                  className={inputCls}
                  value={editForm.date}
                  onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="edit-ref-id">Reference ID</label>
                <input
                  id="edit-ref-id"
                  type="text"
                  className={inputCls}
                  value={editForm.refId}
                  onChange={e => setEditForm(f => ({ ...f, refId: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="edit-mr">MR#</label>
                <input
                  id="edit-mr"
                  type="text"
                  className={inputCls}
                  value={editForm.mrNumber}
                  onChange={e => setEditForm(f => ({ ...f, mrNumber: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="edit-chart">Chart</label>
                <input
                  id="edit-chart"
                  type="text"
                  className={inputCls}
                  value={editForm.chart}
                  onChange={e => setEditForm(f => ({ ...f, chart: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="edit-to-provider">To Provider</label>
                <select
                  id="edit-to-provider"
                  className={inputCls}
                  value={editForm.toProvider}
                  onChange={e => setEditForm(f => ({ ...f, toProvider: e.target.value }))}
                >
                  <option value="">Select provider</option>
                  {providerOptions.map(p => (
                    <option key={p._id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="edit-referring-provider">Referring Provider</label>
                <input
                  id="edit-referring-provider"
                  type="text"
                  className={inputCls}
                  value={editForm.referringProvider}
                  onChange={e => setEditForm(f => ({ ...f, referringProvider: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setEditRow(null)}
                className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
