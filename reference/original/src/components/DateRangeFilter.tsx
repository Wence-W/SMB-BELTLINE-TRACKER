// Shared "Date From / Date To" range filter used on every tab
// (Gretchen, 2026-08-13: "Add Date From and Date To filters to all tabs").
// Deliberately dumb/controlled so each tab decides which date field it
// filters on (created, completed, logged, appointment, etc.).

interface DateRangeFilterProps {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  /** Prefix shown before the inputs, e.g. "Created" → "Created From". */
  label?: string;
  /** Unique id prefix so multiple range filters can coexist on one screen. */
  idPrefix?: string;
  className?: string;
  size?: "sm" | "md";
}

export function DateRangeFilter({
  from,
  to,
  onChange,
  label,
  idPrefix = "date-range",
  className = "",
  size = "md",
}: DateRangeFilterProps) {
  const inputCls =
    size === "sm"
      ? "bg-card border border-input/60 rounded-md px-1.5 py-1 text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
      : "bg-card border border-input/60 rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40";
  const labelCls =
    size === "sm"
      ? "text-[11px] text-muted-foreground whitespace-nowrap"
      : "text-xs text-muted-foreground whitespace-nowrap";

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      <label className={labelCls} htmlFor={`${idPrefix}-from`}>
        {label ? `${label} From` : "Date From"}
      </label>
      <input
        id={`${idPrefix}-from`}
        type="date"
        value={from}
        max={to || undefined}
        onChange={e => onChange({ from: e.target.value, to })}
        className={inputCls}
      />
      <label className={labelCls} htmlFor={`${idPrefix}-to`}>
        {label ? `${label} To` : "Date To"}
      </label>
      <input
        id={`${idPrefix}-to`}
        type="date"
        value={to}
        min={from || undefined}
        onChange={e => onChange({ from, to: e.target.value })}
        className={inputCls}
      />
      {(from || to) && (
        <button
          type="button"
          onClick={() => onChange({ from: "", to: "" })}
          className={`${labelCls} underline hover:text-foreground`}
        >
          Clear
        </button>
      )}
    </div>
  );
}

/** True when `iso` (any ISO date/datetime string) falls inside [from, to].
 *  Blank ends are open-ended; a missing date only passes when no range set. */
export function inDateRange(
  iso: string | undefined | null,
  from: string,
  to: string,
): boolean {
  if (!from && !to) return true;
  if (!iso) return false;
  const day = iso.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}
