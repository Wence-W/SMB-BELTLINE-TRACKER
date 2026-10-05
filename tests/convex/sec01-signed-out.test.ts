// @vitest-environment edge-runtime
// SEC-01: every public function rejects a signed-out caller. Functions are
// discovered from source, so a new public function without an entry in
// SAMPLE_ARGS fails this test until someone adds one (and thereby tests it).
import { makeFunctionReference } from "convex/server";
import { describe, expect, test } from "vitest";
import { expectCode, newBackend, seedUser } from "./helpers";

const sources = import.meta.glob("../../convex/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

type Kind = "query" | "mutation" | "action";
const KIND_BY_BUILDER: Record<string, Kind> = {
  authedQuery: "query",
  capabilityQuery: "query",
  authedMutation: "mutation",
  capabilityMutation: "mutation",
  capabilityAction: "action",
  authedAction: "action",
};

const discovered: { path: string; kind: Kind }[] = [];
for (const [file, text] of Object.entries(sources)) {
  if (file.includes("/_generated/") || file.endsWith("/lib/functions.ts")) continue;
  const module = file.replace(/^.*\/convex\//, "").replace(/\.ts$/, "");
  for (const match of text.matchAll(/export const (\w+) = (\w+)\b/g)) {
    const kind = KIND_BY_BUILDER[match[2]];
    if (kind) discovered.push({ path: `${module}:${match[1]}`, kind });
  }
}

// Valid-shaped arguments, so a rejection can only come from the access check,
// not from argument validation. Placeholder IDs are filled in per test.
type Ids = {
  userId: string;
  personId: string;
  clinicId: string;
  clinicProviderId: string;
  departmentId: string;
  memberId: string;
  precertProviderId: string;
  storageId: string;
  billingEntryId: string;
  intakeEntryId: string;
  metricId: string;
  referralId: string;
};
const SAMPLE_ARGS: Record<string, (ids: Ids) => Record<string, unknown>> = {
  "access:me": () => ({}),
  "access:listPeople": () => ({}),
  "access:setPersonActive": ids => ({ personId: ids.personId, active: false }),
  "access:setPersonTeams": ids => ({ personId: ids.personId, teams: ["billing"] }),
  "access:grantCapability": ids => ({ userId: ids.userId, capability: "admin" }),
  "access:revokeCapability": ids => ({ userId: ids.userId, capability: "admin" }),
  "access:listTeam": () => ({ team: "intake" }),
  "provisioning:provisionPerson": () => ({ email: "x@example.invalid", displayName: "X", teams: [] }),
  // Phase 1
  "directory:listClinics": () => ({}),
  "directory:updateClinicInfo": ids => ({ id: ids.clinicId, name: "X" }),
  "directory:addClinicProvider": ids => ({ clinicId: ids.clinicId, providerName: "X" }),
  "directory:updateClinicProvider": ids => ({ id: ids.clinicProviderId, providerName: "X" }),
  "directory:removeClinicProvider": ids => ({ id: ids.clinicProviderId }),
  "directory:listDepartments": () => ({}),
  "directory:updateDepartmentInfo": ids => ({ id: ids.departmentId, extension: "1" }),
  "directory:addDepartmentMember": ids => ({ departmentId: ids.departmentId, memberName: "X" }),
  "directory:updateDepartmentMember": ids => ({ id: ids.memberId, memberName: "X" }),
  "directory:removeDepartmentMember": ids => ({ id: ids.memberId }),
  "managedLists:list": () => ({ list: "precertProviders" }),
  "managedLists:add": () => ({ list: "precertProviders", name: "X" }),
  "managedLists:remove": ids => ({ list: "precertProviders", id: ids.precertProviderId }),
  "appointmentOptions:list": () => ({}),
  "appointmentOptions:add": () => ({ optionType: "scheduler", value: "X" }),
  "appointmentOptions:remove": () => ({ optionType: "scheduler", value: "X" }),
  "settings:updateMyName": () => ({ name: "X" }),
  "settings:generatePhotoUploadUrl": () => ({}),
  "settings:setProfilePhoto": ids => ({ storageId: ids.storageId }),
  "settings:removeProfilePhoto": () => ({}),
  // Phase 2
  "billing:listEntries": () => ({}),
  "billing:addEntry": ids => ({ staffPersonId: ids.personId, date: "2026-09-01", category: "emails", count: 1 }),
  "billing:updateEntry": ids => ({ id: ids.billingEntryId, date: "2026-09-01", category: "emails", count: 1 }),
  "billing:deleteEntry": ids => ({ id: ids.billingEntryId }),
  "dailyMetrics:list": () => ({}),
  "dailyMetrics:setBillingCounts": ids => ({
    staffPersonId: ids.personId,
    date: "2026-09-01",
    faxDocs: 1,
    newPatientIntake: 1,
  }),
  // Phase 3
  "dailyMetrics:deleteMetric": ids => ({ id: ids.metricId }),
  "intake:listEntries": () => ({}),
  "intake:logActivity": ids => ({
    staffPersonId: ids.personId,
    date: "2026-09-01",
    category: "inquiries",
    count: 1,
    metrics: { emailsSent: 0, ghlChats: 0, newPatientIntake: 0, callAudits: 0, faxDocs: 0 },
  }),
  "intake:updateEntryDetails": ids => ({ id: ids.intakeEntryId, notes: "x" }),
  "intake:deleteEntry": ids => ({ id: ids.intakeEntryId }),
  "intake:resetEntries": () => ({}),
  "intake:exportEntries": () => ({
    filters: { date: "", from: "", to: "", staff: "", direction: "" },
    exportFrom: "",
    exportTo: "",
  }),
  "piedmont:listEntries": () => ({}),
  "piedmont:addEntry": () => ({
    date: "2026-09-01",
    refId: "R1",
    mrNumber: "",
    chart: "",
    toProvider: "",
    referringProvider: "",
  }),
  "piedmont:updateEntry": ids => ({
    id: ids.referralId,
    date: "2026-09-01",
    refId: "R1",
    mrNumber: "",
    chart: "",
    toProvider: "",
    referringProvider: "",
  }),
  "piedmont:resetEntries": () => ({}),
  "piedmont:exportEntries": () => ({}),
};

describe("SEC-01: no public function is callable signed out", () => {
  test("discovery found the public functions", () => {
    expect(discovered.length).toBeGreaterThan(0);
  });

  test("every discovered public function has sample args", () => {
    const missing = discovered.map(d => d.path).filter(path => !(path in SAMPLE_ARGS));
    expect(missing, "add SAMPLE_ARGS entries for new public functions").toEqual([]);
  });

  for (const { path, kind } of discovered) {
    test(`${path} rejects a signed-out caller`, async () => {
      const t = newBackend();
      const target = await seedUser(t, { email: "target@example.invalid" });
      const docs = await t.run(async ctx => {
        const clinicId = await ctx.db.insert("clinicWidgets", { name: "C", address: "", fax: "", order: 0 });
        const departmentId = await ctx.db.insert("departmentWidgets", { name: "D", order: 0 });
        return {
          clinicId,
          clinicProviderId: await ctx.db.insert("clinicProviders", { clinicId, providerName: "P", order: 0 }),
          departmentId,
          memberId: await ctx.db.insert("departmentMembers", { departmentId, memberName: "M", order: 0 }),
          precertProviderId: await ctx.db.insert("precertProviders", { name: "P" }),
          storageId: await ctx.storage.store(new Blob(["x"])),
          billingEntryId: await ctx.db.insert("billingEntries", {
            staff: "S",
            date: "2026-09-01",
            category: "emails",
            tasksCompleted: 1,
            createdAt: "2026-09-01T00:00:00.000Z",
          }),
          intakeEntryId: await ctx.db.insert("intakeEntries", {
            staff: "S",
            date: "2026-09-01",
            direction: "inbound",
            category: "inquiries",
            count: 1,
            createdAt: "2026-09-01T00:00:00.000Z",
          }),
          metricId: await ctx.db.insert("intakeDailyMetrics", {
            staff: "S",
            date: "2026-09-01",
            emailsSent: 1,
            ghlChats: 0,
            newPatientIntake: 0,
            callAudits: 0,
            faxDocs: 0,
            updatedAt: "2026-09-01T00:00:00.000Z",
          }),
          referralId: await ctx.db.insert("piedmontEpicReferrals", {
            date: "2026-09-01",
            refId: "R",
            mrNumber: "",
            chart: "",
            toProvider: "",
            referringProvider: "",
            createdAt: "2026-09-01T00:00:00.000Z",
          }),
        };
      });
      const args = SAMPLE_ARGS[path]?.({ userId: target.userId, personId: target.personId!, ...docs }) ?? {};
      type Args = Record<string, unknown>;
      const call =
        kind === "query"
          ? t.query(makeFunctionReference<"query", Args>(path), args)
          : kind === "mutation"
            ? t.mutation(makeFunctionReference<"mutation", Args>(path), args)
            : t.action(makeFunctionReference<"action", Args>(path), args);
      await expectCode(call, "UNAUTHENTICATED");
    });
  }
});
