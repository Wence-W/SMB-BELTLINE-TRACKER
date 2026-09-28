import { createAccount, retrieveAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";

// One-off helper for creating a real password-login account for a
// non-staff user (e.g. company leadership) who needs to view the app.
// Not exposed to the client; run via `npx convex run` only.
export const createPasswordAccount = internalAction({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, { email, password, name }) => {
    const normalizedEmail = email.trim().toLowerCase();
    try {
      await retrieveAccount(ctx, {
        provider: "password",
        account: { id: normalizedEmail },
      });
      return { success: false, message: "Account already exists" };
    } catch {
      // Doesn't exist yet, proceed to create.
    }

    await createAccount(ctx, {
      provider: "password",
      account: {
        id: normalizedEmail,
        secret: password,
      },
      profile: {
        email: normalizedEmail,
        name,
        emailVerificationTime: Date.now(),
      },
      shouldLinkViaEmail: false,
    });
    return { success: true, message: "Account created successfully" };
  },
});
