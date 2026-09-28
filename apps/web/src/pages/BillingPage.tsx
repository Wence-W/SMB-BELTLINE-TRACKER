// Billing tab, ported from the original components/productivity/BillingTab.tsx
// (layout, labels, defaults and toasts unchanged). Differences:
// - Staff are picked from the Billing team in the people roster (by person id);
//   the Billing Staff roster panel is admin-managed (D5) and nothing is seeded.
// - The server stamps createdAt/updatedAt and merges the Fax Docs / New
//   Patient Chart values into the day's metrics row itself.
// - Editing a row whose staff name is no longer on the roster keeps that name
//   (the original's picker silently showed the first roster name instead).
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { BillingCategory } from "@convex/lib/enums";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { TeamRosterPanel } from "@/components/TeamRosterPanel";
import { BILLING_CATEGORIES, categoryLabel, categoryTotals, metricTotals, productivityNames } from "@/lib/billing";
import { inDateRange, isInCurrentMonth, todayISO } from "@/lib/dates";
import { errorMessage } from "@/lib/errors";

const inputCls =
  "w-full bg-card border border-input text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-primary";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

const digitsOnly = (value: string) => Number(value.replace(/\D/g, ""));

type Draft = { staffPersonId: string; date: string; category: BillingCategory; count: number };

