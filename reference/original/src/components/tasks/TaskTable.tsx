import {
  PRIORITY_STYLES,
  STATUS_STYLES,
  isExpired,
  isExpiringSoon,
  isOverdue,
  type Task,
} from "@/lib/taskTypes";

interface Props {
  tasks: Task[];
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
  emptyLabel?: string;
  // Completed Tasks audit bookmark (Wence, 2026-07-28): click a row to mark
  // it "last reviewed" — only one row is ever bookmarked, clicking a new
  // row moves the marker, clicking the bookmarked row again clears it.
  bookmarkable?: boolean;
  onToggleBookmark?: (t: Task) => void;
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function TaskTable({
  tasks,
  onEdit,
  onDelete,
  emptyLabel,
  bookmarkable,
  onToggleBookmark,
}: Props) {
  if (tasks.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        {emptyLabel ?? "No tasks found."}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            {bookmarkable && <th className="py-2.5 pr-2 font-medium w-8"></th>}
            <th className="py-2.5 pr-3 font-medium">Task Title</th>
            <th className="py-2.5 pr-3 font-medium">Assigned To</th>
            <th className="py-2.5 pr-3 font-medium">Created</th>
            <th className="py-2.5 pr-3 font-medium">Due</th>
            <th className="py-2.5 pr-3 font-medium">Expires</th>
            <th className="py-2.5 pr-3 font-medium">Priority</th>
            <th className="py-2.5 pr-3 font-medium">Status</th>
            <th className="py-2.5 pr-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(t => {
            const expiring = isExpiringSoon(t);
            const expired = isExpired(t);
            const overdue = isOverdue(t);
            return (
              <tr
                key={t.id}
                className={`border-b border-border hover:bg-muted transition-colors ${
                  bookmarkable && t.auditBookmarked
                    ? "bg-blue-50 hover:bg-blue-100"
                    : expired
                      ? "bg-rose-50/60"
                      : expiring
                        ? "bg-amber-50/60"
                        : ""
                }`}
              >
                {bookmarkable && (
                  <td className="py-2.5 pr-2 text-center">
                    <button
                      type="button"
                      onClick={() => onToggleBookmark?.(t)}
                      title={
                        t.auditBookmarked
                          ? "Clear audit bookmark"
                          : "Mark as last reviewed"
                      }
                      className={`text-base leading-none ${
                        t.auditBookmarked
                          ? "text-blue-600"
                          : "text-muted-foreground/40 hover:text-blue-500"
                      }`}
                    >
                      📍
                    </button>
                  </td>
                )}
                <td className="py-2.5 pr-3 font-medium text-foreground">
                  {t.title}
                </td>
                <td className="py-2.5 pr-3 text-muted-foreground">{t.assignedTo}</td>
                <td className="py-2.5 pr-3 text-muted-foreground">
                  {formatDate(t.createdDate)}
                </td>
                <td className="py-2.5 pr-3 text-muted-foreground">
                  {formatDate(t.dueDate)}
                  {overdue && (
                    <span className="ml-1.5 text-[10px] font-semibold text-rose-600">
                      OVERDUE
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-muted-foreground">
                  {formatDate(t.expirationDate)}
                  {expired && (
                    <span className="ml-1.5 text-[10px] font-semibold text-rose-600">
                      EXPIRED
                    </span>
                  )}
                  {!expired && expiring && (
                    <span className="ml-1.5 text-[10px] font-semibold text-amber-600">
                      SOON
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${PRIORITY_STYLES[t.priority]}`}
                  >
                    {t.priority}
                  </span>
                </td>
                <td className="py-2.5 pr-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${STATUS_STYLES[t.status]}`}
                  >
                    {t.status.replace("_", " ")}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                  <button
                    onClick={() => onEdit(t)}
                    className="text-primary hover:text-primary text-xs font-medium mr-3"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDelete(t)}
                    className="text-rose-500 hover:text-rose-700 text-xs font-medium"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
