// AUTO-EXTRACTED ORACLE. DO NOT EDIT.
// Verbatim copy of top-level declarations from the ORIGINAL app:
//   reference/original/src/lib/exportUtils.ts
//   sha256 9e2ea647d317108da5fdea8e622f98c2035fe390ef4e7f9b8b31f22c0c10a746
// Regenerate with: bun run packages/parity/extract-oracles.ts
/* biome-ignore-all lint: verbatim third-party copy */
import { categoryLabel, resultLabel } from "@/lib/intakeTypes";
import { formatDateEST } from "@/lib/dateFormat";

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  try {
    return formatDateEST(iso);
  } catch {
    return iso;
  }
}

// ============================================================
// Intake Log export (Export Excel / Export PDF / Print Report /
// Reset toolbar added to the Intake tab per Wence, 2026-07-24 —
// same pattern as the Cases tab toolbar above, scoped to
// intakeEntries instead of cases.)
// ============================================================

export interface IntakeExportRow {
  patientId?: string;
  staff: string;
  category: string;
  result?: string;
  notes?: string;
  date: string;
  createdAt: string;
}

const INTAKE_EXPORT_HEADERS = ["Patient ID", "Staff", "Call Reason", "Resolution", "Notes", "Date"];

function intakeRowToArray(r: IntakeExportRow): string[] {
  return [r.patientId ?? "", r.staff, categoryLabel(r.category), resultLabel(r.result), r.notes ?? "", formatDate(r.createdAt)];
}

// ============================================================
// Piedmont: Epic referral log export (Wence, 2026-09-10) — same
// Export Excel / Reset pattern as the Intake Log toolbar above.
// ============================================================

export interface PiedmontEpicReferralExportRow {
  date: string;
  refId: string;
  mrNumber: string;
  chart: string;
  toProvider: string;
  referringProvider: string;
}

const PIEDMONT_EPIC_EXPORT_HEADERS = [
  "Date",
  "REF ID.",
  "MR#",
  "CHART",
  "TO PROVIDER",
  "REFERRING PROVIDER",
];

function piedmontEpicRowToArray(r: PiedmontEpicReferralExportRow): string[] {
  return [
    // r.date is a plain YYYY-MM-DD string (date-only input) — render as-is
    // rather than through formatDateEST, which would shift it a day via
    // UTC-midnight parsing.
    r.date,
    r.refId,
    r.mrNumber,
    r.chart,
    r.toProvider,
    r.referringProvider,
  ];
}

export { formatDate, INTAKE_EXPORT_HEADERS, intakeRowToArray, PIEDMONT_EPIC_EXPORT_HEADERS, piedmontEpicRowToArray };
export type {  };
