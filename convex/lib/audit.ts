import type { GenericDatabaseWriter } from "convex/server";
import type { Change } from "convex-helpers/server/triggers";
import type { DataModel, Id, TableNames } from "../_generated/dataModel";
import { nowIso } from "./time";

// Tables whose every write is audited. Module phases append their tables here
// (cases, intakeEntries, appointments, callAudits, ...). auditLog itself and
// devOutbox are deliberately excluded; auth tables are written by Convex Auth's
// own internal functions, outside these wrappers.
export const AUDITED_TABLES = [
  "people",
  "roles",
  // Phase 1
  "clinicWidgets",
  "clinicProviders",
  "departmentWidgets",
  "departmentMembers",
  "precertProviders",
  "reverificationRequesters",
  "piedmontEpicProviders",
  "appointmentDropdownOptions",
  // Phase 2
  "billingEntries",
  "intakeDailyMetrics",
  // Phase 3
  "intakeEntries",
  "piedmontEpicReferrals",
  "intakeReportExclusions",
] as const satisfies readonly TableNames[];

const SYSTEM_FIELDS = new Set(["_id", "_creationTime"]);

/** Names of the fields that differ between two versions of a document. */
export function changedFieldNames(
  oldDoc: Record<string, unknown> | null,
  newDoc: Record<string, unknown> | null,
): string[] {
  const keys = new Set([...Object.keys(oldDoc ?? {}), ...Object.keys(newDoc ?? {})]);
  const changed: string[] = [];
  for (const key of keys) {
    if (SYSTEM_FIELDS.has(key)) continue;
    if (JSON.stringify(oldDoc?.[key]) !== JSON.stringify(newDoc?.[key])) changed.push(key);
  }
  return changed.sort();
}

export async function writeAuditForChange<T extends TableNames>(
  db: GenericDatabaseWriter<DataModel>,
  actorUserId: Id<"users"> | undefined,
  table: T,
  change: Change<DataModel, T>,
): Promise<void> {
  await db.insert("auditLog", {
    actorUserId,
    action: change.operation,
    table,
    docId: change.id,
    // Field names only: values never enter the audit log.
    fields: changedFieldNames(change.oldDoc, change.newDoc),
    at: nowIso(),
  });
}

/**
 * Explicit audit entry for access that isn't a document write: exports,
 * Patient ID history views, recording plays (plan SEC-07). Callers pass field
 * names or a scope label, never values.
 */
export async function logAccess(
  db: GenericDatabaseWriter<DataModel>,
  actorUserId: Id<"users">,
  entry: { action: string; table: string; docId?: string; fields?: string[] },
): Promise<void> {
  await db.insert("auditLog", {
    actorUserId,
    action: entry.action,
    table: entry.table,
    docId: entry.docId,
    fields: entry.fields ?? [],
    at: nowIso(),
  });
}
