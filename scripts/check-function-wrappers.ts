// Static guard for plan section 4.1 / SEC-01: no Convex function may be
// exported without going through the access wrappers in convex/lib/functions.ts.
//
// Fails if any module in convex/ (outside lib/functions.ts and _generated/):
//   1. value-imports `query`, `mutation`, `action` or `httpAction` from
//      _generated/server (type-only imports are fine), or
//   2. exports a const built by anything other than an allowed builder.
//
// Usage: bun run scripts/check-function-wrappers.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const CONVEX_DIR = join(import.meta.dirname, "..", "convex");
const WRAPPERS_FILE = join(CONVEX_DIR, "lib", "functions.ts");

const FORBIDDEN_RAW_IMPORTS = new Set(["query", "mutation", "action", "httpAction"]);
const ALLOWED_BUILDERS = new Set([
  "authedQuery",
  "authedMutation",
  "capabilityQuery",
  "capabilityMutation",
  "capabilityAction",
  "authedAction",
  "auditedInternalMutation",
  "internalQuery",
  "internalMutation",
  "internalAction",
]);
// Convex Auth's own entry points must stay public (they ARE the sign-in API).
const CONVEX_AUTH_FILE = join(CONVEX_DIR, "auth.ts");

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === "_generated") continue;
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

/** The identifier a builder call starts from: capabilityQuery("admin")({...}) -> capabilityQuery. */
function builderName(expr: ts.Expression): string | null {
  let current: ts.Expression = expr;
  while (ts.isCallExpression(current)) current = current.expression;
  if (ts.isIdentifier(current)) return current.text;
  if (ts.isPropertyAccessExpression(current)) return current.getText();
  return null;
}

const problems: string[] = [];
const publicFunctions: string[] = [];

for (const file of listFiles(CONVEX_DIR)) {
  if (file === WRAPPERS_FILE) continue;
  const rel = relative(CONVEX_DIR, file);
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const from = statement.moduleSpecifier.text;
      const clause = statement.importClause;
      if (from.endsWith("_generated/server") && clause && !clause.isTypeOnly) {
        const bindings = clause.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            const imported = (element.propertyName ?? element.name).text;
            if (!element.isTypeOnly && FORBIDDEN_RAW_IMPORTS.has(imported)) {
              problems.push(
                `${rel}: imports raw \`${imported}\` from _generated/server; use lib/functions.ts wrappers`,
              );
            }
          }
        }
      }
    }

    if (!ts.isVariableStatement(statement)) continue;
    const exported = statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    for (const decl of statement.declarationList.declarations) {
      if (!decl.initializer || !ts.isCallExpression(decl.initializer)) continue;
      const name = builderName(decl.initializer);
      if (name === "convexAuth" && file === CONVEX_AUTH_FILE) continue;
      // Only calls that produce Convex functions matter; helpers that return
      // plain values (e.g. `literals(...)`) are skipped by requiring a handler.
      const text = decl.initializer.getText();
      if (!/\bhandler\s*:/.test(text)) continue;
      const declName = decl.name.getText();
      if (!name || !ALLOWED_BUILDERS.has(name)) {
        problems.push(`${rel}: \`${declName}\` is built by \`${name}\`, not an allowed wrapper`);
      } else if (!name.startsWith("internal") && name !== "auditedInternalMutation") {
        publicFunctions.push(`${rel.replace(/\.ts$/, "")}:${declName} (${name})`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`Function wrapper check FAILED:\n${problems.map(p => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`Function wrapper check passed. ${publicFunctions.length} public functions, all gated:`);
for (const fn of publicFunctions.sort()) console.log(`  ${fn}`);
