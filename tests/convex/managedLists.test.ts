// @vitest-environment edge-runtime
// DR-02 (plan 5.6) plus plan D5: managed dropdown lists.
import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { MANAGED_LISTS } from "../../convex/managedLists";
import { expectCode, newBackend, seedUser } from "./helpers";

async function setup() {
  const t = newBackend();
  const staff = await seedUser(t, { email: "staff@example.invalid" });
  const admin = await seedUser(t, { email: "admin@example.invalid", capabilities: ["admin"] });
  return { t, staff, admin };
}

describe.each(MANAGED_LISTS)("%s", list => {
  test("admins add (trimmed, in insertion order); duplicates and blanks are rejected", async () => {
    const { admin, staff } = await setup();
    await admin.as.mutation(api.managedLists.add, { list, name: "  Beta  " });
    await admin.as.mutation(api.managedLists.add, { list, name: "Alpha" });
    await expectCode(admin.as.mutation(api.managedLists.add, { list, name: "Beta" }), "ALREADY_EXISTS");
    await expectCode(admin.as.mutation(api.managedLists.add, { list, name: "   " }), "NAME_REQUIRED");
    // Exact-match duplicate check, as in the original: different case is a new entry.
    await admin.as.mutation(api.managedLists.add, { list, name: "beta" });
    const names = (await staff.as.query(api.managedLists.list, { list })).map(r => r.name);
    expect(names).toEqual(["Beta", "Alpha", "beta"]);
  });

  test("staff can read but not edit (D5)", async () => {
    const { admin, staff } = await setup();
    const id = await admin.as.mutation(api.managedLists.add, { list, name: "Keep" });
    await expectCode(staff.as.mutation(api.managedLists.add, { list, name: "X" }), "FORBIDDEN");
    await expectCode(staff.as.mutation(api.managedLists.remove, { list, id }), "FORBIDDEN");
  });

  test("admins remove by id; an id from another list is rejected", async () => {
    const { admin, staff } = await setup();
    const id = await admin.as.mutation(api.managedLists.add, { list, name: "Gone" });
    const other = MANAGED_LISTS.find(l => l !== list)!;
    await expectCode(admin.as.mutation(api.managedLists.remove, { list: other, id }), "NOT_FOUND");
    await admin.as.mutation(api.managedLists.remove, { list, id });
    expect(await staff.as.query(api.managedLists.list, { list })).toEqual([]);
  });
});
