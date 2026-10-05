// Copies helper functions that the original app defines INSIDE component files
// (so they can't be imported) VERBATIM into packages/parity/oracles/extracted/,
// with the SHA-256 of the source file in the header. The copies are the test
// oracles the rebuild must match (plan section 5.1, step 2).
//
// Usage:
//   bun run packages/parity/extract-oracles.ts          write the files
//   bun run packages/parity/extract-oracles.ts --check  fail if any is stale
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dirname, "..", "..");
const ORIGINAL = join(ROOT, "reference", "original");
const OUT_DIR = join(import.meta.dirname, "oracles", "extracted");

type Target = {
  out: string;
  source: string; // relative to reference/original
  names: string[]; // top-level declarations to copy, in source order
  preamble: string; // imports the copied code needs (the original's own)
  // Helpers defined INSIDE a component body (closures). Copied verbatim into a
  // factory whose parameters bind the component state they close over.
  // `names` may be inner functions, consts (useMemo/useCallback values run
  // through no-op stand-ins, so the copied statements stay verbatim) or types.
  closures?: { component: string; names: string[]; factory: string; params: string };
};

export const TARGETS: Target[] = [
  {
    out: "staffProductivity.ts",
    source: "src/components/productivity/StaffProductivityTab.tsx",
    names: ["RawCase", "dateOnly", "PRECERT_TYPES", "precertOngoingEvents", "DayColumn", "buildDayColumns"],
    preamble: 'import { toDateInputValue, type PeriodRange } from "@/lib/intakeTypes";',
  },
  {
    out: "reportsTab.ts",
    source: "src/components/productivity/ReportsTab.tsx",
    names: ["dateOnly", "BILLING_CATEGORIES", "PRECERT_TYPES", "RawPrecertCase", "precertOngoingEvents"],
    preamble: "",
  },
  {
    out: "appointmentOptions.ts",
    source: "convex/appointmentOptions.ts",
    names: ["OptionType", "optionKey", "unique", "effectiveValues"],
    preamble: "",
  },
  {
    out: "billingTab.ts",
    source: "src/components/productivity/BillingTab.tsx",
    names: ["BILLING_CATEGORIES", "BILLING_CATEGORY_LABELS", "BillingCategoryTotals"],
    preamble: 'import { isInCurrentMonth } from "@/lib/intakeTypes";\nexport { isInCurrentMonth };',
    closures: {
      component: "BillingTab",
      names: ["categoryTotals", "metricTotals"],
      factory: "makeBillingTotals",
      params:
        "allEntries: { staff: string; date: string; category?: string; tasksCompleted: number }[], " +
        "dailyMetrics: { staff: string; date: string; faxDocs: number; newPatientIntake: number }[] | undefined, " +
        "staffNames: string[]",
    },
  },
  {
    out: "intakeTeamTab.ts",
    source: "src/components/productivity/IntakeTeamTab.tsx",
    names: ["METRIC_FIELDS", "MetricKey"],
    preamble: [
      'import { inDateRange } from "./dateRangeFilter";',
      "import {",
      "  BOOST_CATEGORIES,",
      "  INBOUND_CATEGORY_BUCKETS,",
      "  INTAKE_CATEGORIES,",
      "  OUTBOUND_CATEGORY_BUCKETS,",
      "  categoryLabel,",
      "  resultOptionsForDirection,",
      "  type IntakeDirection,",
      '} from "@/lib/intakeTypes";',
      "type OracleEntry = {",
      "  _id: string; staff: string; date: string; direction: string; category: string; result?: string;",
      "  count: number; notes?: string; createdAt: string; patientId?: string;",
      "};",
      "type OracleMetric = {",
      "  _id: string; staff: string; date: string; emailsSent: number; ghlChats: number;",
      "  newPatientIntake: number; callAudits: number; faxDocs: number;",
      "};",
    ].join("\n"),
    closures: {
      component: "IntakeTeamTab",
      names: [
        "logSheetEntries",
        "StaffSummary",
        "EXCLUDED_STAFF_NAMES",
        "summarize",
        "LogRow",
        "combinedLog",
        "rawEntryRows",
        "filteredLog",
        "reportPeriod",
        "reportDateRange",
        "inReportRange",
        "reportEntries",
        "reportBoostEntries",
        "reportMetrics",
        "bucketCounts",
        "resultCounts",
        "inboundCategory",
        "outboundCategory",
        "inboundResult",
        "outboundResult",
        "ADMIN_TASK_ORDER",
        "boostRows",
        "adminTaskRows",
        "adminTaskTotal",
      ],
      factory: "makeIntakeTab",
      params: [
        "allEntries: OracleEntry[]",
        "allMetrics: OracleMetric[]",
        "logSheetDateFilter: string",
        "logSheetFrom: string",
        "logSheetTo: string",
        "logSheetStaffFilter: string",
        'logSheetDirectionFilter: "" | IntakeDirection',
        "logDateFilter: string",
        "logFrom: string",
        "logTo: string",
        "reportStaff: string",
        "reportDateFilter: string",
        "reportFrom: string",
        "reportTo: string",
      ].join(", "),
    },
  },
  {
    out: "exportUtils.ts",
    source: "src/lib/exportUtils.ts",
    names: [
      "formatDate",
      "IntakeExportRow",
      "INTAKE_EXPORT_HEADERS",
      "intakeRowToArray",
      "PiedmontEpicReferralExportRow",
      "PIEDMONT_EPIC_EXPORT_HEADERS",
      "piedmontEpicRowToArray",
    ],
    preamble: [
      'import { categoryLabel, resultLabel } from "@/lib/intakeTypes";',
      'import { formatDateEST } from "@/lib/dateFormat";',
    ].join("\n"),
  },
  {
    out: "dateRangeFilter.ts",
    source: "src/components/DateRangeFilter.tsx",
    names: ["inDateRange"],
    preamble: "",
  },
  {
    out: "historicalActivity.ts",
    source: "src/components/productivity/HistoricalActivityTab.tsx",
    names: ["MonthRow", "monthLabel", "trendDirection"],
    preamble: "",
  },
];

