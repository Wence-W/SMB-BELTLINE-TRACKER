// Intake Directory: Clinic and Departments tabs. Behaviour ported 1:1 from
// reference/original/convex/intakeDirectory.ts (ordering, trimming, and
// "name required" checks). Differences: every function requires a signed-in
// active account (the original had no checks), and seeding is not exposed to
// clients (real defaults arrive with the migrated data; dev uses devSeed.ts).
// Edits stay open to all staff, as in production (plan section 4.2, "confirm").
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/functions";

function requireName(value: string): string {
  const name = value.trim();
  if (!name) throw new ConvexError({ code: "NAME_REQUIRED" });
  return name;
}

async function nextOrder<T extends { order: number }>(rows: Promise<T[]>): Promise<number> {
  return (await rows).reduce((max, row) => Math.max(max, row.order), -1) + 1;
}

function clinicProvidersOf(ctx: QueryCtx, clinicId: Id<"clinicWidgets">) {
  return ctx.db
    .query("clinicProviders")
    .withIndex("by_clinic", q => q.eq("clinicId", clinicId))
    .collect();
}

function departmentMembersOf(ctx: QueryCtx, departmentId: Id<"departmentWidgets">) {
  return ctx.db
    .query("departmentMembers")
    .withIndex("by_department", q => q.eq("departmentId", departmentId))
    .collect();
}

// ─── Clinics ─────────────────────────────────────────────────────────────────

export const listClinics = authedQuery({
  args: {},
  handler: async ctx => {
    const clinics = (await ctx.db.query("clinicWidgets").collect()).sort((a, b) => a.order - b.order);
    return await Promise.all(
      clinics.map(async clinic => ({
        ...clinic,
        providers: (await clinicProvidersOf(ctx, clinic._id)).sort((a, b) => a.order - b.order),
      })),
    );
  },
});

export const updateClinicInfo = authedMutation({
  args: {
    id: v.id("clinicWidgets"),
    name: v.optional(v.string()),
    address: v.optional(v.string()),
    fax: v.optional(v.string()),
  },
  handler: async (ctx, { id, name, address, fax }) => {
    // Parity: the original trims but does not reject a blank clinic name.
    const patch: { name?: string; address?: string; fax?: string } = {};
    if (name !== undefined) patch.name = name.trim();
    if (address !== undefined) patch.address = address.trim();
    if (fax !== undefined) patch.fax = fax.trim();
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
  },
});

export const addClinicProvider = authedMutation({
  args: { clinicId: v.id("clinicWidgets"), providerName: v.string() },
  handler: async (ctx, { clinicId, providerName }) => {
    const name = requireName(providerName);
    const order = await nextOrder(clinicProvidersOf(ctx, clinicId));
    return await ctx.db.insert("clinicProviders", { clinicId, providerName: name, order });
  },
});

export const updateClinicProvider = authedMutation({
  args: { id: v.id("clinicProviders"), providerName: v.string() },
  handler: async (ctx, { id, providerName }) => {
    await ctx.db.patch(id, { providerName: requireName(providerName) });
  },
});

export const removeClinicProvider = authedMutation({
  args: { id: v.id("clinicProviders") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

// ─── Departments ─────────────────────────────────────────────────────────────

export const listDepartments = authedQuery({
  args: {},
  handler: async ctx => {
    const departments = (await ctx.db.query("departmentWidgets").collect()).sort((a, b) => a.order - b.order);
    return await Promise.all(
      departments.map(async department => ({
        ...department,
        members: (await departmentMembersOf(ctx, department._id)).sort((a, b) => a.order - b.order),
      })),
    );
  },
});

export const updateDepartmentInfo = authedMutation({
  args: {
    id: v.id("departmentWidgets"),
    extension: v.optional(v.string()),
    slackChannel: v.optional(v.string()),
  },
  handler: async (ctx, { id, extension, slackChannel }) => {
    const patch: { extension?: string; slackChannel?: string } = {};
    if (extension !== undefined) patch.extension = extension.trim();
    if (slackChannel !== undefined) patch.slackChannel = slackChannel.trim();
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
  },
});

export const addDepartmentMember = authedMutation({
  args: {
    departmentId: v.id("departmentWidgets"),
    memberName: v.string(),
    locationTag: v.optional(v.string()),
    assignment: v.optional(v.string()),
  },
  handler: async (ctx, { departmentId, memberName, locationTag, assignment }) => {
    const name = requireName(memberName);
    const order = await nextOrder(departmentMembersOf(ctx, departmentId));
    return await ctx.db.insert("departmentMembers", {
      departmentId,
      memberName: name,
      locationTag: locationTag?.trim() || undefined,
      assignment: assignment?.trim() || undefined,
      order,
    });
  },
});

export const updateDepartmentMember = authedMutation({
  args: {
    id: v.id("departmentMembers"),
    memberName: v.optional(v.string()),
    locationTag: v.optional(v.string()),
    assignment: v.optional(v.string()),
  },
  handler: async (ctx, { id, memberName, locationTag, assignment }) => {
    const patch: { memberName?: string; locationTag?: string; assignment?: string } = {};
    if (memberName !== undefined) patch.memberName = requireName(memberName);
    if (locationTag !== undefined) patch.locationTag = locationTag.trim() || undefined;
    if (assignment !== undefined) patch.assignment = assignment.trim() || undefined;
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
  },
});

export const removeDepartmentMember = authedMutation({
  args: { id: v.id("departmentMembers") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
