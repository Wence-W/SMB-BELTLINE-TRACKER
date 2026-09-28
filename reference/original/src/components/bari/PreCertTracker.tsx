import type { PreCertCategory } from "@/lib/types";

interface Props {
  categories: PreCertCategory[];
  onAddCase: (key: PreCertCategory["key"]) => void;
}

const COLOR_MAP: Record<
  string,
  { accent: string; border: string; bg: string }
> = {
  bari: {
    accent: "text-cyan-700",
    border: "border-cyan-500/30",
    bg: "bg-cyan-400",
  },
  veins: {
    accent: "text-violet-700",
    border: "border-violet-500/30",
    bg: "bg-violet-400",
  },
  general: {
    accent: "text-emerald-700",
    border: "border-emerald-500/30",
    bg: "bg-emerald-400",
  },
  modified_urgent: {
    accent: "text-orange-700",
    border: "border-orange-500/30",
    bg: "bg-orange-400",
  },
  egd: {
    accent: "text-pink-700",
    border: "border-pink-500/30",
    bg: "bg-pink-400",
  },
};

export function PreCertTracker({ categories, onAddCase }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card backdrop-blur-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-foreground text-base">Pre-Cert Tracker</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map(cat => {
          const c = COLOR_MAP[cat.key];
          const total = cat.new + cat.updated + cat.approved;
          const pct = total > 0 ? Math.round((cat.approved / total) * 100) : 0;

          return (
            <div
              key={cat.key}
              className={`rounded-lg border ${c.border} bg-card/40 p-4`}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className={`font-semibold text-sm ${c.accent}`}>
                  {cat.label}
                </h3>
                <button
                  onClick={() => onAddCase(cat.key)}
                  className={`text-xs px-2 py-0.5 rounded border ${c.border} ${c.accent} hover:bg-card/5 transition-colors`}
                >
                  + Add
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "New", value: cat.new, dimmed: false },
                  { label: "Updated", value: cat.updated, dimmed: false },
                  { label: "Approved", value: cat.approved, dimmed: false },
                  { label: "Remaining", value: cat.remaining, dimmed: true },
                ].map(item => (
                  <div
                    key={item.label}
                    className="bg-muted rounded-lg p-2 text-center"
                  >
                    <div
                      className={`text-xl font-bold ${item.dimmed ? "text-amber-700" : "text-foreground"}`}
                    >
                      {item.value}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Approval rate</span>
                  <span className={c.accent}>{pct}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-1">
                  <div
                    className={`${c.bg} h-1 rounded-full transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
