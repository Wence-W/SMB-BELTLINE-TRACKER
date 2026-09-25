const auditRows = [
  { name: 'Verification call', auditor: 'Dana', status: 'In Progress', score: 84 },
  { name: 'Intake QA', auditor: 'Luis', status: 'Audited', score: 96 },
  { name: 'Billing review', auditor: 'Tara', status: 'Not Audited', score: null },
];

export default function CallAuditsPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Call Audits</p>
        <h2 className="mt-1 text-3xl font-semibold">Audit queue</h2>
      </header>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-800/70 text-slate-300">
            <tr>
              <th className="px-4 py-3">Audit</th>
              <th className="px-4 py-3">Auditor</th>
              <th className="px-4 py-3">QA State</th>
              <th className="px-4 py-3">Score</th>
            </tr>
          </thead>
          <tbody>
            {auditRows.map((row) => (
              <tr key={row.name} className="border-t border-slate-800">
                <td className="px-4 py-3">{row.name}</td>
                <td className="px-4 py-3">{row.auditor}</td>
                <td className="px-4 py-3">{row.status}</td>
                <td className="px-4 py-3">{row.score ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
