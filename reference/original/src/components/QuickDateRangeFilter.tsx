type DatePreset = "today" | "week" | "month" | "custom";

interface QuickDateRangeFilterProps {
  preset: DatePreset;
  from: string;
  to: string;
  onPresetChange: (preset: DatePreset) => void;
  onRangeChange: (range: { from: string; to: string }) => void;
  idPrefix: string;
}

/**
 * Compact date selector used on the operational reporting screens.
 * The From/To controls are always visible, matching the operational
 * reference layout; changing either one immediately selects Custom.
 */
export function QuickDateRangeFilter({
  preset,
  from,
  to,
  onPresetChange,
  onRangeChange,
  idPrefix,
}: QuickDateRangeFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex h-9 items-center rounded-lg border border-border bg-background p-1">
        {(
          [
            ["today", "Today"],
            ["week", "This Week"],
            ["month", "This Month"],
            ["custom", "Custom"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onPresetChange(value)}
            className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors ${
              preset === value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <input
        id={`${idPrefix}-from`}
        aria-label="Custom start date"
        type="date"
        value={from}
        max={to || undefined}
        onChange={event => {
          onPresetChange("custom");
          onRangeChange({ from: event.target.value, to });
        }}
        className="h-9 w-40 rounded-lg border border-input/60 bg-card px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
      />
      <input
        id={`${idPrefix}-to`}
        aria-label="Custom end date"
        type="date"
        min={from || undefined}
        value={to}
        onChange={event => {
          onPresetChange("custom");
          onRangeChange({ from, to: event.target.value });
        }}
        className="h-9 w-40 rounded-lg border border-input/60 bg-card px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
      />
    </div>
  );
}

export type { DatePreset };
