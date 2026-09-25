export type User = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff' | 'auditor';
};

export type CaseStatus = 'new' | 'in_progress' | 'completed' | 'on_hold' | 'reassigned' | 'cancelled';
export type AuthorizationStatus = 'pending_pre_auth' | 'approved' | 'partial_approval' | 'denied' | 'peer_to_peer' | 'appeal' | 'pending_pred' | 'cancelled';
export type Priority = 'urgent' | 'high' | 'standard';

export type TrackerCase = {
  id: string;
  patientId: string;
  caseType: string;
  workflowStatus: CaseStatus;
  authorizationStatus: AuthorizationStatus;
  priority: Priority;
  assignee: string;
  createdAt: string;
};

export function mapQaState(reviewed: boolean | undefined, audited: boolean | undefined) {
  if (audited) return 'Audited';
  if (reviewed) return 'In Progress';
  return 'Not Audited';
}

export function computeIntakeTotals(entries: Array<{ category: string; quantity: number }>) {
  return entries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.category] = (acc[entry.category] ?? 0) + Number(entry.quantity || 0);
    return acc;
  }, {});
}

export function applyCaseFilters(cases: TrackerCase[], filters: Record<string, string>) {
  return cases.filter((item) => {
    const matchesStatus = filters.workflowStatus === 'all' || item.workflowStatus === filters.workflowStatus;
    const matchesAuth = filters.authStatus === 'all' || item.authorizationStatus === filters.authStatus;
    const matchesPriority = filters.priority === 'all' || item.priority === filters.priority;
    const matchesStaff = filters.staff === 'all' || item.assignee === filters.staff;
    return matchesStatus && matchesAuth && matchesPriority && matchesStaff;
  });
}

export function computeDailyProductivity(rows: Array<{ day: string; weekday: string; total: number }>) {
  return rows.filter((row) => row.weekday !== 'Saturday' && row.weekday !== 'Sunday' && row.total > 0);
}
