// Piedmont: Epic, ported from the original components/productivity/
// PiedmontEpicPanel.tsx (layout, labels, placeholders and toasts unchanged).
// Differences: Export and Reset run on the server and are admin-only there;
// the To Provider list is the managed list (no client seeding); the inline
// "Manage To Provider list" returns for admins (P1-b).
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useIsAdmin } from "@/lib/access";
import { todayISO } from "@/lib/dates";
import { errorMessage } from "@/lib/errors";
import { piedmontExportRows } from "@/lib/intakeExport";
import { downloadXlsx } from "@/lib/xlsx";

const inputCls =
  "w-full bg-card border border-input text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-primary";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

type ReferralForm = {
  date: string;
  refId: string;
  mrNumber: string;
  chart: string;
  toProvider: string;
  referringProvider: string;
};
const emptyForm = (date = todayISO()): ReferralForm => ({
  date,
  refId: "",
  mrNumber: "",
  chart: "",
  toProvider: "",
  referringProvider: "",
});

export function PiedmontEpicPanel() {
  const entries = useQuery(api.piedmont.listEntries);
  const addEntry = useMutation(api.piedmont.addEntry);
  const updateEntry = useMutation(api.piedmont.updateEntry);
  const resetEntries = useMutation(api.piedmont.resetEntries);
  const exportEntries = useMutation(api.piedmont.exportEntries);
  const isAdmin = useIsAdmin();

  const toProviders = useQuery(api.managedLists.list, { list: "piedmontEpicProviders" });
  const addToProvider = useMutation(api.managedLists.add);
  const deleteToProvider = useMutation(api.managedLists.remove);
  const [manageProvidersOpen, setManageProvidersOpen] = useState(false);
  const [newProviderName, setNewProviderName] = useState("");

  const [form, setForm] = useState<ReferralForm>(emptyForm);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [editId, setEditId] = useState<Id<"piedmontEpicReferrals"> | null>(null);
  const [editForm, setEditForm] = useState<ReferralForm>(emptyForm);

  const rows = entries ?? [];
  const providerOptions = toProviders ?? [];

  const providerSelect = (id: string, value: string, onChange: (v: string) => void) => (
    <select id={id} className={inputCls} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Select provider</option>
      {providerOptions.map(p => (
        <option key={p._id} value={p.name}>
          {p.name}
        </option>
      ))}
      {/* A migrated row's provider that has since left the list stays selectable. */}
      {value && !providerOptions.some(p => p.name === value) && <option value={value}>{value}</option>}
    </select>
  );

  const handleLogReferral = () => {
    if (!form.refId.trim() && !form.mrNumber.trim() && !form.chart.trim()) {
      toast.error("Fill in at least REF ID, MR#, or CHART before logging.");
      return;
    }
    addEntry(form)
      .then(() => {
        toast.success("Referral logged");
        setForm(emptyForm(form.date));
      })
      .catch(err => toast.error(errorMessage(err, "Failed to log referral")));
  };

  const handleSaveEdit = () => {
    if (!editId) return;
    updateEntry({ id: editId, ...editForm })
      .then(() => {
        toast.success("Referral updated");
        setEditId(null);
      })
      .catch(err => toast.error(errorMessage(err, "Failed to update referral")));
  };

  const handleReset = () => {
    resetEntries({})
      .then(() => {
        setResetConfirm(false);
        toast.success("Piedmont: Epic log has been reset");
      })
      .catch(err => toast.error(errorMessage(err, "Failed to reset log")));
  };

  const handleExport = () => {
    exportEntries({})
      .then(data => downloadXlsx("piedmont-epic-referrals.xlsx", "Piedmont Epic Referrals", piedmontExportRows(data)))
      .catch(err => toast.error(errorMessage(err, "Failed to export")));
  };

  const textField = (id: string, label: string, value: string, onChange: (v: string) => void, placeholder?: string) => (
    <div>
      <label className={labelCls} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        className={inputCls}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="font-semibold text-foreground text-sm mb-3">Log Epic Referral</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mb-3">
          <div className="space-y-3">
            <div>
              <label className={labelCls} htmlFor="piedmont-date">
                Date
              </label>
              <input
                id="piedmont-date"
                type="date"
                className={inputCls}
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
            {textField(
              "piedmont-ref-id",
              "Reference ID",
              form.refId,
              v => setForm(f => ({ ...f, refId: v })),
              "e.g. R123456",
            )}
            {textField("piedmont-mr", "MR#", form.mrNumber, v => setForm(f => ({ ...f, mrNumber: v })), "e.g. MR00123")}
          </div>
          <div className="space-y-3">
            {textField(
              "piedmont-chart",
              "Chart",
              form.chart,
              v => setForm(f => ({ ...f, chart: v })),
              "e.g. EXAMPLE-ID",
            )}
            <div>
              <label className={labelCls} htmlFor="piedmont-to-provider">
                To Provider
              </label>
              {providerSelect("piedmont-to-provider", form.toProvider, v => setForm(f => ({ ...f, toProvider: v })))}
            </div>
            {textField(
              "piedmont-referring-provider",
              "Referring Provider",
              form.referringProvider,
              v => setForm(f => ({ ...f, referringProvider: v })),
              "e.g. Dr. Smith",
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleLogReferral}
            className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors"
          >
            + Log Referrals
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setManageProvidersOpen(o => !o)}
              className="text-xs text-primary hover:underline font-medium"
            >
              {manageProvidersOpen ? "Close provider manager" : "Manage To Provider list"}
            </button>
          )}
        </div>

        {isAdmin && manageProvidersOpen && (
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
                type="button"
                onClick={() => {
                  const trimmed = newProviderName.trim();
                  if (!trimmed) return;
                  addToProvider({ list: "piedmontEpicProviders", name: trimmed })
                    .then(() => setNewProviderName(""))
                    .catch(err => toast.error(errorMessage(err, "Failed to add provider")));
                }}
                className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium"
              >
                Add
              </button>
            </div>
            <ul className="text-sm space-y-1">
              {providerOptions.map(p => (
                <li
                  key={p._id}
                  className="flex items-center justify-between border border-border rounded-lg px-3 py-1.5"
                >
                  <span className="text-foreground">{p.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      deleteToProvider({ list: "piedmontEpicProviders", id: p._id }).catch(err =>
                        toast.error(errorMessage(err, "Failed to remove provider")),
                      );
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

      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h3 className="font-semibold text-foreground text-sm">Piedmont: Epic Referrals ({rows.length})</h3>
          {isAdmin && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleExport}
                disabled={rows.length === 0}
                className="px-3 py-1.5 rounded-lg bg-emerald-700/40 hover:bg-emerald-700/70 text-emerald-700 border border-emerald-600/40 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Export Excel
              </button>
              <button
                type="button"
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
            {/* Reference ID and MR# are hidden here but included in the export, as in the original. */}
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
                    onClick={() => {
                      setEditId(row._id);
                      setEditForm({
                        date: row.date,
                        refId: row.refId,
                        mrNumber: row.mrNumber,
                        chart: row.chart,
                        toProvider: row.toProvider,
                        referringProvider: row.referringProvider,
                      });
                    }}
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

      {editId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-xl shadow-lg p-5 w-full max-w-lg space-y-3">
            <h3 className="font-semibold text-foreground text-sm mb-1">Edit Epic Referral</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <label className={labelCls} htmlFor="edit-date">
                  Date
                </label>
                <input
                  id="edit-date"
                  type="date"
                  className={inputCls}
                  value={editForm.date}
                  onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                />
              </div>
              {textField("edit-ref-id", "Reference ID", editForm.refId, v => setEditForm(f => ({ ...f, refId: v })))}
              {textField("edit-mr", "MR#", editForm.mrNumber, v => setEditForm(f => ({ ...f, mrNumber: v })))}
              {textField("edit-chart", "Chart", editForm.chart, v => setEditForm(f => ({ ...f, chart: v })))}
              <div>
                <label className={labelCls} htmlFor="edit-to-provider">
                  To Provider
                </label>
                {providerSelect("edit-to-provider", editForm.toProvider, v =>
                  setEditForm(f => ({ ...f, toProvider: v })),
                )}
              </div>
              {textField("edit-referring-provider", "Referring Provider", editForm.referringProvider, v =>
                setEditForm(f => ({ ...f, referringProvider: v })),
              )}
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditId(null)}
                className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
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
