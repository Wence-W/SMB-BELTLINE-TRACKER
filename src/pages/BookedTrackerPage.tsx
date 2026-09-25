import { useState } from 'react';

const appointments = [
  { id: 1, status: 'Pending', source: 'SMB', patientId: 'P-1001', scheduler: 'Wendy', appointmentDate: '2026-09-30T09:30', type: 'Consult', service: 'Bariatric', location: 'Northside', provider: 'Dr. Adams' },
  { id: 2, status: 'Showed', source: 'Boost', patientId: 'P-1002', scheduler: 'Maya', appointmentDate: '2026-09-30T13:00', type: 'Follow Up', service: 'Veins', location: 'East Tower', provider: 'Dr. Stone' },
  { id: 3, status: 'No-Show', source: 'SMB', patientId: 'P-1003', scheduler: 'Chris', appointmentDate: '2026-10-01T10:15', type: 'Consult', service: 'General', location: 'West Campus', provider: 'Dr. Chen' },
];

export default function BookedTrackerPage() {
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = appointments.filter((item) => statusFilter === 'all' || item.status === statusFilter);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Booked Tracker</p>
        <h2 className="mt-1 text-3xl font-semibold">Appointments</h2>
      </header>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
          <option value="all">All statuses</option>
          <option value="Pending">Pending</option>
          <option value="Showed">Showed</option>
          <option value="No-Show">No-Show</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-800/70 text-slate-300">
            <tr>
              <th className="px-4 py-3">Patient ID</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Provider</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id} className="border-t border-slate-800">
                <td className="px-4 py-3">{item.patientId}</td>
                <td className="px-4 py-3">{item.source}</td>
                <td className="px-4 py-3">{item.status}</td>
                <td className="px-4 py-3">{new Date(item.appointmentDate).toLocaleString()}</td>
                <td className="px-4 py-3">{item.type}</td>
                <td className="px-4 py-3">{item.provider}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
