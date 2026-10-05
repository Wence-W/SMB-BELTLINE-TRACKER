// @vitest-environment edge-runtime
// Phase 3: Piedmont: Epic referral log. Synthetic data only.
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { expectCode, newBackend, seedUser } from "./helpers";

const blank = { date: "2026-09-14", refId: "", mrNumber: "", chart: "", toProvider: "", referringProvider: "" };

async function setup() {
  const t = newBackend();
  const staff = await seedUser(t, { email: "staff@example.invalid" });
  const admin = await seedUser(t, { email: "admin@example.invalid", capabilities: ["admin"] });
  await admin.as.mutation(api.managedLists.add, { list: "piedmontEpicProviders", name: "Dr. Example" });
  return { t, staff, admin };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Piedmont: Epic", () => {
  test("fields are trimmed; one of REF ID, MR# or CHART is required; newest first", async () => {
    const { staff } = await setup();
    await expectCode(
      staff.as.mutation(api.piedmont.addEntry, { ...blank, referringProvider: "x" }),
      "REFERRAL_ID_REQUIRED",
    );
    await staff.as.mutation(api.piedmont.addEntry, { ...blank, chart: "  SYN-000001 " });
    await staff.as.mutation(api.piedmont.addEntry, { ...blank, refId: "R2", toProvider: "Dr. Example" });
    const rows = await staff.as.query(api.piedmont.listEntries);
    expect(rows.map(r => [r.refId, r.chart])).toEqual([
      ["R2", ""],
      ["", "SYN-000001"],
    ]);
  });

  test("To Provider must be on the list, except a row's existing value", async () => {
    const { t, staff } = await setup();
    await expectCode(
      staff.as.mutation(api.piedmont.addEntry, { ...blank, refId: "R", toProvider: "Nobody" }),
      "INVALID_PROVIDER",
    );
    const id = await t.run(ctx =>
      ctx.db.insert("piedmontEpicReferrals", { ...blank, refId: "R", toProvider: "Former Provider", createdAt: "x" }),
    );
    await staff.as.mutation(api.piedmont.updateEntry, { id, ...blank, refId: "R9", toProvider: "Former Provider" });
    expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ refId: "R9", toProvider: "Former Provider" });
  });

  test("Export and Reset are admin-only; export is logged; reset empties the log", async () => {
    vi.useFakeTimers();
    const { t, staff, admin } = await setup();
    await staff.as.mutation(api.piedmont.addEntry, { ...blank, mrNumber: "MR-1" });
    await expectCode(staff.as.mutation(api.piedmont.exportEntries, {}), "FORBIDDEN");
    await expectCode(staff.as.mutation(api.piedmont.resetEntries, {}), "FORBIDDEN");
    expect(await admin.as.mutation(api.piedmont.exportEntries, {})).toMatchObject([{ mrNumber: "MR-1" }]);
    await admin.as.mutation(api.piedmont.resetEntries, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await staff.as.query(api.piedmont.listEntries)).toEqual([]);
    const audit = await t.run(ctx => ctx.db.query("auditLog").collect());
    expect(audit.filter(a => ["export", "reset"].includes(a.action)).map(a => a.action)).toEqual(["export", "reset"]);
    expect(JSON.stringify(audit)).not.toContain("MR-1");
  });
});
