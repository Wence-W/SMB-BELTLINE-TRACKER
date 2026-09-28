import {
  Activity,
  CheckCircle2,
  Clock,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import type { DashboardSummary } from "@/lib/types";

interface Props {
  summary: DashboardSummary;
}

export function SummaryCards({ summary }: Props) {
  const cards = [
    {
      label: "Total Cases",
      value: summary.totalCases,
      icon: Activity,
      color: "from-blue-500/20 to-blue-600/10",
      iconColor: "text-primary",
      border: "border-primary/30",
    },
    {
      label: "Total Completed",
      value: summary.totalCompleted,
      icon: CheckCircle2,
      color: "from-emerald-500/20 to-emerald-600/10",
      iconColor: "text-emerald-700",
      border: "border-emerald-500/30",
    },
    {
      label: "Total Remaining",
      value: summary.totalRemaining,
      icon: Clock,
      color: "from-amber-500/20 to-amber-600/10",
      iconColor: "text-amber-700",
      border: "border-amber-500/30",
    },
    {
      label: "Total Approved",
      value: summary.totalApproved,
      icon: ShieldCheck,
      color: "from-violet-500/20 to-violet-600/10",
      iconColor: "text-violet-700",
      border: "border-violet-500/30",
    },
    {
      label: "Productivity",
      value: `${summary.productivityPercent}%`,
      icon: TrendingUp,
      color: "from-cyan-500/20 to-cyan-600/10",
      iconColor: "text-cyan-700",
      border: "border-cyan-500/30",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map(card => (
        <div
          key={card.label}
          className={`relative rounded-xl border ${card.border} bg-gradient-to-br ${card.color} backdrop-blur-sm p-4 flex flex-col gap-2`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {card.label}
            </span>
            <card.icon className={`size-4 ${card.iconColor}`} />
          </div>
          <div className="text-3xl font-bold text-foreground">{card.value}</div>
          {card.label === "Productivity" && (
            <div className="w-full bg-muted rounded-full h-1.5 mt-1">
              <div
                className="bg-cyan-400 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${summary.productivityPercent}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
