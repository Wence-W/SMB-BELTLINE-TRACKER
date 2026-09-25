import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const data = [
  { name: 'Mon', cases: 18, intakes: 36 },
  { name: 'Tue', cases: 24, intakes: 32 },
  { name: 'Wed', cases: 21, intakes: 41 },
  { name: 'Thu', cases: 29, intakes: 38 },
  { name: 'Fri', cases: 26, intakes: 44 },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Dashboard</p>
          <h2 className="mt-1 text-3xl font-semibold">Board overview</h2>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ['Open urgent', '14'],
          ['Expiring', '9'],
          ['Pending auth', '27'],
          ['Completed QA', '42'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-sm text-slate-400">{label}</p>
            <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-medium">Operational output</h3>
            <span className="rounded-full border border-sky-700/60 bg-sky-900/30 px-2 py-1 text-xs text-sky-200">This week</span>
          </div>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="cases" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                <Bar dataKey="intakes" fill="#34d399" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="text-lg font-medium">Processing queue</h3>
          <ul className="mt-4 space-y-3 text-sm text-slate-300">
            <li className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-3"><span>Urgent pre-auth cases</span><span className="font-semibold text-amber-300">8</span></li>
            <li className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-3"><span>High priority tasks</span><span className="font-semibold text-violet-300">5</span></li>
            <li className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-3"><span>Expiring dossiers</span><span className="font-semibold text-red-300">3</span></li>
            <li className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-3"><span>Pending audits</span><span className="font-semibold text-emerald-300">12</span></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
