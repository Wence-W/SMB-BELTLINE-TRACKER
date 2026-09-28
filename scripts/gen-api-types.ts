// Stand-in for `npx convex codegen` until the owner's Convex project exists
// (plan gate G0): codegen refuses to run without a deployment. Writes
// convex/_generated/api.d.ts in the same shape codegen produces. The other
// _generated files are static templates. Once a deployment exists, `npx convex
// dev` overwrites all of them and this script can be deleted.
//
// Usage: bun run scripts/gen-api-types.ts [--check]
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const CONVEX_DIR = join(import.meta.dirname, "..", "convex");
const OUT = join(CONVEX_DIR, "_generated", "api.d.ts");
const SKIP = new Set(["schema.ts", "auth.config.ts"]);

function listModules(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (entry === "_generated" || entry.startsWith(".")) continue;
    if (statSync(full).isDirectory()) out.push(...listModules(full));
    else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts") && !SKIP.has(entry)) {
      out.push(relative(CONVEX_DIR, full).replace(/\.ts$/, ""));
    }
  }
  return out;
}

const modules = listModules(CONVEX_DIR);
const alias = (m: string) => m.replace(/[/\\]/g, "_");
const key = (m: string) => (m.includes("/") ? JSON.stringify(m) : m);

const content = `/* eslint-disable */
/**
 * Generated \`api\` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED (scripts/gen-api-types.ts until a
 * Convex deployment exists; then by \`npx convex dev\`).
 * @module
 */

${modules.map(m => `import type * as ${alias(m)} from "../${m}.js";`).join("\n")}

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
${modules.map(m => `  ${key(m)}: typeof ${alias(m)};`).join("\n")}
}>;

export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
`;

if (process.argv.includes("--check")) {
  const current = readFileSync(OUT, "utf8");
  if (current !== content) {
    console.error("convex/_generated/api.d.ts is out of date: run bun run scripts/gen-api-types.ts");
    process.exit(1);
  }
} else {
  writeFileSync(OUT, content);
  console.log(`Wrote ${relative(process.cwd(), OUT)} (${modules.length} modules)`);
}
