import { useMutation, useQuery } from "convex/react";
import { useEffect } from "react";
import { toast } from "sonner";
import { ClinicCard } from "@/components/directory/ClinicCard";
import { DepartmentCard } from "@/components/directory/DepartmentCard";
import { ManageStaffPanel } from "@/components/productivity/ManageStaffPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHasRestrictedAccess } from "@/lib/permissions";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function DirectoryPage() {
  const clinics = useQuery(api.intakeDirectory.listClinics);
  const departments = useQuery(api.intakeDirectory.listDepartments);
  const seedClinics = useMutation(api.intakeDirectory.seedClinicDefaults);
  const seedDepartments = useMutation(api.intakeDirectory.seedDepartmentDefaults);

  const intakeStaff = useQuery(api.intake.listStaff);
  const addStaffMut = useMutation(api.intake.addStaff);
  const deleteStaffMut = useMutation(api.intake.deleteStaff);
  const canManageRestricted = useHasRestrictedAccess();

  useEffect(() => {
    if (clinics !== undefined && clinics.length === 0) void seedClinics({});
  }, [clinics, seedClinics]);

  useEffect(() => {
    if (departments !== undefined && departments.length === 0) void seedDepartments({});
  }, [departments, seedDepartments]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          Intake Directory
        </h1>
        <p className="text-muted-foreground mt-1">
          Quick-reference clinic and department info for Intake Specialists
        </p>
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
          <ManageStaffPanel
            title="Intake Team Staff"
            staffList={intakeStaff ?? []}
            canManage={canManageRestricted}
            showEmail={false}
            onAddStaff={(name, email) =>
              addStaffMut({ name, email }).catch(() => toast.error("Failed to add staff"))
            }
            onDeleteStaff={s =>
              deleteStaffMut({ _id: s._id as Id<"intakeStaff"> }).catch(() =>
                toast.error("Failed to remove staff"),
              )
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
