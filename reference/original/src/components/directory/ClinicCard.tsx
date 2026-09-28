import { useMutation } from "convex/react";
import { FileText, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

type Clinic = Doc<"clinicWidgets"> & { providers: Doc<"clinicProviders">[] };

export function ClinicCard({ clinic }: { clinic: Clinic }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(clinic.name);
  const [address, setAddress] = useState(clinic.address);
  const [fax, setFax] = useState(clinic.fax);
  const [providerDrafts, setProviderDrafts] = useState<Record<string, string>>({});
  const [newProvider, setNewProvider] = useState("");
  const [saving, setSaving] = useState(false);

  const updateClinicInfo = useMutation(api.intakeDirectory.updateClinicInfo);
  const addProvider = useMutation(api.intakeDirectory.addClinicProvider);
  const updateProvider = useMutation(api.intakeDirectory.updateClinicProvider);
  const removeProvider = useMutation(api.intakeDirectory.removeClinicProvider);

  function startEdit() {
    setName(clinic.name);
    setAddress(clinic.address);
    setFax(clinic.fax);
    setProviderDrafts(
      Object.fromEntries(clinic.providers.map(p => [p._id, p.providerName])),
    );
    setNewProvider("");
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateClinicInfo({ id: clinic._id, name, address, fax });
      for (const p of clinic.providers) {
        const draft = providerDrafts[p._id];
        if (draft !== undefined && draft.trim() && draft.trim() !== p.providerName) {
          await updateProvider({ id: p._id, providerName: draft.trim() });
        }
      }
      if (newProvider.trim()) {
        await addProvider({ clinicId: clinic._id, providerName: newProvider.trim() });
        setNewProvider("");
      }
      toast.success(`${name || clinic.name} updated`);
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveProvider(id: Id<"clinicProviders">, providerName: string) {
    try {
      await removeProvider({ id });
      toast.success(`${providerName} removed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove provider");
    }
  }

  return (
    <Card className="gap-3">
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-2">
          {editing ? (
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              className="text-base font-semibold h-8"
            />
          ) : (
            <CardTitle className="text-base uppercase tracking-wide">
              {clinic.name}
            </CardTitle>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label={editing ? "Cancel editing" : `Edit ${clinic.name}`}
            onClick={() => (editing ? setEditing(false) : startEdit())}
          >
            {editing ? <X className="size-4" /> : <Pencil className="size-3.5" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {editing ? (
          <div className="space-y-2">
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Address</span>
              <Input value={address} onChange={e => setAddress(e.target.value)} />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Fax</span>
              <Input value={fax} onChange={e => setFax(e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="space-y-1 text-sm text-muted-foreground">
            <p className="flex items-start gap-1.5">
              <MapPin className="size-3.5 mt-0.5 shrink-0" />
              <span>{clinic.address}</span>
            </p>
            <p className="flex items-center gap-1.5">
              <FileText className="size-3.5 shrink-0" />
              <span>Fax: {clinic.fax}</span>
            </p>
          </div>
        )}

        <div className="space-y-1.5 pt-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Providers
          </p>
          <ul className="space-y-1">
            {clinic.providers.map(p =>
              editing ? (
                <li key={p._id} className="flex items-center gap-1.5">
                  <Input
                    value={providerDrafts[p._id] ?? p.providerName}
                    onChange={e =>
                      setProviderDrafts(d => ({ ...d, [p._id]: e.target.value }))
                    }
                    className="h-8 text-sm"
                  />
                  <button
                    onClick={() => handleRemoveProvider(p._id, p.providerName)}
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    aria-label={`Remove ${p.providerName}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ) : (
                <li key={p._id} className="text-sm">
                  {p.providerName}
                </li>
              ),
            )}
          </ul>
          {editing && (
            <div className="flex items-center gap-1.5 pt-1">
              <Input
                value={newProvider}
                onChange={e => setNewProvider(e.target.value)}
                placeholder="Add provider"
                className="h-8 text-sm"
              />
              <Plus className="size-3.5 text-muted-foreground shrink-0" />
            </div>
          )}
        </div>

        {editing && (
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
