// ============================================================
// Bariatric Operations Tracker — Export Utilities
// ============================================================

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { BariCase } from "./types";
import { categoryLabel, resultLabel } from "./intakeTypes";
import { formatDateEST, formatDateTimeEST } from "./dateFormat";

// A "From"/"To" date range (YYYY-MM-DD, both inclusive). Undefined = no
// filter (all cases). Used by Export Excel / Export PDF / Print Report
// so Wence can scope a report to a specific date range (2026-07-22).
export interface ExportDateRange {
  /** Created-date range (inclusive). */
  from?: string;
  to?: string;
  /** Completed-date range (inclusive), added for Export Reports
   *  (Gretchen, 2026-08-13). Cases with no Completed date are excluded
   *  whenever either end of this range is set. */
  completedFrom?: string;
  completedTo?: string;
  /** Extra non-date filters summary (Export dialog, 2026-09-24), shown in
   *  the PDF/Print header, e.g. "Status: Completed | Staff: Gilda". */
  filtersLabel?: string;
}

export function filterCasesByDateRange(
  cases: BariCase[],
  range?: ExportDateRange,
): BariCase[] {
  if (
    !range ||
    (!range.from && !range.to && !range.completedFrom && !range.completedTo)
  )
    return cases;
  return cases.filter(c => {
    const created = c.createdAt.slice(0, 10);
    if (range.from && created < range.from) return false;
    if (range.to && created > range.to) return false;
    if (range.completedFrom || range.completedTo) {
      const completed = c.completedAt?.slice(0, 10);
      if (!completed) return false;
      if (range.completedFrom && completed < range.completedFrom) return false;
      if (range.completedTo && completed > range.completedTo) return false;
    }
    return true;
  });
}

/** Human-readable label for whichever date range(s) an export was scoped to. */
export function exportRangeLabel(range?: ExportDateRange): string {
  const parts: string[] = [];
  if (range?.from || range?.to)
    parts.push(`Created: ${range.from ?? "…"} to ${range.to ?? "…"}`);
  if (range?.completedFrom || range?.completedTo)
    parts.push(
      `Completed: ${range.completedFrom ?? "…"} to ${range.completedTo ?? "…"}`,
    );
  if (range?.filtersLabel) parts.push(range.filtersLabel);
  return parts.length === 0 ? "Range: All cases" : parts.join("   |   ");
}

const CASE_TYPE_LABELS: Record<BariCase["caseType"], string> = {
  urgent: "Urgent Bari Request",
  initial_consult: "Initial Consult",
  followup_consult: "Follow-Up Consult",
  no_appointment: "No Appointment",
  reverification: "Reverification",
  predetermination: "Predetermination",
  precert_bari: "Pre-Cert Bari",
  precert_veins: "Pre-Cert Veins",
  precert_general: "Pre-Cert General",
  precert_modified_urgent: "Precert - Modified/Urgent",
  precert_egd: "Pre-Cert EGD",
};

const STATUS_LABELS: Record<BariCase["status"], string> = {
  new: "New",
  in_progress: "In Progress",
  completed: "Completed",
  on_hold: "On Hold",
  reassigned: "Reassigned",
  cancelled: "Cancelled",
};

const AUTH_STATUS_LABELS: Record<NonNullable<BariCase["authStatus"]>, string> = {
  pending_pre_auth: "Pending Pre-Auth",
  approved: "Approved",
  partial_approval: "Partial Approval",
  denied: "Denied",
  peer_to_peer: "Peer to Peer",
  appeal: "Appeal",
  pending_pred: "Pending Pred",
  cancelled: "Cancelled",
};

