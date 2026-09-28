// @vitest-environment edge-runtime
// DR-03 (plan 5.6) and the S3 fix (plan 4.2).
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { detectImageType, isAcceptablePhoto, MAX_PHOTO_BYTES } from "../../convex/settings";
import { expectCode, newBackend, seedUser } from "./helpers";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);

afterEach(() => {
  vi.useRealTimers();
});

describe("account name", () => {
  test("updates the account name only (not the roster name), trimmed, and is audited", async () => {
    const t = newBackend();
    const me = await seedUser(t, { email: "staff@example.invalid" });
    await me.as.mutation(api.settings.updateMyName, { name: "  Casey Q  " });
    const profile = await me.as.query(api.access.me, {});
    expect(profile.accountName).toBe("Casey Q");
    expect(profile.displayName).toBe("staff");
    await expectCode(me.as.mutation(api.settings.updateMyName, { name: " " }), "NAME_REQUIRED");
    const audit = await t.run(ctx => ctx.db.query("auditLog").collect());
    expect(audit).toEqual([expect.objectContaining({ table: "users", fields: ["name"], actorUserId: me.userId })]);
  });
});

describe("profile photo", () => {
  test("type comes from the bytes; a declared type must agree", () => {
    expect(detectImageType(PNG)).toBe("image/png");
    expect(detectImageType(JPEG)).toBe("image/jpeg");
    expect(detectImageType(new TextEncoder().encode("RIFF1234WEBPVP8 "))).toBe("image/webp");
    expect(detectImageType(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(isAcceptablePhoto(PNG, "")).toBe(true);
    expect(isAcceptablePhoto(PNG, "image/png")).toBe(true);
    expect(isAcceptablePhoto(JPEG, "image/png")).toBe(false);
    expect(isAcceptablePhoto(new TextEncoder().encode("%PDF-1.7"), "")).toBe(false);
  });

  test("a fresh, valid image is attached; replacing it deletes the old file", async () => {
    const t = newBackend();
    const me = await seedUser(t, { email: "staff@example.invalid" });
    const first = await t.run(ctx => ctx.storage.store(new Blob([PNG], { type: "image/png" })));
    await me.as.action(api.settings.setProfilePhoto, { storageId: first });
    expect((await me.as.query(api.access.me, {})).photoUrl).toBeTruthy();
    const second = await t.run(ctx => ctx.storage.store(new Blob([JPEG], { type: "image/jpeg" })));
    await me.as.action(api.settings.setProfilePhoto, { storageId: second });
    expect(await t.run(ctx => ctx.storage.get(first))).toBeNull();
    await me.as.mutation(api.settings.removeProfilePhoto, {});
    expect((await me.as.query(api.access.me, {})).photoUrl).toBeNull();
    expect(await t.run(ctx => ctx.storage.get(second))).toBeNull();
  });

  test("a file whose content isn't an image is rejected and deleted", async () => {
    const t = newBackend();
    const me = await seedUser(t, { email: "staff@example.invalid" });
    const fake = await t.run(ctx => ctx.storage.store(new Blob(["not an image"], { type: "image/png" })));
    await expectCode(me.as.action(api.settings.setProfilePhoto, { storageId: fake }), "INVALID_IMAGE");
    expect(await t.run(ctx => ctx.storage.get(fake))).toBeNull();
  });

  test("oversized files and non-image types are rejected", async () => {
    const t = newBackend();
    const me = await seedUser(t, { email: "staff@example.invalid" });
    const big = new Uint8Array(MAX_PHOTO_BYTES + 1);
    big.set(PNG);
    const oversized = await t.run(ctx => ctx.storage.store(new Blob([big], { type: "image/png" })));
    await expectCode(me.as.action(api.settings.setProfilePhoto, { storageId: oversized }), "INVALID_IMAGE");
    const pdf = await t.run(ctx => ctx.storage.store(new Blob(["%PDF-1.7"], { type: "application/pdf" })));
    await expectCode(me.as.action(api.settings.setProfilePhoto, { storageId: pdf }), "INVALID_IMAGE");
  });

  test("S3 closed: nobody can claim a file already attached to someone else, and it is not deleted", async () => {
    const t = newBackend();
    const owner = await seedUser(t, { email: "owner@example.invalid" });
    const thief = await seedUser(t, { email: "thief@example.invalid" });
    const photo = await t.run(ctx => ctx.storage.store(new Blob([PNG], { type: "image/png" })));
    await owner.as.action(api.settings.setProfilePhoto, { storageId: photo });
    await expectCode(thief.as.action(api.settings.setProfilePhoto, { storageId: photo }), "INVALID_IMAGE");
    expect(await t.run(async ctx => (await ctx.storage.get(photo)) !== null)).toBe(true);
    expect((await thief.as.query(api.access.me, {})).photoUrl).toBeNull();
  });

  test("S3 closed: an old, unattached file can't be claimed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T08:00:00Z"));
    const t = newBackend();
    const me = await seedUser(t, { email: "staff@example.invalid" });
    const old = await t.run(ctx => ctx.storage.store(new Blob([PNG], { type: "image/png" })));
    vi.setSystemTime(new Date("2026-09-28T09:30:00Z"));
    await expectCode(me.as.action(api.settings.setProfilePhoto, { storageId: old }), "INVALID_IMAGE");
  });
});

describe("team roster", () => {
  test("lists active members of one team, by name", async () => {
    const t = newBackend();
    const me = await seedUser(t, { email: "zed@example.invalid", person: { teams: ["intake"] } });
    await seedUser(t, { email: "amy@example.invalid", person: { teams: ["intake", "billing"] } });
    await seedUser(t, { email: "gone@example.invalid", person: { teams: ["intake"], active: false } });
    await seedUser(t, { email: "bob@example.invalid", person: { teams: ["billing"] } });
    const names = (await me.as.query(api.access.listTeam, { team: "intake" })).map(p => p.displayName);
    expect(names).toEqual(["amy", "zed"]);
  });
});
