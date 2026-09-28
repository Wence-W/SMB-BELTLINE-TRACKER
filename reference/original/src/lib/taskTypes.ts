// ============================================================
// Task Management — Types
// ============================================================

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";

export interface Task {
  id: string;
  title: string;
  assignedTo: string;
  createdDate: string; // ISO date
  dueDate?: string; // ISO date
  expirationDate?: string; // ISO date
  priority: TaskPriority;
  status: TaskStatus;
  notes: string;
  completedAt?: string;
  updatedAt: string;
  auditBookmarked?: boolean;
}

export const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export const PRIORITY_STYLES: Record<TaskPriority, string> = {
  low: "bg-slate-100 text-slate-600 border-slate-300",
  medium: "bg-blue-50 text-blue-700 border-blue-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  urgent: "bg-rose-50 text-rose-700 border-rose-200",
};

export const STATUS_STYLES: Record<TaskStatus, string> = {
  pending: "bg-slate-100 text-slate-600 border-slate-300",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-slate-200 text-slate-500 border-slate-300",
};

/** Days-until-expiration threshold that triggers the "expiring soon" highlight. */
export const EXPIRING_SOON_DAYS = 7;

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function isExpiringSoon(task: Task): boolean {
  if (!task.expirationDate || task.status === "completed" || task.status === "cancelled") {
    return false;
  }
  const days = daysUntil(task.expirationDate);
  return days >= 0 && days <= EXPIRING_SOON_DAYS;
}

export function isExpired(task: Task): boolean {
  if (!task.expirationDate || task.status === "completed" || task.status === "cancelled") {
    return false;
  }
  return daysUntil(task.expirationDate) < 0;
}

export function isOverdue(task: Task): boolean {
  if (!task.dueDate || task.status === "completed" || task.status === "cancelled") {
    return false;
  }
  return daysUntil(task.dueDate) < 0;
}

export function isDueSoon(task: Task): boolean {
  if (!task.dueDate || task.status === "completed" || task.status === "cancelled") {
    return false;
  }
  const days = daysUntil(task.dueDate);
  return days >= 0 && days <= EXPIRING_SOON_DAYS;
}

export function isCreatedThisMonth(task: Task): boolean {
  const created = new Date(task.createdDate + "T00:00:00");
  const now = new Date();
  return (
    created.getFullYear() === now.getFullYear() &&
    created.getMonth() === now.getMonth()
  );
}
