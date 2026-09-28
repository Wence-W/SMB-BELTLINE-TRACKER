# Phase 0 (Foundations): status

**Scope approved** by the owner on 2026-09-28: Phase 0 only, in the new environment, with synthetic data. No production system was touched, and no live data was used.

## Done (on branch `claude/fervent-hawking-zlg14s`)

| Plan item | Where | Evidence |
|---|---|---|
| Repo restructure: starter app and source zip removed; original added as read-only oracle | `reference/original/` (all 229 files pass the export's own `SHA256SUMS.txt`) | — |
| Auth with sign-up off | `convex/auth.ts` | `tests/convex/auth.test.ts`; the tests fail if the guard is removed (checked) |
| Admin-provisioned accounts; email verified by the emailed-code password setup | `convex/provisioning.ts` | `tests/convex/access.test.ts` |
| Roles and capabilities as data (`owner`, `admin`, `patient_id_override`, `call_audit_access`) | `convex/access.ts`, `convex/schema.ts` | Owner-only grant of the override is tested |
| Mandatory wrappers; raw builders forbidden | `convex/lib/functions.ts`, `scripts/check-function-wrappers.ts` | Static check (proven to catch a planted raw `query`); runtime SEC-01 over every public function |
| Audit log with field names, never values | `convex/lib/audit.ts` | Asserted in `access.test.ts` |
| Server timestamps, same ISO format | `convex/lib/time.ts` | — |
| Enum validators (current values plus legacy read values) | `convex/lib/enums.ts` | Compared to the original's option lists in `tests/parity/harness.test.ts` |
| Session limits: 30 min idle, 12 h maximum, sessionStorage, browser idle sign-out | `convex/auth.ts`, `apps/web/src/main.tsx` | — |
| No `console` in app code (SEC-05 aid) | `biome.json` `noConsole` | — |
| Parity harness: oracles from the original, verbatim extractor with SHA-256 pinning | `packages/parity/` | Up-to-date check in CI; 10,000-run property test that the original's two Pre-Cert copies agree |
| Synthetic fixture generator with pinned landmine cases | `packages/parity/fixtures.ts` | Deterministic; synthetic-only check; every row passes the ORIGINAL schema |
| Reference instance runbook | `docs/rebuild/REFERENCE-INSTANCE.md` | Needs the owner's Convex account (below) |
| Web shell: sign in, set/reset password by code, account view; no sign-up screen | `apps/web/` | Builds |
| CI: typecheck, lint, wrapper guard, tests in UTC and UTC+8, web build, gitleaks | `.github/workflows/ci.yml` | — |

**Local result:** `bun run check` is green, and 48 tests pass under UTC, Asia/Manila and America/Los_Angeles.

## Blocked on the owner (can't be done from here)

1. **G0:**
   - Create the owner's Convex account.
   - Confirm and sign the **BAA** before any PHI is ever loaded.
   - Create the rebuild project with `dev`, `staging` and `prod` deployments.
2. **Reference project:** create `beltline-reference` (synthetic only; see the runbook).
3. **Run real codegen** once a deployment exists: `npx convex dev`. It replaces the hand-written `convex/_generated/` files, after which `scripts/gen-api-types.ts` can be deleted.
4. **Bootstrap the first owner** on the new dev deployment:
   ```sh
   npx convex run provisioning:provisionAccount '{"email":"<owner email>","displayName":"<name>","teams":[]}'
   npx convex run provisioning:bootstrapOwner '{"email":"<owner email>"}'
   ```
   Then set a password in the web app with "First time here?". With `EMAIL_TRANSPORT=dev-outbox`, read the code via `npx convex run email:latestDevEmail '{"to":"<owner email>"}'`.
5. **Rewrite `main`'s history** to drop the source zip, or re-create the repo.
6. **Decide D1, D2, D3 (now urgent; see finding F1), D8 inputs, D10, and the session and password defaults** in `DECISIONS.md`.

## Next

**Phase 1 (reference modules) needs the owner's written approval.**
