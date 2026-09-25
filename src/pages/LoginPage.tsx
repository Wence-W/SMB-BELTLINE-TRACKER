import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Login failed');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl shadow-slate-950/50">
        <p className="text-xs uppercase tracking-[0.24em] text-sky-400">Tier 3 operations</p>
        <h1 className="mt-3 text-3xl font-semibold">SMB Beltline Tracker</h1>
        <p className="mt-2 text-sm text-slate-400">Authorized access only</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">Email</span>
            <input
              name="email"
              type="email"
              defaultValue="admin@smb.local"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-sky-500"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">Password</span>
            <input
              name="password"
              type="password"
              defaultValue="changeMe123!"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-sky-500"
            />
          </label>

          <button type="submit" className="w-full rounded-xl bg-sky-600 px-4 py-2.5 font-medium text-white hover:bg-sky-500">
            Sign in
          </button>
        </form>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
          This environment uses synthetic test credentials only and is not connected to production data.
        </div>
      </div>
    </div>
  );
}
