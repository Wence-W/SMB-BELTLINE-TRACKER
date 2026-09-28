// Dev/staging only: synthetic starter data so the app is usable before the
// approved migration (plan G2) brings the real directory and lists. Every
// value here is fictional. Run with `npx convex run devSeed:seedPhase1`.
// Refused on a production deployment and on non-empty tables.
import { ConvexError } from "convex/values";
import { materializeOptions } from "./lib/appointmentOptions";
import { auditedInternalMutation } from "./lib/functions";

declare const process: { env: Record<string, string | undefined> };

export const SYNTHETIC_CLINICS = [
  {
    name: "Atlanta",
    address: "100 Example Way, Suite 1",
    fax: "555-0100",
    providers: ["Dr. Example One", "NP Example Two"],
  },
  {
    name: "Stockbridge",
    address: "200 Example Way",
    fax: "555-0101",
    providers: ["Dr. Example One", "PA Example Three"],
  },
  { name: "Newnan", address: "300 Example Way", fax: "555-0102", providers: ["Dr. Example Four"] },
];

export const SYNTHETIC_DEPARTMENTS = [
  {
    name: "Front Office",
    extension: "1000",
    slackChannel: "#example-front-office",
    members: [{ memberName: "Sam Sample", locationTag: "Stockbridge" }, { memberName: "Robin Sample" }],
  },
  {
    name: "Medical Assistant",
    extension: "2000",
    slackChannel: "#example-ma",
    members: [{ memberName: "Taylor Sample", locationTag: "Atlanta" }],
  },
  { name: "Patient Navigator", members: [{ memberName: "Jordan Sample", assignment: "Dr. Example One (Bariatric)" }] },
  { name: "Billing Team", members: [{ memberName: "Morgan Sample" }] },
];

export const SYNTHETIC_OPTION_DEFAULTS = {
  schedulers: ["Scheduler A.", "Scheduler B.", "Boost"],
  providersByLocation: {
    Atlanta: ["Dr. Example One", "NP Example Two"],
    Stockbridge: ["Dr. Example One", "PA Example Three"],
    Newnan: ["Dr. Example Four"],
  },
};

export const seedPhase1 = auditedInternalMutation({
  args: {},
  handler: async ctx => {
    if (process.env.DEPLOYMENT_ENV === "production") throw new ConvexError({ code: "NOT_IN_PRODUCTION" });
    if ((await ctx.db.query("clinicWidgets").first()) || (await ctx.db.query("departmentWidgets").first())) {
      throw new ConvexError({ code: "ALREADY_SEEDED" });
    }
    for (const [i, clinic] of SYNTHETIC_CLINICS.entries()) {
      const clinicId = await ctx.db.insert("clinicWidgets", {
        name: clinic.name,
        address: clinic.address,
        fax: clinic.fax,
        order: i,
      });
      for (const [j, providerName] of clinic.providers.entries()) {
        await ctx.db.insert("clinicProviders", { clinicId, providerName, order: j });
      }
    }
    for (const [i, department] of SYNTHETIC_DEPARTMENTS.entries()) {
      const departmentId = await ctx.db.insert("departmentWidgets", {
        name: department.name,
        extension: department.extension,
        slackChannel: department.slackChannel,
        order: i,
      });
      for (const [j, member] of department.members.entries()) {
        await ctx.db.insert("departmentMembers", { departmentId, ...member, order: j });
      }
    }
    for (const name of ["Dr. Example One", "Dr. Example Four"]) await ctx.db.insert("precertProviders", { name });
    for (const name of ["Requester A", "Requester B"]) await ctx.db.insert("reverificationRequesters", { name });
    for (const name of ["Dr. Example One, M.D", "NP Example Two"])
      await ctx.db.insert("piedmontEpicProviders", { name });
    for (const row of materializeOptions(SYNTHETIC_OPTION_DEFAULTS, [])) {
      await ctx.db.insert("appointmentDropdownOptions", row);
    }
  },
});
