// @vitest-environment edge-runtime
// Differential test: the SAME random sequence of Billing actions is run
// against the ORIGINAL backend (reference/original/convex, in memory, with the
// original schema) and against the rebuild. The stored billing and metric rows
// must end up identical. The original's browser code for "Save" (read the
// day's row, then upsert the whole row) is reproduced step for step.
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import fc from "fast-check";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import originalSchema from "../../reference/original/convex/schema";
import { newBackend, seedUser } from "./helpers";

const originalModules = import.meta.glob([
  "../../reference/original/convex/_generated/*.js",
  "../../reference/original/convex/billing.ts",
  "../../reference/original/convex/intake.ts",
]);
const original = anyApi;

const STAFF = ["alpha", "bravo"] as const;
const DATES = ["2026-09-01", "2026-09-02", "2026-10-01"];
const CATEGORIES = ["new_claims", "ar_aging", "emails", "boost_billing"] as const;
const COUNTS = [undefined, 0, 1, 2.5, 3.49, -2, 12];

type Op =
  | { kind: "add"; staff: number; date: number; category: number; count: number }
  | { kind: "update"; target: number; staff: number; date: number; category: number; count: number }
  | { kind: "delete"; target: number }
  | { kind: "metric"; staff: number; date: number; faxDocs: number; npc: number };

const op: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    kind: fc.constant("add" as const),
    staff: fc.nat(1),
    date: fc.nat(2),
    category: fc.nat(3),
    count: fc.nat(COUNTS.length - 1),
  }),
  fc.record({
    kind: fc.constant("update" as const),
    target: fc.nat(20),
    staff: fc.nat(1),
    date: fc.nat(2),
    category: fc.nat(3),
    count: fc.nat(COUNTS.length - 2),
  }),
  fc.record({ kind: fc.constant("delete" as const), target: fc.nat(20) }),
  fc.record({
    kind: fc.constant("metric" as const),
    staff: fc.nat(1),
    date: fc.nat(2),
    faxDocs: fc.nat(9),
    npc: fc.nat(9),
  }),
);

type Row = Record<string, unknown>;
const pick = (rows: Row[], keys: string[]) => rows.map(r => Object.fromEntries(keys.map(k => [k, r[k]])));
const ENTRY_KEYS = ["staff", "date", "category", "tasksCompleted"];
const METRIC_KEYS = ["staff", "date", "emailsSent", "ghlChats", "newPatientIntake", "callAudits", "faxDocs"];

test("any sequence of Billing actions leaves the same rows as the original backend", async () => {
  await fc.assert(
    fc.asyncProperty(fc.array(op, { maxLength: 25 }), async ops => {
      const old = convexTest(originalSchema, originalModules);
      const t = newBackend();
      const people: Id<"people">[] = [];
      for (const name of STAFF) {
        const { personId } = await seedUser(t, { email: `${name}@example.invalid`, person: { teams: ["billing"] } });
        people.push(personId as Id<"people">);
      }
      const actor = (await seedUser(t, { email: "actor@example.invalid" })).as;
      // Seed both sides with the same pre-existing Intake metrics for one day.
      const intakeRow = {
        staff: "alpha",
        date: DATES[0],
        emailsSent: 4,
        ghlChats: 5,
        newPatientIntake: 6,
        callAudits: 7,
        faxDocs: 8,
      };
      await old.run(ctx => ctx.db.insert("intakeDailyMetrics", { ...intakeRow, updatedAt: "x" }));
      await t.run(ctx => ctx.db.insert("intakeDailyMetrics", { ...intakeRow, updatedAt: "x" }));
      const oldIds: string[] = [];
      const newIds: Id<"billingEntries">[] = [];

      for (const o of ops) {
        if (o.kind === "add") {
          // The browser sends max(1, Number(count) || 1); the server clamps again.
          const count = COUNTS[o.count];
          const base = { date: DATES[o.date], category: CATEGORIES[o.category], count };
          oldIds.push(
            await old.mutation(original.billing.addEntry, { ...base, staff: STAFF[o.staff], createdAt: "x" }),
          );
          newIds.push(await actor.mutation(api.billing.addEntry, { ...base, staffPersonId: people[o.staff] }));
        } else if (o.kind === "update" || o.kind === "delete") {
          if (oldIds.length === 0) continue;
          const i = o.target % oldIds.length;
          if (o.kind === "delete") {
            await old.mutation(original.billing.deleteEntry, { _id: oldIds[i] });
            await actor.mutation(api.billing.deleteEntry, { id: newIds[i] });
            oldIds.splice(i, 1);
            newIds.splice(i, 1);
          } else {
            const count = COUNTS.slice(1)[o.count] as number; // update requires a count
            const base = { date: DATES[o.date], category: CATEGORIES[o.category], count };
            await old.mutation(original.billing.updateEntry, { ...base, _id: oldIds[i], staff: STAFF[o.staff] });
            await actor.mutation(api.billing.updateEntry, { ...base, id: newIds[i], staffPersonId: people[o.staff] });
          }
        } else {
          // Original BillingTab.handleSaveMetric, step for step.
          const staff = STAFF[o.staff];
          const date = DATES[o.date];
          const metrics: Row[] = await old.query(original.intake.listDailyMetrics, {});
          const existing = metrics.find(m => m.staff === staff && m.date === date);
          await old.mutation(original.intake.upsertDailyMetric, {
            staff,
            date,
            emailsSent: existing?.emailsSent ?? 0,
            ghlChats: existing?.ghlChats ?? 0,
            callAudits: existing?.callAudits ?? 0,
            faxDocs: o.faxDocs,
            newPatientIntake: o.npc,
            updatedAt: "x",
          });
          await actor.mutation(api.dailyMetrics.setBillingCounts, {
            staffPersonId: people[o.staff],
            date,
            faxDocs: o.faxDocs,
            newPatientIntake: o.npc,
          });
        }
      }

      const oldEntries: Row[] = await old.query(original.billing.listEntries, {});
      const newEntries = await actor.query(api.billing.listEntries);
      expect(pick(newEntries, ENTRY_KEYS)).toEqual(pick(oldEntries, ENTRY_KEYS));
      const oldMetrics: Row[] = await old.query(original.intake.listDailyMetrics, {});
      const newMetrics = await actor.query(api.dailyMetrics.list);
      expect(pick(newMetrics, METRIC_KEYS)).toEqual(pick(oldMetrics, METRIC_KEYS));
    }),
    { numRuns: 150 },
  );
});
