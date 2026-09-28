// @vitest-environment edge-runtime
// Phase 2: Billing Activity Log and the Fax Docs / New Patient Chart metrics
// (plan 5.2 BL-01, BL-02; D5). Synthetic identities only.
import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { expectCode, newBackend, seedUser } from "./helpers";

async function setup() {
  const t = newBackend();
  const biller = await seedUser(t, { email: "biller@example.invalid", person: { teams: ["billing"] } });
  const intake = await seedUser(t, { email: "intake@example.invalid", person: { teams: ["intake"] } });
  const billerId = biller.personId as Id<"people">;
  return { t, biller, intake, billerId };
}

const entry = { date: "2026-09-14", category: "new_claims" as const };

describe("billing entries", () => {
  test("count is clamped like the original: max(1, round(count)), default 1 (BL-01)", async () => {
    const { biller, billerId } = await setup();
    for (const count of [undefined, 0, -5, 0.4, 2.5, 2.6, 7]) {
      await biller.as.mutation(api.billing.addEntry, { staffPersonId: billerId, ...entry, count });
    }
    const counts = (await biller.as.query(api.billing.listEntries)).map(e => e.tasksCompleted);
    expect(counts).toEqual([1, 1, 1, 1, 3, 3, 7]);
    await expectCode(
      biller.as.mutation(api.billing.addEntry, { staffPersonId: billerId, ...entry, count: Number.POSITIVE_INFINITY }),
      "INVALID_COUNT",
    );
  });

  test("the row stores the person's name as its staff string, and a server timestamp", async () => {
    const { t, biller, billerId } = await setup();
    const before = new Date().toISOString();
    const id = await biller.as.mutation(api.billing.addEntry, { staffPersonId: billerId, ...entry });
    const row = await t.run(ctx => ctx.db.get(id));
    expect(row).toMatchObject({ staff: "biller", staffPersonId: billerId, date: "2026-09-14", category: "new_claims" });
    expect(row!.createdAt >= before).toBe(true);
  });

  test("staff must be an active Billing team member; dates must be real YYYY-MM-DD", async () => {
    const { t, biller, intake, billerId } = await setup();
    const intakeId = intake.personId as Id<"people">;
    await expectCode(biller.as.mutation(api.billing.addEntry, { staffPersonId: intakeId, ...entry }), "NOT_ON_TEAM");
    await t.run(ctx => ctx.db.patch(billerId, { active: false }));
    await expectCode(intake.as.mutation(api.billing.addEntry, { staffPersonId: billerId, ...entry }), "NOT_ON_TEAM");
    await t.run(ctx => ctx.db.patch(billerId, { active: true }));
    for (const date of ["2026-02-30", "09/14/2026", "2026-9-14", ""]) {
      await expectCode(
        biller.as.mutation(api.billing.addEntry, { staffPersonId: billerId, ...entry, date }),
        "INVALID_DATE",
      );
    }
    await expect(
      biller.as.mutation(api.billing.addEntry, { staffPersonId: billerId, ...entry, category: "other" as never }),
    ).rejects.toThrow();
  });

  test("anyone on the team can log for a Billing person (as in production)", async () => {
    const { intake, billerId } = await setup();
    await intake.as.mutation(api.billing.addEntry, { staffPersonId: billerId, ...entry });
    expect(await intake.as.query(api.billing.listEntries)).toHaveLength(1);
  });

  test("edit replaces date, category and count; staff is kept unless a person is given", async () => {
    const { t, biller, billerId } = await setup();
    // A migrated row whose name is on no roster.
    const legacy = await t.run(ctx =>
      ctx.db.insert("billingEntries", {
        staff: "Former Staffer",
        date: "2026-08-01",
        category: "emails",
        tasksCompleted: 4,
        createdAt: "2026-08-01T12:00:00.000Z",
      }),
    );
    await biller.as.mutation(api.billing.updateEntry, {
      id: legacy,
      date: "2026-08-02",
      category: "ar_aging",
      count: 0,
    });
    expect(await t.run(ctx => ctx.db.get(legacy))).toMatchObject({
      staff: "Former Staffer",
      date: "2026-08-02",
      category: "ar_aging",
      tasksCompleted: 1,
      createdAt: "2026-08-01T12:00:00.000Z",
    });
    await biller.as.mutation(api.billing.updateEntry, {
      id: legacy,
      staffPersonId: billerId,
      date: "2026-08-02",
      category: "ar_aging",
      count: 2.5,
    });
    expect(await t.run(ctx => ctx.db.get(legacy))).toMatchObject({
      staff: "biller",
      staffPersonId: billerId,
      tasksCompleted: 3,
    });
  });

  test("a single entry can be deleted by staff (D5 keeps single-row edits open)", async () => {
    const { biller, intake, billerId } = await setup();
    const id = await biller.as.mutation(api.billing.addEntry, { staffPersonId: billerId, ...entry });
    await intake.as.mutation(api.billing.deleteEntry, { id });
    expect(await biller.as.query(api.billing.listEntries)).toEqual([]);
    await expectCode(biller.as.mutation(api.billing.deleteEntry, { id }), "NOT_FOUND");
    await expectCode(biller.as.mutation(api.billing.updateEntry, { id, ...entry, count: 1 }), "NOT_FOUND");
  });

  test("writes are audited by field name only", async () => {
    const { t, biller, billerId } = await setup();
    const id = await biller.as.mutation(api.billing.addEntry, { staffPersonId: billerId, ...entry, count: 3 });
    await biller.as.mutation(api.billing.deleteEntry, { id });
    const log = await t.run(ctx =>
      ctx.db
        .query("auditLog")
        .withIndex("by_table_doc", q => q.eq("table", "billingEntries").eq("docId", id))
        .collect(),
    );
    expect(log.map(l => [l.action, l.actorUserId])).toEqual([
      ["insert", biller.userId],
      ["delete", biller.userId],
    ]);
    expect(log[0].fields).toEqual(expect.arrayContaining(["staff", "date", "category", "tasksCompleted"]));
    expect(JSON.stringify(log)).not.toContain('biller"');
    expect(JSON.stringify(log)).not.toContain("2026-09-14");
  });
});