function declarationName(statement: ts.Statement): string | null {
  if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)) &&
    statement.name
  ) {
    return statement.name.text;
  }
  if (ts.isVariableStatement(statement)) {
    const decl = statement.declarationList.declarations[0];
    return decl && ts.isIdentifier(decl.name) ? decl.name.text : null;
  }
  return null;
}

export function render(target: Target): string {
  const path = join(ORIGINAL, target.source);
  const text = readFileSync(path, "utf8");
  const sha = createHash("sha256").update(text).digest("hex");
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = new Map<string, string>();
  const typeNames = new Set<string>();
  const selfExported = new Set<string>();
  for (const statement of source.statements) {
    const name = declarationName(statement);
    if (name && target.names.includes(name) && !found.has(name)) {
      if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) typeNames.add(name);
      // Already `export`ed in the original: the copy keeps its own keyword.
      if (
        ts.canHaveModifiers(statement) &&
        ts.getModifiers(statement)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        selfExported.add(name);
      }
      // getFullText keeps the leading comments: they document the rules.
      found.set(name, statement.getFullText(source).replace(/^\n+/, ""));
    }
  }
  const missing = target.names.filter(name => !found.has(name));
  if (missing.length) throw new Error(`${target.source}: declarations not found: ${missing.join(", ")}`);

  let body = target.names.map(name => found.get(name)).join("\n\n");
  const exportNames = target.names.filter(n => !typeNames.has(n) && !selfExported.has(n));
  if (target.closures) {
    const { component, names, factory, params } = target.closures;
    const fn = source.statements.find(
      (st): st is ts.FunctionDeclaration => ts.isFunctionDeclaration(st) && st.name?.text === component,
    );
    if (!fn?.body) throw new Error(`${target.source}: component ${component} not found`);
    const inner = new Map<string, string>();
    const innerTypes = new Set<string>();
    for (const st of fn.body.statements) {
      const name = declarationName(st);
      if (name && names.includes(name) && !inner.has(name)) {
        if (ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st)) innerTypes.add(name);
        inner.set(name, st.getFullText(source).replace(/^\n+/, ""));
      }
    }
    const lost = names.filter(name => !inner.has(name));
    if (lost.length) throw new Error(`${target.source}: closures not found in ${component}: ${lost.join(", ")}`);
    const usesHooks = names.some(n => /\buse(Memo|Callback)\(/.test(inner.get(n) ?? ""));
    const shims = usesHooks
      ? "  // Stand-ins for React hooks: compute the value once, as one render would.\n" +
        "  const useMemo = <T,>(compute: () => T, _deps: unknown[]): T => compute();\n" +
        "  const useCallback = <T,>(callback: T, _deps: unknown[]): T => callback;\n"
      : "";
    const values = names.filter(n => !innerTypes.has(n));
    body += `\n\nfunction ${factory}(${params}) {\n${shims}${names.map(n => inner.get(n)).join("\n\n")}\n  return { ${values.join(", ")} };\n}`;
    exportNames.push(factory);
  }
  return `// AUTO-EXTRACTED ORACLE. DO NOT EDIT.
// Verbatim copy of top-level declarations from the ORIGINAL app:
//   reference/original/${target.source}
//   sha256 ${sha}
// Regenerate with: bun run packages/parity/extract-oracles.ts
/* biome-ignore-all lint: verbatim third-party copy */
${target.preamble}

${body}

${exportNames.length ? `export { ${exportNames.join(", ")} };\n` : ""}${typeNames.size ? `export type { ${target.names.filter(n => typeNames.has(n) && !selfExported.has(n)).join(", ")} };\n` : ""}`;
}

if (import.meta.main) {
  const check = process.argv.includes("--check");
  mkdirSync(OUT_DIR, { recursive: true });
  let stale = false;
  for (const target of TARGETS) {
    const outPath = join(OUT_DIR, target.out);
    const content = render(target);
    if (check) {
      let current = "";
      try {
        current = readFileSync(outPath, "utf8");
      } catch {}
      if (current !== content) {
        console.error(`stale: ${relative(ROOT, outPath)}`);
        stale = true;
      }
    } else {
      writeFileSync(outPath, content);
      console.log(`wrote ${relative(ROOT, outPath)}`);
    }
  }
  if (stale) process.exit(1);
}
