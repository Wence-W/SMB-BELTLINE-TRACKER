import { Copy } from "lucide-react";
import { formatDateEST, formatDateTimeEST } from "@/lib/dateFormat";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FilterState } from "./FiltersBar";
import { StatusBadge } from "./StatusBadge";
import type { Appointment } from "./types";

const PAGE_SIZE = 30;

interface Props {
  appointments: Appointment[];
  filters: FilterState;
  onRowClick: (appt: Appointment) => void;
  /** Hide the Source column — used on the SMB / Boost tabs since the tab
   * itself already scopes the source group (per Wence's spec, 2026-08-04). */
  hideSource?: boolean;
}

export function matches(appt: Appointment, filters: FilterState) {
  const q = filters.search.trim().toLowerCase();
  if (q) {
    const haystack =
      `${appt.patientId} ${appt.fullName} ${appt.phone} ${appt.email}`.toLowerCase();
    // Multiple search terms at once (Wence, 2026-08-06): split on commas
    // (or, if no comma, whitespace) and match if ANY term is found — lets
    // staff paste several Patient IDs/names at once and see every match.
    const terms = q
      .split(q.includes(",") ? "," : /\s+/)
      .map(t => t.trim())
      .filter(Boolean);
    if (terms.length > 0 && !terms.some(term => haystack.includes(term))) return false;
  }
  // Choices within a single filter are OR'd (e.g. Pending OR Showed);
  // different filter groups remain AND'd (e.g. a chosen Status AND Location).
  // Appointment Date From / To (Gretchen, 2026-08-13). Appointments with
  // no date set are excluded once either end of the range is set.
  if (filters.dateFrom || filters.dateTo) {
    const day = (appt.apptDateTime ?? "").slice(0, 10);
    if (!day) return false;
    if (filters.dateFrom && day < filters.dateFrom) return false;
    if (filters.dateTo && day > filters.dateTo) return false;
  }
  if (filters.status.length > 0 && !filters.status.includes(appt.status)) return false;
  if (
    filters.appointmentType.length > 0 &&
    !filters.appointmentType.includes(appt.appointmentType)
  )
    return false;
  if (filters.serviceType.length > 0 && !filters.serviceType.includes(appt.serviceType)) return false;
  if (filters.location.length > 0 && !filters.location.includes(appt.clinicLocation)) return false;
  if (filters.provider.length > 0 && !filters.provider.includes(appt.provider)) return false;
  return true;
}

// One-click Patient ID copy with a brief inline "Copied!" confirmation next
// to the row that was copied (Gretchen, 2026-08-05).
async function copyPatientId(id: string, value: string, setCopiedId: (id: string | null) => void) {
  try {
    await navigator.clipboard.writeText(value);
    setCopiedId(id);
    toast.success("Patient ID copied.");
    setTimeout(() => setCopiedId(null), 1500);
  } catch {
    toast.error("Failed to copy Patient ID.");
  }
}

function PaginationBar({
  page,
  totalPages,
  rangeStart,
  rangeEnd,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap text-xs text-muted-foreground/70">
      <span>
        Showing {total === 0 ? 0 : rangeStart}–{rangeEnd} of {total} appointments
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={onPrev}
          className="underline underline-offset-2 decoration-muted-foreground/40 hover:text-foreground hover:decoration-foreground disabled:opacity-40 disabled:pointer-events-none disabled:no-underline transition-colors"
        >
          Previous
        </button>
        <span className="text-xs text-muted-foreground/70 px-1 whitespace-nowrap">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={onNext}
          className="underline underline-offset-2 decoration-muted-foreground/40 hover:text-foreground hover:decoration-foreground disabled:opacity-40 disabled:pointer-events-none disabled:no-underline transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function AppointmentsTable({ appointments, filters, onRowClick, hideSource }: Props) {
  const [page, setPage] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => appointments.filter(a => matches(a, filters)), [
    appointments,
    filters,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // Reset to page 1 whenever a search or filter is applied (filters is a
  // stable object reference from parent state, only changes on an actual
  // search/filter/tab update — per Wence's spec, 2026-08-05).
  useEffect(() => {
    setPage(1);
  }, [filters]);

  // Clamp if the filtered set shrinks (e.g. a record is deleted) so we
  // never sit on a now-empty page past the end.
  useEffect(() => {
    setPage(p => Math.min(p, totalPages));
  }, [totalPages]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // Phone No. and Email columns removed (Gretchen, 2026-08-05).
  const columnCount = hideSource ? 8 : 9;
  const rangeStart = (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, filtered.length);
  const paginationProps = {
    page,
    totalPages,
    rangeStart,
    rangeEnd,
    total: filtered.length,
    onPrev: () => setPage(p => Math.max(1, p - 1)),
    onNext: () => setPage(p => Math.min(totalPages, p + 1)),
  };

  return (
    <div className="space-y-3">
      <PaginationBar {...paginationProps} />

      <div className="rounded-xl border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Created</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Patient ID</TableHead>
              <TableHead>Date &amp; Time</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Service Type</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Provider</TableHead>
              {!hideSource && <TableHead>Source</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageItems.map(a => (
              <TableRow
                key={a._id}
                onClick={() => onRowClick(a)}
                className="cursor-pointer hover:bg-muted/50"
              >
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDateEST(a.createdDate)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={a.status} />
                </TableCell>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {a.patientId}
                    {a.patientId && (
                      <button
                        title="Copy Patient ID"
                        onClick={e => {
                          e.stopPropagation();
                          void copyPatientId(a._id, a.patientId, setCopiedId);
                        }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="size-3" />
                      </button>
                    )}
                    {copiedId === a._id && (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                        Copied!
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {a.apptDateTime ? formatDateTimeEST(a.apptDateTime) : "—"}
                </TableCell>
                <TableCell>{a.appointmentType}</TableCell>
                <TableCell>{a.serviceType}</TableCell>
                <TableCell>{a.clinicLocation}</TableCell>
                <TableCell className="whitespace-nowrap">{a.provider}</TableCell>
                {!hideSource && (
                  <TableCell className="whitespace-nowrap">{a.source}</TableCell>
                )}
              </TableRow>
            ))}
            {pageItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center text-muted-foreground py-8">
                  No appointments found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <PaginationBar {...paginationProps} />
    </div>
  );
}
