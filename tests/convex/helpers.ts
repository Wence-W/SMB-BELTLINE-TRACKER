import { convexTest } from "convex-test";
import type { Id } from "../../convex/_generated/dataModel";
import type { Capability, Team } from "../../convex/lib/enums";
import schema from "../../convex/schema";

export const modules = import.meta.glob("../../convex/**/*.ts");

export function newBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof newBackend>;

// Synthetic identities only (example.invalid is a reserved, non-routable TLD).
export async function seedUser(
  t: Backend,
  opts: {
    email: string;
    verified?: boolean;
    person?: { active?: boolean; teams?: Team[] } | false;
    capabilities?: Capability[];
  },
) {
  const { email, verified = true, person = {}, capabilities = [] } = opts;
  const ids = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", {
      email,
      ...(verified ? { emailVerificationTime: Date.now() } : {}),
    });
    let personId: Id<"people"> | null = null;
    if (person !== false) {
      personId = await ctx.db.insert("people", {
        displayName: email.split("@")[0],
        email,
        userId,
        teams: person.teams ?? ["verification"],
        active: person.active ?? true,
        legacyNames: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    for (const capability of capabilities) {
      await ctx.db.insert("roles", { userId, capability, grantedAt: new Date().toISOString() });
    }
    return { userId, personId };
  });
  // Convex Auth identities carry "<userId>|<sessionId>" in `subject`.
  const as = t.withIdentity({ subject: `${ids.userId}|test-session`, email });
  return { ...ids, as };
}

export async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    const data = (error as { data?: { code?: string } }).data;
    if (data?.code === code) return;
    throw new Error(`Expected error code ${code}, got: ${JSON.stringify(data) ?? String(error)}`);
  }
  throw new Error(`Expected error code ${code}, but the call succeeded`);
}