function escapeCSV(val: string | undefined): string {
  if (val == null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  try {
    return formatDateEST(iso);
  } catch {
    return iso;
  }
}

const EXPORT_HEADERS = [
  "Patient ID",
  "DOS",
  "Expiration Date",
  "Case Type",
  "Status",
  "Auth Status",
  "Priority",
  "Assigned To",
  "Insurance Provider",
  "Authorization #",
  "Notes",
  "Created At",
  "Updated At",
  "Completed At",
  "Approved At",
];

function caseToRow(c: BariCase): (string | undefined)[] {
  return [
    c.patientId,
    c.dos ?? "",
    c.expirationDate ?? "",
    CASE_TYPE_LABELS[c.caseType],
    STATUS_LABELS[c.status],
    c.authStatus ? AUTH_STATUS_LABELS[c.authStatus] : "",
    c.priority === "urgent" ? "Urgent" : c.priority === "high" ? "High" : "Standard",
    c.assignedTo,
    c.insuranceProvider,
    c.authorizationNumber,
    c.notes,
    formatDate(c.createdAt),
    formatDate(c.updatedAt),
    formatDate(c.completedAt),
    formatDate(c.approvedAt),
  ];
}

/** @deprecated kept for reference; the "Export Excel" button now uses
 * `exportToXLSX` for a real .xlsx spreadsheet instead of a renamed CSV. */
export function exportToCSV(
  cases: BariCase[],
  filename = "bari-ops-tracker.csv",
): void {
  const rows = cases.map(caseToRow).map(r => r.map(v => escapeCSV(v)));
  const csv = [EXPORT_HEADERS.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Real .xlsx spreadsheet (opens correctly in Excel/Google Sheets), unlike
 * the old "Export Excel" button which actually downloaded a CSV. */
export function exportToXLSX(
  cases: BariCase[],
  filename = "bari-ops-tracker.xlsx",
): void {
  const rows = cases.map(caseToRow);
  const worksheet = XLSX.utils.aoa_to_sheet([EXPORT_HEADERS, ...rows]);
  worksheet["!cols"] = EXPORT_HEADERS.map(() => ({ wch: 16 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Cases");
  XLSX.writeFile(workbook, filename);
}

/** One-click downloadable PDF report (summary cards + case table), so
 * Wence doesn't have to go through the browser's print dialog. */
export function exportToPDF(
  cases: BariCase[],
  range?: ExportDateRange,
  filename = "bari-ops-tracker.pdf",
): void {
  const now = formatDateTimeEST(new Date());
  const totalCases = cases.length;
  const completed = cases.filter(c => c.status === "completed").length;
  const approved = cases.filter(
    c => c.authStatus === "approved" || c.authStatus === "partial_approval",
  ).length;
  const remaining = totalCases - completed;

  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(16);
  doc.text("SMB Beltline Tracker Report", 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(100);
  const rangeLabel = exportRangeLabel(range);
  doc.text(`Generated: ${now}   |   ${rangeLabel}`, 14, 22);
  doc.setTextColor(0);
  doc.setFontSize(10);
  doc.text(
    `Total: ${totalCases}    Completed: ${completed}    Remaining: ${remaining}    Approved: ${approved}`,
    14,
    29,
  );

  autoTable(doc, {
    startY: 34,
    head: [["Patient ID", "DOS", "Expires", "Case Type", "Status", "Pre-Cert Task", "Priority", "Assigned To", "Created"]],
    body: cases.map(c => [
      c.patientId,
      c.dos || "—",
      c.expirationDate || "—",
      CASE_TYPE_LABELS[c.caseType],
      STATUS_LABELS[c.status],
      c.authStatus ? AUTH_STATUS_LABELS[c.authStatus] : "—",
      c.priority === "urgent" ? "Urgent" : c.priority === "high" ? "High" : "Standard",
      c.assignedTo,
      formatDate(c.createdAt),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 41, 59] },
  });

  doc.save(filename);
}

export function printReport(cases: BariCase[], range?: ExportDateRange): void {
  const now = formatDateTimeEST(new Date());
  const rangeLabel =
    range?.from || range?.to || range?.completedFrom || range?.completedTo || range?.filtersLabel
      ? exportRangeLabel(range)
      : "";
  const totalCases = cases.length;
  const completed = cases.filter(c => c.status === "completed").length;
  const approved = cases.filter(
    c => c.authStatus === "approved" || c.authStatus === "partial_approval",
  ).length;
  const remaining = totalCases - completed;
  const productivity =
    totalCases > 0 ? Math.round((completed / totalCases) * 100) : 0;

  const rows = cases
    .map(
      c => `
    <tr>
      <td>${c.patientId}</td>
      <td>${c.dos || "—"}</td>
      <td>${c.expirationDate || "—"}</td>
      <td>${CASE_TYPE_LABELS[c.caseType]}</td>
      <td>${STATUS_LABELS[c.status]}</td>
      <td>${c.authStatus ? AUTH_STATUS_LABELS[c.authStatus] : "—"}</td>
      <td>${c.priority === "urgent" ? "🔴 Urgent" : c.priority === "high" ? "🟠 High" : "Standard"}</td>
      <td>${c.assignedTo}</td>
      <td>${formatDate(c.createdAt)}</td>
    </tr>`,
    )
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Bariatric Operations Report - ${now}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    .subtitle { color: #666; font-size: 11px; margin-bottom: 16px; }
    .summary { display: flex; gap: 24px; margin-bottom: 20px; }
    .summary-card { background: #f4f4f4; padding: 10px 16px; border-radius: 6px; }
    .summary-card .label { font-size: 10px; color: #666; }
    .summary-card .value { font-size: 22px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #1e293b; color: white; padding: 6px 8px; text-align: left; font-size: 11px; }
    td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
    tr:nth-child(even) td { background: #f9fafb; }
    @media print { body { -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <h1>SMB Beltline Tracker Report</h1>
  <div class="subtitle">Generated: ${now}${rangeLabel ? `  |  ${rangeLabel}` : ""}</div>
  <div class="summary">
    <div class="summary-card"><div class="label">Total Cases</div><div class="value">${totalCases}</div></div>
    <div class="summary-card"><div class="label">Completed</div><div class="value">${completed}</div></div>
    <div class="summary-card"><div class="label">Remaining</div><div class="value">${remaining}</div></div>
    <div class="summary-card"><div class="label">Approved</div><div class="value">${approved}</div></div>
    <div class="summary-card"><div class="label">Productivity</div><div class="value">${productivity}%</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Patient ID</th>
        <th>DOS</th>
        <th>Expires</th>
        <th>Case Type</th>
        <th>Status</th>
        <th>Pre-Cert Task</th>
        <th>Priority</th>
        <th>Assigned To</th>
        <th>Created</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

  openPrintWindow(html);
}

/** Opens a new window with the given full HTML document and triggers the
 * browser print dialog — shared by `printReport` and any other tab that
 * wants a "Print" button (e.g. Staff Daily Productivity). */
export function openPrintWindow(html: string): void {
  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 500);
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

export function filterIntakeByDateRange(
  rows: IntakeExportRow[],
  range?: ExportDateRange,
): IntakeExportRow[] {
  if (!range || (!range.from && !range.to)) return rows;
  return rows.filter(r => {
    if (range.from && r.date < range.from) return false;
    if (range.to && r.date > range.to) return false;
    return true;
  });
}

const INTAKE_EXPORT_HEADERS = ["Patient ID", "Staff", "Call Reason", "Resolution", "Notes", "Date"];

function intakeRowToArray(r: IntakeExportRow): string[] {
  return [r.patientId ?? "", r.staff, categoryLabel(r.category), resultLabel(r.result), r.notes ?? "", formatDate(r.createdAt)];
}

export function exportIntakeToXLSX(
  rows: IntakeExportRow[],
  filename = "intake-log.xlsx",
): void {
  const data = rows.map(intakeRowToArray);
  const worksheet = XLSX.utils.aoa_to_sheet([INTAKE_EXPORT_HEADERS, ...data]);
  worksheet["!cols"] = INTAKE_EXPORT_HEADERS.map(() => ({ wch: 18 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Intake Log");
  XLSX.writeFile(workbook, filename);
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

export function exportPiedmontEpicReferralsToXLSX(
  rows: PiedmontEpicReferralExportRow[],
  filename = "piedmont-epic-referrals.xlsx",
): void {
  const data = rows.map(piedmontEpicRowToArray);
  const worksheet = XLSX.utils.aoa_to_sheet([PIEDMONT_EPIC_EXPORT_HEADERS, ...data]);
  worksheet["!cols"] = PIEDMONT_EPIC_EXPORT_HEADERS.map(() => ({ wch: 18 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Piedmont Epic Referrals");
  XLSX.writeFile(workbook, filename);
}

export function exportIntakeToPDF(
  rows: IntakeExportRow[],
  range?: ExportDateRange,
  filename = "intake-log.pdf",
): void {
  const now = formatDateTimeEST(new Date());
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(16);
  doc.text("Intake Log Report", 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(100);
  const rangeLabel = range?.from || range?.to
    ? `Range: ${range.from ?? "…"} to ${range.to ?? "…"}`
    : "Range: All entries";
  doc.text(`Generated: ${now}   |   ${rangeLabel}`, 14, 22);
  doc.setTextColor(0);
  doc.setFontSize(10);
  doc.text(`Total entries: ${rows.length}`, 14, 29);

  autoTable(doc, {
    startY: 34,
    head: [INTAKE_EXPORT_HEADERS],
    body: rows.map(intakeRowToArray),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 41, 59] },
  });

  doc.save(filename);
}

export function printIntakeReport(rows: IntakeExportRow[], range?: ExportDateRange): void {
  const now = formatDateTimeEST(new Date());
  const rangeLabel =
    range?.from || range?.to || range?.completedFrom || range?.completedTo || range?.filtersLabel
      ? exportRangeLabel(range)
      : "";

  const tableRows = rows
    .map(
      r => `
    <tr>
      <td>${r.patientId ?? "—"}</td>
      <td>${r.staff}</td>
      <td>${categoryLabel(r.category)}</td>
      <td>${resultLabel(r.result)}</td>
      <td>${r.notes ?? ""}</td>
      <td>${formatDate(r.createdAt)}</td>
    </tr>`,
    )
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Intake Log Report - ${now}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    .subtitle { color: #666; font-size: 11px; margin-bottom: 16px; }
    .summary { display: flex; gap: 24px; margin-bottom: 20px; }
    .summary-card { background: #f4f4f4; padding: 10px 16px; border-radius: 6px; }
    .summary-card .label { font-size: 10px; color: #666; }
    .summary-card .value { font-size: 22px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #1e293b; color: white; padding: 6px 8px; text-align: left; font-size: 11px; }
    td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
    tr:nth-child(even) td { background: #f9fafb; }
    @media print { body { -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <h1>Intake Log Report</h1>
  <div class="subtitle">Generated: ${now}${rangeLabel ? `  |  ${rangeLabel}` : ""}</div>
  <div class="summary">
    <div class="summary-card"><div class="label">Total Entries</div><div class="value">${rows.length}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Patient ID</th>
        <th>Staff</th>
        <th>Call Reason</th>
        <th>Resolution</th>
        <th>Notes</th>
        <th>Date</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
</body>
</html>`;

  openPrintWindow(html);
}
