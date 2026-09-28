import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ---------------------------------------------------------------------------
// Clinic tab
// ---------------------------------------------------------------------------

const CLINIC_SEED: {
  name: string;
  address: string;
  fax: string;
  providers: string[];
}[] = [
  {
    name: "Atlanta",
    address: "370 E Paces Ferry Rd, NE, Ste 750, 30305",
    fax: "470-298-7736",
    providers: [
      "Dr. Charles Procter Jr.",
      "Dr. Vishwanath Danthuluri",
      "PA-C Kathryn Fuss",
      "NP. Jessica Harry",
    ],
  },
  {
    name: "Stockbridge",
    address: "550 Eagles Landing Pkwy, Suite 204, 30281",
    fax: "470-298-7736",
    providers: [
      "Dr. Charles Procter Jr.",
      "Dr. Vishwanath Danthuluri",
      "NP. Mary Florio",
      "NP. Jessica Harry",
    ],
  },
  {
    name: "Newnan",
    address: "300 Bullsboro Dr, Suite BC, 30263",
    fax: "470-298-7732",
    providers: ["Dr. Charles Procter Jr.", "NP. Mary Florio", "RDN. Jeanette Shelley"],
  },
];

export const listClinics = query({
  args: {},
  handler: async ctx => {
    const clinics = await ctx.db.query("clinicWidgets").collect();
    clinics.sort((a, b) => a.order - b.order);
    const result = [];
    for (const c of clinics) {
      const providers = await ctx.db
        .query("clinicProviders")
        .withIndex("by_clinic", q => q.eq("clinicId", c._id))
        .collect();
      providers.sort((a, b) => a.order - b.order);
      result.push({ ...c, providers });
    }
    return result;
  },
});

export const seedClinicDefaults = mutation({
  args: {},
  handler: async ctx => {
    const existing = await ctx.db.query("clinicWidgets").take(1);
    if (existing.length > 0) return;
    for (let i = 0; i < CLINIC_SEED.length; i++) {
      const c = CLINIC_SEED[i];
      const clinicId = await ctx.db.insert("clinicWidgets", {
        name: c.name,
        address: c.address,
        fax: c.fax,
        order: i,
      });
      for (let j = 0; j < c.providers.length; j++) {
        await ctx.db.insert("clinicProviders", {
          clinicId,
          providerName: c.providers[j],
          order: j,
        });
      }
    }
  },
});

export const updateClinicInfo = mutation({
  args: {
    id: v.id("clinicWidgets"),
    name: v.optional(v.string()),
    address: v.optional(v.string()),
    fax: v.optional(v.string()),
  },
  handler: async (ctx, { id, name, address, fax }) => {
    const patch: Record<string, string> = {};
    if (name !== undefined) patch.name = name.trim();
    if (address !== undefined) patch.address = address.trim();
    if (fax !== undefined) patch.fax = fax.trim();
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
  },
});

export const addClinicProvider = mutation({
  args: { clinicId: v.id("clinicWidgets"), providerName: v.string() },
  handler: async (ctx, { clinicId, providerName }) => {
    const name = providerName.trim();
    if (!name) throw new Error("Provider name is required");
    const existing = await ctx.db
      .query("clinicProviders")
      .withIndex("by_clinic", q => q.eq("clinicId", clinicId))
      .collect();
    const maxOrder = existing.reduce((max, e) => Math.max(max, e.order), -1);
    return await ctx.db.insert("clinicProviders", {
      clinicId,
      providerName: name,
      order: maxOrder + 1,
    });
  },
});

export const updateClinicProvider = mutation({
  args: { id: v.id("clinicProviders"), providerName: v.string() },
  handler: async (ctx, { id, providerName }) => {
    const name = providerName.trim();
    if (!name) throw new Error("Provider name is required");
    await ctx.db.patch(id, { providerName: name });
  },
});

