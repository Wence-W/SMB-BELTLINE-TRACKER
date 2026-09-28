// Export Excel button for the Booked Tracker (2026-08-05, per Wence's
// spec). Exports exactly what's currently in the table (respecting the
// active tab + filters), not the full unfiltered dataset.
import * as XLSX from "xlsx";
import { formatDateEST, formatDateTimeEST } from "@/lib/dateFormat";
import type { Appointment } from "./types";

// Phone No. / Email are captured in the Add/Edit form and included here in
// the export, but intentionally not shown in the table (Wence, 2026-08-07).
const HEADERS = [
  "Status",
  "Patient ID",
  "Phone No.",
  "Email",
  "Source",
  "Date & Time",
  "Type",
  "Service Type",
  "Location",
  "Provider",
  "Scheduler",
  "Created",
];

function toRow(a: Appointment): (string | undefined)[] {
  return [
    a.status,
    a.patientId,
    a.phone,
    a.email,
    a.source,
    a.apptDateTime ? formatDateTimeEST(a.apptDateTime) : "",
    a.appointmentType,
    a.serviceType,
    a.clinicLocation,
    a.provider,
    a.scheduler,
    a.createdDate ? formatDateEST(a.createdDate) : "",
  ];
}

export function exportAppointmentsToXLSX(
  appointments: Appointment[],
  filename = "booked-tracker.xlsx",
): void {
  const rows = appointments.map(toRow);
  const worksheet = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
  worksheet["!cols"] = HEADERS.map(() => ({ wch: 16 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Appointments");
  XLSX.writeFile(workbook, filename);
}
