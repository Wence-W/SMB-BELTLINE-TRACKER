// App shell. Routes keep the original's URL scheme (/dashboard?tab=...,
// /settings) so bookmarks and muscle memory carry over; sidebar labels match
// the original sidebar. Modules appear here as their phases land.
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { BookOpen, History, ListChecks, LogOut, Settings, Users } from "lucide-react";
import { type ReactNode, useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import {
  ACCESS_MESSAGES,
  AccessBoundary,
  AuthCard,
  SetPasswordForm,
  SignInForm,
  useIdleSignOut,
} from "@/components/auth/AuthScreens";
import { Toaster } from "@/components/ui/sonner";
import { useIsAdmin, useMe } from "@/lib/access";
import { cn } from "@/lib/utils";
import { ListsPage } from "@/pages/admin/ListsPage";
import { PeoplePage } from "@/pages/admin/PeoplePage";
import { DirectoryPage } from "@/pages/DirectoryPage";
import { HistoricalActivityTab } from "@/pages/HistoricalActivityPage";
import { SettingsPage } from "@/pages/SettingsPage";

const DEFAULT_TAB = "directory";

type NavItem = { to: string; label: string; icon: ReactNode; indent?: boolean };

function NavLink({ item }: { item: NavItem }) {
  const location = useLocation();
  const [path, query] = item.to.split("?");
  const tab = new URLSearchParams(query ?? "").get("tab");
  const current =
    new URLSearchParams(location.search).get("tab") ?? (location.pathname === "/dashboard" ? DEFAULT_TAB : null);
  const active = location.pathname === path && (tab === null || tab === current);
  return (
    <Link
      to={item.to}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
        item.indent && "pl-8",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent",
      )}
    >
      {item.icon}
      {item.label}
    </Link>
  );
}

function Sidebar() {
  const me = useMe();
  const isAdmin = useIsAdmin();
  const { signOut } = useAuthActions();
  const items: NavItem[] = [
    { to: "/dashboard?tab=historical", label: "Historical Activity", icon: <History className="size-4" /> },
    { to: "/dashboard?tab=directory", label: "Intake Directory", icon: <BookOpen className="size-4" /> },
  ];
  const adminItems: NavItem[] = [
    { to: "/admin/people", label: "People & access", icon: <Users className="size-4" /> },
    { to: "/admin/lists", label: "Dropdown lists", icon: <ListChecks className="size-4" /> },
  ];
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-3">
      <div className="px-3 py-2 text-sm font-semibold">SMB Beltline Tracker</div>
      <nav className="mt-2 flex flex-1 flex-col gap-1">
        {items.map(item => (
          <NavLink key={item.to} item={item} />
        ))}
        {isAdmin && (
          <>
            <p className="mt-4 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Admin</p>
            {adminItems.map(item => (
              <NavLink key={item.to} item={item} />
            ))}
          </>
        )}
      </nav>
      <div className="border-t border-sidebar-border pt-2">
        <NavLink item={{ to: "/settings", label: "Settings", icon: <Settings className="size-4" /> }} />
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <LogOut className="size-4" />
          Sign out{me ? ` (${me.accountName ?? me.displayName})` : ""}
        </button>
      </div>
    </aside>
  );
}

function Dashboard() {
  const [params] = useSearchParams();
  const tab = params.get("tab") ?? DEFAULT_TAB;
  if (tab === "historical") return <HistoricalActivityTab />;
  if (tab === "directory") return <DirectoryPage />;
  return <p className="text-sm text-muted-foreground">This part of the tracker hasn't been rebuilt yet.</p>;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me === undefined) return null;
  return me.capabilities.includes("admin") ? children : <Navigate to="/dashboard" replace />;
}

function Shell() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-x-auto p-6">
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route
            path="/admin/people"
            element={
              <AdminOnly>
                <PeoplePage />
              </AdminOnly>
            }
          />
          <Route
            path="/admin/lists"
            element={
              <AdminOnly>
                <ListsPage />
              </AdminOnly>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function SignedIn() {
  const { signOut } = useAuthActions();
  return (
    <AccessBoundary
      fallback={code => (
        <AuthCard title="Access">
          <p className="text-sm text-slate-700">{ACCESS_MESSAGES[code ?? ""] ?? "Something went wrong."}</p>
          <button
            className="mt-4 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            type="button"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </AuthCard>
      )}
    >
      <Shell />
    </AccessBoundary>
  );
}

export function App() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const [settingPassword, setSettingPassword] = useState(false);
  useIdleSignOut(isAuthenticated);

  let content: ReactNode;
  if (isLoading) content = <AuthCard title="Loading…">{null}</AuthCard>;
  else if (!isAuthenticated) {
    content = settingPassword ? (
      <SetPasswordForm onDone={() => setSettingPassword(false)} />
    ) : (
      <SignInForm onSetPassword={() => setSettingPassword(true)} />
    );
  } else content = <SignedIn />;

  return (
    <BrowserRouter>
      {content}
      <Toaster />
    </BrowserRouter>
  );
}
