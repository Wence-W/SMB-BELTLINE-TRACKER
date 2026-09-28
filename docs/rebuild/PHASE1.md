# Phase 1 (reference modules): status

**Scope approved** by the owner on 2026-09-28: Intake Directory, Settings, the managed dropdown lists and Historical Activity, with synthetic data only. No production system was touched, and no live data was used.

## Done (on branch `claude/fervent-hawking-zlg14s`)

| Module | Backend | Screens | Parity and tests |
|---|---|---|---|
| **Intake Directory**: Clinic and Departments | `convex/directory.ts`: every function ported 1:1 (ordering, trimming, name-required rules, blank clinic name allowed) | `DirectoryPage`, plus the original `ClinicCard` / `DepartmentCard` ported verbatim except for the API path and error text (diff checked) | `tests/convex/directory.test.ts`; edits audited |
| **Intake Directory**: Intake Team | Unified `people` roster (`access.listTeam`); membership through `setPersonTeams` (admin) | Intake Team tab; admins add or remove members; new staff are added under Admin | `tests/convex/settings.test.ts` (roster) |
| **Managed lists**: Pre-Cert Provider, Request by, Piedmont To Provider | `convex/managedLists.ts`: trim, blank rejected, exact-duplicate rejected, delete by id | Admin → Dropdown lists (interim; see below) | `tests/convex/managedLists.test.ts` |
| **Booked Tracker Scheduler/Provider options** | `convex/appointmentOptions.ts` + `convex/lib/appointmentOptions.ts` | Admin → Dropdown lists | Property test: under 3,000 random sequences of add/remove, the lists equal the ORIGINAL's `effectiveValues` output. Breaking the logic on purpose makes the test fail (checked). Migration transform tested. |
| **Settings** | `convex/settings.ts`: account name; photo accepted only if the file's bytes are JPEG/PNG/WebP, it is 2 MB or smaller, it was uploaded in the last hour, and it isn't attached to anything else | `SettingsPage`: round crop as in the original; password change by emailed code | `tests/convex/settings.test.ts`, including the S3 fix: a claimed or old file is refused and never deleted |
| **Historical Activity** | none (static archive, aggregate counts only) | Original screen ported; its helpers replaced by `apps/web/src/lib/historical.ts` | Trend and labels equal the original on the real archive and on 5,000 random series |

**Local result:**
- All 28 public functions are gated, and the SEC-01 signed-out test covers every one.
- 102 tests pass under UTC, Asia/Manila and America/Los_Angeles.
- Typecheck, lint and build are clean.
- The sign-in screen renders in a real browser.

## Deliberate differences from production (owner to confirm in `DECISIONS.md`)

1. **D5 applied:** editing the Pre-Cert Provider and Request-by lists is admin-only. Production lets any user edit them. The Piedmont and Booked lists were already admin-only.
2. **Intake Team = people with the Intake team.** Adding a member now means setting up a person with a login email (Admin → People & access) or adding the team to an existing person. The original stored a free-text name. This follows from the plan's single-roster design (plan 3.1).
3. **Managed-list editing lives on an admin page for now.** The original edited these lists from "Manage" buttons inside the Cases, Piedmont and Booked forms; those buttons return with their modules in Phases 3–5.
4. **No seeding from the browser.** Real directory contents and list values arrive only with the approved migration (G2). Dev/staging uses `devSeed:seedPhase1`, whose values are all fictional.
5. **Built-in Scheduler/Provider defaults are data, not code.** The effective lists are proven identical to the original's; the defaults are loaded by the migration.

## Not verified yet

- **The signed-in screens have not been exercised in a browser.** That needs a Convex deployment: this environment's network policy blocks Convex's local backend download (`version.convex.dev`), and no owner project exists yet (G0). They typecheck and build. The first run on the owner's dev deployment should walk each screen.
- CI has not been observed on GitHub from here.

## Next

**Phase 2 (Billing) needs the owner's written approval.** Still open from Phase 0: G0, the reference project, the history rewrite on `main`, and decisions D1, D2, D3 (urgent, see F1), D8 and D10.
