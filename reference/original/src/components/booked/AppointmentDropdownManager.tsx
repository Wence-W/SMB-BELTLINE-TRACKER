import { useMutation } from "convex/react";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "../../../convex/_generated/api";

interface Props {
  optionType: "scheduler" | "provider";
  options: readonly string[];
  location?: string;
  disabled?: boolean;
}

// This control is rendered only for admins. The Convex mutations enforce the
// same restriction, so calling them outside the UI is rejected as well.
export function AppointmentDropdownManager({
  optionType,
  options,
  location,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);
  const add = useMutation(api.appointmentOptions.add);
  const remove = useMutation(api.appointmentOptions.remove);
  const label = optionType === "scheduler" ? "Scheduler" : "Provider";
  const locationLabel = location ? ` — ${location}` : "";

  async function handleAdd() {
    const value = newValue.trim();
    if (!value) return;
    setSaving(true);
    try {
      await add({ optionType, value, ...(location ? { location } : {}) });
      setNewValue("");
      toast.success(`${label} added.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to add ${label.toLowerCase()}.`);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(value: string) {
    setSaving(true);
    try {
      await remove({ optionType, value, ...(location ? { location } : {}) });
      toast.success(`${label} removed from this dropdown.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to remove ${label.toLowerCase()}.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? "Select a clinic location first" : `Manage ${label.toLowerCase()} options`}
      >
        <Settings2 className="size-3.5" />
        <span className="sr-only">Manage {label} options</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage {label}s{locationLabel}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor={`${optionType}-option`}>Add {label}</Label>
            <div className="flex gap-2">
              <Input
                id={`${optionType}-option`}
                value={newValue}
                onChange={event => setNewValue(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleAdd();
                  }
                }}
                placeholder={`Enter ${label.toLowerCase()} name`}
              />
              <Button type="button" onClick={() => void handleAdd()} disabled={saving || !newValue.trim()}>
                <Plus className="mr-1 size-4" />
                Add
              </Button>
            </div>
          </div>

          <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-2">
            {options.length > 0 ? (
              options.map(option => (
                <div key={option} className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-sm">
                  <span className="min-w-0 break-words">{option}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-destructive hover:text-destructive"
                    onClick={() => void handleRemove(option)}
                    disabled={saving}
                  >
                    <Trash2 className="mr-1 size-3.5" />
                    Remove
                  </Button>
                </div>
              ))
            ) : (
              <p className="px-2 py-3 text-sm text-muted-foreground">No {label.toLowerCase()}s yet.</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
