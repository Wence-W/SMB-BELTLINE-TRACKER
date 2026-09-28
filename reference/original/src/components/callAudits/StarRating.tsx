import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function StarRating({
  value,
  onChange,
  disabled = false,
  tone = "amber",
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** Intake Audits scorecard uses green stars (was cyan). */
  tone?: "amber" | "cyan" | "green";
}) {
  const filled =
    tone === "cyan"
      ? "fill-cyan-400 text-cyan-500"
      : tone === "green"
        ? "fill-green-500 text-green-600"
        : "fill-amber-400 text-amber-500";
  const hover =
    tone === "cyan"
      ? "hover:bg-cyan-500/10"
      : tone === "green"
        ? "hover:bg-green-500/10"
        : "hover:bg-amber-500/10";
  return (
    <div className="flex items-center gap-1" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value === star ? 0 : star)}
          className={cn(
            "rounded p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            hover,
          )}
          aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
        >
          <Star
            className={cn(
              "size-5",
              star <= value ? filled : "fill-transparent text-muted-foreground",
            )}
          />
        </button>
      ))}
      {value > 0 && !disabled && tone !== "cyan" && (
        <button
          type="button"
          onClick={() => onChange(0)}
          className="ml-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Clear
        </button>
      )}
    </div>
  );
}
