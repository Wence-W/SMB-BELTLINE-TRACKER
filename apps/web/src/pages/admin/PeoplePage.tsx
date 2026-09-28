// Admin → People & access: provisioning, teams, active status, capabilities.
// Replaces the original's hard-coded email allowlists. Every action is
// enforced (and audited) on the server; owner-only capabilities are refused
// there for non-owners.
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useIsOwner } from "@/lib/access";
import { errorMessage } from "@/lib/errors";

const TEAMS = ["verification", "intake", "billing"] as const;
const CAPABILITIES = [
  { value: "admin", label: "Admin" },
  { value: "call_audit_access", label: "Call Audits" },
  { value: "patient_id_override", label: "Patient ID override", ownerOnly: true },
  { value: "owner", label: "Owner", ownerOnly: true },
] as const;
type Team = (typeof TEAMS)[number];

function NewPersonForm() {
  const provision = useAction(api.provisioning.provisionPerson);
  const [teams, setTeams] = useState<Team[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center"
      onSubmit={async e => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        setBusy(true);
        try {
          await provision({
            displayName: String(data.get("displayName") ?? ""),
            email: String(data.get("email") ?? ""),
            teams,
          });
          toast.success("Account created. They set their password with “First time here?” on the sign-in page.");
          form.reset();
          setTeams([]);
        } catch (err) {
          toast.error(errorMessage(err, "Failed to create the account"));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input name="displayName" placeholder="Name (as shown in the tracker)" required />
      <Input name="email" type="email" placeholder="Work email" required />
      <div className="flex gap-3 text-sm">
        {TEAMS.map(team => (
          <label key={team} className="flex items-center gap-1 capitalize">
            <input
              type="checkbox"
              checked={teams.includes(team)}
              onChange={e => setTeams(prev => (e.target.checked ? [...prev, team] : prev.filter(t => t !== team)))}
            />
            {team}
          </label>
        ))}
      </div>
      <Button type="submit" size="sm" disabled={busy}>
        Add person
      </Button>
    </form>
  );
}

export function PeoplePage() {
  const people = useQuery(api.access.listPeople);
  const isOwner = useIsOwner();
  const setActive = useMutation(api.access.setPersonActive);
  const setTeams = useMutation(api.access.setPersonTeams);
  const grant = useMutation(api.access.grantCapability);
  const revoke = useMutation(api.access.revokeCapability);

  const run = (promise: Promise<unknown>, fallback: string) =>
    promise.catch(err => toast.error(errorMessage(err, fallback)));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">People &amp; access</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a person</CardTitle>
        </CardHeader>
        <CardContent>
          <NewPersonForm />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto pt-6">
          {people === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Name</th>
                  <th>Email</th>
                  <th>Teams</th>
                  <th>Access</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {people.map(person => (
                  <tr key={person._id} className={person.active ? "" : "opacity-50"}>
                    <td className="py-2 font-medium">{person.displayName}</td>
                    <td>{person.email}</td>
                    <td>
                      <div className="flex gap-2">
                        {TEAMS.map(team => (
                          <label key={team} className="flex items-center gap-1 capitalize">
                            <input
                              type="checkbox"
                              checked={person.teams.includes(team)}
                              onChange={e =>
                                void run(
                                  setTeams({
                                    personId: person._id,
                                    teams: e.target.checked
                                      ? [...person.teams, team]
                                      : person.teams.filter(t => t !== team),
                                  }),
                                  "Failed to update teams",
                                )
                              }
                            />
                            {team}
                          </label>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        {CAPABILITIES.filter(c => !("ownerOnly" in c) || isOwner).map(cap => (
                          <label key={cap.value} className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              disabled={!person.userId}
                              checked={person.capabilities.includes(cap.value)}
                              onChange={e => {
                                const args = { userId: person.userId as Id<"users">, capability: cap.value };
                                void run(e.target.checked ? grant(args) : revoke(args), "Failed to change access");
                              }}
                            />
                            {cap.label}
                          </label>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {person.verified ? "Verified" : "Awaiting password setup"}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void run(
                              setActive({ personId: person._id, active: !person.active }),
                              "Failed to update status",
                            )
                          }
                        >
                          {person.active ? "Deactivate" : "Reactivate"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
