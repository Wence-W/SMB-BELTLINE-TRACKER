import type { BariCase } from "@/lib/types";

const CASE_TYPE_LABELS: Record<BariCase["caseType"], string> = {
  urgent: "Urgent",
  initial_consult: "Initial Consult",
  followup_consult: "Follow-Up",
  no_appointment: "No Appt",
  reverification: "Reverif.",
  predetermination: "Predeterm.",
  precert_bari: "PC Bari",
  precert_veins: "PC Veins",
  precert_general: "PC General",
  precert_modified_urgent: "PC Modified/Urgent",
  precert_egd: "PC EGD",
};

const AUTH_STATUS_STYLES: Record<
  NonNullable<BariCase["authStatus"]>,
  { label: string; cls: string }
> = {
  pending_pre_auth: {
    label: "Pending Pre-Auth",
    cls: "bg-muted text-foreground border-input",
  },
  approved: {
    label: "Approved",
    cls: "bg-violet-500/20 text-violet-700 border-violet-500/30",
  },
  partial_approval: {
    label: "Partial Approval",
    cls: "bg-teal-500/20 text-teal-700 border-teal-500/30",
  },
  denied: {
    label: "Denied",
    cls: "bg-rose-500/20 text-rose-700 border-rose-500/30",
  },
  peer_to_peer: {
    label: "Peer to Peer",
    cls: "bg-orange-500/20 text-orange-700 border-orange-500/30",
  },
  appeal: {
    label: "Appeal",
    cls: "bg-fuchsia-500/20 text-fuchsia-700 border-fuchsia-500/30",
  },
  pending_pred: {
    label: "Pending Pred",
    cls: "bg-sky-500/20 text-sky-700 border-sky-500/30",
  },
  cancelled: {
    label: "Cancelled",
    cls: "bg-slate-500/20 text-slate-700 border-slate-500/30",
  },
};

const STATUS_STYLES: Record<
  BariCase["status"],
  { label: string; cls: string }
