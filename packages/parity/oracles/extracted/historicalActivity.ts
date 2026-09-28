// AUTO-EXTRACTED ORACLE. DO NOT EDIT.
// Verbatim copy of top-level declarations from the ORIGINAL app:
//   reference/original/src/components/productivity/HistoricalActivityTab.tsx
//   sha256 06a5253b9e73b322a065b5885d1ec0d9b258e9f2c3a727254a85db51e16b1c23
// Regenerate with: bun run packages/parity/extract-oracles.ts
/* biome-ignore-all lint: verbatim third-party copy */


type MonthRow = { month: string } & Record<string, number | string>;

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

export { monthLabel, trendDirection };
export type { MonthRow };
