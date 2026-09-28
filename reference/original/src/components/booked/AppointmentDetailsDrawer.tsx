// Appointment Details side panel — replaces the old "view" Dialog +
// row-level Edit button. Clicking anywhere on an appointment row opens
// this drawer (read-only). Edit switches the same panel into an editable
// form; Save Changes/Cancel commit or discard. Per Wence's spec, 2026-08-04:
// Full Name lives in the header (not Column 1), Status sits directly below
// Source in Column 1, Scheduler (required) sits directly below Status, and
// Created/Last Updated move to the bottom-right of Column 2, beneath
// Provider (aligned with the Scheduler row).
import { useMutation, useQuery } from "convex/react";
import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDateTimeEST } from "@/lib/dateFormat";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { AppointmentDropdownManager } from "@/components/booked/AppointmentDropdownManager";
import { Checkbox } from "@/components/ui/checkbox";
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
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useHasRestrictedAccess } from "@/lib/permissions";
import { DateTimePicker } from "./DateTimePicker";
import { StatusBadge } from "./StatusBadge";
import type { Appointment, AppointmentDraft } from "./types";

// How often the client refreshes its own presence row while the drawer is
// open. Must stay comfortably under the server's 15s staleness window
// (convex/appointmentPresence.ts) so a viewer never flickers away/back.
const HEARTBEAT_INTERVAL_MS = 5_000;

function ViewerIndicator({ appointmentId }: { appointmentId: Id<"appointments"> }) {
  const heartbeat = useMutation(api.appointmentPresence.heartbeat);
  const leave = useMutation(api.appointmentPresence.leave);
  const viewers = useQuery(api.appointmentPresence.listViewers, { appointmentId }) ?? [];

  useEffect(() => {
    let cancelled = false;
    const ping = () => {
      if (!cancelled) void heartbeat({ appointmentId });
    };
    ping();
    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      void leave({ appointmentId });
    };
    // Re-arm whenever the drawer switches to a different appointment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId]);

  if (viewers.length === 0) return null;

  const names = viewers.map(v => v.userName);
  const label =
    names.length === 1
      ? `${names[0]} is also viewing this record`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are also viewing this record`
        : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]} are also viewing this record`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 w-fit">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </span>
            {names.length === 1 ? `${names[0]} is also viewing` : `${names.length} others viewing`}
          </div>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface Props {
  appointment: Appointment | null;
  onOpenChange: (open: boolean) => void;
  onSave: (
    draft: AppointmentDraft,
    id: string,
    options?: { statusChanged?: boolean },
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

// One-click copy for Patient ID, with a brief inline confirmation
// (Gretchen, 2026-08-05).
function CopyablePatientId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <span>{value || "—"}</span>
      {value && (
        <button
          type="button"
          title="Copy Patient ID"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              toast.success("Patient ID copied.");
              setTimeout(() => setCopied(false), 1500);
            } catch {
              toast.error("Failed to copy Patient ID.");
            }
          }}
          className="text-muted-foreground hover:text-foreground"
        >
          <Copy className="size-3" />
        </button>
      )}
      {copied && <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Copied!</span>}
    </div>
  );
}

// Smaller, muted variant for footer metadata (Created / Last Updated) —
// visually de-emphasized vs. the primary appointment fields above.
function MetaField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] text-muted-foreground/70">{label}</div>
      <div className="text-xs text-muted-foreground">{value}</div>
    </div>
  );
}

