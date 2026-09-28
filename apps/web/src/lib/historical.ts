// Historical Activity helpers (rebuild). Must produce the same output as the
// original HistoricalActivityTab's monthLabel / trendDirection; proven by
// tests/parity/historical.test.ts against the verbatim oracle.
export type MonthRow = { month: string } & Record<string, number | string>;

export type Trend = { pctChange: number; recentAvg: number; priorAvg: number };

export function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(new Date(year, month - 1, 1));
}

const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/**
 * Average of the last 3 months vs the 3 before them. Null when there are
 * fewer than 4 months or the earlier average is 0 (same rule as the original).
 */
export function trendDirection(months: MonthRow[], category: string): Trend | null {
  const values = months.map(m => Number(m[category] ?? 0));
  if (values.length < 4) return null;
  const recent = values.slice(-3);
  const prior = values.slice(-6, -3);
  if (prior.length === 0) return null;
  const recentAvg = average(recent);
  const priorAvg = average(prior);
  if (priorAvg === 0) return null;
  return { pctChange: ((recentAvg - priorAvg) / priorAvg) * 100, recentAvg, priorAvg };
}
