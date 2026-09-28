// Shared business-rule constants for the Intake Booked Tracker appointment
// form (Add/Edit modal) and filter dropdowns. Kept in one place so the
// frontend and backend agree on the exact same option lists (per Wence's
// spec, 2026-08-04).
import { v } from "convex/values";
import { assertRestrictedActionAllowed } from "./permissions";
import { mutation, query } from "./_generated/server";

export const SOURCES = ["SMB-PLD", "SMB INB-NEW", "SMB INB-OLD", "SMB TASK", "Boost"] as const;

export const SMB_SOURCES = ["SMB-PLD", "SMB INB-NEW", "SMB INB-OLD", "SMB TASK"];
export const BOOST_SOURCES = ["Boost"];

export function sourceGroup(source: string): "SMB" | "Boost" {
  return BOOST_SOURCES.includes(source) ? "Boost" : "SMB";
}

// Source group -> allowed Appointment Types
export const APPOINTMENT_TYPES_BY_GROUP: Record<string, string[]> = {
  SMB: ["Consult", "Follow Up"],
  Boost: ["Consult"],
};

// "<group>|<appointmentType>" -> allowed Service Types
export const SERVICE_TYPES: Record<string, string[]> = {
  "SMB|Consult": ["Bariatric Surgery", "Revision", "Veins Treatment", "Medical Weight Loss", "General"],
  "SMB|Follow Up": [
    "Follow Up",
    "Post Op",
    "Pre-Op",
    "RDN Visit",
    "IV Hydration",
    "B12 Shot",
    "Veins U/S",
  ],
  "Boost|Consult": ["Bariatric Surgery", "Veins Treatment", "Medical Weight Loss"],
};

export const CLINIC_LOCATIONS = ["Atlanta", "Stockbridge", "Newnan"] as const;

// Updated per Wence's provider assignment rules, 2026-08-04.
export const PROVIDERS_BY_LOCATION: Record<string, string[]> = {
  Atlanta: [
    "Dr. Charles Procter Jr.",
    "Dr. Vishwanath Danthuluri",
    "PA-C Kathryn Fuss",
    "NP. Jessica Harry",
  ],
  Stockbridge: [
    "Dr. Charles Procter Jr.",
    "Dr. Vishwanath Danthuluri",
    "NP. Mary Florio",
    "NP. Jessica Harry",
  ],
  Newnan: ["Dr. Charles Procter Jr.", "NP. Mary Florio", "RDN. Jeanette Shelley"],
};

export const STATUSES = ["Pending", "Showed", "No-Show", "Cancelled"] as const;

// Scheduler dropdown, added 2026-08-04 per Wence.
export const SCHEDULERS = ["Mitzi L.", "Rose B.", "Claire Q.", "Katrina B.", "Jhaysen M.", "Boost"] as const;

export const ALL_SERVICE_TYPES = Array.from(new Set(Object.values(SERVICE_TYPES).flat()));

type OptionType = "scheduler" | "provider";

function optionKey(optionType: OptionType, value: string, location?: string) {
  return [optionType, location?.trim().toLowerCase() ?? "", value.trim().toLowerCase()].join("|");
}

function unique(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function effectiveValues(
  defaults: string[],
  overrides: { value: string; active: boolean }[],
) {
  const overrideByValue = new Map(
    overrides.map(option => [option.value.trim().toLowerCase(), option]),
  );
  const defaultValues = unique(defaults).filter(
    value => overrideByValue.get(value.toLowerCase())?.active !== false,
  );
  const customValues = overrides
    .filter(option => {
      const normalized = option.value.trim().toLowerCase();
      return option.active && !defaults.some(value => value.toLowerCase() === normalized);
    })
    .map(option => option.value.trim());
  return unique([...defaultValues, ...customValues]);
}

// Public read query: every Appointment Form user needs the live choices.
// Changes are written only by the admin allowlist below.
export const list = query({
  args: {},
  handler: async ctx => {
    const overrides = await ctx.db.query("appointmentDropdownOptions").collect();
    return {
      schedulers: effectiveValues(
        [...SCHEDULERS],
        overrides
          .filter(option => option.optionType === "scheduler")
          .map(option => ({ value: option.value, active: option.active })),
      ),
      providersByLocation: Object.fromEntries(
        CLINIC_LOCATIONS.map(location => [
          location,
          effectiveValues(
            PROVIDERS_BY_LOCATION[location] ?? [],
            overrides
              .filter(option => option.optionType === "provider" && option.location === location)
              .map(option => ({ value: option.value, active: option.active })),
          ),
        ]),
      ),
    };
  },
});

// Adds a new choice or reactivates one that an admin previously removed.
// `assertRestrictedActionAllowed` is the existing server-enforced admin
// allowlist used for restricted Booked Tracker controls.
export const add = mutation({
  args: {
    optionType: v.union(v.literal("scheduler"), v.literal("provider")),
    value: v.string(),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertRestrictedActionAllowed(ctx);
    const value = args.value.trim();
    const location = args.location?.trim();
    if (!value) throw new Error("Enter a name before adding it.");
    if (args.optionType === "provider" && (!location || !CLINIC_LOCATIONS.includes(location as never))) {
      throw new Error("Choose a valid clinic location for this provider.");
    }
    if (args.optionType === "scheduler" && location) {
      throw new Error("Schedulers cannot be assigned to a clinic location.");
    }

    const key = optionKey(args.optionType, value, location);
    const existing = await ctx.db
      .query("appointmentDropdownOptions")
      .withIndex("by_optionKey", query => query.eq("optionKey", key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value, location, active: true });
    } else {
      await ctx.db.insert("appointmentDropdownOptions", {
        optionType: args.optionType,
        value,
        location,
        optionKey: key,
        active: true,
      });
    }
  },
});

// Hides one option from the form without changing historic appointments
// already saved with that Scheduler or Provider.
export const remove = mutation({
  args: {
    optionType: v.union(v.literal("scheduler"), v.literal("provider")),
    value: v.string(),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertRestrictedActionAllowed(ctx);
    const value = args.value.trim();
    const location = args.location?.trim();
    if (!value) throw new Error("Choose an option to remove.");
    if (args.optionType === "provider" && (!location || !CLINIC_LOCATIONS.includes(location as never))) {
      throw new Error("Choose a valid clinic location for this provider.");
    }
    if (args.optionType === "scheduler" && location) {
      throw new Error("Schedulers cannot be assigned to a clinic location.");
    }

    const key = optionKey(args.optionType, value, location);
    const existing = await ctx.db
      .query("appointmentDropdownOptions")
      .withIndex("by_optionKey", query => query.eq("optionKey", key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value, location, active: false });
    } else {
      await ctx.db.insert("appointmentDropdownOptions", {
        optionType: args.optionType,
        value,
        location,
        optionKey: key,
        active: false,
      });
    }
  },
});