export function AppointmentDetailsDrawer({
  appointment,
  onOpenChange,
  onSave,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<AppointmentDraft | null>(null);
  const [statusTouched, setStatusTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dropdownOptions = useQuery(api.appointmentOptions.list);
  const canManageOptions = useHasRestrictedAccess();

  // Reset the form only when a *different* appointment is opened — not on
  // every live-query push. `appointment` is re-derived from the live Convex
  // query, so its object identity changes whenever anyone touches the row;
  // keying this off `appointment` itself used to kick the drawer out of Edit
  // mode mid-edit and discard in-progress changes (Wence, 2026-08-06).
  const appointmentId = appointment?._id ?? null;
  useEffect(() => {
    setEditing(false);
    setForm(appointment ? { ...appointment } : null);
    setStatusTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId]);

  const open = !!appointment;

  function patch(fields: Partial<AppointmentDraft>) {
    setForm(f => (f ? { ...f, ...fields } : f));
  }

  if (!appointment) return null;
  const current = appointment;

  const group = sourceGroup(form?.source ?? current.source);
  const appointmentTypeOptions = APPOINTMENT_TYPES_BY_GROUP[group] ?? [];
  const serviceTypeOptions = form ? serviceTypesFor(group, form.appointmentType) : [];
  const schedulers = dropdownOptions?.schedulers ?? SCHEDULERS;
  const providersByLocation = dropdownOptions?.providersByLocation ?? PROVIDERS_BY_LOCATION;
  const providerOptions = providersByLocation[form?.clinicLocation ?? ""] ?? [];

  function handleSourceChange(source: string) {
    if (!form) return;
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
    if (!form) return;
    const nextServiceOptions = serviceTypesFor(group, appointmentType);
    patch({
      appointmentType,
      serviceType: nextServiceOptions.includes(form.serviceType) ? form.serviceType : "",
    });
  }

  function handleLocationChange(clinicLocation: string) {
    if (!form) return;
    const nextProviders = providersByLocation[clinicLocation] ?? [];
    patch({
      clinicLocation,
      provider: nextProviders.includes(form.provider) ? form.provider : "",
    });
  }

  // Patient ID, Scheduler, Appointment Date & Time, Appointment Type,
  // Service Type, Clinic Location and Provider are all optional (Gretchen,
  // 2026-08-05) — nothing left here blocks saving.
  const isValid = !!form;

  async function handleSaveChanges() {
    if (!form || !isValid) return;
    setSaving(true);
    try {
      await onSave(form, current._id, { statusChanged: statusTouched });
      toast.success("Appointment updated.");
      setEditing(false);
    } catch {
      toast.error("Failed to save appointment.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdit() {
    setForm({ ...current });
    setStatusTouched(false);
    setEditing(false);
  }

  async function handleConfirmDelete() {
    setDeleting(true);
    try {
      await onDelete(current._id);
      toast.success("Appointment deleted.");
      setConfirmingDelete(false);
      onOpenChange(false);
    } catch {
      toast.error("Failed to delete appointment.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={o => !o && onOpenChange(false)}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            Appointment Details — {appointment.fullName || appointment.patientId}
          </SheetTitle>
          {open && <ViewerIndicator appointmentId={current._id as Id<"appointments">} />}
        </SheetHeader>

        <div className="grid gap-6 sm:grid-cols-2 mt-4">
          {/* Column 1 */}
          <div className="space-y-3">
            {editing ? (
              <div className="space-y-1.5">
                <Label htmlFor="drawer-patientId">Patient ID</Label>
                <Input
                  id="drawer-patientId"
                  value={form?.patientId}
                  onChange={e => patch({ patientId: e.target.value })}
                />
              </div>
            ) : (
              <Field label="Patient ID" value={<CopyablePatientId value={appointment.patientId} />} />
            )}

            {/* Phone / Email (Wence, 2026-08-07) — captured in the form and
                exported, but not shown as table columns. */}
            {editing ? (
              <div className="space-y-1.5">
                <Label htmlFor="drawer-phone">Phone Number</Label>
                <Input
                  id="drawer-phone"
                  type="tel"
                  value={form?.phone}
                  onChange={e => patch({ phone: e.target.value })}
                />
              </div>
            ) : (
              <Field label="Phone Number" value={appointment.phone || "—"} />
            )}

            {editing ? (
              <div className="space-y-1.5">
                <Label htmlFor="drawer-email">Email</Label>
                <Input
                  id="drawer-email"
                  type="email"
                  value={form?.email}
                  onChange={e => patch({ email: e.target.value })}
                />
              </div>
            ) : (
              <Field label="Email" value={appointment.email || "—"} />
            )}

            {editing ? (
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select value={form?.source} onValueChange={handleSourceChange}>
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
            ) : (
              <Field label="Source" value={appointment.source} />
            )}

            {editing ? (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form?.status}
                  onValueChange={v => {
                    setStatusTouched(true);
                    patch({ status: v });
                  }}
                >
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
            ) : (
              <Field label="Status" value={<StatusBadge status={appointment.status} />} />
            )}

            {editing ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label>Scheduler</Label>
                  {canManageOptions && (
                    <AppointmentDropdownManager optionType="scheduler" options={schedulers} />
                  )}
                </div>
                <Select value={form?.scheduler} onValueChange={v => patch({ scheduler: v })}>
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
            ) : (
              <Field label="Scheduler" value={appointment.scheduler || "—"} />
            )}
          </div>

          {/* Column 2 */}
          <div className="space-y-3">
            {editing ? (
              <div className="space-y-1.5">
                <Label>Appointment Date &amp; Time</Label>
                <DateTimePicker
                  value={form?.apptDateTime ?? ""}
                  onChange={apptDateTime => patch({ apptDateTime })}
                />
              </div>
            ) : (
              <Field
                label="Date & Time"
                value={formatDateTimeEST(appointment.apptDateTime)}
              />
            )}

            {editing ? (
              <div className="space-y-1.5">
                <Label>Appointment Type</Label>
                <Select
                  value={form?.appointmentType}
                  onValueChange={handleAppointmentTypeChange}
                >
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
            ) : (
              <Field label="Appointment Type" value={appointment.appointmentType} />
            )}

            {editing ? (
              <div className="space-y-1.5">
                <Label>Service Type</Label>
                <Select
                  value={form?.serviceType}
                  onValueChange={v => patch({ serviceType: v })}
                  disabled={!form?.appointmentType}
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
            ) : (
              <Field label="Service Type" value={appointment.serviceType} />
            )}

            {editing ? (
              <div className="space-y-1.5">
                <Label>Clinic Location</Label>
                <Select value={form?.clinicLocation} onValueChange={handleLocationChange}>
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
            ) : (
              <Field label="Clinic Location" value={appointment.clinicLocation} />
            )}

            {editing ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label>Provider</Label>
                  {canManageOptions && (
                    <AppointmentDropdownManager
                      optionType="provider"
                      options={providerOptions}
                      location={form?.clinicLocation || undefined}
                      disabled={!form?.clinicLocation}
                    />
                  )}
                </div>
                <Select
                  value={form?.provider}
                  onValueChange={v => patch({ provider: v })}
                  disabled={!form?.clinicLocation}
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
            ) : (
              <Field label="Provider" value={appointment.provider} />
            )}

          </div>
        </div>

        {/* Update Synchronization checklist (Wence, 2026-08-06). Items
            stack vertically with the checkbox on the right of each label.
            Locked in read-only view (Wence, 2026-08-06 follow-up #3): the
            checkboxes are only clickable in Edit mode and persist with
            Save Changes, so a stray click can never flip/clear a box.
            Visibility rules: checkboxes only apply to Consult and Follow
            Up appointment types.
            - Consult: Patient Portal Access + Insurance Verification
              Task always show, plus Send to Boost (Source = Boost) or
              Send to Pipeline Dash (Source = SMB-PLD / SMB INB-NEW /
              SMB INB-OLD / SMB TASK).
            - Follow Up: only Insurance Verification Task shows.
            - Any other appointment type (or none picked yet): nothing
              shows. */}
        {(() => {
          const apptType = editing ? form?.appointmentType : current.appointmentType;
          const isConsult = apptType === "Consult";
          const isFollowUp = apptType === "Follow Up";
          const sourceGroupForCurrent = sourceGroup(
            (editing ? form?.source : current.source) ?? current.source,
          );

          const items: { key: keyof AppointmentDraft; label: string }[] = [];
          if (isConsult) {
            items.push({ key: "patientPortalAccess", label: "Patient Portal Access" });
            items.push({ key: "insuranceVerificationTask", label: "Insurance Verification Task" });
            if (sourceGroupForCurrent === "Boost") {
              items.push({ key: "sendToBoost", label: "Send to Boost" });
            } else {
              items.push({ key: "sendToPipelineDash", label: "Send to Pipeline Dash" });
            }
          } else if (isFollowUp) {
            items.push({ key: "insuranceVerificationTask", label: "Insurance Verification Task" });
          }

          if (items.length === 0) return null;

          return (
            <div className="border-t pt-4 mt-6 space-y-2">
              <h4 className="text-sm font-semibold text-foreground">Update Synchronization</h4>
              <div className="flex flex-col gap-2">
                {items.map(({ key, label }) => (
                  <div
                    key={key}
                    className="flex items-center gap-2 text-sm text-foreground"
                  >
                    <span>{label}</span>
                    <Checkbox
                      checked={editing ? !!form?.[key] : !!appointment[key]}
                      disabled={!editing}
                      className="border-emerald-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 data-[state=checked]:text-white dark:border-emerald-500 dark:data-[state=checked]:bg-emerald-500 dark:data-[state=checked]:border-emerald-500 disabled:opacity-100 disabled:cursor-default"
                      onCheckedChange={checked => {
                        if (!editing) return;
                        patch({ [key]: checked === true } as Partial<AppointmentDraft>);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Created / Last Updated — horizontally aligned footer row, stacks
            vertically on narrow screens. Smaller/muted vs. primary fields
            (2026-08-04, Wence). Layout only; values/logic untouched. */}
        <div className="flex flex-col gap-3 border-t pt-4 mt-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <MetaField label="Created" value={formatDateTimeEST(appointment.createdDate)} />
          {/* Created By added beside Created, same muted format
              (Wence, 2026-08-06). */}
          <MetaField label="Created By" value={appointment.createdByName || "—"} />
          <MetaField
            label="Last Updated"
            value={formatDateTimeEST(appointment.updatedAt)}
          />
          {/* Show the staff member's name (never their raw email address)
              who last touched this record — Gretchen, 2026-08-05. */}
          <MetaField label="Updated By" value={appointment.updatedByName || "—"} />
        </div>

        {/* Button order: Edit | Delete | Close (Gretchen, 2026-08-05). */}
        <SheetFooter className="mt-6">
          {editing ? (
            <>
              <Button variant="outline" onClick={handleCancelEdit} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSaveChanges} disabled={!isValid || saving}>
                {saving ? "Saving…" : "Save Changes"}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => setEditing(true)}>Edit</Button>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {current.fullName || current.patientId}'s
              appointment. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
