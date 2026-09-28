// @vitest-environment edge-runtime
// Proves the synthetic fixtures satisfy the ORIGINAL app's schema validators,
// so `npx convex import` into the reference instance will accept them
// (docs/rebuild/REFERENCE-INSTANCE.md).
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { generateFixtures } from "../../packages/parity/fixtures";
import originalSchema from "../../reference/original/convex/schema";

test("every fixture row inserts cleanly under the original schema", async () => {
  // Only direct DB writes are exercised, so the original's generated stubs are
  // the only modules needed.
  const t = convexTest(originalSchema, import.meta.glob("../../reference/original/convex/_generated/*.js"));
  const set = generateFixtures(20260928);
  const tables = [
    "staff",
    "intakeStaff",
    "billingStaff",
    "cases",
    "intakeEntries",
    "intakeDailyMetrics",
    "billingEntries",
  ] as const;
  const counts = await t.run(async ctx => {
    const result: Record<string, number> = {};
    for (const table of tables) {
      for (const row of set[table]) await ctx.db.insert(table, row as never);
      result[table] = (await ctx.db.query(table).collect()).length;
    }
    return result;
  });
  for (const table of tables) expect(counts[table]).toBe(set[table].length);
  // Guard against a vacuous pass: the backend must really enforce the schema.
  await expect(t.run(ctx => ctx.db.insert("cases", { bogus: 1 } as never))).rejects.toThrow();
});
