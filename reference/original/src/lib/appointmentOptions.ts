// Mirrors convex/appointmentOptions.ts — kept in sync manually (no shared
// package boundary between convex/ and src/ in this template).

export const SOURCES = ["SMB-PLD", "SMB INB-NEW", "SMB INB-OLD", "SMB TASK", "Boost"] as const;
export type Source = (typeof SOURCES)[number];

const BOOST_SOURCES = ["Boost"];

export function sourceGroup(source: string): "SMB" | "Boost" {
  return BOOST_SOURCES.includes(source) ? "Boost" : "SMB";
}

export const APPOINTMENT_TYPES_BY_GROUP: Record<string, string[]> = {
  SMB: ["Consult", "Follow Up"],
  Boost: ["Consult"],
};
export const ALL_APPOINTMENT_TYPES = Array.from(
  new Set(Object.values(APPOINTMENT_TYPES_BY_GROUP).flat()),
);

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
export type ClinicLocation = (typeof CLINIC_LOCATIONS)[number];

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
export type Status = (typeof STATUSES)[number];

// Scheduler dropdown, added 2026-08-04 per Wence.
export const SCHEDULERS = ["Mitzi L.", "Rose B.", "Claire Q.", "Katrina B.", "Jhaysen M.", "Boost"] as const;
export type Scheduler = (typeof SCHEDULERS)[number];

export const ALL_SERVICE_TYPES = Array.from(new Set(Object.values(SERVICE_TYPES).flat()));
export const ALL_PROVIDERS = Array.from(new Set(Object.values(PROVIDERS_BY_LOCATION).flat()));

// Service Type filter options per Booked Tracker tab, added 2026-08-04 per
// Wence: the "All Service Type" dropdown on the Boost Appointments tab must
// only list the service types Boost actually supports (Bariatric, Veins,
// Medical Weight Loss) — no SMB-only types like Revision/General. All and
// SMB tabs keep the full list unchanged.
export const SERVICE_TYPES_BY_GROUP: Record<"SMB" | "Boost", string[]> = {
  SMB: ALL_SERVICE_TYPES,
  Boost: SERVICE_TYPES["Boost|Consult"],
};

export const STATUS_BADGE_CLASSES: Record<string, string> = {
  Pending: "bg-blue-500 text-white",
  Showed: "bg-green-600 text-white",
  "No-Show": "bg-orange-500 text-white",
  Cancelled: "bg-red-600 text-white",
};

export function serviceTypesFor(group: "SMB" | "Boost", appointmentType: string): string[] {
  return SERVICE_TYPES[`${group}|${appointmentType}`] ?? [];
}
