// @vitest-environment edge-runtime
// DR-01 (plan 5.6): Intake Directory behaviour, ported 1:1 from the original.
import { describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { expectCode, newBackend, seedUser } from "./helpers";

async function setup() {
  const t = newBackend();
  await t.mutation(internal.devSeed.seedPhase1, {});
  const staff = await seedUser(t, { email: "staff@example.invalid", person: { teams: ["intake"] } });
  return { t, staff };
}

describe("clinics", () => {
  test("list is ordered, with providers ordered", async () => {
    const { staff } = await setup();
    const clinics = await staff.as.query(api.directory.listClinics, {});
    expect(clinics.map(c => c.name)).toEqual(["Atlanta", "Stockbridge", "Newnan"]);
    expect(clinics[0].providers.map(p => p.providerName)).toEqual(["Dr. Example One", "NP Example Two"]);
  });

  test("staff can edit clinic info; values are trimmed; a blank name is allowed (parity)", async () => {
    const { staff } = await setup();
    const [atlanta] = await staff.as.query(api.directory.listClinics, {});
    await staff.as.mutation(api.directory.updateClinicInfo, { id: atlanta._id, name: "  ", fax: " 555-0199 " });
    const [after] = await staff.as.query(api.directory.listClinics, {});
    expect(after).toMatchObject({ name: "", fax: "555-0199", address: atlanta.address });
  });

  test("providers are appended in order, renamed, and removed immediately; names are required", async () => {
    const { staff } = await setup();
    const [atlanta] = await staff.as.query(api.directory.listClinics, {});
    const id = await staff.as.mutation(api.directory.addClinicProvider, {
      clinicId: atlanta._id,
      providerName: "  Dr. New  ",
    });
    await expectCode(
      staff.as.mutation(api.directory.addClinicProvider, { clinicId: atlanta._id, providerName: " " }),
      "NAME_REQUIRED",
    );
    await expectCode(staff.as.mutation(api.directory.updateClinicProvider, { id, providerName: "" }), "NAME_REQUIRED");
    await staff.as.mutation(api.directory.updateClinicProvider, { id, providerName: "Dr. Renamed" });
    let [clinic] = await staff.as.query(api.directory.listClinics, {});
    expect(clinic.providers.map(p => p.providerName)).toEqual(["Dr. Example One", "NP Example Two", "Dr. Renamed"]);
    await staff.as.mutation(api.directory.removeClinicProvider, { id });
    [clinic] = await staff.as.query(api.directory.listClinics, {});
    expect(clinic.providers).toHaveLength(2);
  });
});

describe("departments", () => {
  test("members: blank tag/assignment become absent; name is required; edits audited", async () => {
    const { t, staff } = await setup();
    const [frontOffice] = await staff.as.query(api.directory.listDepartments, {});
    const id = await staff.as.mutation(api.directory.addDepartmentMember, {
      departmentId: frontOffice._id,
      memberName: "New Member",
      locationTag: "  ",
      assignment: "",
    });
    await expectCode(staff.as.mutation(api.directory.updateDepartmentMember, { id, memberName: " " }), "NAME_REQUIRED");
    await staff.as.mutation(api.directory.updateDepartmentMember, { id, locationTag: "Newnan" });
    const [dept] = await staff.as.query(api.directory.listDepartments, {});
    const member = dept.members.find(m => m._id === id);
    expect(member).toMatchObject({ memberName: "New Member", locationTag: "Newnan" });
    expect(member?.assignment).toBeUndefined();
    await staff.as.mutation(api.directory.updateDepartmentInfo, { id: frontOffice._id, extension: " 1234 " });
    expect((await staff.as.query(api.directory.listDepartments, {}))[0].extension).toBe("1234");

    const audit = await t.run(ctx => ctx.db.query("auditLog").collect());
    const mine = audit.filter(a => a.actorUserId === staff.userId);
    expect(mine.map(a => `${a.action}:${a.table}`)).toEqual([
      "insert:departmentMembers",
      "update:departmentMembers",
      "update:departmentWidgets",
    ]);
  });
});

describe("dev seed", () => {
  test("refuses to run twice", async () => {
    const { t } = await setup();
    await expectCode(t.mutation(internal.devSeed.seedPhase1, {}), "ALREADY_SEEDED");
  });
});
