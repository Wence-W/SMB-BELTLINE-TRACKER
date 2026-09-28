import { useState } from "react";
import type { StaffRecord, StaffWorkloadEntry } from "@/lib/types";

interface StaffExtras {
  faxDocs: number;
  newPatientChart: number;
  callAudits: number;
  otherConcern: number;
  urgentTasks: number;
  expiringTasks: number;
}

interface Props {
  workload: StaffWorkloadEntry[];
  staffList: StaffRecord[];
  extras?: Record<string, StaffExtras>;
  onAddStaff: (name: string, color: string, email?: string) => void;
  onDeleteStaff: (staff: StaffRecord) => void;
  onUpdateStaffEmail: (staff: StaffRecord, email: string) => void;
  onLogMetric?: (
    staff: string,
    date: string,
    faxDocs: number,
    newPatientChart: number,
  ) => void;
  onLogOtherConcern?: (staff: string, date: string, count: number) => void;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export const COLOR_STYLES: Record<
  string,
  { ring: string; bg: string; text: string; dot: string }
> = {
  pink: {
    ring: "ring-pink-500/50",
    bg: "bg-pink-500/20",
    text: "text-pink-700",
    dot: "bg-pink-400",
  },
  blue: {
    ring: "ring-blue-500/50",
    bg: "bg-primary/20",
    text: "text-primary",
    dot: "bg-primary",
  },
  green: {
    ring: "ring-emerald-500/50",
    bg: "bg-emerald-500/20",
    text: "text-emerald-700",
    dot: "bg-emerald-400",
  },
  purple: {
    ring: "ring-violet-500/50",
    bg: "bg-violet-500/20",
    text: "text-violet-700",
    dot: "bg-violet-400",
  },
  yellow: {
    ring: "ring-amber-500/50",
    bg: "bg-amber-500/20",
    text: "text-amber-700",
    dot: "bg-amber-400",
  },
  cyan: {
    ring: "ring-cyan-500/50",
    bg: "bg-cyan-500/20",
    text: "text-cyan-700",
    dot: "bg-cyan-400",
  },
  orange: {
    ring: "ring-orange-500/50",
    bg: "bg-orange-500/20",
    text: "text-orange-700",
    dot: "bg-orange-400",
  },
  red: {
    ring: "ring-rose-500/50",
    bg: "bg-rose-500/20",
    text: "text-rose-700",
    dot: "bg-rose-400",
  },
  teal: {
    ring: "ring-teal-500/50",
    bg: "bg-teal-500/20",
    text: "text-teal-400",
    dot: "bg-teal-400",
  },
  indigo: {
    ring: "ring-indigo-500/50",
    bg: "bg-indigo-500/20",
    text: "text-indigo-400",
    dot: "bg-indigo-400",
  },
  lime: {
    ring: "ring-lime-500/50",
    bg: "bg-lime-500/20",
    text: "text-lime-400",
    dot: "bg-lime-400",
  },
  fuchsia: {
    ring: "ring-fuchsia-500/50",
    bg: "bg-fuchsia-500/20",
    text: "text-fuchsia-400",
    dot: "bg-fuchsia-400",
  },
};

const COLOR_ORDER = Object.keys(COLOR_STYLES);

export function nextAvailableColor(staffList: StaffRecord[]): string {
  const used = new Set(staffList.map(s => s.color));
  return COLOR_ORDER.find(c => !used.has(c)) ?? COLOR_ORDER[staffList.length % COLOR_ORDER.length];
}

export function StaffWorkload({
  workload,
  staffList,
  extras,
  onAddStaff,
  onDeleteStaff,
  onUpdateStaffEmail,
  onLogMetric,
  onLogOtherConcern,
}: Props) {
  const [managing, setManaging] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<StaffRecord | null>(null);
  const [editingEmailFor, setEditingEmailFor] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [loggingMetric, setLoggingMetric] = useState(false);
  const [metricForm, setMetricForm] = useState({
    staff: "",
    date: todayISO(),
    faxDocs: 0,
    newPatientChart: 0,
  });
  const [loggingConcern, setLoggingConcern] = useState(false);
  const [concernForm, setConcernForm] = useState({
    staff: "",
    date: todayISO(),
    count: 1,
  });

  const maxTotal = Math.max(...workload.map(s => s.total + s.precertTotal), 1);
  const colorByName = new Map(staffList.map(s => [s.name, s.color]));

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    onAddStaff(name, nextAvailableColor(staffList), newEmail.trim() || undefined);
    setNewName("");
    setNewEmail("");
  }

