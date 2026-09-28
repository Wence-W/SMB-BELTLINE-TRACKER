import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DateRangeFilter, inDateRange } from "@/components/DateRangeFilter";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { isInCurrentMonth } from "@/lib/intakeTypes";
import { now } from "@/lib/store";
import { ManageStaffPanel } from "./ManageStaffPanel";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const inputCls =
  "w-full bg-card border border-input text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-primary";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

const BILLING_CATEGORIES = [
  { value: "new_claims", label: "New Claims" },
  { value: "ar_aging", label: "A/R Aging" },
  { value: "emails", label: "Emails" },
  { value: "boost_billing", label: "Boost Billing" },
] as const;

const BILLING_CATEGORY_LABELS = Object.fromEntries(
  BILLING_CATEGORIES.map(category => [category.value, category.label]),
) as Record<string, string>;

type BillingCategoryTotals = Record<string, Record<string, number>>;

export function BillingTab({ view = "overview" }: { view?: "overview" | "log" }) {
  const [billingFrom, setBillingFrom] = useState("");
  const [billingTo, setBillingTo] = useState("");
  const staff = useQuery(api.billing.listStaff);
  const entries = useQuery(api.billing.listEntries);
  const dailyMetrics = useQuery(api.intake.listDailyMetrics);
  const seedStaff = useMutation(api.billing.seedStaffDefaults);
  const addEntry = useMutation(api.billing.addEntry);
  const updateEntry = useMutation(api.billing.updateEntry);
  const deleteEntry = useMutation(api.billing.deleteEntry);
  const addStaffMut = useMutation(api.billing.addStaff);
  const deleteStaffMut = useMutation(api.billing.deleteStaff);
  const upsertMetric = useMutation(api.intake.upsertDailyMetric);

  useEffect(() => {
    seedStaff({}).catch(() => {});
  }, [seedStaff]);

  const staffNames = useMemo(() => (staff ?? []).map(s => s.name), [staff]);

  const [form, setForm] = useState<{
    staff: string;
    date: string;
    category: string;
    count: number;
  }>({
    staff: "",
    date: todayISO(),
    category: BILLING_CATEGORIES[0].value,
    count: 1,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    staff: string;
    date: string;
    category: string;
    count: number;
  }>({ staff: "", date: "", category: "", count: 1 });

  const [metricForm, setMetricForm] = useState({
    staff: "",
    date: todayISO(),
    faxDocs: 0,
    newPatientChart: 0,
  });

  useEffect(() => {
    if (staffNames.length > 0 && !form.staff) {
      setForm(f => ({ ...f, staff: staffNames[0] }));
    }
    if (staffNames.length > 0 && !metricForm.staff) {
      setMetricForm(f => ({ ...f, staff: staffNames[0] }));
    }
  }, [staffNames, form.staff, metricForm.staff]);

  // Lets a Billing staff member log their own Fax Docs / New Patient Chart
  // directly (part of their own productivity), instead of relying on an
  // Intake Team entry happening to share their name.
  function handleSaveMetric() {
    if (!metricForm.staff) {
      toast.error("Select a staff member");
      return;
    }
    const existing = (dailyMetrics ?? []).find(
      m => m.staff === metricForm.staff && m.date === metricForm.date,
    );
    upsertMetric({
      staff: metricForm.staff,
      date: metricForm.date,
      emailsSent: existing?.emailsSent ?? 0,
      ghlChats: existing?.ghlChats ?? 0,
      callAudits: existing?.callAudits ?? 0,
      faxDocs: Number(metricForm.faxDocs) || 0,
      newPatientIntake: Number(metricForm.newPatientChart) || 0,
      updatedAt: now(),
    })
      .then(() => {
        toast.success("Saved");
        setMetricForm(f => ({ ...f, faxDocs: 0, newPatientChart: 0 }));
      })
      .catch(() => toast.error("Failed to save"));
  }

  function handleAdd() {
    if (!form.staff) {
      toast.error("Select a staff member");
      return;
    }
    addEntry({
      staff: form.staff,
      date: form.date,
      category: form.category,
      count: Math.max(1, Number(form.count) || 1),
      createdAt: now(),
    })
      .then(() => {
        toast.success("Billing activity logged");
        setForm(f => ({ ...f, count: 1 }));
      })
      .catch(() => toast.error("Failed to log activity"));
  }

  function startEdit(e: { _id: string; staff: string; date: string; category?: string; tasksCompleted: number }) {
    setEditingId(e._id);
    setEditDraft({
      staff: e.staff,
      date: e.date,
      category: e.category ?? BILLING_CATEGORIES[0].value,
      count: e.tasksCompleted || 1,
    });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function saveEdit(_id: Id<"billingEntries">) {
    if (!editDraft.staff) {
      toast.error("Select a staff member");
      return;
    }
    updateEntry({
      _id,
      staff: editDraft.staff,
      date: editDraft.date,
      category: editDraft.category,
      count: Math.max(1, Number(editDraft.count) || 1),
    })
      .then(() => {
        toast.success("Entry updated");
        setEditingId(null);
      })
      .catch(() => toast.error("Failed to update entry"));
  }

  const rawBillingEntries = entries ?? [];
  // Date From / Date To (Gretchen, 2026-08-13) — scopes the Billing Log
  // table below; the period cards keep their own week/month logic.
  const allEntries = useMemo(
    () => rawBillingEntries.filter(e => inDateRange(e.date, billingFrom, billingTo)),
    [rawBillingEntries, billingFrom, billingTo],
  );
  const activityEntries = useMemo(
    () => allEntries.filter(e => !!e.category),
    [allEntries],
  );

  function categoryTotals(filterFn: (d: string) => boolean): BillingCategoryTotals {
    const byStaff: BillingCategoryTotals = {};
    for (const e of allEntries) {
      if (!filterFn(e.date)) continue;
      if (!e.category || !BILLING_CATEGORY_LABELS[e.category]) continue;
      byStaff[e.staff] ??= {};
      byStaff[e.staff][e.category] = (byStaff[e.staff][e.category] ?? 0) + (e.tasksCompleted || 1);
    }
    return byStaff;
  }

  const monthTotals = categoryTotals(isInCurrentMonth);

  // Fax Docs / New Patient Chart, logged directly by Billing staff below
  // (or by an Intake Team member sharing the exact same name). Only shown
  // for staff who are actually on the Billing roster — matching against
  // ALL staff-name keys in dailyMetrics would incorrectly pull in Intake
  // Team members who happen to share a name but never did billing work.
  function metricTotals(filterFn: (d: string) => boolean) {
    const byStaff: Record<string, { faxDocs: number; newPatientChart: number }> = {};
    const rosterNames = new Set(staffNames);
    for (const m of dailyMetrics ?? []) {
      if (!filterFn(m.date)) continue;
      if (!rosterNames.has(m.staff)) continue;
      byStaff[m.staff] ??= { faxDocs: 0, newPatientChart: 0 };
      byStaff[m.staff].faxDocs += m.faxDocs;
      byStaff[m.staff].newPatientChart += m.newPatientIntake;
    }
    return byStaff;
  }
  const monthMetrics = metricTotals(isInCurrentMonth);

  if (view === "log") {
    return (
      <div className="space-y-6">
        <div className="bg-card border border-border rounded-xl shadow-sm p-5">
          <div className="mb-4">
            <h2 className="font-semibold text-foreground">Billing Activity Log</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Record and track completed billing activities.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className={labelCls} htmlFor="bill-staff">Staff</label>
              <select
                id="bill-staff"
                className={inputCls}
                value={form.staff}
                onChange={e => setForm(f => ({ ...f, staff: e.target.value }))}
              >
                {staffNames.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="bill-category">Category</label>
              <select
                id="bill-category"
                className={inputCls}
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              >
                {BILLING_CATEGORIES.map(category => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="bill-count">Count</label>
              <input
                id="bill-count"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className={inputCls}
                value={form.count}
                onChange={e =>
                  setForm(f => ({ ...f, count: Number(e.target.value.replace(/\D/g, "")) }))
                }
              />
            </div>
            <button
              onClick={handleAdd}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary hover:bg-primary text-white transition-colors shadow-sm h-[38px]"
            >
              + Log Activity
            </button>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h3 className="font-semibold text-foreground text-sm">
              Billing Activity Log ({activityEntries.length})
            </h3>
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
                      const isEditing = editingId === e._id;
                      if (isEditing) {
                        return (
                          <tr key={e._id} className="border-b border-border bg-muted">
                            <td className="py-2 pr-3">
                              <input
                                type="date"
                                className={inputCls}
                                value={editDraft.date}
                                onChange={ev => setEditDraft(d => ({ ...d, date: ev.target.value }))}
                              />
                            </td>
                            <td className="py-2 pr-3">
                              <select
                                className={inputCls}
                                value={editDraft.staff}
                                onChange={ev => setEditDraft(d => ({ ...d, staff: ev.target.value }))}
                              >
                                {staffNames.map(n => (
                                  <option key={n} value={n}>{n}</option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 pr-3">
                              <select
                                className={inputCls}
                                value={editDraft.category}
                                onChange={ev => setEditDraft(d => ({ ...d, category: ev.target.value }))}
                              >
                                {BILLING_CATEGORIES.map(category => (
                                  <option key={category.value} value={category.value}>
                                    {category.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 pr-3 text-right">
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                className={`${inputCls} text-right`}
                                value={editDraft.count}
                                onChange={ev =>
                                  setEditDraft(d => ({
                                    ...d,
                                    count: Number(ev.target.value.replace(/\D/g, "")),
                                  }))
                                }
                              />
                            </td>
                            <td className="py-2 pr-3 text-right whitespace-nowrap">
                              <button
                                onClick={() => saveEdit(e._id as Id<"billingEntries">)}
                                className="text-primary hover:opacity-80 text-xs font-medium mr-3"
                              >
                                Save
                              </button>
                              <button
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
                          <td className="py-2 pr-3">
                            {e.category
                              ? (BILLING_CATEGORY_LABELS[e.category] ?? e.category)
                              : "Legacy Billing Task"}
                          </td>
                          <td className="py-2 pr-3 text-right font-semibold">{e.tasksCompleted ?? 1}</td>
                          <td className="py-2 pr-3 text-right whitespace-nowrap">
                            <button
                              onClick={() => startEdit(e)}
                              className="text-primary hover:opacity-80 text-xs font-medium mr-3"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() =>
                                deleteEntry({ _id: e._id as Id<"billingEntries"> }).catch(() =>
                                  toast.error("Failed to delete"),
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

  return (
    <div className="space-y-6">
      <ManageStaffPanel
        title="Billing Staff"
        staffList={staff ?? []}
        onAddStaff={(name, email) =>
          addStaffMut({ name, email }).catch(() => toast.error("Failed to add staff"))
        }
        onDeleteStaff={s =>
          deleteStaffMut({ _id: s._id as Id<"billingStaff"> }).catch(() =>
            toast.error("Failed to remove staff"),
          )
        }
      />

      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="font-semibold text-foreground text-sm mb-3">
          Log Fax Docs / New Patient Chart
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className={labelCls} htmlFor="bill-metric-staff">Staff</label>
            <select
              id="bill-metric-staff"
              className={inputCls}
              value={metricForm.staff}
              onChange={e => setMetricForm(f => ({ ...f, staff: e.target.value }))}
            >
              {staffNames.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="bill-metric-date">Date</label>
            <input
              id="bill-metric-date"
              type="date"
              className={inputCls}
              value={metricForm.date}
              onChange={e => setMetricForm(f => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="bill-metric-fax">Fax Docs</label>
            <input
              id="bill-metric-fax"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className={inputCls}
              value={metricForm.faxDocs}
              onChange={e =>
                setMetricForm(f => ({
                  ...f,
                  faxDocs: Number(e.target.value.replace(/\D/g, "")),
                }))
              }
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="bill-metric-npc">New Patient Chart</label>
            <input
              id="bill-metric-npc"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className={inputCls}
              value={metricForm.newPatientChart}
              onChange={e =>
                setMetricForm(f => ({
                  ...f,
                  newPatientChart: Number(e.target.value.replace(/\D/g, "")),
                }))
              }
            />
          </div>
          <button
            onClick={handleSaveMetric}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary hover:bg-primary text-white transition-colors shadow-sm h-[38px]"
          >
            Save
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {(
          [
            ["This Month's Billing Productivity", monthTotals, monthMetrics],
          ] as const
        ).map(([label, data, metrics]) => {
          const names = Array.from(new Set([...staffNames, ...Object.keys(data), ...Object.keys(metrics)]));
          return (
            <div key={label} className="bg-card border border-border rounded-xl shadow-sm p-5">
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
                            {data[name]?.[category.value] ?? 0}
                          </td>
                        ))}
                        <td className="py-1.5 text-right font-semibold">{metrics[name]?.faxDocs ?? 0}</td>
                        <td className="py-1.5 text-right font-semibold">{metrics[name]?.newPatientChart ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}
