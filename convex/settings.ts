// Settings: account name and profile photo. (Password changes use the
// emailed-code flow in convex/auth.ts.) Ported from the original's
// users.updateName / generateUploadUrl / updateProfileImage, with the photo
// path hardened: the original stored ANY storage ID as a public URL.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { logAccess } from "./lib/audit";
import { authedAction, authedMutation } from "./lib/functions";
import { isStorageReferenced } from "./lib/storageRefs";

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const PHOTO_UPLOAD_WINDOW_MS = 60 * 60 * 1000;
export type PhotoType = "image/jpeg" | "image/png" | "image/webp";

/** The image type the file's own bytes say it is (magic bytes), or null. */
export function detectImageType(bytes: Uint8Array): PhotoType | null {
  const at = (i: number, b: number) => bytes[i] === b;
  const ascii = (from: number, text: string) => [...text].every((c, i) => bytes[from + i] === c.charCodeAt(0));
  if (at(0, 0xff) && at(1, 0xd8) && at(2, 0xff)) return "image/jpeg";
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => at(i, b))) return "image/png";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  return null;
}

/**
 * Accept only real JPEG/PNG/WebP content; if the upload declared a type, it
 * must agree with the bytes.
 */
export function isAcceptablePhoto(bytes: Uint8Array, declaredType: string): boolean {
  const detected = detectImageType(bytes);
  return detected !== null && (declaredType === "" || declaredType === detected);
}

export const updateMyName = authedMutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const trimmed = name.trim();
    if (!trimmed) throw new ConvexError({ code: "NAME_REQUIRED" });
    await ctx.db.patch(ctx.viewer.userId, { name: trimmed });
    // `users` is written outside the audit triggers, so log it explicitly.
    await logAccess(ctx.db, ctx.viewer.userId, {
      action: "update",
      table: "users",
      docId: ctx.viewer.userId,
      fields: ["name"],
    });
  },
});

export const generatePhotoUploadUrl = authedMutation({
  args: {},
  handler: async ctx => await ctx.storage.generateUploadUrl(),
});

export const photoCandidate = internalQuery({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const file = await ctx.db.system.get(storageId);
    if (!file) return null;
    return {
      size: file.size,
      contentType: file.contentType ?? "",
      createdAt: file._creationTime,
      referenced: await isStorageReferenced(ctx, storageId),
    };
  },
});

export const attachPhoto = internalMutation({
  args: { personId: v.id("people"), userId: v.id("users"), storageId: v.id("_storage") },
  handler: async (ctx, { personId, userId, storageId }) => {
    // Re-checked inside the transaction so two callers can't both claim it.
    if (await isStorageReferenced(ctx, storageId)) throw new ConvexError({ code: "INVALID_IMAGE" });
    const person = await ctx.db.get(personId);
    if (!person) throw new ConvexError({ code: "NOT_PROVISIONED" });
    const previous = person.profilePhotoId;
    await ctx.db.patch(personId, { profilePhotoId: storageId });
    await logAccess(ctx.db, userId, { action: "update", table: "people", docId: personId, fields: ["profilePhotoId"] });
    if (previous && previous !== storageId) await ctx.storage.delete(previous);
  },
});

export const setProfilePhoto = authedAction({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const candidate = await ctx.runQuery(internal.settings.photoCandidate, { storageId });
    // Never delete a file that belongs to something else; only fresh strays.
    const reject = async (): Promise<never> => {
      if (candidate && !candidate.referenced) await ctx.storage.delete(storageId);
      throw new ConvexError({ code: "INVALID_IMAGE" });
    };
    if (!candidate || candidate.referenced) return await reject();
    if (candidate.size <= 0 || candidate.size > MAX_PHOTO_BYTES) return await reject();
    if (Date.now() - candidate.createdAt > PHOTO_UPLOAD_WINDOW_MS) return await reject();
    const blob = await ctx.storage.get(storageId);
    if (!blob) return await reject();
    const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    if (!isAcceptablePhoto(head, candidate.contentType)) return await reject();
    await ctx.runMutation(internal.settings.attachPhoto, {
      personId: ctx.viewer.personId,
      userId: ctx.viewer.userId,
      storageId,
    });
  },
});

export const removeProfilePhoto = authedMutation({
  args: {},
  handler: async ctx => {
    const person = await ctx.db.get(ctx.viewer.personId as Id<"people">);
    if (!person?.profilePhotoId) return;
    const photo = person.profilePhotoId;
    await ctx.db.patch(person._id, { profilePhotoId: undefined });
    await ctx.storage.delete(photo);
  },
});
