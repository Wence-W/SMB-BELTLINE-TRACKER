// @vitest-environment edge-runtime
// Differential test: the SAME random sequence of Intake actions runs against
// the ORIGINAL backend (reference/original/convex, in memory, original schema)
// and the rebuild. The original browser rules (IntakeTeamTab handleSave and
// the entry window's Save) are reproduced step for step on the original side.
// The stored entry and metric rows must end up identical, and the rebuild
// must refuse exactly the saves the original screen refused.
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import fc from "fast-check";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import originalSchema from "../../reference/original/convex/schema";
import {
  ACTIVE_INTAKE_CATEGORY_OPTIONS,
  isBoostCategory,
  resultOptionsForDirection,
} from "../../convex/lib/intakeTaxonomy";
import { intakeTypes } from "../../packages/parity/oracles";
import { newBackend, seedUser } from "./helpers";

const originalModules = import.meta.glob([
  "../../reference/original/convex/_generated/*.js",
  "../../reference/original/convex/intake.ts",
  "../../reference/original/convex/permissions.ts",
]);
const original = anyApi;

const STAFF = ["alpha", "bravo"] as const;
const DATES = ["2026-09-01", "2026-09-02"];
const CATEGORIES = ["", ...ACTIVE_INTAKE_CATEGORY_OPTIONS.map(c => c.value)];
const METRIC_KEYS = ["emailsSent", "ghlChats", "newPatientIntake", "callAudits", "faxDocs"] as const;

const save = fc.record({
  kind: fc.constant("save" as const),
  staff: fc.nat(1),
  date: fc.nat(1),
  category: fc.nat(CATEGORIES.length - 1),
  result: fc.nat(7), // index into the direction's results; 7 = none
  count: fc.constantFrom(0, 1, 2, 5),
  notes: fc.constantFrom("", "note"),
  patientId: fc.constantFrom("", "SYN-000001", " SYN-000002 "),
  metrics: fc.array(fc.constantFrom(0, 0, 1, 3), { minLength: 5, maxLength: 5 }),
});
const edit = fc.record({
  kind: fc.constant("edit" as const),
  target: fc.nat(30),
  category: fc.nat(20),
  result: fc.nat(7),
  notes: fc.constantFrom("", "changed"),
  patientId: fc.constantFrom("", " SYN-000003 "),
});
const del = fc.record({ kind: fc.constant("delete" as const), target: fc.nat(30) });
const delMetric = fc.record({ kind: fc.constant("deleteMetric" as const), target: fc.nat(30) });

type Row = Record<string, unknown>;
const pick = (rows: Row[], keys: string[]) => rows.map(r => Object.fromEntries(keys.map(k => [k, r[k]])));
const ENTRY_KEYS = ["staff", "date", "direction", "category", "result", "count", "notes", "patientId"];
const METRIC_COLUMNS = ["staff", "date", ...METRIC_KEYS];

