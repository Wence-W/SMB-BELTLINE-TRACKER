import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { History } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { generateId, now } from "@/lib/store";
import { useCanEditLockedPatientId, useHasRestrictedAccess } from "@/lib/permissions";
import {
  type AuthStatus,
  type BariCase,
  type CaseStatus,
  type CaseType,
} from "@/lib/types";

/** Patient ID change log popover — admins only (Wence, 2026-09-17: "give me
 * access to check the previous or edit history"). Only shows once a case
 * exists (new/unsaved cases have no history) and only ever lists changes
 * made after this feature shipped; nothing prior was recorded. */
function PatientIdHistoryButton({ caseId }: { caseId: NonNullable<BariCase["_id"]> }) {
  const [showHistory, setShowHistory] = useState(false);
  const history = useQuery(
    api.cases.listPatientIdHistory,
    showHistory ? { caseId: caseId as Id<"cases"> } : "skip",
  );

  return (
    <span className="relative inline-block ml-1">
      <button
        type="button"
        onClick={() => setShowHistory(s => !s)}
        title="View Patient ID edit history"
        className="align-middle text-muted-foreground/70 hover:text-foreground"
      >
        <History className="inline h-3 w-3" />
      </button>
      {showHistory && (
        <div className="absolute z-20 left-0 top-5 w-72 bg-card border border-input rounded-lg shadow-lg p-2 text-xs">
          <div className="font-medium mb-1">Patient ID history</div>
          {history === undefined ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : history.length === 0 ? (
            <div className="text-muted-foreground">
              No recorded changes yet (only changes made from now on are logged).
            </div>
          ) : (
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {history.map(h => (
                <li key={h._id} className="border-b border-input/50 pb-1 last:border-0">
                  <span className="line-through text-muted-foreground">{h.oldPatientId}</span>
                  {" → "}
                  <span className="font-medium">{h.newPatientId}</span>
                  <div className="text-[10px] text-muted-foreground">
                    {h.changedBy ?? "Unknown"} · {new Date(h.changedAt).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </span>
  );
}

/** Pre-Cert case types get the separate Auth Status field/dropdown. */
function isPrecertType(t: CaseType): boolean {
  return t.startsWith("precert_");
}

interface Props {
  open: boolean;
  editCase?: BariCase | null;
  defaultCaseType?: CaseType;
  staffOptions: string[];
  /** Ordering/referring physicians — Pre-Cert cases only. Dynamic list. */
  providerOptions: string[];
  onAddProvider: (name: string) => void;
  onDeleteProvider: (name: string) => void;
  /** Requesters — Reverification cases only. Dynamic list. */
  requestByOptions: string[];
  onAddRequestBy: (name: string) => void;
  onDeleteRequestBy: (name: string) => void;
  onSave: (c: BariCase) => void;
  onClose: () => void;
}

const CASE_TYPE_OPTIONS: { value: CaseType; label: string }[] = [
  { value: "urgent", label: "Urgent Bari Request" },
  { value: "initial_consult", label: "Initial Consult" },
  { value: "followup_consult", label: "Follow-Up Consult" },
  { value: "no_appointment", label: "No Appointment" },
  { value: "reverification", label: "Reverification" },
  { value: "predetermination", label: "Predetermination" },
  { value: "precert_bari", label: "Pre-Cert Bari" },
  { value: "precert_veins", label: "Pre-Cert Veins" },
  { value: "precert_general", label: "Pre-Cert General" },
  { value: "precert_modified_urgent", label: "Precert – Modified/Urgent" },
  { value: "precert_egd", label: "Pre-Cert EGD" },
];

const STATUS_OPTIONS = [
  { value: "", label: "Select..." },
  { value: "new", label: "New" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On Hold" },
  { value: "reassigned", label: "Reassigned" },
  { value: "cancelled", label: "Cancelled" },
];

const AUTH_STATUS_OPTIONS: { value: AuthStatus | ""; label: string }[] = [
  { value: "", label: "Select..." },
  { value: "pending_pre_auth", label: "Pending Pre-Auth" },
  { value: "approved", label: "Approved" },
  { value: "partial_approval", label: "Partial Approval" },
  { value: "denied", label: "Denied" },
  { value: "peer_to_peer", label: "Peer to Peer" },
  { value: "appeal", label: "Appeal" },
  { value: "pending_pred", label: "Pending Pred" },
  { value: "cancelled", label: "Cancelled" },
];

type FormState = Omit<
  BariCase,
  "id" | "createdAt" | "updatedAt" | "status" | "authStatus"
> & {
  status: CaseStatus | "";
  authStatus: AuthStatus | "";
};

function emptyCase(defaultType?: CaseType, defaultStaff?: string): FormState {
  return {
    patientId: "",
    dos: "",
    expirationDate: "",
    caseType: defaultType ?? "initial_consult",
    status: "",
    authStatus: "",
    priority: "standard",
    assignedTo: defaultStaff ?? "",
    // Created By is auto-detected from the logged-in user by the parent
    // page on save — there's no form field for it anymore (2026-07-28,
    // Wence). Left blank here; BariTrackerPage.handleSaveCase overwrites it.
    createdBy: "",
    notes: "",
    insuranceProvider: "",
    authorizationNumber: "",
    provider: "",
    requestBy: "",
  };
}

function fromEditCase(editCase: BariCase): FormState {
  return { ...editCase, authStatus: editCase.authStatus ?? "" };
}

export function CaseModal({
  open,
  editCase,
  defaultCaseType,
  staffOptions,
  providerOptions,
  onAddProvider,
  onDeleteProvider,
  requestByOptions,
  onAddRequestBy,
  onDeleteRequestBy,
  onSave,
  onClose,
}: Props) {
  const [form, setForm] = useState<FormState>(
    editCase ? fromEditCase(editCase) : emptyCase(defaultCaseType, staffOptions[0]),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [manageProvidersOpen, setManageProvidersOpen] = useState(false);
  const [newProviderName, setNewProviderName] = useState("");
  const [manageRequestByOpen, setManageRequestByOpen] = useState(false);
  const [newRequestByName, setNewRequestByName] = useState("");

  useEffect(() => {
    if (open) {
      setForm(
        editCase ? fromEditCase(editCase) : emptyCase(defaultCaseType, staffOptions[0]),
      );
      setErrors({});
      setManageProvidersOpen(false);
      setNewProviderName("");
      setManageRequestByOpen(false);
      setNewRequestByName("");
      setTimeout(() => firstFieldRef.current?.focus(), 50);
    }
  }, [open, editCase, defaultCaseType]);

  // Keyboard: close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Must run unconditionally (before the `if (!open) return null` below) —
  // React hooks can't be called conditionally.
  const canEditLockedPatientId = useCanEditLockedPatientId();
  const hasRestrictedAccess = useHasRestrictedAccess();

  if (!open) return null;

  // Keep a removed requester visible while editing a case that already has
  // that saved value. Removing a dropdown choice must not erase historical
  // case data.
  const visibleRequestByOptions = Array.from(
    new Set([
      ...requestByOptions,
      ...(form.requestBy && !requestByOptions.includes(form.requestBy)
        ? [form.requestBy]
        : []),
    ]),
  );

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.patientId.trim()) errs.patientId = "Patient ID is required";
    if (!form.status) errs.status = "Status is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const ts = now();
    const status = form.status as CaseStatus;
    const precert = isPrecertType(form.caseType);
    // Auth Status only applies to Pre-Cert cases — cleared if the case
    // type is switched away from a Pre-Cert type.
    const authStatus =
      precert && form.authStatus ? (form.authStatus as AuthStatus) : undefined;
    // Provider (ordering physician) only applies to Pre-Cert cases —
    // cleared if the case type is switched away from a Pre-Cert type.
    const provider = precert && form.provider ? form.provider : undefined;
    // Request by only applies to Reverification cases — clear it when a case
    // is switched to any other type.
    const requestBy =
      form.caseType === "reverification" && form.requestBy
        ? form.requestBy
        : undefined;
    const isApproved =
      precert && (authStatus === "approved" || authStatus === "partial_approval");
    const newCase: BariCase = editCase
      ? {
          ...editCase,
          ...form,
          status,
          authStatus,
          provider,
          requestBy,
          updatedAt: ts,
          completedAt:
            (form.status === "completed" || isApproved) && !editCase.completedAt
              ? ts
              : editCase.completedAt,
          approvedAt: isApproved && !editCase.approvedAt ? ts : editCase.approvedAt,
        }
      : {
          id: generateId(),
          ...form,
          status,
          authStatus,
          provider,
          requestBy,
          createdAt: ts,
          updatedAt: ts,
          completedAt: form.status === "completed" || isApproved ? ts : undefined,
          approvedAt: isApproved ? ts : undefined,
        };
    onSave(newCase);
  }

  /** Once a case already has a Patient ID, that field is locked from further
   * edits — except Wence's own account, which can still correct it
   * (Wence, 2026-09-17: "only me can edit"). */
  const patientIdLocked = Boolean(
    editCase && editCase.patientId && editCase.patientId.trim() && !canEditLockedPatientId,
  );

  function field(
    label: string,
    key: keyof typeof form,
    type: "text" | "select" | "textarea" | "date" = "text",
    options?: { value: string; label: string }[],
  ) {
    const fieldId = `field-${String(key)}`;
    const locked = key === "patientId" && patientIdLocked;
    return (
      <div>
        <label
          htmlFor={fieldId}
          className="block text-xs font-medium text-muted-foreground mb-1"
        >
          {label}
          {locked && (
            <span
              className="ml-1 text-[10px] text-muted-foreground/70"
              title="Patient ID is locked once set and cannot be changed"
            >
              🔒
            </span>
          )}
          {key === "patientId" && hasRestrictedAccess && editCase?._id && (
            <PatientIdHistoryButton caseId={editCase._id} />
          )}
        </label>
        {type === "select" ? (
          <select
            id={fieldId}
            value={String(form[key])}
            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            className={`w-full bg-card border ${errors[key as string] ? "border-rose-500" : "border-input"} text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
          >
            {options?.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : type === "textarea" ? (
          <textarea
            id={fieldId}
            value={String(form[key])}
            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            rows={2}
            className="w-full bg-card border border-input text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
          />
        ) : (
          <input
            id={fieldId}
            ref={key === "patientId" ? firstFieldRef : undefined}
            type={type === "date" ? "date" : "text"}
            value={String(form[key] ?? "")}
            onChange={e => {
              if (locked) return;
              setForm(f => ({ ...f, [key]: e.target.value }));
            }}
            readOnly={locked}
            disabled={locked}
            title={locked ? "Patient ID is locked once set and cannot be changed" : undefined}
            className={`w-full bg-card border ${errors[key as string] ? "border-rose-500" : "border-input"} text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${locked ? "opacity-70 cursor-not-allowed" : ""}`}
          />
        )}
        {errors[key as string] && (
          <p className="text-rose-700 text-[11px] mt-1">
            {errors[key as string]}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editCase ? "Edit Case" : "Add New Case"}
    >
      {/* Backdrop */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Close modal"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") onClose();
        }}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-bold text-foreground text-base">
            {editCase ? "Edit Case" : "Add New Case"}
          </h2>
          <button
            onClick={onClose}
            className="size-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="p-6 space-y-4 max-h-[70vh] overflow-y-auto"
        >
          <div className="grid grid-cols-2 gap-4">
            {field("Patient ID *", "patientId")}
            {field("DOS (Date of Service)", "dos", "date")}
            {field("Expiration Date", "expirationDate", "date")}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {field("Case Type", "caseType", "select", CASE_TYPE_OPTIONS)}
            {field("Status", "status", "select", STATUS_OPTIONS)}
          </div>

          {form.caseType === "reverification" && (
            <div className="max-w-[calc(50%-0.5rem)]">
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="field-requestBy"
                  className="block text-xs font-medium text-muted-foreground"
                >
                  Request by
                </label>
                <button
                  type="button"
                  onClick={() => setManageRequestByOpen(o => !o)}
                  className="text-[11px] text-primary hover:underline"
                >
                  Manage
                </button>
              </div>
              <select
                id="field-requestBy"
                value={form.requestBy ?? ""}
                onChange={e => setForm(f => ({ ...f, requestBy: e.target.value }))}
                className="w-full bg-card border border-input text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="">Select...</option>
                {visibleRequestByOptions.map(name => (
                  <option key={name} value={name}>
                    {name}
                    {!requestByOptions.includes(name) ? " (saved)" : ""}
                  </option>
                ))}
              </select>

              {manageRequestByOpen && (
                <div className="mt-2 p-2 rounded-lg border border-border bg-muted space-y-1.5">
                  {requestByOptions.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      No requester names yet.
                    </p>
                  )}
                  {requestByOptions.map(name => (
                    <div
                      key={name}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-foreground">{name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteRequestBy(name);
                          // Keep an existing case's saved value intact. For a
                          // new case, remove the choice from the unsaved form.
                          if (!editCase && form.requestBy === name) {
                            setForm(f => ({ ...f, requestBy: "" }));
                          }
                        }}
                        className="text-rose-700 hover:underline"
                        aria-label={`Remove ${name}`}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5 pt-1">
                    <input
                      type="text"
                      value={newRequestByName}
                      onChange={e => setNewRequestByName(e.target.value)}
                      placeholder="Add requester name"
                      className="flex-1 bg-card border border-input text-foreground rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const trimmed = newRequestByName.trim();
                          if (trimmed) {
                            onAddRequestBy(trimmed);
                            setNewRequestByName("");
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = newRequestByName.trim();
                        if (trimmed) {
                          onAddRequestBy(trimmed);
                          setNewRequestByName("");
                        }
                      }}
                      className="px-2 py-1 rounded-md text-xs font-medium bg-primary text-white hover:bg-primary/90"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isPrecertType(form.caseType) && (
            <div className="grid grid-cols-2 gap-4">
              {field("Auth Status", "authStatus", "select", AUTH_STATUS_OPTIONS)}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="field-provider"
                    className="block text-xs font-medium text-muted-foreground"
                  >
                    Provider
                  </label>
                  <button
                    type="button"
                    onClick={() => setManageProvidersOpen(o => !o)}
                    className="text-[11px] text-primary hover:underline"
                  >
                    Manage
                  </button>
                </div>
                <select
                  id="field-provider"
                  value={form.provider ?? ""}
                  onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                  className="w-full bg-card border border-input text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="">Select...</option>
                  {providerOptions.map(p => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>

                {manageProvidersOpen && (
                  <div className="mt-2 p-2 rounded-lg border border-border bg-muted space-y-1.5">
                    {providerOptions.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">No providers yet.</p>
                    )}
                    {providerOptions.map(p => (
                      <div key={p} className="flex items-center justify-between text-xs">
                        <span className="text-foreground">{p}</span>
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteProvider(p);
                            if (form.provider === p) {
                              setForm(f => ({ ...f, provider: "" }));
                            }
                          }}
                          className="text-rose-700 hover:underline"
                          aria-label={`Remove ${p}`}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center gap-1.5 pt-1">
                      <input
                        type="text"
                        value={newProviderName}
                        onChange={e => setNewProviderName(e.target.value)}
                        placeholder="Add new provider (e.g. Dr. Smith)"
                        className="flex-1 bg-card border border-input text-foreground rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const trimmed = newProviderName.trim();
                            if (trimmed) {
                              onAddProvider(trimmed);
                              setNewProviderName("");
                            }
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = newProviderName.trim();
                          if (trimmed) {
                            onAddProvider(trimmed);
                            setNewProviderName("");
                          }
                        }}
                        className="px-2 py-1 rounded-md text-xs font-medium bg-primary text-white hover:bg-primary/90"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {field("Priority", "priority", "select", [
              { value: "urgent", label: "🔴 Urgent" },
              { value: "high", label: "🟠 High" },
              { value: "standard", label: "Standard" },
            ])}
            {field(
              "Assigned To",
              "assignedTo",
              "select",
              staffOptions.map(s => ({ value: s, label: s })),
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {field("Insurance Provider", "insuranceProvider")}
            {field("Authorization #", "authorizationNumber")}
          </div>

          {field("Notes", "notes", "textarea")}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={e => handleSubmit(e as unknown as React.FormEvent)}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-primary hover:bg-primary text-white transition-colors"
          >
            {editCase ? "Save Changes" : "Add Case"}
          </button>
        </div>
      </div>
    </div>
  );
}