export const removeClinicProvider = mutation({
  args: { id: v.id("clinicProviders") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

// ---------------------------------------------------------------------------
// Departments tab
// ---------------------------------------------------------------------------

const DEPARTMENT_SEED: {
  name: string;
  extension?: string;
  slackChannel?: string;
  members: { memberName: string; locationTag?: string; assignment?: string }[];
}[] = [
  {
    name: "Front Office",
    extension: "1007",
    slackChannel: "fo-smb",
    members: [
      { memberName: "Regina Riley" },
      { memberName: "Mckeeble Faegin" },
      { memberName: "Miriam Clement" },
      { memberName: "Donna Woods" },
      { memberName: "Keisha Cole", locationTag: "Stockbridge" },
      { memberName: "Chante Carroll", locationTag: "Newnan" },
    ],
  },
  {
    name: "Medical Assistant",
    extension: "2001",
    slackChannel: "smb-vs-medical-assistance-channel",
    members: [
      { memberName: "Sharda' High", locationTag: "Atlanta" },
      { memberName: "Tanya Washington" },
      { memberName: "Linh Dang" },
      { memberName: "Trayona Belford" },
      { memberName: "Tikila Chapman", locationTag: "Stockbridge" },
      { memberName: "Wendy Sexton", locationTag: "Newnan" },
    ],
  },
  {
    name: "Patient Navigator",
    members: [
      { memberName: "Karen Murray", assignment: "Dr. Procter (Bariatric)" },
      { memberName: "Al-nisa Hawkins", assignment: "Dr. Procter (Veins)" },
      { memberName: "Al-nisa Hawkins", assignment: "Dr. Danthuluri" },
    ],
  },
  {
    name: "Billing",
    members: [{ memberName: "Stacey Stripp" }, { memberName: "Michelle Phillipps" }],
  },
];

export const listDepartments = query({
  args: {},
  handler: async ctx => {
    const departments = await ctx.db.query("departmentWidgets").collect();
    departments.sort((a, b) => a.order - b.order);
    const result = [];
    for (const d of departments) {
      const members = await ctx.db
        .query("departmentMembers")
        .withIndex("by_department", q => q.eq("departmentId", d._id))
        .collect();
      members.sort((a, b) => a.order - b.order);
      result.push({ ...d, members });
    }
    return result;
  },
});

export const seedDepartmentDefaults = mutation({
  args: {},
  handler: async ctx => {
    const existing = await ctx.db.query("departmentWidgets").take(1);
    if (existing.length > 0) return;
    for (let i = 0; i < DEPARTMENT_SEED.length; i++) {
      const d = DEPARTMENT_SEED[i];
      const departmentId = await ctx.db.insert("departmentWidgets", {
        name: d.name,
        extension: d.extension,
        slackChannel: d.slackChannel,
        order: i,
      });
      for (let j = 0; j < d.members.length; j++) {
        const m = d.members[j];
        await ctx.db.insert("departmentMembers", {
          departmentId,
          memberName: m.memberName,
          locationTag: m.locationTag,
          assignment: m.assignment,
          order: j,
        });
      }
    }
  },
});

export const updateDepartmentInfo = mutation({
  args: {
    id: v.id("departmentWidgets"),
    extension: v.optional(v.string()),
    slackChannel: v.optional(v.string()),
  },
  handler: async (ctx, { id, extension, slackChannel }) => {
    const patch: Record<string, string> = {};
    if (extension !== undefined) patch.extension = extension.trim();
    if (slackChannel !== undefined) patch.slackChannel = slackChannel.trim();
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
  },
});

export const addDepartmentMember = mutation({
  args: {
    departmentId: v.id("departmentWidgets"),
    memberName: v.string(),
    locationTag: v.optional(v.string()),
    assignment: v.optional(v.string()),
  },
  handler: async (ctx, { departmentId, memberName, locationTag, assignment }) => {
    const name = memberName.trim();
    if (!name) throw new Error("Name is required");
    const existing = await ctx.db
      .query("departmentMembers")
      .withIndex("by_department", q => q.eq("departmentId", departmentId))
      .collect();
    const maxOrder = existing.reduce((max, e) => Math.max(max, e.order), -1);
    return await ctx.db.insert("departmentMembers", {
      departmentId,
      memberName: name,
      locationTag: locationTag?.trim() || undefined,
      assignment: assignment?.trim() || undefined,
      order: maxOrder + 1,
    });
  },
});

export const updateDepartmentMember = mutation({
  args: {
    id: v.id("departmentMembers"),
    memberName: v.optional(v.string()),
    locationTag: v.optional(v.string()),
    assignment: v.optional(v.string()),
  },
  handler: async (ctx, { id, memberName, locationTag, assignment }) => {
    const patch: Record<string, string | undefined> = {};
    if (memberName !== undefined) {
      const name = memberName.trim();
      if (!name) throw new Error("Name is required");
      patch.memberName = name;
    }
    if (locationTag !== undefined) patch.locationTag = locationTag.trim() || undefined;
    if (assignment !== undefined) patch.assignment = assignment.trim() || undefined;
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
  },
});

export const removeDepartmentMember = mutation({
  args: { id: v.id("departmentMembers") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
