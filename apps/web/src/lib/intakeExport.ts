// The two Intake exports' columns, exactly as the original exportUtils.ts:
// Intake Log (Date = the entry's logged time in Eastern, as the original did,
// not its activity date; no Count column) and Piedmont: Epic (date as typed).
import { categoryLabel, resultLabel } from "../../../../convex/lib/intakeTaxonomy";
import { formatDateEST } from "./dateFormat";

export const INTAKE_EXPORT_HEADERS = ["Patient ID", "Staff", "Call Reason", "Resolution", "Notes", "Date"];

export function intakeExportRows(
  rows: { patientId?: string; staff: string; category: string; result?: string; notes?: string; createdAt: string }[],
): string[][] {
  return [
    INTAKE_EXPORT_HEADERS,
    ...rows.map(r => [
      r.patientId ?? "",
      r.staff,
      categoryLabel(r.category),
      resultLabel(r.result),
      r.notes ?? "",
      r.createdAt ? formatDateEST(r.createdAt) : "",
    ]),
  ];
}

export const PIEDMONT_EXPORT_HEADERS = ["Date", "REF ID.", "MR#", "CHART", "TO PROVIDER", "REFERRING PROVIDER"];

export function piedmontExportRows(
  rows: {
    date: string;
    refId: string;
    mrNumber: string;
    chart: string;
    toProvider: string;
    referringProvider: string;
  }[],
): string[][] {
  return [
    PIEDMONT_EXPORT_HEADERS,
    ...rows.map(r => [r.date, r.refId, r.mrNumber, r.chart, r.toProvider, r.referringProvider]),
  ];
}
