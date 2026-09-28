// Intake Directory, ported from the original DirectoryPage. Differences: no
// client-side seeding (defaults arrive with migrated data), and the Intake
// Team tab reads the unified people roster (plan section 3.1) instead of the
// separate intakeStaff name list.
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ClinicCard } from "@/components/directory/ClinicCard";
import { DepartmentCard } from "@/components/directory/DepartmentCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsAdmin } from "@/lib/access";
import { errorMessage } from "@/lib/errors";

function IntakeTeamPanel() {
  const isAdmin = useIsAdmin();
  const team = useQuery(api.access.listTeam, { team: "intake" });
  // Only admins can see the full people list (to add someone to the team).
  const people = useQuery(api.access.listPeople, isAdmin ? {} : "skip");
  const setTeams = useMutation(api.access.setPersonTeams);
  const [adding, setAdding] = useState("");

  async function changeMembership(personId: Id<"people">, add: boolean) {
    const person = people?.find(p => p._id === personId);
    if (!person) return;
    const teams = add ? [...person.teams, "intake" as const] : person.teams.filter(t => t !== "intake");
    try {
      await setTeams({ personId, teams });
      toast.success(`${person.displayName} ${add ? "added to" : "removed from"} the Intake Team`);
    } catch (err) {
      toast.error(errorMessage(err, add ? "Failed to add staff" : "Failed to remove staff"));
    }
  }

  const candidates = (people ?? []).filter(p => p.active && !p.teams.includes("intake"));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Intake Team Staff</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {team === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : team.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one is on the Intake Team yet.</p>
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
                    aria-label={`Remove ${member.displayName} from the Intake Team`}
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
              <option value="">Add someone to the Intake Team…</option>
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

export function DirectoryPage() {
  const clinics = useQuery(api.directory.listClinics);
  const departments = useQuery(api.directory.listDepartments);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Intake Directory</h1>
        <p className="text-muted-foreground mt-1">Quick-reference clinic and department info for Intake Specialists</p>
      </div>

      <Tabs defaultValue="clinic">
        <TabsList>
          <TabsTrigger value="clinic">Clinic</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="intake-team">Intake Team</TabsTrigger>
        </TabsList>

        <TabsContent value="clinic" className="space-y-4">
          {clinics === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {clinics.map(c => (
                <ClinicCard key={c._id} clinic={c} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="departments" className="space-y-4">
          {departments === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {departments.map(d => (
                <DepartmentCard key={d._id} department={d} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="intake-team" className="space-y-4">
          <IntakeTeamPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
