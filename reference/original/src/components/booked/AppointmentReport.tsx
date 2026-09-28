import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarDays, Check, ChevronDown, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import type { Appointment } from "@/components/booked/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ALL_PROVIDERS,
  ALL_APPOINTMENT_TYPES,
  CLINIC_LOCATIONS,
  STATUSES,
  sourceGroup,
} from "@/lib/appointmentOptions";

type DatePreset = "today" | "week" | "month" | "custom";

interface ReportFilters {
  preset: DatePreset;
  customStart: string;
  customEnd: string;
  sources: string[];
  statuses: string[];
  appointmentTypes: string[];
  clinics: string[];
  providers: string[];
}

const EMPTY_FILTERS: ReportFilters = {
  preset: "month",
  customStart: "",
  customEnd: "",
  sources: [],
  statuses: [],
  appointmentTypes: [],
  clinics: [],
  providers: [],
};

const SOURCE_COLORS: Record<string, string> = { SMB: "#facc15", Boost: "#2563eb" };
const DAILY_VOLUME_COLOR = "#6b8e4e"; // earthy green
const MONTHLY_VOLUME_COLOR = "#8b5fbf"; // purple
const STATUS_COLORS: Record<string, string> = {
  Pending: "#3b82f6",
  Showed: "#16a34a",
  "No-Show": "#f97316",
  Cancelled: "#dc2626",
};
const FALLBACK_COLORS = ["#0891b2", "#0d9488", "#ca8a04", "#db2777", "#64748b"];

function easternDateParts(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function parseDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDate(key: string, days: number) {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function dateRange(filters: ReportFilters) {
  const today = easternDateParts(new Date());
  if (filters.preset === "today") return { start: today, end: today };
  if (filters.preset === "week") {
    const day = parseDateKey(today).getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = shiftDate(today, mondayOffset);
    return { start, end: shiftDate(start, 6) };
  }
  if (filters.preset === "month") {
    const [year, month] = today.split("-").map(Number);
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    return { start, end: toDateKey(new Date(year, month, 0, 12)) };
  }
  return {
    start: filters.customStart || "0000-01-01",
    end: filters.customEnd || "9999-12-31",
  };
}

function shortDate(key: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parseDateKey(key));
}

function monthLabel(key: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(parseDateKey(`${key}-01`));
}

function periodDateLabel(key: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    parseDateKey(key),
  );
}

function MultiSelect({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: readonly string[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const summary = values.length === 0 ? `All ${label}` : values.length === 1 ? values[0] : `${values.length} selected`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 min-w-36 justify-between bg-background font-normal">
          <span className="truncate">{summary}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {options.map(option => {
            const selected = values.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() =>
                  onChange(selected ? values.filter(value => value !== option) : [...values, option])
                }
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
              >
                <Checkbox checked={selected} className="pointer-events-none" />
                <span className="flex-1">{option}</span>
                {selected && <Check className="size-3.5 text-primary" />}
              </button>
            );
          })}
        </div>
        {values.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-2 w-full border-t border-border pt-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Clear selection
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-background p-4 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="h-64 min-w-0">{children}</div>
    </section>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
      No appointments match these filters.
    </div>
  );
}

