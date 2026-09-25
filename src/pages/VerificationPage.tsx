const updates = [
  { author: 'Kara', time: '2026-09-25 11:00', text: 'Verification workflow updated to include same-day resubmission checks.' },
  { author: 'Derek', time: '2026-09-24 16:15', text: 'New SOP note: urgent cases require pre-auth review before scheduling.' },
];

export default function VerificationPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Verification</p>
        <h2 className="mt-1 text-3xl font-semibold">Workflow process & guidelines</h2>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="text-lg font-medium">Shared updates</h3>
          <div className="mt-4 space-y-3">
            {updates.map((update) => (
              <div key={`${update.author}-${update.time}`} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{update.author}</span>
                  <span>{update.time}</span>
                </div>
                <p className="mt-2 text-sm text-slate-200">{update.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="text-lg font-medium">Acknowledgements</h3>
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            <li className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">Kara acknowledged at 2026-09-25 10:41</li>
            <li className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">Derek acknowledged at 2026-09-24 14:10</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
