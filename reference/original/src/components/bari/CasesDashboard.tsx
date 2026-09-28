// Cases Dashboard — replaced the old card/section overview with a
// graph/chart dashboard modelled on the Booked Tracker Dashboard
// (Gretchen, 2026-08-13). Same visual language as
// components/booked/AppointmentReport.tsx: preset + custom date range,
// KPI strip, then recharts pies/bars in ChartCards.
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarDays, RotateCcw } from "lucide-react";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { Button } from "@/components/ui/button";
import type { BariCase } from "@/lib/types";

type Preset = "today" | "week" | "month" | "all" | "custom";

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  in_progress: "In Progress",
  completed: "Completed",
  on_hold: "On Hold",
  reassigned: "Reassigned",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  New: "#3b82f6",
  "In Progress": "#f59e0b",
  Completed: "#16a34a",
  "On Hold": "#64748b",
  Reassigned: "#8b5fbf",
  Cancelled: "#dc2626",
};

const AUTH_STATUS_LABELS: Record<string, string> = {
  pending_pre_auth: "Pending Pre-Auth",
  approved: "Approved",
  partial_approval: "Partial Approval",
  denied: "Denied",
  peer_to_peer: "Peer to Peer",
  appeal: "Appeal",
  pending_pred: "Pending Pred",
  cancelled: "Cancelled",
};

const AUTH_COLORS: Record<string, string> = {
  Approved: "#16a34a",
  "Partial Approval": "#65a30d",
  "Pending Pre-Auth": "#3b82f6",
  "Pending Pred": "#0891b2",
  Denied: "#dc2626",
  "Peer to Peer": "#f59e0b",
  Appeal: "#8b5fbf",
  Cancelled: "#64748b",
};

const CASE_TYPE_LABELS: Record<string, string> = {
  urgent: "Urgent",
  initial_consult: "Initial Consult",
  followup_consult: "Follow-Up Consult",
  no_appointment: "No Appointment",
  reverification: "Reverification",
  predetermination: "Predetermination",
  precert_bari: "Pre-Cert Bari",
  precert_veins: "Pre-Cert Veins",
  precert_general: "Pre-Cert General",
  precert_modified_urgent: "Pre-Cert Mod/Urgent",
  precert_egd: "Pre-Cert EGD",
};

const PRIORITY_COLORS: Record<string, string> = {
  Urgent: "#dc2626",
  High: "#f97316",
  Medium: "#3b82f6",
  Low: "#64748b",
};

const FALLBACK_COLORS = ["#0891b2", "#0d9488", "#ca8a04", "#db2777", "#6b8e4e", "#8b5fbf"];
const CASE_VOLUME_COLOR = "#6b8e4e";
const STAFF_COLOR = "#2563eb";
const COMPLETED_COLOR = "#16a34a";

function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function parseKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

function toKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function shift(key: string, days: number) {
  const d = parseKey(key);
  d.setDate(d.getDate() + days);
  return toKey(d);
}

function shortDate(key: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    parseKey(key),
  );
}

function monthLabel(key: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(
    parseKey(`${key}-01`),
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}
      <div className="mt-3 h-[260px]">{children}</div>
    </section>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
      No cases in this date range.
    </div>
  );
}

