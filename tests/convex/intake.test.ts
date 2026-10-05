// @vitest-environment edge-runtime
// Phase 3: Intake backend (plan 5.2 IN-01 to IN-07). Synthetic data only.
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { expectCode, newBackend, seedUser } from "./helpers";

const ZERO = { emailsSent: 0, ghlChats: 0, newPatientIntake: 0, callAudits: 0, faxDocs: 0 };
const NO_FILTERS = { date: "", from: "", to: "", staff: "", direction: "" as const };

async function setup() {
  const t = newBackend();
  const staff = await seedUser(t, { email: "intaker@example.invalid", person: { teams: ["intake"] } });
  const admin = await seedUser(t, { email: "admin@example.invalid", capabilities: ["admin"] });
  const biller = await seedUser(t, { email: "biller@example.invalid", person: { teams: ["billing"] } });
  const personId = staff.personId as Id<"people">;
  const log = (args: Record<string, unknown>) =>
    staff.as.mutation(api.intake.logActivity, {
      staffPersonId: personId,
      date: "2026-09-14",
      count: 1,
      metrics: ZERO,
      ...args,
    } as never);
  return { t, staff, admin, biller, personId, log };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("logActivity: the original save rules, now on the server (IN-02)", () => {
  test("one entry with Count 5 is ONE row holding count 5 (IN-01)", async () => {
    const { staff, log } = await setup();
    await log({ category: "inquiries", count: 5 });
    const rows = await staff.as.query(api.intake.listEntries);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ staff: "intaker", direction: "inbound", category: "inquiries", count: 5 });
  });

  test("Count > 0 with no category is refused; nothing at all to save is refused", async () => {
    const { log } = await setup();
    await expectCode(log({ count: 3 }), "CATEGORY_REQUIRED");
    await expectCode(log({ category: "inquiries", count: 0 }), "NOTHING_TO_SAVE");
    await expectCode(log({ count: 0 }), "NOTHING_TO_SAVE");
  });

  test("a category with Count 0 logs no entry, but filled metrics still save", async () => {
    const { staff, log } = await setup();
    const res = await log({ category: "inquiries", count: 0, metrics: { ...ZERO, ghlChats: 2 } });
    expect(res.entryId).toBeNull();
    expect(await staff.as.query(api.intake.listEntries)).toEqual([]);
    expect(await staff.as.query(api.dailyMetrics.list)).toMatchObject([{ staff: "intaker", ghlChats: 2 }]);
  });

  test("direction comes from the category; Boost drops the Result; results must fit the direction", async () => {
    const { staff, log } = await setup();
    await log({ category: "referral", result: "no_ans_lvm" });
    await log({ category: "boost_booked", result: "confirmed_appt" });
    const rows = await staff.as.query(api.intake.listEntries);
    expect(rows.map(r => [r.direction, r.result])).toEqual([
      ["outbound", "no_ans_lvm"],
      ["outbound", undefined],
    ]);
    await expectCode(log({ category: "inquiries", result: "no_ans_lvm" }), "INVALID_RESULT");
    // A legacy category can't be used for new entries.
    await expect(log({ category: "booked_new" })).rejects.toThrow();
  });

  test("blank notes / patient ID are not stored; createdAt is server time", async () => {
    const { t, log } = await setup();
    const before = new Date().toISOString();
    const { entryId } = await log({ category: "inquiries", notes: "", patientId: "", result: "" });
    const row = await t.run(ctx => ctx.db.get(entryId as Id<"intakeEntries">));
    expect(row).not.toHaveProperty("notes");
    expect(row).not.toHaveProperty("patientId");
    expect(row).not.toHaveProperty("result");
    expect(row!.createdAt >= before).toBe(true);
  });

  test("saving metrics twice for the same staff and day OVERWRITES all five (IN-03, parity)", async () => {
    const { staff, log } = await setup();
    await log({ count: 0, metrics: { ...ZERO, emailsSent: 4, faxDocs: 3 } });
    await log({ count: 0, metrics: { ...ZERO, ghlChats: 1 } });
    const rows = await staff.as.query(api.dailyMetrics.list);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ emailsSent: 0, ghlChats: 1, faxDocs: 0 });
  });

  test("counts and metrics must be whole numbers >= 0; staff must be on the Intake team", async () => {
    const { log, biller } = await setup();
    await expectCode(log({ category: "inquiries", count: 1.5 }), "INVALID_COUNT");
    await expectCode(log({ category: "inquiries", count: -1 }), "INVALID_COUNT");
    await expectCode(log({ count: 0, metrics: { ...ZERO, emailsSent: -2, ghlChats: 1 } }), "INVALID_COUNT");
    await expectCode(log({ category: "inquiries", staffPersonId: biller.personId }), "NOT_ON_TEAM");
    await expectCode(log({ category: "inquiries", date: "2026-13-01" }), "INVALID_DATE");
  });
});

