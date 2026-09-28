// AUTO-EXTRACTED ORACLE. DO NOT EDIT.
// Verbatim copy of top-level declarations from the ORIGINAL app:
//   reference/original/convex/appointmentOptions.ts
//   sha256 b63abeffd990a67a6d0215f9381f856f204399037099064d732bb2958dfa9f12
// Regenerate with: bun run packages/parity/extract-oracles.ts
/* biome-ignore-all lint: verbatim third-party copy */


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

export { optionKey, unique, effectiveValues };
export type { OptionType };
