import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";

declare const process: { env: Record<string, string | undefined> };

export type OutgoingEmail = { to: string; subject: string; text: string };

/**
 * Plain-text email only (no HTML templating, so nothing can be injected) and
 * callers must never put PHI in `text` (plan section 1.2).
 *
 * Transports:
 * - `dev-outbox`: writes to the devOutbox table for dev/staging; refused on a
 *   production deployment.
 * - anything else: not configured yet. The owner picks a BAA-covered provider
 *   at gate G0, and it is wired in here.
 */
export async function sendEmail(ctx: Pick<ActionCtx, "runMutation">, email: OutgoingEmail): Promise<void> {
  const transport = process.env.EMAIL_TRANSPORT;
  if (transport === "dev-outbox") {
    if (process.env.DEPLOYMENT_ENV === "production") {
      throw new Error("dev-outbox email transport is not allowed in production.");
    }
    await ctx.runMutation(internal.email.recordDevEmail, email);
    return;
  }
  throw new Error("No email transport configured (set EMAIL_TRANSPORT).");
}
