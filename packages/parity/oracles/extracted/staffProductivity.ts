// AUTO-EXTRACTED ORACLE. DO NOT EDIT.
// Verbatim copy of top-level declarations from the ORIGINAL app:
//   reference/original/src/components/productivity/StaffProductivityTab.tsx
//   sha256 125eb439e2744ff77c9bb4cb9b509cb493c76aee1bcf6de13e046228e0d059df
// Regenerate with: bun run packages/parity/extract-oracles.ts
/* biome-ignore-all lint: verbatim third-party copy */
import { toDateInputValue, type PeriodRange } from "@/lib/intakeTypes";

// Raw case shape as returned by `api.cases.listAll` — looser than the
// front-end `BariCase` type (caseType/status are plain strings here).
interface RawCase {
  caseType: string;
  status: string;
  authStatus?: string;
  assignedTo: string;
  createdAt: string;
  createdBy?: string;
  approvedAt?: string;
  completedAt?: string;
  authCancelledAt?: string;
  updatedAt?: string;
  notes?: string;
  noteLog?: { addedAt: string; addedBy?: string }[];
  notesUpdatedAt?: string;
  notesUpdatedBy?: string;
}

// ============================================================
// Staff Daily Productivity — Daily Operations Summary
// ============================================================
// Rebuilt 2026-07-21 per Wence's mockup: a company-wide rollup with one
// column per day in the selected period plus a grand Total column,
// grouped into 3 sections (Verification Team / Intake Team / Billing,
// per Wence 2026-07-21). Two rows from his original mockup ("Ins Veri:
// With/No Coverage" and "Data Management") have no equivalent tracked
// data anywhere in the app — Wence confirmed to skip them.

function dateOnly(iso?: string): string | null {
  return iso ? iso.slice(0, 10) : null;
}

const PRECERT_TYPES = new Set<string>([
  "precert_bari",
  "precert_veins",
  "precert_general",
  "precert_modified_urgent",
  "precert_egd",
]);

// Pre-Cert On-going activity events for a case: one (date, staff) pair per
// individual note/update added to it. Creating the case with no notes does
// NOT count on its own — that's just an assignment, not on-going work
// (Wence, 2026-07-23). But if the initial Notes box was filled in at
// creation, that first note counts too, credited to the creator on the
// creation date (Wence, 2026-07-24 — "also count the first notes"; that
// initial Notes text lives in `notes`, separate from the timestamped
// `noteLog` entries added later via the note icon).
// EXCEPTION (Wence, 2026-07-29): the creator's initial-note credit only
// applies if the creator is also the case's assignee. An Intake staffer who
// creates a case (with notes) and hands it off to a Verifier for the actual
// Pre-Cert work did intake/creation work, not Pre-Cert on-going work — so
// that credit stays with whoever is actually assigned to the case.
// COUNTED PER NOTE, not deduped per staff/day (Wence, 2026-08-28): each
// individual note — the initial Notes box, every `noteLog` entry, and the
// latest direct Notes-box edit — is its own credit, even if several land on
// the same case/staff/day. A case touched with 3 notes in one day credits 3,
// not 1. This is a retroactive change: past days where a staffer added 2+
// notes to the same case on the same day now show more credit than before.
// MUST be identical to ReportsTab.tsx's copy of this function — that's what
// keeps the two tabs' totals in sync.
function precertOngoingEvents(c: RawCase): { date: string; staff: string }[] {
  const events: { date: string; staff: string }[] = [];
  function add(date: string | null, staff: string | undefined) {
    if (!date || !staff) return;
    events.push({ date, staff });
  }
  if (c.notes && c.notes.trim().length > 0 && c.createdBy === c.assignedTo) {
    add(dateOnly(c.createdAt), c.createdBy);
  }
  for (const note of c.noteLog ?? []) {
    add(dateOnly(note.addedAt), note.addedBy);
  }
  // Direct edits to the Notes box itself, stamped server-side from the
  // logged-in staff account (Wence, 2026-07-29).
  add(dateOnly(c.notesUpdatedAt), c.notesUpdatedBy);
  return events;
}

interface DayColumn {
  date: string; // YYYY-MM-DD
  label: string; // "Jul 1"
}

function buildDayColumns(range: PeriodRange): DayColumn[] {
  const days: DayColumn[] = [];
  const cursor = new Date(range.start);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(range.end);
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    // Bari Ops works Monday–Friday only. Weekend activity must not appear
    // as a report column or be included in any table total (Wence, 2026-08-26).
    const dayOfWeek = cursor.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const iso = toDateInputValue(cursor);
      days.push({
        date: iso,
        label: cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export { dateOnly, PRECERT_TYPES, precertOngoingEvents, buildDayColumns };
export type { RawCase, DayColumn };