test("any sequence of Intake actions leaves the same rows as the original backend", async () => {
  await fc.assert(
    fc.asyncProperty(fc.array(fc.oneof(save, save, edit, del, delMetric), { maxLength: 20 }), async ops => {
      const old = convexTest(originalSchema, originalModules);
      const t = newBackend();
      const people: Id<"people">[] = [];
      for (const name of STAFF) {
        const { personId } = await seedUser(t, { email: `${name}@example.invalid`, person: { teams: ["intake"] } });
        people.push(personId as Id<"people">);
      }
      const actor = (await seedUser(t, { email: "actor@example.invalid" })).as;
      const oldIds: string[] = [];
      const newIds: Id<"intakeEntries">[] = [];

      for (const o of ops) {
        if (o.kind === "save") {
          const category = CATEGORIES[o.category];
          const cat = intakeTypes.INTAKE_CATEGORIES.find(c => c.value === category);
          const direction = cat?.direction ?? "inbound";
          const results = resultOptionsForDirection(direction);
          const result = !isBoostCategory(category) && o.result < results.length ? results[o.result].value : "";
          const metrics = Object.fromEntries(METRIC_KEYS.map((k, i) => [k, o.metrics[i]])) as Record<
            (typeof METRIC_KEYS)[number],
            number
          >;
          // ── Original handleSave ──
          const count = Number(o.count) || 0;
          const metricsFilled = METRIC_KEYS.some(k => metrics[k] > 0);
          const loggingCategory = count > 0 && !!category;
          const refused = (count > 0 && !category) || (!loggingCategory && !metricsFilled);
          if (!refused) {
            if (loggingCategory) {
              oldIds.push(
                await old.mutation(original.intake.addEntry, {
                  staff: STAFF[o.staff],
                  date: DATES[o.date],
                  direction,
                  category,
                  result: !isBoostCategory(category) && result ? result : undefined,
                  count,
                  notes: o.notes || undefined,
                  createdAt: new Date().toISOString(),
                  patientId: o.patientId || undefined,
                  otherInfo: undefined,
                }),
              );
            }
            if (metricsFilled) {
              await old.mutation(original.intake.upsertDailyMetric, {
                staff: STAFF[o.staff],
                date: DATES[o.date],
                ...metrics,
                updatedAt: "x",
              });
            }
          }
          // ── Rebuild ──
          const call = actor.mutation(api.intake.logActivity, {
            staffPersonId: people[o.staff],
            date: DATES[o.date],
            ...(category ? { category: category as never } : {}),
            result,
            count,
            notes: o.notes || undefined,
            patientId: o.patientId || undefined,
            metrics,
          });
          if (refused) {
            await expect(call).rejects.toThrow();
          } else {
            const res = await call;
            if (loggingCategory) newIds.push(res.entryId as Id<"intakeEntries">);
          }
        } else if (o.kind === "edit" || o.kind === "delete") {
          if (oldIds.length === 0) continue;
          const i = o.target % oldIds.length;
          if (o.kind === "delete") {
            await old.mutation(original.intake.deleteEntry, { _id: oldIds[i] });
            await actor.mutation(api.intake.deleteEntry, { id: newIds[i] });
            oldIds.splice(i, 1);
            newIds.splice(i, 1);
          } else {
            const current = (await old.query(original.intake.listEntries, {})).find((e: Row) => e._id === oldIds[i]);
            const options = ACTIVE_INTAKE_CATEGORY_OPTIONS.filter(c => c.direction === current.direction);
            const category = o.category < options.length ? options[o.category].value : current.category;
            const results = resultOptionsForDirection(current.direction);
            const result = o.result < results.length ? results[o.result].value : "";
            // ── The original entry window's Save ──
            const details = { patientId: o.patientId.trim(), category, result, notes: o.notes || undefined };
            await old.mutation(original.intake.updateEntryDetails, { _id: oldIds[i], ...details });
            await actor.mutation(api.intake.updateEntryDetails, { id: newIds[i], ...details });
          }
        } else {
          const oldMetrics: Row[] = await old.query(original.intake.listDailyMetrics, {});
          const newMetrics = await actor.query(api.dailyMetrics.list);
          if (oldMetrics.length === 0) continue;
          const i = o.target % oldMetrics.length;
          await old.mutation(original.intake.deleteDailyMetric, { _id: oldMetrics[i]._id });
          await actor.mutation(api.dailyMetrics.deleteMetric, { id: newMetrics[i]._id });
        }
      }

      expect(pick(await actor.query(api.intake.listEntries), ENTRY_KEYS)).toEqual(
        pick(await old.query(original.intake.listEntries, {}), ENTRY_KEYS),
      );
      expect(pick(await actor.query(api.dailyMetrics.list), METRIC_COLUMNS)).toEqual(
        pick(await old.query(original.intake.listDailyMetrics, {}), METRIC_COLUMNS),
      );
    }),
    { numRuns: 150 },
  );
});
