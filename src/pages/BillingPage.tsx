const billingRows = [
  { category: 'New Claims', count: 18 },
  { category: 'A/R Aging', count: 12 },
  { category: 'Emails', count: 7 },
  { category: 'Boost Billing', count: 3 },
];

export default function BillingPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Billing</p>
        <h2 className="mt-1 text-3xl font-semibold">Activity log & reports</h2>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        {billingRows.map((row) => (
          <div key={row.category} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-sm text-slate-400">{row.category}</p>
            <p className="mt-3 text-3xl font-semibold text-white">{row.count}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-800/70 text-slate-300">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Count</th>
            </tr>
          </thead>
          <tbody>
            {billingRows.map((row) => (
              <tr key={row.category} className="border-t border-slate-800">
                <td className="px-4 py-3">2026-09-25</td>
                <td className="px-4 py-3">Maya</td>
                <td className="px-4 py-3">{row.category}</td>
                <td className="px-4 py-3">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
