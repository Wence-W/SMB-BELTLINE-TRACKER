// @vitest-environment edge-runtime
import { describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { expectCode, newBackend, seedUser } from "./helpers";

describe("wrapper access rules (SEC-01, SEC-03)", () => {
  test("signed-out callers are rejected", async () => {
    const t = newBackend();
    await expectCode(t.query(api.access.me, {}), "UNAUTHENTICATED");
  });

  test("an unverified account gets nothing, even with a capability", async () => {
    const t = newBackend();
    const { as } = await seedUser(t, { email: "unverified@example.invalid", verified: false, capabilities: ["admin"] });
    await expectCode(as.query(api.access.me, {}), "EMAIL_NOT_VERIFIED");
    await expectCode(as.query(api.access.listPeople, {}), "EMAIL_NOT_VERIFIED");
  });

  test("a verified login with no linked person is rejected", async () => {
    const t = newBackend();
    const { as } = await seedUser(t, { email: "stray@example.invalid", person: false });
    await expectCode(as.query(api.access.me, {}), "NOT_PROVISIONED");
  });

  test("a deactivated person is rejected", async () => {
    const t = newBackend();
    const { as } = await seedUser(t, { email: "left@example.invalid", person: { active: false } });
    await expectCode(as.query(api.access.me, {}), "NOT_PROVISIONED");
  });

  test("an active, verified person sees their own profile", async () => {
    const t = newBackend();
    const { as } = await seedUser(t, {
      email: "staff@example.invalid",
      person: { teams: ["intake"] },
      capabilities: ["call_audit_access"],
    });
    expect(await as.query(api.access.me, {})).toEqual({
      displayName: "staff",
      accountName: null,
      email: "staff@example.invalid",
      teams: ["intake"],
      capabilities: ["call_audit_access"],
      photoUrl: null,
    });
  });

  test("capability-gated functions reject staff without the capability", async () => {
    const t = newBackend();
    const staff = await seedUser(t, { email: "staff@example.invalid" });
    await expectCode(staff.as.query(api.access.listPeople, {}), "FORBIDDEN");
    const admin = await seedUser(t, { email: "admin@example.invalid", capabilities: ["admin"] });
    const people = await admin.as.query(api.access.listPeople, {});
    expect(people.map(p => p.email).sort()).toEqual(["admin@example.invalid", "staff@example.invalid"]);
  });
});

describe("capability management", () => {
  test("only the owner can grant the Patient ID override", async () => {
    const t = newBackend();
    const target = await seedUser(t, { email: "verifier@example.invalid" });
    const admin = await seedUser(t, { email: "admin@example.invalid", capabilities: ["admin"] });
    await expectCode(
      admin.as.mutation(api.access.grantCapability, { userId: target.userId, capability: "patient_id_override" }),
      "FORBIDDEN",
    );
    const owner = await seedUser(t, { email: "owner@example.invalid", capabilities: ["owner", "admin"] });
    await owner.as.mutation(api.access.grantCapability, { userId: target.userId, capability: "patient_id_override" });
    expect((await target.as.query(api.access.me, {})).capabilities).toEqual(["patient_id_override"]);
  });

  test("admins can grant ordinary capabilities; granting twice is a no-op", async () => {
    const t = newBackend();
    const target = await seedUser(t, { email: "auditor@example.invalid" });
    const admin = await seedUser(t, { email: "admin@example.invalid", capabilities: ["admin"] });
    for (let i = 0; i < 2; i++) {
      await admin.as.mutation(api.access.grantCapability, { userId: target.userId, capability: "call_audit_access" });
    }
    const roles = await t.run(ctx => ctx.db.query("roles").collect());
    expect(roles.filter(r => r.userId === target.userId)).toHaveLength(1);
  });

  test("nobody can revoke their own admin, or deactivate themselves", async () => {
    const t = newBackend();
    const admin = await seedUser(t, { email: "admin@example.invalid", capabilities: ["admin"] });
    await expectCode(
      admin.as.mutation(api.access.revokeCapability, { userId: admin.userId, capability: "admin" }),
      "FORBIDDEN",
    );
    await expectCode(
      admin.as.mutation(api.access.setPersonActive, { personId: admin.personId!, active: false }),
      "FORBIDDEN",
    );
  });

  test("revoking takes effect immediately", async () => {
    const t = newBackend();
    const target = await seedUser(t, { email: "x@example.invalid", capabilities: ["admin"] });
    const owner = await seedUser(t, { email: "owner@example.invalid", capabilities: ["owner", "admin"] });
    await owner.as.mutation(api.access.revokeCapability, { userId: target.userId, capability: "admin" });
    await expectCode(target.as.query(api.access.listPeople, {}), "FORBIDDEN");
  });
});

describe("audit log (SEC-07)", () => {
  test("every audited write records actor, action and field NAMES, never values", async () => {
    const t = newBackend();
    const target = await seedUser(t, { email: "target@example.invalid" });
    const admin = await seedUser(t, { email: "admin@example.invalid", capabilities: ["admin"] });
    await admin.as.mutation(api.access.grantCapability, { userId: target.userId, capability: "call_audit_access" });
    await admin.as.mutation(api.access.setPersonTeams, { personId: target.personId!, teams: ["billing"] });

    const log = await t.run(ctx => ctx.db.query("auditLog").collect());
    expect(log.map(({ action, table, fields, actorUserId }) => ({ action, table, fields, actorUserId }))).toEqual([
      {
        action: "insert",
        table: "roles",
        fields: ["capability", "grantedAt", "grantedBy", "userId"],
        actorUserId: admin.userId,
      },
      { action: "update", table: "people", fields: ["teams", "updatedAt"], actorUserId: admin.userId },
    ]);
    const serialized = JSON.stringify(log);
    for (const value of ["target@example.invalid", "billing", "call_audit_access"]) {
      expect(serialized).not.toContain(value);
    }
  });
});

describe("bootstrap and provisioning", () => {
  test("bootstrapOwner works once, then refuses", async () => {
    const t = newBackend();
    await seedUser(t, { email: "owner@example.invalid" });
    await t.mutation(internal.provisioning.bootstrapOwner, { email: "Owner@Example.invalid" });
    await expectCode(
      t.mutation(internal.provisioning.bootstrapOwner, { email: "owner@example.invalid" }),
      "OWNER_EXISTS",
    );
    const roles = await t.run(ctx => ctx.db.query("roles").collect());
    expect(roles.map(r => r.capability).sort()).toEqual(["admin", "owner"]);
  });

  test("a provisioned account starts unverified and gets no access until it verifies", async () => {
    const t = newBackend();
    const personId = await t.action(internal.provisioning.provisionAccount, {
      email: " New.Person@Example.invalid ",
      displayName: "New Person",
      teams: ["intake", "intake"],
    });
    const { person, user } = await t.run(async ctx => {
      const person = await ctx.db.get(personId);
      return { person, user: person?.userId ? await ctx.db.get(person.userId) : null };
    });
    expect(person).toMatchObject({ email: "new.person@example.invalid", teams: ["intake"], active: true });
    expect(user?.emailVerificationTime).toBeUndefined();
    const as = t.withIdentity({ subject: `${person?.userId}|s` });
    await expectCode(as.query(api.access.me, {}), "EMAIL_NOT_VERIFIED");
    await expectCode(
      t.action(internal.provisioning.provisionAccount, {
        email: "new.person@example.invalid",
        displayName: "Dup",
        teams: [],
      }),
      "ALREADY_PROVISIONED",
    );
  });

  test("provisionPerson (admin UI path) requires admin", async () => {
    const t = newBackend();
    const staff = await seedUser(t, { email: "staff@example.invalid" });
    await expectCode(
      staff.as.action(api.provisioning.provisionPerson, {
        email: "someone@example.invalid",
        displayName: "Someone",
        teams: [],
      }),
      "FORBIDDEN",
    );
  });
});