describe("entry details, delete, reset, export", () => {
  test("left-out fields are untouched; Resolution '' clears; the direction never changes", async () => {
    const { t, staff, log } = await setup();
    const { entryId } = await log({
      category: "inquiries",
      result: "provided_info",
      notes: "first",
      patientId: "SYN-000001",
    });
    const id = entryId as Id<"intakeEntries">;
    await staff.as.mutation(api.intake.updateEntryDetails, { id, category: "ma_concern", result: "" });
    expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({
      direction: "inbound",
      category: "ma_concern",
      result: "",
      notes: "first",
      patientId: "SYN-000001",
    });
    // An outbound category for an inbound entry is refused.
    await expectCode(
      staff.as.mutation(api.intake.updateEntryDetails, { id, category: "referral" }),
      "INVALID_CATEGORY",
    );
    await expectCode(staff.as.mutation(api.intake.updateEntryDetails, { id, result: "no_ans_lvm" }), "INVALID_RESULT");
  });

  test("a migrated row keeps its legacy category when edited", async () => {
    const { t, staff } = await setup();
    const id = await t.run(ctx =>
      ctx.db.insert("intakeEntries", {
        staff: "Old",
        date: "2026-07-01",
        direction: "outbound",
        category: "voicemail_no_answer",
        count: 2,
        createdAt: "2026-07-01T12:00:00.000Z",
      }),
    );
    await staff.as.mutation(api.intake.updateEntryDetails, { id, category: "voicemail_no_answer", notes: "n" });
    expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ category: "voicemail_no_answer", notes: "n" });
  });

  test("anyone can delete one entry; NOT_FOUND afterwards", async () => {
    const { staff, log } = await setup();
    const { entryId } = await log({ category: "inquiries" });
    await staff.as.mutation(api.intake.deleteEntry, { id: entryId as Id<"intakeEntries"> });
    await expectCode(staff.as.mutation(api.intake.deleteEntry, { id: entryId as Id<"intakeEntries"> }), "NOT_FOUND");
  });

  test("Reset is admin-only and deletes Intake entries only; metrics survive (IN-07)", async () => {
    vi.useFakeTimers();
    const { t, staff, admin, log } = await setup();
    for (let i = 0; i < 3; i++) await log({ category: "inquiries", metrics: { ...ZERO, emailsSent: 1 } });
    await expectCode(staff.as.mutation(api.intake.resetEntries, {}), "FORBIDDEN");
    await admin.as.mutation(api.intake.resetEntries, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await staff.as.query(api.intake.listEntries)).toEqual([]);
    expect(await staff.as.query(api.dailyMetrics.list)).toHaveLength(1);
    const audit = await t.run(ctx => ctx.db.query("auditLog").collect());
    expect(audit.some(a => a.action === "reset" && a.actorUserId === admin.userId)).toBe(true);
  });

  test("Export is admin-only, follows the table filters, excludes Boost, and is logged (IN-06)", async () => {
    const { t, staff, admin, log } = await setup();
    await log({ category: "inquiries", date: "2026-09-01", patientId: "SYN-000001" });
    await log({ category: "referral", date: "2026-09-02" });
    await log({ category: "boost_booked", date: "2026-09-02" });
    const args = { filters: NO_FILTERS, exportFrom: "", exportTo: "" };
    await expectCode(staff.as.mutation(api.intake.exportEntries, args), "FORBIDDEN");
    const all = await admin.as.mutation(api.intake.exportEntries, args);
    expect(all.map(r => r.category)).toEqual(["referral", "inquiries"]);
    const inbound = await admin.as.mutation(api.intake.exportEntries, {
      ...args,
      filters: { ...NO_FILTERS, direction: "inbound" },
    });
    expect(inbound.map(r => r.patientId)).toEqual(["SYN-000001"]);
    const ranged = await admin.as.mutation(api.intake.exportEntries, { ...args, exportFrom: "2026-09-02" });
    expect(ranged.map(r => r.category)).toEqual(["referral"]);
    const exports = await t.run(ctx => ctx.db.query("auditLog").collect());
    const logged = exports.filter(a => a.action === "export");
    expect(logged).toHaveLength(3);
    expect(JSON.stringify(logged)).not.toContain("SYN-000001");
  });

  test("Raw Entries delete removes that day's whole metrics row (IN-04)", async () => {
    const { staff, log } = await setup();
    const { metricId } = await log({ count: 0, metrics: { ...ZERO, emailsSent: 2, faxDocs: 1 } });
    await staff.as.mutation(api.dailyMetrics.deleteMetric, { id: metricId as Id<"intakeDailyMetrics"> });
    expect(await staff.as.query(api.dailyMetrics.list)).toEqual([]);
  });

  test("patient IDs and notes never reach the audit log", async () => {
    const { t, staff, log } = await setup();
    const { entryId } = await log({ category: "inquiries", patientId: "SYN-123456", notes: "called about coverage" });
    await staff.as.mutation(api.intake.updateEntryDetails, {
      id: entryId as Id<"intakeEntries">,
      patientId: "SYN-654321",
      notes: "updated note",
    });
    const audit = JSON.stringify(await t.run(ctx => ctx.db.query("auditLog").collect()));
    for (const secret of ["SYN-123456", "SYN-654321", "coverage", "updated note"]) expect(audit).not.toContain(secret);
    expect(audit).toContain("patientId");
  });
});
