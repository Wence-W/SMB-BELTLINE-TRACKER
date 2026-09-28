import { STATUS_BADGE_CLASSES } from "@/lib/appointmentOptions";

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE_CLASSES[status] ?? "bg-muted text-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}
    >
      {status}
    </span>
  );
}
