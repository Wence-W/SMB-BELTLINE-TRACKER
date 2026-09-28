// A team's staff roster, read from the unified people table (plan section
// 3.1). Replaces the original's per-team ManageStaffPanel name lists; changing
// membership is admin-only (D5). Removing someone keeps everything they logged.
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { Team } from "@convex/lib/enums";
import { useMutation, useQuery } from "convex/react";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsAdmin } from "@/lib/access";
import { errorMessage } from "@/lib/errors";

export function TeamRosterPanel({ team: teamKey, title, teamName }: { team: Team; title: string; teamName: string }) {
  const isAdmin = useIsAdmin();
  const team = useQuery(api.access.listTeam, { team: teamKey });
  // Only admins can see the full people list (to add someone to the team).
  const people = useQuery(api.access.listPeople, isAdmin ? {} : "skip");
  const setTeams = useMutation(api.access.setPersonTeams);
  const [adding, setAdding] = useState("");

  async function changeMembership(personId: Id<"people">, add: boolean) {
    const person = people?.find(p => p._id === personId);
    if (!person) return;
    const teams = add ? [...person.teams, teamKey] : person.teams.filter(t => t !== teamKey);
    try {
      await setTeams({ personId, teams });
      toast.success(`${person.displayName} ${add ? "added to" : "removed from"} ${teamName}`);
    } catch (err) {
      toast.error(errorMessage(err, add ? "Failed to add staff" : "Failed to remove staff"));
    }
  }

  const candidates = (people ?? []).filter(p => p.active && !p.teams.includes(teamKey));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {team === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : team.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one is on {teamName} yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {team.map(member => (
              <li key={member.personId} className="flex items-center justify-between py-2 text-sm">
                <span>{member.displayName}</span>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => void changeMembership(member.personId, false)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${member.displayName} from ${teamName}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {isAdmin && (
          <div className="flex items-center gap-2 pt-2">
            <select
              className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm"
              value={adding}
              onChange={e => setAdding(e.target.value)}
            >
              <option value="">Add someone to {teamName}…</option>
              {candidates.map(p => (
                <option key={p._id} value={p._id}>
                  {p.displayName}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={!adding}
              onClick={() => {
                void changeMembership(adding as Id<"people">, true);
                setAdding("");
              }}
            >
              Add
            </Button>
          </div>
        )}
        {isAdmin && (
          <p className="text-xs text-muted-foreground">New staff are set up under Admin → People &amp; access.</p>
        )}
        {/* Removing someone keeps everything they already logged. */}
      </CardContent>
    </Card>
  );
}
