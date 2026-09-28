import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { formatDateTimeEST } from "@/lib/dateFormat";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateTimePicker } from "@/components/booked/DateTimePicker";
import { AppointmentDropdownManager } from "@/components/booked/AppointmentDropdownManager";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  APPOINTMENT_TYPES_BY_GROUP,
  CLINIC_LOCATIONS,
  PROVIDERS_BY_LOCATION,
  SCHEDULERS,
  SOURCES,
  STATUSES,
  serviceTypesFor,
  sourceGroup,
} from "@/lib/appointmentOptions";
import type { Appointment, AppointmentDraft } from "./types";
import { api } from "../../../convex/_generated/api";
import { useHasRestrictedAccess } from "@/lib/permissions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: AppointmentDraft & Partial<Pick<Appointment, "_id" | "createdDate" | "updatedAt">>;
  onSave: (draft: AppointmentDraft, id?: string) => Promise<void>;
}

// Phone/Email re-added to the Add/Edit Appointment form below Patient ID
// (Wence, 2026-08-07). Not shown in the Appointments table, but included in
// the Excel export.
const EMPTY: AppointmentDraft = {
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

export function AppointmentModal({ open, onOpenChange, initial, onSave }: Props) {
  const [form, setForm] = useState<AppointmentDraft>(initial ?? EMPTY);
  const [saving, setSaving] = useState(false);
  const dropdownOptions = useQuery(api.appointmentOptions.list);
  const canManageOptions = useHasRestrictedAccess();

  useEffect(() => {
    if (open) setForm(initial ?? EMPTY);
  }, [open, initial]);

  const group = sourceGroup(form.source);
  const appointmentTypeOptions = APPOINTMENT_TYPES_BY_GROUP[group] ?? [];
  const serviceTypeOptions = useMemo(
    () => serviceTypesFor(group, form.appointmentType),
    [group, form.appointmentType],
  );
  const schedulers = dropdownOptions?.schedulers ?? SCHEDULERS;
  const providersByLocation = dropdownOptions?.providersByLocation ?? PROVIDERS_BY_LOCATION;
  const providerOptions = providersByLocation[form.clinicLocation] ?? [];

  function patch(fields: Partial<AppointmentDraft>) {
    setForm(f => ({ ...f, ...fields }));
  }

  function handleSourceChange(source: string) {
    const newGroup = sourceGroup(source);
    const newTypeOptions = APPOINTMENT_TYPES_BY_GROUP[newGroup] ?? [];
    const nextType = newTypeOptions.includes(form.appointmentType) ? form.appointmentType : "";
    const nextServiceOptions = serviceTypesFor(newGroup, nextType);
    patch({
      source,
      appointmentType: nextType,
      serviceType: nextServiceOptions.includes(form.serviceType) ? form.serviceType : "",
    });
  }

  function handleAppointmentTypeChange(appointmentType: string) {
    const nextServiceOptions = serviceTypesFor(group, appointmentType);
    patch({
      appointmentType,
      serviceType: nextServiceOptions.includes(form.serviceType) ? form.serviceType : "",
    });
  }

  function handleLocationChange(clinicLocation: string) {
    const nextProviders = providersByLocation[clinicLocation] ?? [];
    patch({
      clinicLocation,
      provider: nextProviders.includes(form.provider) ? form.provider : "",
    });
  }

  // Patient ID, Scheduler, Appointment Date & Time, Appointment Type,
  // Service Type, Clinic Location and Provider are all optional now
  // (Gretchen, 2026-08-05) — Source is the only field the form defaults
  // and always carries a value, so there's nothing left to block Save on.
  const isValid = true;

  async function handleSave() {
    if (!isValid) return;
    setSaving(true);
    try {
      await onSave(form, initial?._id);
      toast.success(initial?._id ? "Appointment updated." : "Appointment successfully added.");
      onOpenChange(false);
    } catch {
      toast.error("Failed to save appointment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {initial?._id ? "Edit Appointment" : "Add Appointment"}
            {form.patientId ? ` — ${form.patientId}` : ""}
          </DialogTitle>
        </DialogHeader>

        {/* Full Name field fully removed from the form (Wence, 2026-08-04) —
            no longer captured for new appointments; old rows keep their name. */}

        <div className="grid gap-6 sm:grid-cols-2">
          {/* Column 1 — Patient Information */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground">Patient Information</h4>
            <div className="space-y-1.5">
              <Label htmlFor="patientId">Patient ID</Label>
              <Input
                id="patientId"
                value={form.patientId}
                onChange={e => patch({ patientId: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={e => patch({ phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={e => patch({ email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Select value={form.source} onValueChange={handleSourceChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map(s => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => patch({ status: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label>Scheduler</Label>
                {canManageOptions && (
                  <AppointmentDropdownManager optionType="scheduler" options={schedulers} />
                )}
              </div>
              <Select value={form.scheduler} onValueChange={v => patch({ scheduler: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select Scheduler" />
                </SelectTrigger>
                <SelectContent>
                  {schedulers.map(s => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Column 2 — Appointment Information */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground">Appointment Information</h4>
            <div className="space-y-1.5">
              <Label htmlFor="apptDateTime">Appointment Date &amp; Time</Label>
              <DateTimePicker
                id="apptDateTime"
                value={form.apptDateTime}
                onChange={apptDateTime => patch({ apptDateTime })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Appointment Type</Label>
              <Select value={form.appointmentType} onValueChange={handleAppointmentTypeChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {appointmentTypeOptions.map(t => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Service Type</Label>
              <Select
                value={form.serviceType}
                onValueChange={v => patch({ serviceType: v })}
                disabled={!form.appointmentType}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select service" />
                </SelectTrigger>
                <SelectContent>
                  {serviceTypeOptions.map(t => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Clinic Location</Label>
              <Select value={form.clinicLocation} onValueChange={handleLocationChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {CLINIC_LOCATIONS.map(l => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label>Provider</Label>
                {canManageOptions && (
                  <AppointmentDropdownManager
                    optionType="provider"
                    options={providerOptions}
                    location={form.clinicLocation || undefined}
                    disabled={!form.clinicLocation}
                  />
                )}
              </div>
              <Select
                value={form.provider}
                onValueChange={v => patch({ provider: v })}
                disabled={!form.clinicLocation}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {providerOptions.map(p => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </div>
        </div>

        {/* Created / Last Updated — horizontally aligned footer row, stacks
            vertically on narrow screens. Smaller/muted vs. primary fields
            (2026-08-04, Wence). Only shown when editing an existing
            appointment. Layout only; values/logic untouched. */}
        {initial?._id && (
          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="space-y-0.5">
              <Label className="text-[11px] text-muted-foreground/70">Created</Label>
              <p className="text-xs text-muted-foreground">
                {initial.createdDate ? formatDateTimeEST(initial.createdDate) : "—"}
              </p>
            </div>
            <div className="space-y-0.5">
              <Label className="text-[11px] text-muted-foreground/70">Last Updated</Label>
              <p className="text-xs text-muted-foreground">
                {initial.updatedAt ? formatDateTimeEST(initial.updatedAt) : "—"}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