export function BillingPage({ view = "overview" }: { view?: "overview" | "log" }) {
  const [billingFrom, setBillingFrom] = useState("");
  const [billingTo, setBillingTo] = useState("");
  const roster = useQuery(api.access.listTeam, { team: "billing" });
  const entries = useQuery(api.billing.listEntries);
  const dailyMetrics = useQuery(api.dailyMetrics.list);
  const addEntry = useMutation(api.billing.addEntry);
  const updateEntry = useMutation(api.billing.updateEntry);
  const deleteEntry = useMutation(api.billing.deleteEntry);
  const setBillingCounts = useMutation(api.dailyMetrics.setBillingCounts);

  const staff = roster ?? [];
  const staffNames = useMemo(() => (roster ?? []).map(s => s.displayName), [roster]);
  const firstPersonId = roster?.[0]?.personId;

  const [form, setForm] = useState<Draft>({
    staffPersonId: "",
    date: todayISO(),
    category: BILLING_CATEGORIES[0].value,
    count: 1,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft & { legacyStaff: string }>({
    staffPersonId: "",
    date: "",
    category: BILLING_CATEGORIES[0].value,
    count: 1,
    legacyStaff: "",
  });

  const [metricForm, setMetricForm] = useState({
    staffPersonId: "",
    date: todayISO(),
    faxDocs: 0,
    newPatientChart: 0,
  });

  useEffect(() => {
    if (firstPersonId && !form.staffPersonId) setForm(f => ({ ...f, staffPersonId: firstPersonId }));
    if (firstPersonId && !metricForm.staffPersonId) setMetricForm(f => ({ ...f, staffPersonId: firstPersonId }));
  }, [firstPersonId, form.staffPersonId, metricForm.staffPersonId]);

  // Lets a Billing staff member log their own Fax Docs / New Patient Chart.
  // The two values replace that day's stored values; the server keeps the
  // day's other Intake metrics.
  function handleSaveMetric() {
    if (!metricForm.staffPersonId) {
      toast.error("Select a staff member");
      return;
    }
    setBillingCounts({
      staffPersonId: metricForm.staffPersonId as Id<"people">,
      date: metricForm.date,
      faxDocs: Number(metricForm.faxDocs) || 0,
      newPatientIntake: Number(metricForm.newPatientChart) || 0,
    })
      .then(() => {
        toast.success("Saved");
        setMetricForm(f => ({ ...f, faxDocs: 0, newPatientChart: 0 }));
      })
      .catch(err => toast.error(errorMessage(err, "Failed to save")));
  }

  function handleAdd() {
    if (!form.staffPersonId) {
      toast.error("Select a staff member");
      return;
    }
    addEntry({
      staffPersonId: form.staffPersonId as Id<"people">,
      date: form.date,
      category: form.category,
      count: Math.max(1, Number(form.count) || 1),
    })
      .then(() => {
        toast.success("Billing activity logged");
        setForm(f => ({ ...f, count: 1 }));
      })
      .catch(err => toast.error(errorMessage(err, "Failed to log activity")));
  }

  function startEdit(e: { _id: string; staff: string; date: string; category?: string; tasksCompleted: number }) {
    const person = staff.find(s => s.displayName === e.staff);
    const known = BILLING_CATEGORIES.find(c => c.value === e.category);
    setEditingId(e._id);
    setEditDraft({
      staffPersonId: person?.personId ?? "",
      legacyStaff: person ? "" : e.staff,
      date: e.date,
      category: known?.value ?? BILLING_CATEGORIES[0].value,
      count: e.tasksCompleted || 1,
    });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function saveEdit(id: Id<"billingEntries">) {
    if (!editDraft.staffPersonId && !editDraft.legacyStaff) {
      toast.error("Select a staff member");
      return;
    }
    updateEntry({
      id,
      ...(editDraft.staffPersonId ? { staffPersonId: editDraft.staffPersonId as Id<"people"> } : {}),
      date: editDraft.date,
      category: editDraft.category,
      count: Math.max(1, Number(editDraft.count) || 1),
    })
      .then(() => {
        toast.success("Entry updated");
        setEditingId(null);
      })
      .catch(err => toast.error(errorMessage(err, "Failed to update entry")));
  }

  // Date From / Date To scopes the log table. As in the original, the This
  // Month table counts the same filtered list, but the overview has no range
  // control, so there it always sees every entry.
  const allEntries = useMemo(
    () => (entries ?? []).filter(e => inDateRange(e.date, billingFrom, billingTo)),
    [entries, billingFrom, billingTo],
  );
  const activityEntries = useMemo(() => allEntries.filter(e => !!e.category), [allEntries]);

  const monthTotals = categoryTotals(allEntries, d => isInCurrentMonth(d));
  const monthMetrics = metricTotals(dailyMetrics ?? [], staffNames, d => isInCurrentMonth(d));

  const staffOptions = staff.map(s => (
    <option key={s.personId} value={s.personId}>
      {s.displayName}
    </option>
  ));
  const categoryOptions = BILLING_CATEGORIES.map(category => (
    <option key={category.value} value={category.value}>
      {category.label}
    </option>
  ));

  if (view === "log") {
    return (
      <div className="space-y-6">
        <div className="bg-card border border-border rounded-xl shadow-sm p-5">
          <div className="mb-4">
            <h2 className="font-semibold text-foreground">Billing Activity Log</h2>
            <p className="text-xs text-muted-foreground mt-1">Record and track completed billing activities.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className={labelCls} htmlFor="bill-staff">
                Staff
              </label>
              <select
                id="bill-staff"
                className={inputCls}
                value={form.staffPersonId}
                onChange={e => setForm(f => ({ ...f, staffPersonId: e.target.value }))}
              >
                {staffOptions}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="bill-category">
                Category
              </label>
              <select
                id="bill-category"
                className={inputCls}
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value as BillingCategory }))}
              >
                {categoryOptions}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="bill-count">
                Count
              </label>
              <input
                id="bill-count"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className={inputCls}
                value={form.count}
                onChange={e => setForm(f => ({ ...f, count: digitsOnly(e.target.value) }))}
              />
            </div>
            <button
              type="button"
              onClick={handleAdd}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary hover:bg-primary text-white transition-colors shadow-sm h-[38px]"
            >
              + Log Activity
            </button>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h3 className="font-semibold text-foreground text-sm">Billing Activity Log ({activityEntries.length})</h3>
            <DateRangeFilter
              idPrefix="billing-log"
              size="sm"
              from={billingFrom}
              to={billingTo}
              onChange={({ from, to }) => {
                setBillingFrom(from);
                setBillingTo(to);
              }}
            />
          </div>
          {activityEntries.length === 0 ? (
            <p className="text-muted-foreground text-sm">No activities yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Staff</th>
                    <th className="py-2 pr-3">Category</th>
                    <th className="py-2 pr-3 text-right">Count</th>
                    <th className="py-2 pr-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {[...activityEntries]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map(e => {
                      if (editingId === e._id) {
                        return (
                          <tr key={e._id} className="border-b border-border bg-muted">
                            <td className="py-2 pr-3">
                              <input
                                type="date"
                                aria-label="Date"
                                className={inputCls}
                                value={editDraft.date}
                                onChange={ev => setEditDraft(d => ({ ...d, date: ev.target.value }))}
                              />
                            </td>
                            <td className="py-2 pr-3">
                              <select
                                aria-label="Staff"
                                className={inputCls}
                                value={editDraft.staffPersonId}
                                onChange={ev => setEditDraft(d => ({ ...d, staffPersonId: ev.target.value }))}
                              >
                                {editDraft.legacyStaff && <option value="">{editDraft.legacyStaff}</option>}
                                {staffOptions}
                              </select>
                            </td>
                            <td className="py-2 pr-3">
                              <select
                                aria-label="Category"
                                className={inputCls}
                                value={editDraft.category}
                                onChange={ev =>
                                  setEditDraft(d => ({ ...d, category: ev.target.value as BillingCategory }))
                                }
                              >
                                {categoryOptions}
                              </select>
                            </td>
                            <td className="py-2 pr-3 text-right">
                              <input
                                type="text"
                                aria-label="Count"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                className={`${inputCls} text-right`}
                                value={editDraft.count}
                                onChange={ev => setEditDraft(d => ({ ...d, count: digitsOnly(ev.target.value) }))}
                              />
                            </td>
                            <td className="py-2 pr-3 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => saveEdit(e._id)}
                                className="text-primary hover:opacity-80 text-xs font-medium mr-3"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="text-muted-foreground hover:text-foreground text-xs font-medium"
                              >
                                Cancel
                              </button>
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={e._id} className="border-b border-border hover:bg-muted">
                          <td className="py-2 pr-3 text-muted-foreground">{e.date}</td>
                          <td className="py-2 pr-3 font-medium text-foreground">{e.staff}</td>
                          <td className="py-2 pr-3">{categoryLabel(e.category)}</td>
                          <td className="py-2 pr-3 text-right font-semibold">{e.tasksCompleted ?? 1}</td>
                          <td className="py-2 pr-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => startEdit(e)}
                              className="text-primary hover:opacity-80 text-xs font-medium mr-3"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                deleteEntry({ id: e._id }).catch(err =>
                                  toast.error(errorMessage(err, "Failed to delete")),
                                )
                              }
                              className="text-rose-500 hover:text-rose-700 text-xs font-medium"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  const label = "This Month's Billing Productivity";
  const names = productivityNames(staffNames, monthTotals, monthMetrics);
  return (
    <div className="space-y-6">
      <TeamRosterPanel team="billing" title="Billing Staff" teamName="Billing" />

      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="font-semibold text-foreground text-sm mb-3">Log Fax Docs / New Patient Chart</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className={labelCls} htmlFor="bill-metric-staff">
              Staff
            </label>
            <select
              id="bill-metric-staff"
              className={inputCls}
              value={metricForm.staffPersonId}
              onChange={e => setMetricForm(f => ({ ...f, staffPersonId: e.target.value }))}
            >
              {staffOptions}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="bill-metric-date">
              Date
            </label>
            <input
              id="bill-metric-date"
              type="date"
              className={inputCls}
              value={metricForm.date}
              onChange={e => setMetricForm(f => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="bill-metric-fax">
              Fax Docs
            </label>
            <input
              id="bill-metric-fax"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className={inputCls}
              value={metricForm.faxDocs}
              onChange={e => setMetricForm(f => ({ ...f, faxDocs: digitsOnly(e.target.value) }))}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="bill-metric-npc">
              New Patient Chart
            </label>
            <input
              id="bill-metric-npc"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className={inputCls}
              value={metricForm.newPatientChart}
              onChange={e => setMetricForm(f => ({ ...f, newPatientChart: digitsOnly(e.target.value) }))}
            />
          </div>
          <button
            type="button"
            onClick={handleSaveMetric}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary hover:bg-primary text-white transition-colors shadow-sm h-[38px]"
          >
            Save
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl shadow-sm p-5">
          <h3 className="font-semibold text-foreground text-sm mb-3">{label}</h3>
          {names.length === 0 ? (
            <p className="text-muted-foreground text-xs">No billing activities logged.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-1.5">Staff</th>
                  {BILLING_CATEGORIES.map(category => (
                    <th key={category.value} className="py-1.5 text-right">
                      {category.label}
                    </th>
                  ))}
                  <th className="py-1.5 text-right">Fax Docs</th>
                  <th className="py-1.5 text-right">New Patient Chart</th>
                </tr>
              </thead>
              <tbody>
                {names.map(name => (
                  <tr key={name} className="border-b border-border">
                    <td className="py-1.5 font-medium text-foreground">{name}</td>
                    {BILLING_CATEGORIES.map(category => (
                      <td key={category.value} className="py-1.5 text-right font-semibold">
                        {monthTotals[name]?.[category.value] ?? 0}
                      </td>
                    ))}
                    <td className="py-1.5 text-right font-semibold">{monthMetrics[name]?.faxDocs ?? 0}</td>
                    <td className="py-1.5 text-right font-semibold">{monthMetrics[name]?.newPatientChart ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
