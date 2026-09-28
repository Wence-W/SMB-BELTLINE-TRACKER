export interface AppointmentDraft {
  patientId: string;
  fullName: string;
  phone: string;
  email: string;
  source: string;
  apptDateTime: string;
  appointmentType: string;
  serviceType: string;
  clinicLocation: string;
  provider: string;
  status: string;
  scheduler: string;
  // "Update Synchronization" checklist (Wence, 2026-08-06).
  patientPortalAccess?: boolean;
  insuranceVerificationTask?: boolean;
  sendToBoost?: boolean;
  sendToPipelineDash?: boolean;
}

export interface Appointment extends AppointmentDraft {
  _id: string;
  createdDate: string;
  updatedAt: string;
  createdByName?: string;
  updatedByName?: string;
  /**
   * The status captured when this appointment first qualified for the
   * Year to Date Consults view. The main appointment status may change
   * later; the YTD view deliberately keeps this snapshot unchanged.
   */
  ytdConsultStatus?: string;
}
