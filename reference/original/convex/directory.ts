import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const SEED: {
  team: string;
  extension?: string;
  slackChannel?: string;
  groupLabel?: string;
  memberName: string;
}[] = [
  { team: "Front Office", extension: "1007", slackChannel: "#fo-smb", memberName: "Regina Riley" },
  { team: "Front Office", extension: "1007", slackChannel: "#fo-smb", memberName: "Mckeeble Faegin" },
  { team: "Front Office", extension: "1007", slackChannel: "#fo-smb", memberName: "Miriam Clement" },
  { team: "Front Office", extension: "1007", slackChannel: "#fo-smb", memberName: "Donna Woods" },

  { team: "Medical Assistant", extension: "2001", slackChannel: "#smb-vs-medical-assistance-channel", groupLabel: "Atlanta", memberName: "Sharda' High" },
  { team: "Medical Assistant", extension: "2001", slackChannel: "#smb-vs-medical-assistance-channel", groupLabel: "Atlanta", memberName: "Tanya Woods" },
  { team: "Medical Assistant", extension: "2001", slackChannel: "#smb-vs-medical-assistance-channel", groupLabel: "Stockbridge", memberName: "Tikila Chapman" },
  { team: "Medical Assistant", extension: "2001", slackChannel: "#smb-vs-medical-assistance-channel", groupLabel: "Newnan", memberName: "Wendy Sexton" },
  { team: "Medical Assistant", extension: "2001", slackChannel: "#smb-vs-medical-assistance-channel", groupLabel: "Other Medical Assistants", memberName: "Tanya Washington" },
  { team: "Medical Assistant", extension: "2001", slackChannel: "#smb-vs-medical-assistance-channel", groupLabel: "Other Medical Assistants", memberName: "Linh Dang" },
  { team: "Medical Assistant", extension: "2001", slackChannel: "#smb-vs-medical-assistance-channel", groupLabel: "Other Medical Assistants", memberName: "Trayona Belford" },

  { team: "Billing Team", groupLabel: "Patient Balances", memberName: "Stacey Stripp" },
  { team: "Billing Team", groupLabel: "Claims", memberName: "Michelle Phillipps" },
  { team: "Billing Team", groupLabel: "Billing", memberName: "Taquoya Pearson" },

  { team: "Patient Navigator", groupLabel: "Bariatric — Dr. Procter", memberName: "Karen Murray" },
  { team: "Patient Navigator", groupLabel: "Veins — Dr. Procter", memberName: "Al-Nisa Hawkins" },
  { team: "Patient Navigator", groupLabel: "Bariatric / Veins — Dr. Danthuluri", memberName: "Al-Nisa Hawkins" },
];

export const list = query({
  args: {},
  handler: async ctx => {
    return await ctx.db.query("directoryEntries").withIndex("by_team").collect();
  },
});

/** Seed default directory if the table is empty (called once from the client). */
export const seedDefaults = mutation({
  args: {},
  handler: async ctx => {
    const existing = await ctx.db.query("directoryEntries").take(1);
    if (existing.length > 0) return;
    for (let i = 0; i < SEED.length; i++) {
      await ctx.db.insert("directoryEntries", { ...SEED[i], order: i });
    }
  },
});

export const add = mutation({
  args: {
    team: v.string(),
    extension: v.optional(v.string()),
    slackChannel: v.optional(v.string()),
    groupLabel: v.optional(v.string()),
    memberName: v.string(),
  },
  handler: async (ctx, args) => {
    const team = args.team.trim();
    const memberName = args.memberName.trim();
    if (!team) throw new Error("Team is required");
    if (!memberName) throw new Error("Name is required");

    const all = await ctx.db.query("directoryEntries").collect();
    const maxOrder = all.reduce((max, e) => Math.max(max, e.order), -1);

    // Reuse extension/slackChannel from an existing row for the same team,
    // if not explicitly provided, so the whole team stays consistent.
    const existingForTeam = all.find(e => e.team === team);

    return await ctx.db.insert("directoryEntries", {
      team,
      extension: args.extension?.trim() || existingForTeam?.extension,
      slackChannel: args.slackChannel?.trim() || existingForTeam?.slackChannel,
      groupLabel: args.groupLabel?.trim() || undefined,
      memberName,
      order: maxOrder + 1,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("directoryEntries") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
