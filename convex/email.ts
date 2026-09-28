import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { nowIso } from "./lib/time";

declare const process: { env: Record<string, string | undefined> };

function assertNotProduction() {
  if (process.env.DEPLOYMENT_ENV === "production") {
    throw new Error("The dev outbox is disabled in production.");
  }
}

export const recordDevEmail = internalMutation({
  args: { to: v.string(), subject: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    assertNotProduction();
    await ctx.db.insert("devOutbox", { ...args, createdAt: nowIso() });
  },
});

// For dev/staging only, run from the CLI (`npx convex run email:latestDevEmail
// '{"to":"..."}'`) to read a password-setup code. Never browser-callable.
export const latestDevEmail = internalQuery({
  args: { to: v.string() },
  handler: async (ctx, { to }) => {
    assertNotProduction();
    return await ctx.db
      .query("devOutbox")
      .withIndex("by_to", q => q.eq("to", to))
      .order("desc")
      .first();
  },
});
