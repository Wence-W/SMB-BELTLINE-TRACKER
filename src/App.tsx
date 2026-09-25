import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import CasesPage from './pages/CasesPage';
import IntakePage from './pages/IntakePage';
import BookedTrackerPage from './pages/BookedTrackerPage';
import BillingPage from './pages/BillingPage';
import CallAuditsPage from './pages/CallAuditsPage';
import VerificationPage from './pages/VerificationPage';
import HistoryPage from './pages/HistoryPage';
import type { User } from './lib/types';

const API_URL = '/api';

type AuthContextValue = {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getStoredToken() {
  return window.localStorage.getItem('smb_tracker_token');
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${input}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Request failed');
  }

  return response.json() as Promise<T>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const currentToken = getStoredToken();
    if (!currentToken) {
      setLoading(false);
      return;
    }

    fetchJson<{ user: User }>('/auth/me', {
      headers: { Authorization: `Bearer ${currentToken}` },
    })
      .then(({ user }) => setUser(user))
      .catch(() => {
        window.localStorage.removeItem('smb_tracker_token');
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const result = await fetchJson<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    window.localStorage.setItem('smb_tracker_token', result.token);
    setToken(result.token);
    setUser(result.user);
  };

  const logout = () => {
    if (token) {
      fetchJson('/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }

    window.localStorage.removeItem('smb_tracker_token');
    setToken(null);
    setUser(null);
  };

  const value = useMemo<AuthContextValue>(() => ({ user, token, login, logout, loading }), [user, token, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-300">Checking session...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

function AppShell() {
  const { user, logout } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      return;
    }

    const client = io({ extraHeaders: { Authorization: `Bearer ${token}` } });
    setSocket(client);

    return () => {
      client.disconnect();
    };
  }, [user]);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="w-72 border-r border-slate-800 bg-slate-950/80 p-4">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-sky-400">Operations</p>
            <h1 className="mt-1 text-xl font-semibold">SMB Beltline</h1>
          </div>
        </div>

        <nav className="space-y-2 text-sm">
          <NavLink to="/dashboard" label="Dashboard" />
          <NavLink to="/cases" label="Cases" />
          <NavLink to="/call-audits" label="Call Audits" />
          <NavLink to="/intake" label="Intake" />
          <NavLink to="/booked-tracker" label="Booked Tracker" />
          <NavLink to="/billing" label="Billing" />
          <NavLink to="/history" label="Historical Activity" />
          <NavLink to="/verification" label="Verification" />
        </nav>

        <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Signed in</p>
          <p className="mt-2 font-medium">{user?.name ?? 'Staff User'}</p>
          <p className="text-xs text-slate-400">{user?.role ?? 'ops'}</p>
          <button
            onClick={logout}
            className="mt-4 w-full rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
          >
            Log out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-6">
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/cases" element={<CasesPage />} />
          <Route path="/intake" element={<IntakePage />} />
          <Route path="/booked-tracker" element={<BookedTrackerPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/call-audits" element={<CallAuditsPage />} />
          <Route path="/verification" element={<VerificationPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function NavLink({ to, label }: { to: string; label: string }) {
  const location = useLocation();
  const active = location.pathname === to;

  return (
    <a
      href={to}
      onClick={(event) => {
        event.preventDefault();
        window.location.assign(to);
      }}
      className={`block rounded-lg px-3 py-2 transition ${
        active ? 'bg-sky-600/20 text-sky-200 ring-1 ring-sky-500/30' : 'text-slate-300 hover:bg-slate-800'
      }`}
    >
      {label}
    </a>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<ProtectedRoute><AppShell /></ProtectedRoute>} />
      </Routes>
    </AuthProvider>
  );
}
