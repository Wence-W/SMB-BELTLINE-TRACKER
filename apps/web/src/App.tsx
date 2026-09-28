// Phase 0 shell: sign-in, password setup/reset by emailed code, and the
// signed-in account view. There is deliberately no sign-up screen (plan D4);
// the server rejects sign-up regardless. Module screens arrive from Phase 1.
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { Component, type ReactNode, useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";

const IDLE_SIGN_OUT_MS = 30 * 60 * 1000; // matches convex/auth.ts SESSION_IDLE_MS

const ACCESS_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Your session has ended. Please sign in again.",
  EMAIL_NOT_VERIFIED: "Finish setting your password with the emailed code to activate your account.",
  NOT_PROVISIONED: "This account isn't active in the tracker. Ask an admin to enable it.",
  FORBIDDEN: "You don't have access to this.",
};

function errorCode(error: unknown): string | undefined {
  return (error as { data?: { code?: string } } | null)?.data?.code;
}

class AccessBoundary extends Component<
  { children: ReactNode; fallback: (code?: string) => ReactNode },
  { error: unknown }
> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    return this.state.error ? this.props.fallback(errorCode(this.state.error)) : this.props.children;
  }
}

function useIdleSignOut(enabled: boolean) {
  const { signOut } = useAuthActions();
  useEffect(() => {
    if (!enabled) return;
    let timer = window.setTimeout(() => void signOut(), IDLE_SIGN_OUT_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void signOut(), IDLE_SIGN_OUT_MS);
    };
    const events = ["mousedown", "keydown", "touchstart", "scroll"] as const;
    for (const e of events) window.addEventListener(e, reset, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, reset);
    };
  }, [enabled, signOut]);
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-lg font-semibold text-slate-900">{title}</h1>
        {children}
      </div>
    </div>
  );
}

const input = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm";
const button = "w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
const link = "text-sm text-slate-600 underline";

function SignInForm({ onSetPassword }: { onSetPassword: () => void }) {
  const { signIn } = useAuthActions();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card title="Sign in to SMB Beltline Tracker">
      <form
        className="space-y-3"
        onSubmit={async event => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          const form = new FormData(event.currentTarget);
          try {
            await signIn("password", {
              flow: "signIn",
              email: String(form.get("email") ?? ""),
              password: String(form.get("password") ?? ""),
            });
          } catch {
            // One generic message: never reveal whether the email exists.
            setError("Email or password is incorrect.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <input className={input} name="email" type="email" autoComplete="username" placeholder="Email" required />
        <input
          className={input}
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          required
        />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button className={button} type="submit" disabled={busy}>
          Sign in
        </button>
      </form>
      <button className={`${link} mt-4`} type="button" onClick={onSetPassword}>
        First time here, or forgot your password?
      </button>
    </Card>
  );
}

function SetPasswordForm({ onDone }: { onDone: () => void }) {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card title="Set your password">
      {email === null ? (
        <form
          className="space-y-3"
          onSubmit={async event => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            const value = String(new FormData(event.currentTarget).get("email") ?? "");
            try {
              await signIn("password", { flow: "reset", email: value });
            } catch {
              // Same outcome either way, so the form can't be used to probe accounts.
            } finally {
              setBusy(false);
              setEmail(value);
            }
          }}
        >
          <p className="text-sm text-slate-600">We'll email you an 8-digit code if this address has an account.</p>
          <input
            className={input}
            name="email"
            type="email"
            autoComplete="username"
            placeholder="Work email"
            required
          />
          <button className={button} type="submit" disabled={busy}>
            Send code
          </button>
        </form>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async event => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            const form = new FormData(event.currentTarget);
            try {
              await signIn("password", {
                flow: "reset-verification",
                email,
                code: String(form.get("code") ?? ""),
                newPassword: String(form.get("newPassword") ?? ""),
              });
            } catch {
              setError("That code didn't work, or the password is shorter than 12 characters.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <input
            className={input}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="8-digit code"
            required
          />
          <input
            className={input}
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            placeholder="New password (12+ characters)"
            required
          />
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button className={button} type="submit" disabled={busy}>
            Set password and sign in
          </button>
        </form>
      )}
      <button className={`${link} mt-4`} type="button" onClick={onDone}>
        Back to sign in
      </button>
    </Card>
  );
}

function Account() {
  const me = useQuery(api.access.me);
  const { signOut } = useAuthActions();
  if (me === undefined) return <Card title="Loading…">{null}</Card>;
  return (
    <Card title={`Signed in as ${me.displayName}`}>
      <dl className="space-y-1 text-sm text-slate-700">
        <div>
          <dt className="inline font-medium">Teams: </dt>
          <dd className="inline">{me.teams.join(", ") || "none"}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Access: </dt>
          <dd className="inline">{me.capabilities.join(", ") || "staff"}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-slate-500">Tracker modules arrive from Phase 1.</p>
      <button className={`${button} mt-4`} type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </Card>
  );
}

export function App() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const [settingPassword, setSettingPassword] = useState(false);
  useIdleSignOut(isAuthenticated);
  const { signOut } = useAuthActions();

  if (isLoading) return <Card title="Loading…">{null}</Card>;
  if (!isAuthenticated) {
    return settingPassword ? (
      <SetPasswordForm onDone={() => setSettingPassword(false)} />
    ) : (
      <SignInForm onSetPassword={() => setSettingPassword(true)} />
    );
  }
  return (
    <AccessBoundary
      fallback={code => (
        <Card title="Access">
          <p className="text-sm text-slate-700">{ACCESS_MESSAGES[code ?? ""] ?? "Something went wrong."}</p>
          <button className={`${button} mt-4`} type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </Card>
      )}
    >
      <Account />
    </AccessBoundary>
  );
}
