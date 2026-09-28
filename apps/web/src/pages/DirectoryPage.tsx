// Intake Directory, ported from the original DirectoryPage. Differences: no
// client-side seeding (defaults arrive with migrated data), and the Intake
// Team tab reads the unified people roster (plan section 3.1) instead of the
// separate intakeStaff name list.
import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { ClinicCard } from "@/components/directory/ClinicCard";
import { DepartmentCard } from "@/components/directory/DepartmentCard";
import { TeamRosterPanel } from "@/components/TeamRosterPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
          <TeamRosterPanel team="intake" title="Intake Team Staff" teamName="the Intake Team" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
