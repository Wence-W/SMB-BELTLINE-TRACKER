import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * True if any document already points at this storage file. Used to stop a
 * caller from "claiming" someone else's file by ID (the original's S3 hole:
 * updateProfileImage accepted any storage ID and published it). Later phases
 * add their storage-bearing tables (recordings, screenshots) here.
 */
export async function isStorageReferenced(ctx: QueryCtx, storageId: Id<"_storage">): Promise<boolean> {
  const people = await ctx.db.query("people").collect();
  return people.some(person => person.profilePhotoId === storageId);
}
