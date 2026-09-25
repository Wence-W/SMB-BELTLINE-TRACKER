import { useMemo, useState } from 'react';

const intakeCategories = ['Inbound', 'Outbound', 'Admin Task'];

const initialEntries = [
  { id: 1, staff: 'Maya', category: 'Inbound', result: 'Completed', quantity: 3 },
  { id: 2, staff: 'Chris', category: 'Outbound', result: 'Scheduled', quantity: 2 },
  { id: 3, staff: 'Wendy', category: 'Admin Task', result: 'Follow Up', quantity: 1 },
];

export default function IntakePage() {
  const [entries, setEntries] = useState(initialEntries);
  const [form, setForm] = useState({ category: 'Inbound', result: 'Completed', quantity: 1 });

  const totals = useMemo(() => {
    const sums = { Inbound: 0, Outbound: 0, 'Admin Task': 0 };
    entries.forEach((entry) => {
      sums[entry.category as keyof typeof sums] += Number(entry.quantity || 0);
    });
    return sums;
  }, [entries]);

  const addEntry = () => {
    setEntries((current) => [
      ...current,
      {
        id: Date.now(),
        staff: 'Current Staff',
        category: form.category,
        result: form.result,
        quantity: Number(form.quantity || 1),
      },
    ]);
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Intake</p>
        <h2 className="mt-1 text-3xl font-semibold">Activity reports & logs</h2>
      </header>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
            {intakeCategories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <input value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" placeholder="Result" />
          <input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value || 1) })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          <button onClick={addEntry} className="rounded-xl bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-500">Add log entry</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {Object.entries(totals).map(([key, value]) => (
          <div key={key} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-sm text-slate-400">{key}</p>
            <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-800/70 text-slate-300">
            <tr>
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Result</th>
              <th className="px-4 py-3">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t border-slate-800">
                <td className="px-4 py-3">{entry.staff}</td>
                <td className="px-4 py-3">{entry.category}</td>
                <td className="px-4 py-3">{entry.result}</td>
                <td className="px-4 py-3">{entry.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
