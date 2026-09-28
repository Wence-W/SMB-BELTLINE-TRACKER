// Pure logic for the Booked Tracker Scheduler / Provider choices, shared by
// convex/appointmentOptions.ts and the parity tests.
//
// Original model (reference/original/convex/appointmentOptions.ts): built-in
// defaults in code + "override" rows; effective list = defaults not
// deactivated, then active custom values, deduplicated.
// Rebuild model: defaults are rows too (`builtIn`), ordered by `order`, so the
// effective list is just "active rows in order". `materializeOptions` converts
// the original model into rows; the parity test proves both models produce
// identical lists under any sequence of add/remove.
import { ConvexError } from "convex/values";
import { CLINIC_LOCATIONS } from "./enums";

export type OptionType = "scheduler" | "provider";
export type ClinicLocation = (typeof CLINIC_LOCATIONS)[number];

export type OptionRow = {
  optionType: OptionType;
  value: string;
  location?: string;
  optionKey: string;
  active: boolean;
  builtIn: boolean;
  order: number;
};

export type OptionArgs = { optionType: OptionType; value: string; location?: string };

export type EffectiveOptions = {
  schedulers: string[];
  providersByLocation: Record<ClinicLocation, string[]>;
};

/** Same identity key as the original: type | lower(location) | lower(value). */
export function optionKey(optionType: OptionType, value: string, location?: string): string {
  return [optionType, location?.trim().toLowerCase() ?? "", value.trim().toLowerCase()].join("|");
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

/** Validation copied from the original's add/remove, with error codes. */
export function validateOptionArgs(
  args: OptionArgs,
  emptyCode: "VALUE_REQUIRED",
): {
  value: string;
  location?: string;
} {
  const value = args.value.trim();
  const location = args.location?.trim();
  if (!value) throw new ConvexError({ code: emptyCode });
  if (args.optionType === "provider" && (!location || !(CLINIC_LOCATIONS as readonly string[]).includes(location))) {
    throw new ConvexError({ code: "INVALID_LOCATION" });
  }
  if (args.optionType === "scheduler" && location) {
    throw new ConvexError({ code: "SCHEDULER_HAS_NO_LOCATION" });
  }
  return { value, location };
}

export type OptionPlan =
  | { kind: "patch"; patch: Pick<OptionRow, "value" | "location" | "active"> }
  | { kind: "insert"; row: OptionRow };

/**
 * What an add (active=true) or remove (active=false) does, given the row that
 * already has this key (if any). Mirrors the original, which patched or
 * inserted an override row. Built-in rows keep their canonical spelling,
 * because the original always displayed the default's spelling.
 */
export function planOptionChange(
  existing: OptionRow | null,
  args: OptionArgs,
  active: boolean,
  nextOrder: number,
): OptionPlan {
  const { value, location } = validateOptionArgs(args, "VALUE_REQUIRED");
  if (existing) {
    return { kind: "patch", patch: { value: existing.builtIn ? existing.value : value, location, active } };
  }
  return {
    kind: "insert",
    row: {
      optionType: args.optionType,
      value,
      location,
      optionKey: optionKey(args.optionType, value, location),
      active,
      builtIn: false,
      order: nextOrder,
    },
  };
}

export function effectiveOptions(rows: readonly OptionRow[]): EffectiveOptions {
  const listOf = (optionType: OptionType, location?: string) =>
    unique(
      rows
        .filter(
          row =>
            row.optionType === optionType && row.active && (optionType === "scheduler" || row.location === location),
        )
        .sort((a, b) => a.order - b.order)
        .map(row => row.value),
    );
  return {
    schedulers: listOf("scheduler"),
    providersByLocation: Object.fromEntries(
      CLINIC_LOCATIONS.map(location => [location, listOf("provider", location)]),
    ) as Record<ClinicLocation, string[]>,
  };
}

/**
 * Migration: original code defaults + original override rows -> rebuild rows.
 * Defaults come first, in code order; custom values follow in override order.
 */
export function materializeOptions(
  defaults: { schedulers: readonly string[]; providersByLocation: Record<string, readonly string[]> },
  overrides: readonly { optionType: OptionType; value: string; location?: string; active: boolean }[],
): OptionRow[] {
  const rows: OptionRow[] = [];
  let order = 0;
  const lists: { optionType: OptionType; location?: string; defaults: readonly string[] }[] = [
    { optionType: "scheduler", defaults: defaults.schedulers },
    ...CLINIC_LOCATIONS.map(location => ({
      optionType: "provider" as const,
      location,
      defaults: defaults.providersByLocation[location] ?? [],
    })),
  ];
  for (const list of lists) {
    const listOverrides = overrides.filter(
      o => o.optionType === list.optionType && (list.optionType === "scheduler" || o.location === list.location),
    );
    const byLower = new Map(listOverrides.map(o => [o.value.trim().toLowerCase(), o]));
    const defaultValues = unique([...list.defaults]);
    for (const value of defaultValues) {
      rows.push({
        optionType: list.optionType,
        value,
        location: list.location,
        optionKey: optionKey(list.optionType, value, list.location),
        active: byLower.get(value.toLowerCase())?.active !== false,
        builtIn: true,
        order: order++,
      });
    }
    const defaultLower = new Set(defaultValues.map(value => value.toLowerCase()));
    for (const o of listOverrides) {
      const value = o.value.trim();
      if (!value || defaultLower.has(value.toLowerCase())) continue;
      rows.push({
        optionType: list.optionType,
        value,
        location: list.location,
        optionKey: optionKey(list.optionType, value, list.location),
        active: o.active,
        builtIn: false,
        order: order++,
      });
    }
  }
  return rows;
}
