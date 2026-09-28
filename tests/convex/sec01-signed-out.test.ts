// @vitest-environment edge-runtime
// SEC-01: every public function rejects a signed-out caller. Functions are
// discovered from source, so a new public function without an entry in
// SAMPLE_ARGS fails this test until someone adds one (and thereby tests it).
import { makeFunctionReference } from "convex/server";
import { describe, expect, test } from "vitest";
import { expectCode, newBackend, seedUser } from "./helpers";

const sources = import.meta.glob("../../convex/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

type Kind = "query" | "mutation" | "action";
const KIND_BY_BUILDER: Record<string, Kind> = {
  authedQuery: "query",
  capabilityQuery: "query",
  authedMutation: "mutation",
  capabilityMutation: "mutation",
  capabilityAction: "action",
};

const discovered: { path: string; kind: Kind }[] = [];
for (const [file, text] of Object.entries(sources)) {
  if (file.includes("/_generated/") || file.endsWith("/lib/functions.ts")) continue;
  const module = file.replace(/^.*\/convex\//, "").replace(/\.ts$/, "");
  for (const match of text.matchAll(/export const (\w+) = (\w+)\b/g)) {
    const kind = KIND_BY_BUILDER[match[2]];
    if (kind) discovered.push({ path: `${module}:${match[1]}`, kind });
  }
}

// Valid-shaped arguments, so a rejection can only come from the access check,
// not from argument validation. Placeholder IDs are filled in per test.
const SAMPLE_ARGS: Record<string, (ids: { userId: string; personId: string }) => Record<string, unknown>> = {
  "access:me": () => ({}),
  "access:listPeople": () => ({}),
  "access:setPersonActive": ids => ({ personId: ids.personId, active: false }),
  "access:setPersonTeams": ids => ({ personId: ids.personId, teams: ["billing"] }),
  "access:grantCapability": ids => ({ userId: ids.userId, capability: "admin" }),
  "access:revokeCapability": ids => ({ userId: ids.userId, capability: "admin" }),
  "provisioning:provisionPerson": () => ({ email: "x@example.invalid", displayName: "X", teams: [] }),
};

describe("SEC-01: no public function is callable signed out", () => {
  test("discovery found the public functions", () => {
    expect(discovered.length).toBeGreaterThan(0);
  });

  test("every discovered public function has sample args", () => {
    const missing = discovered.map(d => d.path).filter(path => !(path in SAMPLE_ARGS));
    expect(missing, "add SAMPLE_ARGS entries for new public functions").toEqual([]);
  });

  for (const { path, kind } of discovered) {
    test(`${path} rejects a signed-out caller`, async () => {
      const t = newBackend();
      const target = await seedUser(t, { email: "target@example.invalid" });
      const args = SAMPLE_ARGS[path]?.({ userId: target.userId, personId: target.personId! }) ?? {};
      type Args = Record<string, unknown>;
      const call =
        kind === "query"
          ? t.query(makeFunctionReference<"query", Args>(path), args)
          : kind === "mutation"
            ? t.mutation(makeFunctionReference<"mutation", Args>(path), args)
            : t.action(makeFunctionReference<"action", Args>(path), args);
      await expectCode(call, "UNAUTHENTICATED");
    });
  }
});
