import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import historicalData from "@/data/historicalActivity.json";

type MonthRow = { month: string } & Record<string, number | string>;

const DATA = historicalData as unknown as {
  months: MonthRow[];
  categories: string[];
  category_first_seen: Record<string, string>;
};

const CATEGORY_COLORS: Record<string, string> = {
  Intake: "#2563eb",
  Verification: "#16a34a",
  Precert: "#8b5fbf",
  "Booked Appointments": "#6b8e4e",
  "Boost Appts": "#f97316",
  Billing: "#dc2626",
  "Call Audits": "#0891b2",
  "GHL Chats": "#ca8a04",
  Admin: "#64748b",
};

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(
    new Date(year, month - 1, 1),
  );
}

/** Simple linear trend: compares the average of the last 3 available months
 * against the average of the 3 months before that, per category. */
function trendDirection(months: MonthRow[], category: string) {
  const values = months.map(m => Number(m[category] ?? 0));
  if (values.length < 4) return null;
  const recent = values.slice(-3);
  const prior = values.slice(-6, -3);
  if (prior.length === 0) return null;
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
  if (priorAvg === 0) return null;
  const pctChange = ((recentAvg - priorAvg) / priorAvg) * 100;
  return { pctChange, recentAvg, priorAvg };
}

export function HistoricalActivityTab() {
  const [selected, setSelected] = useState<string[]>(DATA.categories);

  const chartData = useMemo(
    () =>
      DATA.months.map(row => ({
        ...row,
        label: monthLabel(row.month),
      })),
    [],
  );

  function toggleCategory(cat: string) {
    setSelected(prev => (prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]));
  }

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl shadow-sm px-5 py-4">
        <h2 className="text-lg font-bold text-foreground">Historical Activity (Aug 2024 – Jul 2026)</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Team-wide activity volume by category, imported from the historical productivity tracker
          spreadsheet. This is a read-only archive for context and trend comparison — it does not
          affect live Cases, Tasks, or Reports data.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm px-5 py-4">
        <div className="flex flex-wrap gap-2 mb-4">
          {DATA.categories.map(cat => {
            const isNewService = DATA.category_first_seen[cat] !== DATA.months[0]?.month;
            return (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  selected.includes(cat)
                    ? "text-white border-transparent"
                    : "bg-muted text-muted-foreground border-border"
                }`}
                style={selected.includes(cat) ? { backgroundColor: CATEGORY_COLORS[cat] } : undefined}
              >
                {cat}
                {isNewService && <span className="ml-1 opacity-80">•new</span>}
              </button>
            );
          })}
        </div>

        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--foreground)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--foreground)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {DATA.categories
                .filter(cat => selected.includes(cat))
                .map(cat => (
                  <Line
                    key={cat}
                    type="monotone"
                    dataKey={cat}
                    stroke={CATEGORY_COLORS[cat]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          "•new" categories (Boost Appts, Call Audits, Billing) didn't exist for the full history —
          their line only starts from the month the service was introduced, so an early flat/zero
          period is expected, not a drop in activity.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm px-5 py-4">
        <h3 className="text-sm font-bold text-foreground mb-3">
          Recent trend (last 3 months vs. prior 3 months)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {DATA.categories.map(cat => {
            const trend = trendDirection(DATA.months, cat);
            if (!trend) return null;
            const up = trend.pctChange >= 0;
            return (
              <div key={cat} className="border border-border rounded-lg px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{cat}</span>
                  <span
                    className={`text-sm font-bold ${up ? "text-green-600" : "text-red-600"}`}
                  >
                    {up ? "▲" : "▼"} {Math.abs(trend.pctChange).toFixed(0)}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {trend.recentAvg.toFixed(0)}/mo recently vs. {trend.priorAvg.toFixed(0)}/mo before
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
