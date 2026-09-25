import { useEffect, useState } from 'react';

const emptyFilters = {
  workflowStatus: 'all',
  authStatus: 'all',
  priority: 'all',
  staff: 'all',
};

export default function CasesPage() {
  const [cases, setCases] = useState<any[]>([]);
  const [filters, setFilters] = useState(emptyFilters);

  useEffect(() => {
    fetch('/api/cases')
      .then((res) => res.json())
      .then((payload) => setCases(payload.cases ?? []))
      .catch(() => setCases([]));
  }, []);

  const visibleCases = cases.filter((item) => {
    const matchesStatus = filters.workflowStatus === 'all' || item.workflowStatus === filters.workflowStatus;
    const matchesAuth = filters.authStatus === 'all' || item.authorizationStatus === filters.authStatus;
    const matchesPriority = filters.priority === 'all' || item.priority === filters.priority;
    const matchesStaff = filters.staff === 'all' || item.assignee === filters.staff;
    return matchesStatus && matchesAuth && matchesPriority && matchesStaff;
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Cases</p>
          <h2 className="mt-1 text-3xl font-semibold">Case management</h2>
        </div>
      </header>

      <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 md:grid-cols-5">
        <select value={filters.workflowStatus} onChange={(e) => setFilters({ ...filters, workflowStatus: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        <select value={filters.authStatus} onChange={(e) => setFilters({ ...filters, authStatus: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
          <option value="all">All auth</option>
          <option value="pending_pre_auth">Pending Pre-Auth</option>
          <option value="approved">Approved</option>
          <option value="partial_approval">Partial Approval</option>
        </select>
        <select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
          <option value="all">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="standard">Standard</option>
        </select>
        <select value={filters.staff} onChange={(e) => setFilters({ ...filters, staff: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
          <option value="all">All staff</option>
          <option value="Wendy">Wendy</option>
          <option value="Maya">Maya</option>
          <option value="Chris">Chris</option>
        </select>
        <button onClick={() => setFilters(emptyFilters)} className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-medium hover:bg-slate-700">Reset filters</button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-800/70 text-slate-300">
            <tr>
              <th className="px-4 py-3">Patient ID</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Auth</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Assignee</th>
            </tr>
          </thead>
          <tbody>
            {visibleCases.map((item) => (
              <tr key={item.id} className="border-t border-slate-800 hover:bg-slate-800/40">
                <td className="px-4 py-3">{item.patientId}</td>
                <td className="px-4 py-3">{item.caseType}</td>
                <td className="px-4 py-3">{item.workflowStatus}</td>
                <td className="px-4 py-3">{item.authorizationStatus}</td>
                <td className="px-4 py-3">{item.priority}</td>
                <td className="px-4 py-3">{item.assignee}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
