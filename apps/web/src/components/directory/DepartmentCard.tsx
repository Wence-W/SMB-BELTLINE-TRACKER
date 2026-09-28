import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Hash, Pencil, Phone, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/errors";

type Department = Doc<"departmentWidgets"> & { members: Doc<"departmentMembers">[] };

type MemberDraft = { memberName: string; locationTag: string; assignment: string };

function displayMember(m: Doc<"departmentMembers">) {
  const prefix = m.locationTag ? `(${m.locationTag}) ` : "";
  const suffix = m.assignment ? ` — ${m.assignment}` : "";
  return `${prefix}${m.memberName}${suffix}`;
}

export function DepartmentCard({ department }: { department: Department }) {
  const hasContactInfo =
    department.extension !== undefined ||
    department.slackChannel !== undefined ||
    department.name === "Front Office" ||
    department.name === "Medical Assistant";
  const showAssignment = department.name === "Patient Navigator";
  const showLocationTag = department.name === "Front Office" || department.name === "Medical Assistant";

  const [editing, setEditing] = useState(false);
  const [extension, setExtension] = useState(department.extension ?? "");
  const [slackChannel, setSlackChannel] = useState(department.slackChannel ?? "");
  const [drafts, setDrafts] = useState<Record<string, MemberDraft>>({});
  const [newMember, setNewMember] = useState<MemberDraft>({
    memberName: "",
    locationTag: "",
    assignment: "",
  });
  const [saving, setSaving] = useState(false);

  const updateDepartmentInfo = useMutation(api.directory.updateDepartmentInfo);
  const addMember = useMutation(api.directory.addDepartmentMember);
  const updateMember = useMutation(api.directory.updateDepartmentMember);
  const removeMember = useMutation(api.directory.removeDepartmentMember);

  function startEdit() {
    setExtension(department.extension ?? "");
    setSlackChannel(department.slackChannel ?? "");
    setDrafts(
      Object.fromEntries(
        department.members.map(m => [
          m._id,
          {
            memberName: m.memberName,
            locationTag: m.locationTag ?? "",
            assignment: m.assignment ?? "",
          },
        ]),
      ),
    );
    setNewMember({ memberName: "", locationTag: "", assignment: "" });
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (hasContactInfo) {
        await updateDepartmentInfo({ id: department._id, extension, slackChannel });
      }
      for (const m of department.members) {
        const draft = drafts[m._id];
        if (!draft) continue;
        const changed =
          draft.memberName.trim() !== m.memberName ||
          draft.locationTag.trim() !== (m.locationTag ?? "") ||
          draft.assignment.trim() !== (m.assignment ?? "");
        if (changed && draft.memberName.trim()) {
          await updateMember({
            id: m._id,
            memberName: draft.memberName,
            locationTag: draft.locationTag,
            assignment: draft.assignment,
          });
        }
      }
      if (newMember.memberName.trim()) {
        await addMember({
          departmentId: department._id,
          memberName: newMember.memberName,
          locationTag: newMember.locationTag || undefined,
          assignment: newMember.assignment || undefined,
        });
        setNewMember({ memberName: "", locationTag: "", assignment: "" });
      }
      toast.success(`${department.name} updated`);
      setEditing(false);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to save changes"));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: Id<"departmentMembers">, memberName: string) {
    try {
      await removeMember({ id });
      toast.success(`${memberName} removed`);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to remove"));
    }
  }

  return (
    <Card className="gap-3">
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base uppercase tracking-wide">{department.name}</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label={editing ? "Cancel editing" : `Edit ${department.name}`}
            onClick={() => (editing ? setEditing(false) : startEdit())}
          >
            {editing ? <X className="size-4" /> : <Pencil className="size-3.5" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasContactInfo && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contact Information</p>
            {editing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Extension</span>
                  <Input value={extension} onChange={e => setExtension(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Slack channel</span>
                  <Input
                    value={slackChannel}
                    onChange={e => setSlackChannel(e.target.value)}
                    className="h-8 text-sm"
                    placeholder="e.g. fo-smb"
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {department.extension && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="size-3.5" />
                    Ext. {department.extension}
                  </span>
                )}
                {department.slackChannel && (
                  <span className="flex items-center gap-1.5">
                    <Hash className="size-3.5" />
                    {department.slackChannel.replace(/^#/, "")}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Staff</p>
          <ul className="space-y-1">
            {department.members.map(m =>
              editing ? (
                <li key={m._id} className="flex flex-wrap items-center gap-1.5">
                  {showLocationTag && (
                    <Input
                      value={drafts[m._id]?.locationTag ?? ""}
                      onChange={e =>
                        setDrafts(d => ({
                          ...d,
                          [m._id]: {
                            ...(d[m._id] ?? {
                              memberName: m.memberName,
                              locationTag: "",
                              assignment: "",
                            }),
                            locationTag: e.target.value,
                          },
                        }))
                      }
                      placeholder="Location"
                      className="h-8 text-sm w-28"
                    />
                  )}
                  <Input
                    value={drafts[m._id]?.memberName ?? m.memberName}
                    onChange={e =>
                      setDrafts(d => ({
                        ...d,
                        [m._id]: {
                          ...(d[m._id] ?? {
                            memberName: m.memberName,
                            locationTag: m.locationTag ?? "",
                            assignment: m.assignment ?? "",
                          }),
                          memberName: e.target.value,
                        },
                      }))
                    }
                    className="h-8 text-sm flex-1 min-w-[120px]"
                  />
                  {showAssignment && (
                    <Input
                      value={drafts[m._id]?.assignment ?? ""}
                      onChange={e =>
                        setDrafts(d => ({
                          ...d,
                          [m._id]: {
                            ...(d[m._id] ?? {
                              memberName: m.memberName,
                              locationTag: "",
                              assignment: "",
                            }),
                            assignment: e.target.value,
                          },
                        }))
                      }
                      placeholder="Assignment"
                      className="h-8 text-sm flex-1 min-w-[140px]"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(m._id, m.memberName)}
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    aria-label={`Remove ${m.memberName}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ) : (
                <li key={m._id} className="text-sm">
                  {displayMember(m)}
                </li>
              ),
            )}
          </ul>
          {editing && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {showLocationTag && (
                <Input
                  value={newMember.locationTag}
                  onChange={e => setNewMember(n => ({ ...n, locationTag: e.target.value }))}
                  placeholder="Location"
                  className="h-8 text-sm w-28"
                />
              )}
              <Input
                value={newMember.memberName}
                onChange={e => setNewMember(n => ({ ...n, memberName: e.target.value }))}
                placeholder="Add staff name"
                className="h-8 text-sm flex-1 min-w-[120px]"
              />
              {showAssignment && (
                <Input
                  value={newMember.assignment}
                  onChange={e => setNewMember(n => ({ ...n, assignment: e.target.value }))}
                  placeholder="Assignment"
                  className="h-8 text-sm flex-1 min-w-[140px]"
                />
              )}
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