  return (
    <div className="rounded-xl border border-border bg-card backdrop-blur-sm p-5">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="font-bold text-foreground text-base">Verification Team</h2>
        <div className="flex gap-2">
          {onLogMetric && (
            <button
              onClick={() => {
                setLoggingMetric(m => !m);
                if (!metricForm.staff && staffList.length > 0) {
                  setMetricForm(f => ({ ...f, staff: staffList[0].name }));
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                loggingMetric
                  ? "bg-primary text-white border-primary"
                  : "bg-muted hover:bg-secondary text-foreground border-input"
              }`}
            >
              {loggingMetric ? "Done" : "📠 Log Fax Docs / Chart"}
            </button>
          )}
          {onLogOtherConcern && (
            <button
              onClick={() => {
                setLoggingConcern(c => !c);
                if (!concernForm.staff && staffList.length > 0) {
                  setConcernForm(f => ({ ...f, staff: staffList[0].name }));
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                loggingConcern
                  ? "bg-primary text-white border-primary"
                  : "bg-muted hover:bg-secondary text-foreground border-input"
              }`}
            >
              {loggingConcern ? "Done" : "📋 Log Inbound Other Concern"}
            </button>
          )}
          <button
            onClick={() => setManaging(m => !m)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              managing
                ? "bg-primary text-white border-primary"
                : "bg-muted hover:bg-secondary text-foreground border-input"
            }`}
          >
            {managing ? "Done" : "⚙️ Manage Staff"}
          </button>
        </div>
      </div>

      {loggingMetric && onLogMetric && (
        <div className="mb-4 rounded-lg border border-border bg-card/40 p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Staff</label>
              <select
                value={metricForm.staff}
                onChange={e => setMetricForm(f => ({ ...f, staff: e.target.value }))}
                className="w-full rounded-lg bg-card border border-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                {staffList.map(s => (
                  <option key={s._id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
              <input
                type="date"
                value={metricForm.date}
                onChange={e => setMetricForm(f => ({ ...f, date: e.target.value }))}
                className="w-full rounded-lg bg-card border border-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Fax Docs</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={metricForm.faxDocs}
                onChange={e =>
                  setMetricForm(f => ({
                    ...f,
                    faxDocs: Number(e.target.value.replace(/\D/g, "")),
                  }))
                }
                className="w-full rounded-lg bg-card border border-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">New Patient Chart</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={metricForm.newPatientChart}
                onChange={e =>
                  setMetricForm(f => ({
                    ...f,
                    newPatientChart: Number(e.target.value.replace(/\D/g, "")),
                  }))
                }
                className="w-full rounded-lg bg-card border border-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
            <button
              onClick={() => {
                if (!metricForm.staff) return;
                onLogMetric(
                  metricForm.staff,
                  metricForm.date,
                  metricForm.faxDocs,
                  metricForm.newPatientChart,
                );
                setMetricForm(f => ({ ...f, faxDocs: 0, newPatientChart: 0 }));
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary hover:bg-primary text-white transition-colors shadow-sm h-[38px]"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {loggingConcern && onLogOtherConcern && (
        <div className="mb-4 rounded-lg border border-border bg-card/40 p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Staff</label>
              <select
                value={concernForm.staff}
                onChange={e => setConcernForm(f => ({ ...f, staff: e.target.value }))}
                className="w-full rounded-lg bg-card border border-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                {staffList.map(s => (
                  <option key={s._id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
              <input
                type="date"
                value={concernForm.date}
                onChange={e => setConcernForm(f => ({ ...f, date: e.target.value }))}
                className="w-full rounded-lg bg-card border border-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Count</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={concernForm.count}
                onChange={e =>
                  setConcernForm(f => ({
                    ...f,
                    count: Number(e.target.value.replace(/\D/g, "")),
                  }))
                }
                className="w-full rounded-lg bg-card border border-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
            <button
              onClick={() => {
                if (!concernForm.staff) return;
                onLogOtherConcern(concernForm.staff, concernForm.date, concernForm.count);
                setConcernForm(f => ({ ...f, count: 1 }));
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary hover:bg-primary text-white transition-colors shadow-sm h-[38px]"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {managing && (
        <div className="mb-4 rounded-lg border border-border bg-card/40 p-4 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
              placeholder="New staff member name…"
              className="flex-1 rounded-lg bg-card border border-input/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
            <input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
              placeholder="Email (optional, for notifications)"
              className="flex-1 rounded-lg bg-card border border-input/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + Add
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Deleting a staff member does not delete their cases — existing
            cases keep the name they were assigned to. Add an email to enable
            task notifications for that person.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {workload.map(staff => {
          const color = colorByName.get(staff.name) ?? "blue";
          const c = COLOR_STYLES[color] ?? COLOR_STYLES.blue;
          const pct = Math.round(((staff.total + staff.precertTotal) / maxTotal) * 100);
          const record = staffList.find(s => s.name === staff.name);

          return (
            <div
              key={staff.name}
              className="relative rounded-lg border border-border bg-card/40 p-4"
            >
              {managing && record && (
                <button
                  onClick={() => setConfirmDelete(record)}
                  title={`Remove ${staff.name}`}
                  className="absolute top-2 right-2 size-6 rounded-full bg-rose-600/20 hover:bg-rose-600/60 text-rose-700 hover:text-white text-xs font-bold transition-colors flex items-center justify-center"
                >
                  ✕
                </button>
              )}

              {/* Avatar */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`size-10 rounded-full ${c.bg} ring-2 ${c.ring} flex items-center justify-center`}
                >
                  <span className={`font-bold text-sm ${c.text}`}>
                    {staff.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <div className="font-semibold text-foreground text-sm">
                    {staff.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {staff.total + staff.precertTotal} open cases
                  </div>
                  {managing && record && (
                    editingEmailFor === record._id ? (
                      <div className="flex gap-1 mt-1">
                        <input
                          type="email"
                          value={emailDraft}
                          autoFocus
                          onChange={e => setEmailDraft(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              onUpdateStaffEmail(record, emailDraft.trim());
                              setEditingEmailFor(null);
                            }
                            if (e.key === "Escape") setEditingEmailFor(null);
                          }}
                          placeholder="email@…"
                          className="w-full rounded bg-card border border-input/60 px-1.5 py-0.5 text-[10px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/60"
                        />
                        <button
                          onClick={() => {
                            onUpdateStaffEmail(record, emailDraft.trim());
                            setEditingEmailFor(null);
                          }}
                          className="text-[10px] text-primary hover:text-primary"
                        >
                          ✓
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingEmailFor(record._id);
                          setEmailDraft(record.email ?? "");
                        }}
                        className="text-[10px] text-muted-foreground hover:text-primary mt-0.5 block truncate max-w-[140px] text-left"
                        title="Click to edit email"
                      >
                        {record.email ?? "+ add email"}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Breakdown */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-rose-400 inline-block" />
                    Urgent
                  </span>
                  <span className="text-sm font-semibold text-rose-700">
                    {staff.urgent}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-orange-400 inline-block" />
                    High
                  </span>
                  <span className="text-sm font-semibold text-orange-700">
                    {staff.high}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-muted-foreground inline-block" />
                    Standard
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {staff.standard}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-2">
                  <span className="text-xs text-muted-foreground font-medium">
                    Total Assigned
                  </span>
                  <span className={`text-sm font-bold ${c.text}`}>
                    {staff.total}
                  </span>
                </div>
              </div>

              {/* Pre-Cert (kept separate from Verification workload above) */}
              <div className="mt-3 pt-2 border-t border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-indigo-400 inline-block" />
                    Pre-Cert Urgent
                  </span>
                  <span className="text-sm font-semibold text-indigo-700">
                    {staff.precertUrgent}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-orange-300 inline-block" />
                    Pre-Cert High
                  </span>
                  <span className="text-sm font-semibold text-orange-700">
                    {staff.precertHigh}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-indigo-300 inline-block" />
                    Pre-Cert Standard
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {staff.precertStandard}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-medium">
                    Total Pre-Cert
                  </span>
                  <span className="text-sm font-bold text-indigo-700">
                    {staff.precertTotal}
                  </span>
                </div>
              </div>

              {/* Fax Docs / New Patient Chart (from Intake Daily Metrics) */}
              {(() => {
                const extra = extras?.[staff.name];
                if (!extra) return null;
                return (
                  <div className="mt-3 pt-2 border-t border-border space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Fax Docs</span>
                      <span className="text-xs font-semibold text-foreground">
                        {extra.faxDocs}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        New Patient Chart
                      </span>
                      <span className="text-xs font-semibold text-foreground">
                        {extra.newPatientChart}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Call Audits
                      </span>
                      <span className="text-xs font-semibold text-foreground">
                        {extra.callAudits}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Inbound Other Concern
                      </span>
                      <span className="text-xs font-semibold text-foreground">
                        {extra.otherConcern}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Task notifications: open urgent tasks + expiring/expired tasks */}
              {(() => {
                const extra = extras?.[staff.name];
                if (!extra || (extra.urgentTasks === 0 && extra.expiringTasks === 0)) {
                  return null;
                }
                return (
                  <div className="mt-3 pt-2 border-t border-border flex flex-wrap gap-1.5">
                    {extra.urgentTasks > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-semibold">
                        🔔 {extra.urgentTasks} Urgent Task
                        {extra.urgentTasks !== 1 ? "s" : ""}
                      </span>
                    )}
                    {extra.expiringTasks > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold">
                        ⏰ {extra.expiringTasks} Expiring Task
                        {extra.expiringTasks !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* Load bar */}
              <div className="mt-3">
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${c.bg.replace("/20", "/80")}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 text-right">
                  {pct}% of max load
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {workload.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No staff members yet. Click “Manage Staff” to add your team.
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl">
            <h3 className="font-bold text-foreground text-base mb-2">
              Remove {confirmDelete.name}?
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {confirmDelete.name} will be removed from the staff list. Their
              existing cases will not be deleted.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 rounded-lg bg-muted hover:bg-muted text-foreground text-sm font-medium transition-colors"
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
