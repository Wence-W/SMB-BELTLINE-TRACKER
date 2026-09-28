import type { Appointment } from "@/components/booked/types";
import { easternDateKey } from "./dateFormat";

/**
 * Whether an appointment belongs in Booked Tracker > Year to Date Consults.
 *
 * The membership predicate follows Wence's requested save/import rule:
 * Consult appointments whose Service Type is not Medical Weight Loss are
 * captured in the YTD tab. Once captured, the server-side status snapshot
 * keeps the row in this tab even if the live appointment is edited later.
 */
export function isYearToDateConsult(
  appointment: Pick<
    Appointment,
    "apptDateTime" | "appointmentType" | "serviceType" | "ytdConsultStatus"
  >,
  year = easternDateKey(new Date()).slice(0, 4),
): boolean {
  if (appointment.ytdConsultStatus !== undefined) return true;
  if (easternDateKey(appointment.apptDateTime).slice(0, 4) !== year) return false;
  return (
    (appointment.appointmentType === "Consult" &&
      appointment.serviceType !== "Medical Weight Loss")
  );
}

/**
 * The YTD table uses the same appointment row shape as the other tabs, but
 * deliberately substitutes the immutable status snapshot.
 */
export function withYtdConsultStatusSnapshot(appointment: Appointment): Appointment {
  return appointment.ytdConsultStatus === undefined
    ? appointment
    : { ...appointment, status: appointment.ytdConsultStatus };
}