> = {
  new: {
    label: "New",
    cls: "bg-cyan-500/20 text-cyan-700 border-cyan-500/30",
  },
  in_progress: {
    label: "In Progress",
    cls: "bg-primary/20 text-primary border-primary/30",
  },
  completed: {
    label: "Completed",
    cls: "bg-emerald-500/20 text-emerald-700 border-emerald-500/30",
  },
  on_hold: {
    label: "On Hold",
    cls: "bg-amber-500/20 text-amber-700 border-amber-500/30",
  },
  reassigned: {
    label: "Reassigned",
    cls: "bg-sky-500/20 text-sky-700 border-sky-500/30",
  },
  cancelled: {
    label: "Cancelled",
    cls: "bg-foreground/40 text-muted-foreground border-input",
  },
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatDate(iso: string) {
  try {
    // Parse the date-only string (YYYY-MM-DD) manually to avoid UTC/local
    // timezone shifting the day when using `new Date(iso)`.
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (match) {
      const year = match[1];
      const monthIndex = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      return `${MONTH_NAMES[monthIndex]} ${day}, ${year}`;
    }
    const d = new Date(iso);
    return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  } catch {
    return "—";
  }
}

interface Props {
  cases: BariCase[];
  onEdit: (c: BariCase) => void;
  onDelete: (id: string) => void;
  onOpenNotes: (c: BariCase) => void;
  /** Show the Auth Status column — Pre-Cert view only. */
  showAuthStatus?: boolean;
}

export function CasesTable({
  cases,
  onEdit,
  onDelete,
  onOpenNotes,
  showAuthStatus = false,
}: Props) {
  if (cases.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <div className="text-4xl mb-3">📋</div>
        <div className="font-medium text-muted-foreground">No cases found</div>
        <div className="text-sm mt-1">Add a case or adjust your filters</div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {[
              "ID",
              "DOS",
              "Expires",
              "Type",
              "Insurance",
              ...(showAuthStatus ? ["Auth Status", "Provider"] : []),
              "Priority",
              "Assigned To",
              "Created By",
              "Status",
              "Auth #",
              "Notes",
              "Created",
              "Completed",
              "Actions",
            ].map(h => (
              <th
                key={h}
                className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 py-3 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cases.map(c => {
            const s = STATUS_STYLES[c.status];
            const noteCount = c.noteLog?.length ?? 0;
            const sortedNotes = [...(c.noteLog ?? [])].sort((a, b) =>
              b.addedAt.localeCompare(a.addedAt),
            );
            const latestNoteText = sortedNotes[0]?.text || c.notes || "";
            const latestNoteAuthor = sortedNotes[0]?.addedBy || "";
            return (
              <tr
                key={c.id}
                onClick={() => onEdit(c)}
                className="border-b border-border/30 hover:bg-muted transition-colors group cursor-pointer"
              >
                <td className="px-3 py-3 text-muted-foreground font-mono text-xs">
                  {c.patientId}
                </td>
                <td className="px-3 py-3 text-muted-foreground text-xs whitespace-nowrap">
                  {c.dos ? formatDate(c.dos) : "—"}
                </td>
                <td className="px-3 py-3 text-muted-foreground text-xs whitespace-nowrap">
                  {c.expirationDate ? formatDate(c.expirationDate) : "—"}
                </td>
                <td className="px-3 py-3 text-foreground whitespace-nowrap">
                  {CASE_TYPE_LABELS[c.caseType]}
                </td>
                <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                  {c.insuranceProvider || "—"}
                </td>
                {showAuthStatus && (
                  <td className="px-3 py-3">
                    {c.authStatus ? (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium ${AUTH_STATUS_STYLES[c.authStatus].cls}`}
                      >
                        {AUTH_STATUS_STYLES[c.authStatus].label}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                )}
                {showAuthStatus && (
                  <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                    {c.provider || "—"}
                  </td>
                )}
                <td className="px-3 py-3">
                  {c.priority === "urgent" ? (
                    <span className="inline-flex items-center gap-1 text-rose-700 text-xs font-medium">
                      <span className="size-1.5 bg-rose-400 rounded-full animate-pulse" />
                      Urgent
                    </span>
                  ) : c.priority === "high" ? (
                    <span className="inline-flex items-center gap-1 text-amber-700 text-xs font-medium">
                      <span className="size-1.5 bg-amber-400 rounded-full" />
                      High
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">Standard</span>
                  )}
                </td>
                <td className="px-3 py-3 text-foreground whitespace-nowrap">
                  {c.assignedTo}
                </td>
                <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                  {c.createdBy || "—"}
                </td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium ${s.cls}`}
                  >
                    {s.label}
                  </span>
                </td>
                <td className="px-3 py-3 text-muted-foreground font-mono text-xs whitespace-nowrap">
                  {c.authorizationNumber || "—"}
                </td>
                {/* Notes column — latest note preview, visible for all cases */}
                <td className="px-3 py-3 max-w-[220px]">
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onOpenNotes(c);
                    }}
                    className="flex items-center gap-1.5 w-full text-left group/notes"
                    title="View / add notes"
                  >
                    <span className="shrink-0">📝</span>
                    {latestNoteText ? (
                      <span className="text-foreground text-xs truncate group-hover/notes:text-muted-foreground">
                        {latestNoteAuthor && (
                          <span className="text-muted-foreground">{latestNoteAuthor}: </span>
                        )}
                        {latestNoteText}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs group-hover/notes:text-muted-foreground">
                        Add note
                      </span>
                    )}
                    {noteCount > 1 && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        +{noteCount - 1}
                      </span>
                    )}
                  </button>
                </td>
                <td className="px-3 py-3 text-muted-foreground text-xs whitespace-nowrap">
                  {formatDate(c.createdAt)}
                </td>
                <td className="px-3 py-3 text-muted-foreground text-xs whitespace-nowrap">
                  {c.completedAt ? formatDate(c.completedAt) : "—"}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onEdit(c);
                      }}
                      className="px-2.5 py-1 rounded-md text-xs bg-primary/20 text-primary border border-primary/30 hover:bg-primary/40 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onDelete(c.id);
                      }}
                      className="px-2.5 py-1 rounded-md text-xs bg-rose-600/20 text-rose-700 border border-rose-500/30 hover:bg-rose-600/40 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
