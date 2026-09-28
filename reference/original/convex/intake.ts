import { v } from "convex/values";
import { assertRestrictedActionAllowed } from "./permissions";
import { mutation, query } from "./_generated/server";

const DEFAULT_INTAKE_STAFF: Array<{ name: string; email: string }> = [
  { name: "Mitzi", email: "smbphvs.langit.mitzi@gmail.com" },
  { name: "Rose", email: "virtualstaff.benedicto.05202024@gmail.com" },
  { name: "Jhaysen", email: "virtualstaff.mercurio.100724@gmail.com" },
  { name: "Claire", email: "virtualstaff.quijano.031826@gmail.com" },
  { name: "Kat", email: "virtualstaff.barrameda.07102026@gmail.com" },
];

// ─── Intake staff ───────────────────────────────────────────────────────────

export const listStaff = query({
  args: {},
  handler: async ctx => {
    return await ctx.db.query("intakeStaff").collect();
  },
});

export const seedStaffDefaults = mutation({
  args: {},
  handler: async ctx => {
    const existing = await ctx.db.query("intakeStaff").collect();
    if (existing.length > 0) return;
    for (const s of DEFAULT_INTAKE_STAFF) {
      await ctx.db.insert("intakeStaff", s);
    }
  },
});

export const addStaff = mutation({
  args: { name: v.string(), email: v.string() },
  handler: async (ctx, { name, email }) => {
    await assertRestrictedActionAllowed(ctx);
    return await ctx.db.insert("intakeStaff", { name: name.trim(), email: email.trim() });
  },
});

export const deleteStaff = mutation({
  args: { _id: v.id("intakeStaff") },
  handler: async (ctx, { _id }) => {
    await assertRestrictedActionAllowed(ctx);
    await ctx.db.delete(_id);
  },
});

// ─── Intake productivity entries ───────────────────────────────────────────

export const listEntries = query({
  args: {},
  handler: async ctx => {
    return await ctx.db.query("intakeEntries").collect();
  },
});

const entryFields = {
  staff: v.string(),
  date: v.string(),
  direction: v.string(),
  category: v.string(),
  result: v.optional(v.string()),
  count: v.number(),
  notes: v.optional(v.string()),
  createdAt: v.string(),
  patientId: v.optional(v.string()),
  otherInfo: v.optional(v.string()),
};

export const addEntry = mutation({
  args: { ...entryFields },
  handler: async (ctx, fields) => {
    return await ctx.db.insert("intakeEntries", { ...fields });
  },
});

export const deleteEntry = mutation({
  args: { _id: v.id("intakeEntries") },
  handler: async (ctx, { _id }) => {
    await ctx.db.delete(_id);
  },
});

export const updateEntryNotes = mutation({
  args: { _id: v.id("intakeEntries"), notes: v.optional(v.string()) },
  handler: async (ctx, { _id, notes }) => {
    await ctx.db.patch(_id, { notes });
  },
});

// Lets staff correct Call Reason (category) and/or Resolution (result) on
// an already-logged Intake entry, alongside Notes, from the Log tab's entry
// modal (Wence, 2026-07-27). Any field left undefined is untouched.
export const updateEntryDetails = mutation({
  args: {
    _id: v.id("intakeEntries"),
    patientId: v.optional(v.string()),
    category: v.optional(v.string()),
    result: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { _id, patientId, category, result, notes }) => {
    const patch: Record<string, unknown> = {};
    if (patientId !== undefined) patch.patientId = patientId;
    if (category !== undefined) patch.category = category;
    if (result !== undefined) patch.result = result;
    if (notes !== undefined) patch.notes = notes;
    await ctx.db.patch(_id, patch);
  },
});

// Reset button on the Intake Log toolbar — clears only intakeEntries
// (leaves staff roster and daily metrics untouched), mirroring cases.deleteAll.
export const deleteAllEntries = mutation({
  args: {},
  handler: async ctx => {
    await assertRestrictedActionAllowed(ctx);
    const all = await ctx.db.query("intakeEntries").collect();
    await Promise.all(all.map(e => ctx.db.delete(e._id)));
  },
});

// ─── Daily metrics (emails sent, GHL chats, etc.) ─────────────────────────

export const listDailyMetrics = query({
  args: {},
  handler: async ctx => {
    return await ctx.db.query("intakeDailyMetrics").collect();
  },
});

const metricFields = {
  staff: v.string(),
  date: v.string(),
  emailsSent: v.number(),
  ghlChats: v.number(),
  newPatientIntake: v.number(),
  callAudits: v.number(),
  faxDocs: v.number(),
  updatedAt: v.string(),
};

export const upsertDailyMetric = mutation({
  args: { ...metricFields },
  handler: async (ctx, fields) => {
    const existing = await ctx.db
      .query("intakeDailyMetrics")
      .withIndex("by_staff_date", q =>
        q.eq("staff", fields.staff).eq("date", fields.date),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { ...fields });
      return existing._id;
    }
    return await ctx.db.insert("intakeDailyMetrics", { ...fields });
  },
});

export const deleteDailyMetric = mutation({
  args: { _id: v.id("intakeDailyMetrics") },
  handler: async (ctx, { _id }) => {
    await ctx.db.delete(_id);
  },
});
