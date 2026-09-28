import { easternDateKey, easternDateTimeKey } from "./dateFormat";

export interface NotificationAppointment {
  status: string;
  apptDateTime: string;
}

export type NotificationReason =
  | "Scheduled today"
  | "Pending past due"
  | "Scheduled today · Pending past due";

/**
 * Classify one appointment for the Booked Tracker Notifications badge.
 *
 * The stored appointment datetime has no offset and represents Eastern local
 * time. `easternDateKey`/`easternDateTimeKey` therefore compare it against
 * the current Eastern clock without depending on the viewer's timezone.
 */
export function appointmentNotificationReason(
  appointment: NotificationAppointment,
  now: Date,
): NotificationReason | null {
  const todayKey = easternDateKey(now);
  const nowKey = easternDateTimeKey(now);
  const appointmentDateKey = easternDateKey(appointment.apptDateTime);
  const appointmentDateTimeKey = easternDateTimeKey(appointment.apptDateTime);
  const scheduledToday =
    Boolean(appointmentDateKey) && appointmentDateKey === todayKey;
  const pendingPastDue =
    appointment.status === "Pending" &&
    Boolean(appointmentDateTimeKey) &&
    appointmentDateTimeKey < nowKey;

  if (!scheduledToday && !pendingPastDue) return null;
  if (scheduledToday && pendingPastDue)
    return "Scheduled today · Pending past due";
  return scheduledToday ? "Scheduled today" : "Pending past due";
}
