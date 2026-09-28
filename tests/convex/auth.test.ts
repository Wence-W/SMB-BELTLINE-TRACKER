// @vitest-environment edge-runtime
import { afterEach, describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { generateNumericCode, passwordProfile, validatePassword } from "../../convex/auth";
import { newBackend } from "./helpers";

describe("self-signup is disabled on the server (SEC-02)", () => {
  test("the Password profile hook rejects the signUp flow", () => {
    expect(() => passwordProfile({ flow: "signUp", email: "a@example.invalid", password: "x".repeat(20) })).toThrow();
    try {
      passwordProfile({ flow: "signUp", email: "a@example.invalid" });
    } catch (error) {
      expect((error as { data?: { code?: string } }).data?.code).toBe("SIGNUP_DISABLED");
    }
  });

  test("other flows get a normalized email", () => {
    expect(passwordProfile({ flow: "signIn", email: "  Some.One@Example.invalid " })).toEqual({
      email: "some.one@example.invalid",
    });
  });

  test("the public signIn action refuses flow=signUp and creates no user", async () => {
    const t = newBackend();
    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: { flow: "signUp", email: "intruder@example.invalid", password: "a-long-enough-password" },
      }),
    ).rejects.toThrow();
    const users = await t.run(ctx => ctx.db.query("users").collect());
    expect(users).toHaveLength(0);
  });
});

describe("passwords and codes", () => {
  test("passwords shorter than 12 characters are rejected", () => {
    expect(() => validatePassword("short-pass1")).toThrow();
    expect(() => validatePassword("twelve-chars")).not.toThrow();
  });

  test("codes are 8 digits", () => {
    for (let i = 0; i < 200; i++) expect(generateNumericCode()).toMatch(/^\d{8}$/);
  });
});

describe("dev outbox is refused in production", () => {
  afterEach(() => {
    delete process.env.DEPLOYMENT_ENV;
  });

  test("recordDevEmail throws when DEPLOYMENT_ENV=production", async () => {
    const t = newBackend();
    process.env.DEPLOYMENT_ENV = "production";
    await expect(
      t.mutation(internal.email.recordDevEmail, { to: "a@example.invalid", subject: "s", text: "t" }),
    ).rejects.toThrow();
  });

  test("recordDevEmail works outside production", async () => {
    const t = newBackend();
    await t.mutation(internal.email.recordDevEmail, { to: "a@example.invalid", subject: "s", text: "t" });
    const latest = await t.query(internal.email.latestDevEmail, { to: "a@example.invalid" });
    expect(latest?.subject).toBe("s");
  });
});