describe("Fax Docs / New Patient Chart (dailyMetrics.setBillingCounts)", () => {
  const counts = { date: "2026-09-14", faxDocs: 3, newPatientIntake: 2 };

  test("replaces the two counts and keeps the day's other Intake metrics", async () => {
    const { t, biller, billerId } = await setup();
    await t.run(ctx =>
      ctx.db.insert("intakeDailyMetrics", {
        staff: "biller",
        date: "2026-09-14",
        emailsSent: 5,
        ghlChats: 6,
        newPatientIntake: 9,
        callAudits: 7,
        faxDocs: 8,
        updatedAt: "2026-09-14T01:00:00.000Z",
      }),
    );
    await biller.as.mutation(api.dailyMetrics.setBillingCounts, { staffPersonId: billerId, ...counts });
    await biller.as.mutation(api.dailyMetrics.setBillingCounts, { staffPersonId: billerId, ...counts, faxDocs: 1 });
    const rows = await biller.as.query(api.dailyMetrics.list);
    expect(rows).toHaveLength(1);
    // Not added up: the second save REPLACES the first (original behaviour).
    expect(rows[0]).toMatchObject({ emailsSent: 5, ghlChats: 6, callAudits: 7, faxDocs: 1, newPatientIntake: 2 });
  });

  test("a new day starts from zero for the other metrics", async () => {
    const { biller, billerId } = await setup();
    await biller.as.mutation(api.dailyMetrics.setBillingCounts, { staffPersonId: billerId, ...counts });
    expect(await biller.as.query(api.dailyMetrics.list)).toMatchObject([
      {
        staff: "biller",
        date: "2026-09-14",
        emailsSent: 0,
        ghlChats: 0,
        callAudits: 0,
        faxDocs: 3,
        newPatientIntake: 2,
      },
    ]);
  });

  test("counts are whole numbers >= 0; staff must be on the Billing team", async () => {
    const { biller, intake, billerId } = await setup();
    for (const faxDocs of [-1, 1.5, Number.NaN]) {
      await expectCode(
        biller.as.mutation(api.dailyMetrics.setBillingCounts, { staffPersonId: billerId, ...counts, faxDocs }),
        "INVALID_COUNT",
      );
    }
    await expectCode(
      biller.as.mutation(api.dailyMetrics.setBillingCounts, {
        staffPersonId: intake.personId as Id<"people">,
        ...counts,
      }),
      "NOT_ON_TEAM",
    );
  });
});
