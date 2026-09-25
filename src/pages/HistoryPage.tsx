const archiveRows = [
  { date: '2026-09-21', team: 'Intake', summary: 'Daily productivity report completed', result: 'Archive' },
  { date: '2026-09-20', team: 'Verification', summary: 'Urgent pre-auth review processed', result: 'Archive' },
  { date: '2026-09-19', team: 'Billing', summary: 'Claim batch processed', result: 'Archive' },
];

export default function HistoryPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Historical Activity</p>
        <h2 className="mt-1 text-3xl font-semibold">Read-only team archive</h2>
      </header>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-800/70 text-slate-300">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Summary</th>
              <th className="px-4 py-3">Result</th>
            </tr>
          </thead>
          <tbody>
            {archiveRows.map((row) => (
              <tr key={`${row.date}-${row.team}`} className="border-t border-slate-800">
                <td className="px-4 py-3">{row.date}</td>
                <td className="px-4 py-3">{row.team}</td>
                <td className="px-4 py-3">{row.summary}</td>
                <td className="px-4 py-3">{row.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
