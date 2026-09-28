// AUTO-EXTRACTED ORACLE. DO NOT EDIT.
// Verbatim copy of top-level declarations from the ORIGINAL app:
//   reference/original/src/components/DateRangeFilter.tsx
//   sha256 bb383e5ec9ab95ceadc8f7f081a6baa944d7eb5457897e9db955791ed0a10017
// Regenerate with: bun run packages/parity/extract-oracles.ts
/* biome-ignore-all lint: verbatim third-party copy */


/** True when `iso` (any ISO date/datetime string) falls inside [from, to].
 *  Blank ends are open-ended; a missing date only passes when no range set. */
export function inDateRange(
  iso: string | undefined | null,
  from: string,
  to: string,
): boolean {
  if (!from && !to) return true;
  if (!iso) return false;
  const day = iso.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

