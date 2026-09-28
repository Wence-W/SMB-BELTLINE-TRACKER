import { useMutation, useQuery } from "convex/react";
import { UserMinus, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function CallAuditRosterManager() {
  const roster = useQuery(api.callAudits.listRosterAdmin);
  const addMember = useMutation(api.callAudits.addRosterMember);
  const deactivateMember = useMutation(api.callAudits.deactivateRosterMember);
  const seedVerifiedRoster = useMutation(api.callAudits.seedVerifiedRoster);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!name.trim() || !email.trim() || saving) return;
    setSaving(true);
    try {
      await addMember({ name: name.trim(), userEmail: email.trim() });
      setName("");
      setEmail("");
      toast.success("Call Audit roster member added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add roster member");
    } finally {
      setSaving(false);
    }
  }

  async function handleSeedVerifiedRoster() {
    setSaving(true);
    try {
      const result = await seedVerifiedRoster({});
      toast.success(`${result.seeded} verified Call Audit roster members added`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not seed verified roster");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id: Id<"callAuditRoster">, memberName: string) {
    try {
      await deactivateMember({ id });
      toast.success(`${memberName} was removed from the active Call Audit roster`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update roster");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4 text-muted-foreground" />
          Call Audit roster
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Admin-only. Every name must be mapped to an existing SMB Beltline Tracker
          account so assigned-auditor permissions are verified by email.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {roster?.length === 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/30 p-3">
            <p className="text-sm text-muted-foreground">
              Add the eight previously verified VCA staff mappings first.
            </p>
            <Button size="sm" onClick={handleSeedVerifiedRoster} disabled={saving}>
              <Users />
              Seed verified roster
            </Button>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
          <Input
            value={name}
            placeholder="Roster name"
            onChange={event => setName(event.target.value)}
          />
          <Input
            value={email}
            type="email"
            placeholder="Existing Tracker email"
            onChange={event => setEmail(event.target.value)}
          />
          <Button onClick={handleAdd} disabled={saving || !name.trim() || !email.trim()}>
            <UserPlus />
            Add
          </Button>
        </div>
        <div className="space-y-1">
          {roster === undefined && (
            <p className="text-sm text-muted-foreground">Loading roster…</p>
          )}
          {roster?.map(member => (
            <div
              key={member._id}
              className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium">
                  {member.name}
                  {!member.active && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      Inactive
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{member.userEmail}</p>
              </div>
              {member.active && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDeactivate(member._id, member.name)}
                  aria-label={`Deactivate ${member.name}`}
                >
                  <UserMinus className="text-destructive" />
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
