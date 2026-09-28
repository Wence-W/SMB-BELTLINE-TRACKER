// Writes a fixture set as one JSONL file per table, ready for loading the
// reference instance with `npx convex import --table <table> <file>`
// (docs/rebuild/REFERENCE-INSTANCE.md).
//
// Usage: bun run packages/parity/generate-fixtures.ts [seed] [outDir]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateFixtures } from "./fixtures";

const seed = Number(process.argv[2] ?? 20260928);
const outDir = process.argv[3] ?? join(import.meta.dirname, "..", "..", "fixtures", "generated", String(seed));
const set = generateFixtures(seed);
mkdirSync(outDir, { recursive: true });
for (const [table, rows] of Object.entries(set)) {
  if (!Array.isArray(rows)) continue;
  writeFileSync(join(outDir, `${table}.jsonl`), `${rows.map(row => JSON.stringify(row)).join("\n")}\n`);
  console.log(`${table}: ${rows.length} rows`);
}
console.log(`Wrote fixtures for seed ${seed} to ${outDir}`);
