import { useEffect, useRef, useState } from "react";
import { generateId, now } from "@/lib/store";
import {
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  type Task,
} from "@/lib/taskTypes";

interface Props {
  open: boolean;
  editTask?: Task | null;
  staffOptions: string[];
  onSave: (t: Task) => void;
  onClose: () => void;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function emptyTask(defaultStaff?: string): Omit<Task, "id" | "updatedAt"> {
  return {
    title: "",
    assignedTo: defaultStaff ?? "",
    createdDate: todayISO(),
    dueDate: "",
    expirationDate: "",
    priority: "medium",
    status: "pending",
    notes: "",
  };
}

export function TaskModal({
  open,
  editTask,
  staffOptions,
  onSave,
  onClose,
}: Props) {
  const [form, setForm] = useState<Omit<Task, "id" | "updatedAt">>(
    editTask ? { ...editTask } : emptyTask(staffOptions[0]),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm(editTask ? { ...editTask } : emptyTask(staffOptions[0]));
      setErrors({});
      setTimeout(() => firstFieldRef.current?.focus(), 50);
    }
  }, [open, editTask, staffOptions]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = "Task title is required";
    if (!form.assignedTo.trim()) errs.assignedTo = "Assign a staff member";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const ts = now();
    const newTask: Task = editTask
      ? {
          ...editTask,
          ...form,
          updatedAt: ts,
          completedAt:
            form.status === "completed" && !editTask.completedAt
              ? ts
              : form.status !== "completed"
                ? undefined
                : editTask.completedAt,
        }
      : {
          id: generateId(),
          ...form,
          updatedAt: ts,
          completedAt: form.status === "completed" ? ts : undefined,
        };
    onSave(newTask);
  }

  function field(
    label: string,
    key: keyof typeof form,
    type: "text" | "select" | "textarea" | "date" = "text",
    options?: { value: string; label: string }[],
  ) {
    const fieldId = `task-field-${String(key)}`;
    return (
      <div>
        <label
          htmlFor={fieldId}
          className="block text-xs font-medium text-muted-foreground mb-1"
        >
          {label}
        </label>
        {type === "select" ? (
          <select
            id={fieldId}
            value={String(form[key])}
            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            className="w-full bg-card border border-input text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-primary"
          >
            {options?.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : type === "textarea" ? (
          <textarea
            id={fieldId}
            value={String(form[key] ?? "")}
            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            rows={3}
            className="w-full bg-card border border-input text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-primary resize-none"
          />
        ) : (
          <input
            id={fieldId}
            ref={key === "title" ? firstFieldRef : undefined}
            type={type === "date" ? "date" : "text"}
            value={String(form[key] ?? "")}
            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            className={`w-full bg-card border ${
              errors[key as string] ? "border-rose-400" : "border-input"
            } text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-primary`}
          />
        )}
        {errors[key as string] && (
          <p className="text-rose-500 text-[11px] mt-1">
            {errors[key as string]}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editTask ? "Edit Task" : "Add New Task"}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label="Close modal"
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") onClose();
        }}
      />

      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-bold text-foreground text-base">
            {editTask ? "Edit Task" : "Add New Task"}
          </h2>
          <button
            onClick={onClose}
            className="size-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-6 space-y-4 max-h-[70vh] overflow-y-auto"
        >
          {field("Task Title *", "title")}

          <div className="grid grid-cols-2 gap-4">
            {field(
              "Assigned Staff Member *",
              "assignedTo",
              "select",
              staffOptions.map(s => ({ value: s, label: s })),
            )}
            {field("Priority Level", "priority", "select", PRIORITY_OPTIONS)}
          </div>

          <div className="grid grid-cols-3 gap-4">
            {field("Created Date", "createdDate", "date")}
            {field("Due Date", "dueDate", "date")}
            {field("Expiration Date", "expirationDate", "date")}
          </div>

          {field("Status", "status", "select", STATUS_OPTIONS)}

          {field("Notes", "notes", "textarea")}
        </form>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={e => handleSubmit(e as unknown as React.FormEvent)}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-primary hover:bg-primary text-white transition-colors shadow-sm"
          >
            {editTask ? "Save Changes" : "Add Task"}
          </button>
        </div>
      </div>
    </div>
  );
}