export function AppointmentReport({ appointments }: { appointments: Appointment[] }) {
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const range = useMemo(() => dateRange(filters), [filters]);
  const today = easternDateParts(new Date());
  // Show-rate reporting is always month-to-date (or through the end of a
  // selected historical period), so future scheduled appointments cannot
  // distort the completed-appointment comparison.
  const showRateEnd = range.end < today ? range.end : today;

  const filtered = useMemo(
    () =>
      appointments.filter(appointment => {
        const key = easternDateParts(appointment.apptDateTime);
        return (
          Boolean(key) &&
          key >= range.start &&
          key <= range.end &&
          (filters.sources.length === 0 || filters.sources.includes(sourceGroup(appointment.source))) &&
          (filters.statuses.length === 0 || filters.statuses.includes(appointment.status)) &&
          (filters.appointmentTypes.length === 0 ||
            filters.appointmentTypes.includes(appointment.appointmentType)) &&
          (filters.clinics.length === 0 || filters.clinics.includes(appointment.clinicLocation)) &&
          (filters.providers.length === 0 || filters.providers.includes(appointment.provider))
        );
      }),
    [appointments, filters, range],
  );

  const showRateAppointments = useMemo(
    () => filtered.filter(appointment => easternDateParts(appointment.apptDateTime) <= showRateEnd),
    [filtered, showRateEnd],
  );

  const analytics = useMemo(() => {
    const countBy = (key: (appointment: Appointment) => string) => {
      const counts = new Map<string, number>();
      for (const appointment of filtered) {
        const name = key(appointment) || "Unassigned";
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      return [...counts].map(([name, value]) => ({ name, value }));
    };
    const daily = countBy(appointment => easternDateParts(appointment.apptDateTime)).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const monthly = countBy(appointment => easternDateParts(appointment.apptDateTime).slice(0, 7)).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const source = countBy(appointment => sourceGroup(appointment.source));
    const status = countBy(appointment => appointment.status);
    const booker = countBy(appointment => appointment.scheduler).sort((a, b) => b.value - a.value);
    const clinicShowRate = CLINIC_LOCATIONS.map(clinic => {
      const clinicAppointments = showRateAppointments.filter(appointment => appointment.clinicLocation === clinic);
      const showed = clinicAppointments.filter(appointment => appointment.status === "Showed").length;
      const noShows = clinicAppointments.filter(appointment => appointment.status === "No-Show").length;
      const cancelled = clinicAppointments.filter(appointment => appointment.status === "Cancelled").length;
      const finalOutcomes = showed + noShows + cancelled;
      const rate = finalOutcomes === 0 ? 0 : (showed / finalOutcomes) * 100;
      return {
        clinic,
        rate,
        label: finalOutcomes === 0 ? "—" : `${rate.toFixed(1)}%`,
        showed,
        noShows,
        cancelled,
        finalOutcomes,
      };
    });
    return {
      daily: daily.map(item => ({ ...item, label: shortDate(item.name) })),
      monthly: monthly.map(item => ({ ...item, label: monthLabel(item.name) })),
      source,
      status,
      booker,
      clinicShowRate,
    };
  }, [filtered, showRateAppointments]);

  const total = filtered.length;
  const smb = filtered.filter(appointment => sourceGroup(appointment.source) === "SMB").length;
  const boost = total - smb;
  const showed = filtered.filter(appointment => appointment.status === "Showed").length;
  const cancelled = filtered.filter(appointment => appointment.status === "Cancelled").length;
  const noShows = filtered.filter(appointment => appointment.status === "No-Show").length;
  const conversion = total === 0 ? 0 : (showed / total) * 100;
  const percentageOfTotal = (value: number) => (total === 0 ? 0 : (value / total) * 100);
  const metrics = [
    ["Total Appointments", total, "text-foreground"],
    ["SMB Appointments", smb, "text-blue-600 dark:text-blue-400"],
    ["Boost Appointments", boost, "text-violet-600 dark:text-violet-400"],
    ["Completed Appointments", showed, "text-emerald-600 dark:text-emerald-400"],
    ["Cancelled Appointments", cancelled, "text-red-600 dark:text-red-400"],
    ["No-Shows", noShows, "text-orange-600 dark:text-orange-400"],
    ["Conversion Rate", `${conversion.toFixed(1)}%`, "text-cyan-600 dark:text-cyan-400"],
  ] as const;

  const update = <K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) =>
    setFilters(current => ({ ...current, [key]: value }));
  const chartTooltip = {
    contentStyle: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: "8px",
      color: "var(--foreground)",
      fontSize: "12px",
    },
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-muted/20 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <CalendarDays className="size-4 text-primary" />
              Appointment Performance
            </h2>
            <p className="text-xs text-muted-foreground">
              Filters use Appointment Date/Time in Eastern Time. Completed means Showed.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
            <RotateCcw className="size-3.5" />
            Reset filters
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="flex h-9 items-center rounded-lg border border-border bg-background p-1">
            {([
              ["today", "Today"],
              ["week", "This Week"],
              ["month", "This Month"],
              ["custom", "Custom"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => update("preset", value)}
                className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors ${
                  filters.preset === value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {filters.preset === "custom" && (
            <>
              <Input
                aria-label="Custom start date"
                type="date"
                value={filters.customStart}
                onChange={event => update("customStart", event.target.value)}
                className="h-9 w-40 bg-background"
              />
              <Input
                aria-label="Custom end date"
                type="date"
                min={filters.customStart}
                value={filters.customEnd}
                onChange={event => update("customEnd", event.target.value)}
                className="h-9 w-40 bg-background"
              />
            </>
          )}
          <MultiSelect label="Sources" options={["SMB", "Boost"]} values={filters.sources} onChange={value => update("sources", value)} />
          <MultiSelect label="Statuses" options={STATUSES} values={filters.statuses} onChange={value => update("statuses", value)} />
          <MultiSelect label="Appointment Types" options={ALL_APPOINTMENT_TYPES} values={filters.appointmentTypes} onChange={value => update("appointmentTypes", value)} />
          <MultiSelect label="Clinics" options={CLINIC_LOCATIONS} values={filters.clinics} onChange={value => update("clinics", value)} />
          <MultiSelect label="Providers" options={ALL_PROVIDERS} values={filters.providers} onChange={value => update("providers", value)} />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Showing {range.start} through {range.end} · {total} matching appointment{total === 1 ? "" : "s"}
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {metrics.map(([label, value, color]) => (
          <section key={label} className="rounded-xl border border-border bg-background p-3 shadow-sm">
            <p className="text-[11px] font-medium leading-tight text-muted-foreground">{label}</p>
            <p className={`mt-2 text-2xl font-bold tracking-tight ${color}`}>{value}</p>
          </section>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Appointment Status Breakdown" subtitle="Percentage of selected appointments by status">
          {analytics.status.length === 0 ? <EmptyChart /> : (
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
                    <Cell key={item.name} fill={STATUS_COLORS[item.name] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  {...chartTooltip}
                  formatter={(value, name) => [
                    `${percentageOfTotal(Number(value)).toFixed(1)}% (${Number(value)} appointment${Number(value) === 1 ? "" : "s"})`,
                    name,
                  ]}
                />
                <Legend
                  layout="vertical"
                  verticalAlign="middle"
                  align="right"
                  formatter={value => {
                    const item = analytics.status.find(status => status.name === value);
                    return `${value} ${percentageOfTotal(item?.value ?? 0).toFixed(1)}%`;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Clinic Show Rate"
          subtitle={`Showed ÷ (Showed + No-Show + Cancelled) · ${periodDateLabel(range.start)}–${periodDateLabel(showRateEnd)} (ET)`}
        >
          <div className="flex h-full flex-col justify-center">
            <div className="mb-3 ml-[5.5rem] mr-10 flex justify-between text-[10px] text-muted-foreground">
              {[0, 25, 50, 75, 100].map(value => (
                <span key={value}>{value}%</span>
              ))}
            </div>
            <div className="space-y-5">
              {analytics.clinicShowRate.map((item, index) => (
                <div key={item.clinic} className="grid grid-cols-[5rem_minmax(0,1fr)_2.75rem] items-center gap-2">
                  <span className="truncate text-xs font-medium text-foreground">{item.clinic}</span>
                  <div
                    className="relative h-7 overflow-hidden rounded-md bg-muted"
                    title={`${item.clinic}: ${item.showed} showed / ${item.finalOutcomes} final outcomes`}
                  >
                    <div
                      className="h-full rounded-md transition-[width]"
                      style={{
                        width: `${item.rate}%`,
                        backgroundColor: FALLBACK_COLORS[index % FALLBACK_COLORS.length],
                      }}
                    />
                  </div>
                  <span className="text-right text-sm font-bold text-foreground">{item.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-[11px] text-muted-foreground">
              Hover a bar for showed and final-outcome totals.
            </p>
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Daily Appointment Volume" subtitle="Appointments grouped by calendar day">
          {analytics.daily.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.daily} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                <Tooltip {...chartTooltip} />
                <Bar dataKey="value" name="Appointments" fill={DAILY_VOLUME_COLOR} radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Appointments by Source" subtitle="SMB compared with Boost">
          {analytics.source.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={analytics.source} dataKey="value" nameKey="name" outerRadius={82} label={({ name, value }) => `${name}: ${value}`}>
                  {analytics.source.map(item => <Cell key={item.name} fill={SOURCE_COLORS[item.name] ?? "#64748b"} />)}
                </Pie>
                <Tooltip {...chartTooltip} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Monthly Appointment Volume" subtitle="Appointments grouped by calendar month">
          {analytics.monthly.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.monthly} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                <Tooltip {...chartTooltip} />
                <Bar dataKey="value" name="Appointments" fill={MONTHLY_VOLUME_COLOR} radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