function countBy<T extends string>(values: T[]) {
  const map = new Map<string, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function CasesDashboard({ cases }: { cases: BariCase[] }) {
  const [preset, setPreset] = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const range = useMemo(() => {
    const today = todayKey();
    if (preset === "today") return { start: today, end: today };
    if (preset === "week") {
      const day = parseKey(today).getDay();
      const start = shift(today, day === 0 ? -6 : 1 - day);
      return { start, end: shift(start, 6) };
    }
    if (preset === "month") {
      const [year, month] = today.split("-").map(Number);
      return {
        start: `${year}-${String(month).padStart(2, "0")}-01`,
        end: toKey(new Date(year, month, 0, 12)),
      };
    }
    if (preset === "all") return { start: "0000-01-01", end: "9999-12-31" };
    return { start: customFrom || "0000-01-01", end: customTo || "9999-12-31" };
  }, [preset, customFrom, customTo]);

  const inRange = (iso?: string) => {
    if (!iso) return false;
    const day = iso.slice(0, 10);
    return day >= range.start && day <= range.end;
  };

  // Cases *created* in the selected range drive every chart, so all numbers
  // on the page describe the same cohort.
  const scoped = useMemo(() => cases.filter(c => inRange(c.createdAt)), [cases, range]);

  const metrics = useMemo(() => {
    const total = scoped.length;
    const completed = scoped.filter(c => c.status === "completed").length;
    const open = scoped.filter(c =>
      ["new", "in_progress", "on_hold", "reassigned"].includes(c.status),
    ).length;
    const urgent = scoped.filter(c => c.priority === "urgent").length;
    const approved = scoped.filter(
      c => c.authStatus === "approved" || c.authStatus === "partial_approval",
    ).length;
    const pending = scoped.filter(
      c => c.authStatus === "pending_pre_auth" || c.authStatus === "pending_pred",
    ).length;
    const completionRate = total === 0 ? 0 : Math.round((completed / total) * 100);
    return [
      ["Total Cases", String(total), "text-foreground"],
      ["Open", String(open), "text-amber-600"],
      ["Completed", String(completed), "text-emerald-600"],
      ["Completion Rate", `${completionRate}%`, "text-emerald-600"],
      ["Urgent", String(urgent), "text-rose-600"],
      ["Auth Approved", String(approved), "text-emerald-600"],
      ["Auth Pending", String(pending), "text-blue-600"],
    ] as const;
  }, [scoped]);

  const analytics = useMemo(() => {
    const status = countBy(scoped.map(c => STATUS_LABELS[c.status] ?? c.status));
    const caseType = countBy(scoped.map(c => CASE_TYPE_LABELS[c.caseType] ?? c.caseType));
    const priority = countBy(
      scoped.map(c => (c.priority ? c.priority[0].toUpperCase() + c.priority.slice(1) : "Unset")),
    );
    const authStatus = countBy(
      scoped
        .filter(c => c.authStatus)
        .map(c => AUTH_STATUS_LABELS[c.authStatus as string] ?? (c.authStatus as string)),
    );
    const staff = countBy(scoped.map(c => c.assignedTo || "Unassigned")).slice(0, 10);

    const createdByDay = new Map<string, number>();
    const completedByDay = new Map<string, number>();
    const byMonth = new Map<string, number>();
    for (const c of scoped) {
      const day = c.createdAt.slice(0, 10);
      createdByDay.set(day, (createdByDay.get(day) ?? 0) + 1);
      byMonth.set(day.slice(0, 7), (byMonth.get(day.slice(0, 7)) ?? 0) + 1);
    }
    for (const c of scoped) {
      if (!c.completedAt) continue;
      const day = c.completedAt.slice(0, 10);
      completedByDay.set(day, (completedByDay.get(day) ?? 0) + 1);
    }
    const days = [...new Set([...createdByDay.keys(), ...completedByDay.keys()])].sort();
    const daily = days.map(day => ({
      label: shortDate(day),
      created: createdByDay.get(day) ?? 0,
      completed: completedByDay.get(day) ?? 0,
    }));
    const monthly = [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({ label: monthLabel(key), value }));

    return { status, caseType, priority, authStatus, staff, daily, monthly };
  }, [scoped]);

  const chartTooltip = {
    contentStyle: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: "8px",
      color: "var(--foreground)",
      fontSize: "12px",
    },
  };

  const percentage = (value: number) =>
    scoped.length === 0 ? 0 : (value / scoped.length) * 100;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <CalendarDays className="size-4 text-primary" />
              Cases Performance Dashboard
            </h2>
            <p className="text-xs text-muted-foreground">
              All charts cover cases <strong>created</strong> in the selected date range.
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setPreset("month");
              setCustomFrom("");
              setCustomTo("");
            }}
          >
            <RotateCcw className="size-3.5" />
            Reset filters
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 items-center rounded-lg border border-border bg-background p-1">
            {(
              [
                ["today", "Today"],
                ["week", "This Week"],
                ["month", "This Month"],
                ["all", "All Time"],
                ["custom", "Custom"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPreset(value)}
                className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors ${
                  preset === value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <DateRangeFilter
              label="Created"
              idPrefix="cases-dashboard"
              from={customFrom}
              to={customTo}
              onChange={({ from, to }) => {
                setCustomFrom(from);
                setCustomTo(to);
              }}
            />
          )}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {preset === "all"
            ? "Showing all cases"
            : `Showing ${range.start} through ${range.end}`}{" "}
          · {scoped.length} case{scoped.length === 1 ? "" : "s"}
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {metrics.map(([label, value, color]) => (
          <section key={label} className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <p className="text-[11px] font-medium leading-tight text-muted-foreground">{label}</p>
            <p className={`mt-2 text-2xl font-bold tracking-tight ${color}`}>{value}</p>
          </section>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Case Status Breakdown" subtitle="Share of cases by current status">
          {analytics.status.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={analytics.status}
                  dataKey="value"
                  nameKey="name"
                  cx="38%"
                  innerRadius={48}
                  outerRadius={82}
                  paddingAngle={2}
                >
                  {analytics.status.map((item, index) => (
                    <Cell
                      key={item.name}
                      fill={
                        STATUS_COLORS[item.name] ??
                        FALLBACK_COLORS[index % FALLBACK_COLORS.length]
                      }
                    />
                  ))}
                </Pie>
                <Tooltip
                  {...chartTooltip}
                  formatter={(value, name) => [
                    `${percentage(Number(value)).toFixed(1)}% (${Number(value)} case${
                      Number(value) === 1 ? "" : "s"
                    })`,
                    name,
                  ]}
                />
                <Legend
                  layout="vertical"
                  verticalAlign="middle"
                  align="right"
                  formatter={value => {
                    const item = analytics.status.find(s => s.name === value);
                    return `${value} ${percentage(item?.value ?? 0).toFixed(1)}%`;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Cases by Type" subtitle="Bari Task and Pre-Cert case volume by type">
          {analytics.caseType.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analytics.caseType}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 60, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={130}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                />
                <Tooltip {...chartTooltip} />
                <Bar dataKey="value" name="Cases" fill={CASE_VOLUME_COLOR} radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Created vs Completed by Day"
          subtitle="Daily case intake against daily completions"
        >
          {analytics.daily.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.daily} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                <Tooltip {...chartTooltip} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="created"
                  name="Created"
                  stroke={CASE_VOLUME_COLOR}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="completed"
                  name="Completed"
                  stroke={COMPLETED_COLOR}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Cases by Assigned Staff" subtitle="Top 10 by case count">
          {analytics.staff.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.staff} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="name"
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={60}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                />
                <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                <Tooltip {...chartTooltip} />
                <Bar dataKey="value" name="Cases" fill={STAFF_COLOR} radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Pre-Cert Auth Status" subtitle="Authorization outcomes on record">
          {analytics.authStatus.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={analytics.authStatus}
                  dataKey="value"
                  nameKey="name"
                  cx="30%"
                  innerRadius={34}
                  outerRadius={62}
                  paddingAngle={2}
                >
                  {analytics.authStatus.map((item, index) => (
                    <Cell
                      key={item.name}
                      fill={AUTH_COLORS[item.name] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip {...chartTooltip} />
                <Legend
                  layout="vertical"
                  verticalAlign="middle"
                  align="right"
                  wrapperStyle={{ fontSize: 11, lineHeight: "16px", maxWidth: "48%" }}
                  formatter={(value: string) => {
                    const item = analytics.authStatus.find(i => i.name === value);
                    return `${value} (${item?.value ?? 0})`;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Cases by Priority" subtitle="Urgent / High / Medium / Low mix">
          {analytics.priority.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={analytics.priority}
                  dataKey="value"
                  nameKey="name"
                  cx="30%"
                  innerRadius={34}
                  outerRadius={62}
                  paddingAngle={2}
                >
                  {analytics.priority.map((item, index) => (
                    <Cell
                      key={item.name}
                      fill={
                        PRIORITY_COLORS[item.name] ??
                        FALLBACK_COLORS[index % FALLBACK_COLORS.length]
                      }
                    />
                  ))}
                </Pie>
                <Tooltip {...chartTooltip} />
                <Legend
                  layout="vertical"
                  verticalAlign="middle"
                  align="right"
                  wrapperStyle={{ fontSize: 11, lineHeight: "16px", maxWidth: "48%" }}
                  formatter={(value: string) => {
                    const item = analytics.priority.find(i => i.name === value);
                    return `${value} (${item?.value ?? 0})`;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Monthly Case Volume" subtitle="Cases grouped by calendar month">
          {analytics.monthly.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.monthly} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                <Tooltip {...chartTooltip} />
                <Bar dataKey="value" name="Cases" fill="#8b5fbf" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
