import type { ConsultSummary, UrgentBariSummary } from "@/lib/types";

interface ConsultSectionProps {
  title: string;
  data: ConsultSummary;
  accentColor?: string;
  onAddCase: () => void;
}

export function ConsultSection({
  title,
  data,
  accentColor = "emerald",
  onAddCase,
}: ConsultSectionProps) {
  const colorMap: Record<
    string,
    { bar: string; text: string; border: string; bg: string }
  > = {
    emerald: {
      bar: "bg-emerald-400",
      text: "text-emerald-700",
      border: "border-emerald-500/30",
      bg: "from-emerald-500/10 to-emerald-600/5",
    },
    blue: {
      bar: "bg-primary",
      text: "text-primary",
      border: "border-primary/30",
      bg: "from-blue-500/10 to-blue-600/5",
    },
    violet: {
      bar: "bg-violet-400",
      text: "text-violet-700",
      border: "border-violet-500/30",
      bg: "from-violet-500/10 to-violet-600/5",
    },
    amber: {
      bar: "bg-amber-400",
      text: "text-amber-700",
      border: "border-amber-500/30",
      bg: "from-amber-500/10 to-amber-600/5",
    },
    rose: {
      bar: "bg-rose-400",
      text: "text-rose-700",
      border: "border-rose-500/30",
      bg: "from-rose-500/10 to-rose-600/5",
    },
    indigo: {
      bar: "bg-indigo-400",
      text: "text-indigo-700",
      border: "border-indigo-500/30",
      bg: "from-indigo-500/10 to-indigo-600/5",
    },
  };
  const c = colorMap[accentColor] ?? colorMap.emerald;

  return (
    <div
      className={`rounded-xl border ${c.border} bg-gradient-to-br ${c.bg} backdrop-blur-sm p-4`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-foreground text-sm">{title}</h3>
        <button
          onClick={onAddCase}
          className={`text-xs px-2 py-1 rounded-md border ${c.border} ${c.text} hover:bg-card/5 transition-colors`}
        >
          + Add
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        {[
          { label: "Total", value: data.total, highlight: false },
          { label: "Completed", value: data.completed, highlight: false },
          { label: "Remaining", value: data.remaining, highlight: true },
          {
            label: "Completion",
            value: `${data.completionPercent}%`,
            highlight: false,
          },
        ].map(item => (
          <div key={item.label} className="text-center">
            <div
              className={`text-xl font-bold ${item.highlight ? "text-amber-700" : "text-foreground"}`}
            >
              {item.value}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {item.label}
            </div>
          </div>
        ))}
      </div>

      <div className="w-full bg-muted rounded-full h-1.5">
        <div
          className={`${c.bar} h-1.5 rounded-full transition-all duration-500`}
          style={{ width: `${data.completionPercent}%` }}
        />
      </div>
    </div>
  );
}

interface UrgentSectionProps {
  data: UrgentBariSummary;
  onAddCase: () => void;
}

export function UrgentSection({ data, onAddCase }: UrgentSectionProps) {
  return (
    <div className="rounded-xl border border-rose-500/40 bg-gradient-to-br from-rose-500/15 to-rose-600/5 backdrop-blur-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-rose-400 animate-pulse" />
          <h3 className="font-semibold text-foreground text-sm">
            Urgent Bari Requests
          </h3>
        </div>
        <button
          onClick={onAddCase}
          className="text-xs px-2 py-1 rounded-md border border-rose-500/40 text-rose-700 hover:bg-card/5 transition-colors"
        >
          + Add
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "Created Today",
            value: data.createdToday,
            color: "text-foreground",
          },
          {
            label: "Completed",
            value: data.completed,
            color: "text-emerald-700",
          },
          { label: "Remaining", value: data.remaining, color: "text-rose-700" },
        ].map(item => (
          <div
            key={item.label}
            className="text-center bg-card rounded-lg py-3"
          >
            <div className={`text-2xl font-bold ${item.color}`}>
              {item.value}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
