import { Email } from "@convex-dev/auth/providers/Email";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { ActionCtx } from "./_generated/server";
import { sendEmail } from "./lib/email";
import { normalizeEmail } from "./lib/time";

const CODE_DIGITS = 8;
const CODE_TTL_SECONDS = 15 * 60;
export const MIN_PASSWORD_LENGTH = 12;

/** Uniformly random numeric code (rejection sampling, no modulo bias). */
export function generateNumericCode(digits = CODE_DIGITS): string {
  const limit = 10 ** digits;
  const ceiling = Math.floor(0x1_0000_0000 / limit) * limit;
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    if (buffer[0] < ceiling) return String(buffer[0] % limit).padStart(digits, "0");
  }
}

// Password setup / reset by emailed code. Completing it is what marks an
// admin-provisioned account's email as verified.
const PasswordCode = Email({
  id: "password-code",
  maxAge: CODE_TTL_SECONDS,
  async generateVerificationToken() {
    return generateNumericCode();
  },
  async sendVerificationRequest({ identifier, token }, ctx?: unknown) {
    await sendEmail(ctx as Pick<ActionCtx, "runMutation">, {
      to: identifier,
      subject: "Your SMB Beltline Tracker code",
      text: `Your SMB Beltline Tracker code is ${token}. It expires in 15 minutes. If you didn't ask for it, ignore this email.`,
    });
  },
});

/**
 * Runs for EVERY Password flow before any account is created or read, so
 * rejecting `signUp` here blocks self-registration on the server, not just
 * in the UI (plan D4, SEC-02; closes Inventory finding S2). Accounts are only
 * created by admins through `provisioning.ts`.
 */
export function passwordProfile(params: Record<string, unknown>) {
  if (params.flow === "signUp") throw new ConvexError({ code: "SIGNUP_DISABLED" });
  const email = normalizeEmail(typeof params.email === "string" ? params.email : "");
  if (!email) throw new ConvexError({ code: "EMAIL_REQUIRED" });
  return { email };
}

export function validatePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ConvexError({ code: "PASSWORD_TOO_SHORT", minLength: MIN_PASSWORD_LENGTH });
  }
}

// Session limits (plan SEC-08). The idle value is the plan's suggested 30
// minutes pending the owner's decision; the browser also signs out on idle.
export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_MAX_MS = 12 * 60 * 60 * 1000;

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  session: { inactiveDurationMs: SESSION_IDLE_MS, totalDurationMs: SESSION_MAX_MS },
  providers: [
    Password({
      profile: passwordProfile,
      reset: PasswordCode,
      validatePasswordRequirements: validatePassword,
    }),
  ],
});
