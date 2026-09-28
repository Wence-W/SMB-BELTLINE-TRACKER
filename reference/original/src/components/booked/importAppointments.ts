// Import button for the Booked Tracker (Gretchen, 2026-08-05). Parses an
// .xlsx/.csv file (same shape as what Export produces) into appointment
// drafts. Imported rows always carry a valid `source`/status so the
// existing All/SMB/Boost tabs, filters, and validations keep working
// unchanged — Convex's live `appointments` query is what actually syncs
// them into the right tab, this just has to hand it well-formed data.
import * as XLSX from "xlsx";
import { SOURCES, STATUSES } from "@/lib/appointmentOptions";
import type { AppointmentDraft } from "./types";

// Import only ever fills string fields from the spreadsheet — the
// "Update Synchronization" checkboxes (added 2026-08-06) aren't part of
// any import template, so they're excluded from this map's key type.
type ImportableField = Exclude<
  keyof AppointmentDraft,
  "patientPortalAccess" | "insuranceVerificationTask" | "sendToBoost" | "sendToPipelineDash"
>;

const HEADER_MAP: Record<string, ImportableField> = {
  "patient id": "patientId",
  "full name": "fullName",
  name: "fullName",
  phone: "phone",
  "phone number": "phone",
  "phone no.": "phone",
  "phone no": "phone",
  email: "email",
  "email address": "email",
  source: "source",
  "date & time": "apptDateTime",
  "date and time": "apptDateTime",
  "appointment date & time": "apptDateTime",
  type: "appointmentType",
  "appointment type": "appointmentType",
  "service type": "serviceType",
  location: "clinicLocation",
  "clinic location": "clinicLocation",
  provider: "provider",
  scheduler: "scheduler",
  status: "status",
};

function toISODateTime(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
  }
  const str = String(value ?? "").trim();
  if (!str) return "";
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) return toISODateTime(parsed);
  return "";
}

function normalizeSource(value: string): string {
  const match = SOURCES.find(s => s.toLowerCase() === value.trim().toLowerCase());
  return match ?? (value.trim() ? value.trim() : "SMB-PLD");
}

function normalizeStatus(value: string): string {
  const match = STATUSES.find(s => s.toLowerCase() === value.trim().toLowerCase());
  return match ?? "Pending";
}

export interface ImportResult {
  rows: AppointmentDraft[];
  skipped: number;
}

export async function parseAppointmentsFile(file: File): Promise<ImportResult> {
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const rows: AppointmentDraft[] = [];
  let skipped = 0;

  for (const record of raw) {
    const draft: AppointmentDraft = {
      patientId: "",
      fullName: "",
      phone: "",
      email: "",
      source: "SMB-PLD",
      apptDateTime: "",
      appointmentType: "",
      serviceType: "",
      clinicLocation: "",
      provider: "",
      status: "Pending",
      scheduler: "",
    };

    for (const [rawKey, rawValue] of Object.entries(record)) {
      const key = HEADER_MAP[rawKey.trim().toLowerCase()];
      if (!key) continue;
      if (key === "apptDateTime") {
        draft.apptDateTime = toISODateTime(rawValue);
      } else if (key === "source") {
        draft.source = normalizeSource(String(rawValue));
      } else if (key === "status") {
        draft.status = normalizeStatus(String(rawValue));
      } else {
        draft[key] = String(rawValue ?? "").trim();
      }
    }

    if (!draft.patientId && !draft.apptDateTime && !draft.fullName) {
      skipped++;
      continue;
    }
    rows.push(draft);
  }

  return { rows, skipped };
}
