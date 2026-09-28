# SMB Beltline Tracker: Step 2 Migration and Rebuild Plan

**Status:** DRAFT for owner approval. **No building starts until the owner approves this plan in writing.**
**Inputs:** `docs/rebuild/STEP1-INVENTORY.md`. Section references like "Inv §6.1" point there.
**Hard constraints carried from the brief:**
1. The production app is never modified.
2. The new build runs in a separate environment that cannot write to production.
3. No live data moves until the owner approves it, after parity validation.
4. HIPAA-level care throughout: no PHI in logs, no secrets in code, access control enforced on the server.

---

## 0. Decisions this plan assumes (owner to confirm or change)

The Step 1 open questions are unanswered. This plan proceeds on the defaults below; each one is a single switch in the build.

**Principle: build for parity first, fix second.** The rebuild first reproduces today's numbers exactly, so parity can be proven. Every behavioural fix (Inv §9) is then a separate, owner-approved change behind a named flag, applied only after parity sign-off.

| # | Question (Inv §10) | Default in this plan |
|---|---|---|
| D1 | Pre-Cert double credit (Approved + In Progress) | **Replicate** for parity; fix only on approval |
| D2 | Weekends | **Replicate**: weekday-only in Staff Daily Productivity only |
| D3 | Timezone of record | **Replicate UTC-slice** for parity. Recommended fix afterwards: `America/New_York` everywhere |
| D4 | Self-signup | **Off**, enforced on the server (per the brief) |
| D5 | Deletes and roster edits | **Per the brief:** bulk/destructive actions (Reset all cases, delete case, staff roster edits) become admin-only. Single-row edits stay open to staff. *This is a deliberate deviation from production.* |
| D6 | Legacy Task tool | Keep **read-only** (existing tasks visible in Urgent/Priority/Expiring/Completed and Reports); no create |
| D7 | Starter app in this repo | **Discard.** Replaced by the rebuild. |
| D8 | Viktor email cron | Rebuilt in-app as a scheduled job. Needs the current schedule and templates from Viktor or the owner. |
| D9 | Historical Activity JSON | Carried over as-is, as static data |
| D10 | Legacy `quaint-parrot-788` deployment | **Drop** the Verification Summary tab unless the owner confirms it is still used |

**Security deviations from production that are not optional** (the brief requires server-side access control):
- Every function requires sign-in.
- Hard-coded email allowlists become a roles table.
- The S2–S4 holes (Inv §0) are closed.

These change *who can call what*. They do not change any number a report shows.

---

## 1. Target stack

### 1.1 Options considered

| | A. Convex + React (recommended) | B. Postgres + Node API + React | C. Stay on Viktor Spaces |
|---|---|---|---|
| Parity risk | **Lowest.** The same document model and the same React code can be ported, and the original computations can be reused as test oracles. | High. Every query, live update and file flow is rewritten. | n/a: this is the current app |
| Data migration | Convex export → Convex import keeps document shapes. Storage files move with their IDs remapped. | Schema translation for 33 tables, embedded arrays normalised | none |
| Real-time behaviour (live tables, presence, badges) | Native | Needs websockets/SSE plus cache invalidation | native |
| HIPAA / BAA | Convex offers HIPAA support with a BAA on paid plans; **availability and plan must be confirmed in writing before any PHI is loaded** | Mature BAAs (AWS RDS/Aurora, GCP Cloud SQL, Azure) | Unknown; not under your control |
| Control and exit | Vendor-managed. Open-source self-hosted Convex exists as an exit path. | Full control | Low |
| Effort | Medium | High (roughly 2–3× A) | none |

### 1.2 Recommendation: Option A, decoupled from Viktor

Components:
- **Backend:** a new, owner-owned Convex project on a BAA-covered plan, with separate `dev`, `staging` and `prod` deployments. It is created by the owner, and its credentials never touch the old deployment.
- **Frontend:** React 19 + Vite + TypeScript + Tailwind, ported from the original source (the same UI, so staff need no retraining), minus all Viktor-specific code.
- **Auth:** Convex Auth.
  - Password provider with **server-side sign-up disabled**. Accounts are admin-provisioned and must verify their email.
  - Optional Google Workspace or Microsoft OIDC to replace "Sign in with Viktor", if the team has a workspace. That also brings MFA.
  - If no SSO is used, add TOTP MFA as a Phase 0 decision. MFA is not required by HIPAA verbatim but is strongly recommended.
- **Email:** a provider that signs a BAA (for example AWS SES under an AWS BAA, or Paubox) if any notification contains patient identifiers. Otherwise, emails carry **no PHI**, just "You have 3 cases due; open the tracker".
- **Static hosting:** any static host. The bundle contains no PHI or secrets, and the backend URL is not a secret once every function is gated.
- **Tooling:** Bun, Biome, Vitest, Playwright, GitHub Actions CI, and secret scanning.

**Why not B:** B's control is only worth the 2–3× effort and the higher parity risk if Convex cannot sign a BAA. B is the **fallback**, and the Phase 0 gate G0 decides between them.

### 1.3 Repository layout (this repo, `Wence-W/SMB-BELTLINE-TRACKER`, private)

```
reference/original/     ← the unzipped 2026-09-25 export, read-only, never deployed to prod; used as the test oracle
apps/web/               ← rebuilt React app
convex/                 ← rebuilt backend (schema, functions, crons, http)
packages/parity/        ← oracle wrappers around the original computation code + fixture generators
tests/                  ← unit, integration, permission-matrix, Playwright parity suites
docs/rebuild/           ← Step 1, Step 2, decision log, test evidence
```

- The source zip and the starter app are removed from `main`, with history rewritten or the repo re-created (owner action).
- Staff emails move out of code into seeded roles data kept outside git.

---

## 2. Module-by-module rebuild sequence

Modules are ordered from low to high risk. Each phase ends only when its parity tests (§5) pass and the owner or a named staff member signs it off on staging. Sizes are relative (S/M/L/XL), not calendar promises.

| Phase | Scope | Why here | Size |
|---|---|---|---|
| **0. Foundations** | Everything in the Phase 0 list below | Everything depends on it; it also retires the S1–S4 classes of bug by construction | L |
| **1. Reference modules** | Intake Directory (clinics, departments, intake roster); Settings (profile, photo, password); managed dropdown lists (Pre-Cert providers, requesters, To Providers, Scheduler/Provider options); Historical Activity (static) | Few rules, no rollups; proves the stack and the auth wrappers end to end | S |
| **2. Billing** | Activity Log (4 categories, count ≥ 1), Fax/NPC logging, This Month table | Small; exercises the shared `intakeDailyMetrics` upsert (Inv §5.9) | S |
| **3. Intake** | Activity Log (form, tree, Intake Log, Raw Entries, export, reset); Piedmont: Epic; Intake Reports views (Daily/Weekly/Monthly, Activity Reports) | The row-count vs summed-count rule, Boost exclusions, the hard-coded staff exclusion, metrics overwrite (Inv §5.4–5.7, §6.3–6.4) | M |
| **4. Booked Tracker** | Appointments CRUD and cascades; All/SMB/Boost/YTD tabs; dashboard; import/export; per-tab reset with undo; Queue; notifications; presence; sync checklist | Many interacting features and the timezone traps (Inv §5.6) | L |
| **5. Ins Verifiers** | Case modal, Patient ID lock and history, note log, all views, badges, Staff Workload, Documentation Audit, dashboards, export (xlsx/pdf/print), Verification Process/Guidelines with updates and acknowledgements, read-only tasks | The core PHI module; the Patient ID lock rules (Inv §5.1) | L |
| **6. Productivity rollups** | Staff Daily Productivity, Qualified Activities Total, Reports tab | The densest landmines (Inv §6.1–6.5); depends on phases 2–5 as its data sources | L |
| **7. Call Audits** | Verification audits, Intake audits, Highlights, reactions, roster, recordings over the HTTP range endpoint, storage | Already well-secured in production; large media migration; isolated from the rollups except `countsByAuditor` | L |
| **8. Notifications** | Case/task email cron (assigned, due-soon, expiring, overdue, completed, updated), replacing the external Viktor cron | Needs D8 inputs; runs only after data is in place | M |
| **9. Rehearsal and cutover** | §6 and §7 | — | M |

**Phase 0 (Foundations) scope**
- New Convex project and BAA (gate **G0**).
- CI.
- Auth with sign-up off.
- Roles and capabilities.
- Mandatory `authedQuery` / `authedMutation` / `adminMutation` wrappers, with a lint rule that forbids raw `query`/`mutation` exports.
- Audit log.
- Server-side timestamps.
- Enum validators.
- The parity harness and a fixture generator.
- A *reference instance* of the original app running on synthetic fixtures (§5.1).

---

## 3. Data model translation (old → new)

The target is Convex again, so **most tables map 1:1** with the same fields. The differences:

### 3.1 Tables that change

| Old | New | Change and reason |
|---|---|---|
| hard-coded `RESTRICTED_ACTION_EMAILS`, `PATIENT_ID_LOCK_EXEMPT_EMAIL`, `CALL_AUDIT_ACCESS_EMAILS`, intake-auditor name map | **`roles`** `{userId, capability, grantedBy, grantedAt}` plus a **`people`** table | Access becomes data, managed by admins, audited, with no deploy needed. Capabilities: `admin`, `patient_id_override`, `call_audit_access`. Seeded from the current lists, verified by the owner. |
| `staff`, `intakeStaff`, `billingStaff`, `callAuditRoster` (four name lists) | **`people`** `{displayName, email?, userId?, teams[], active, legacyNames[]}`. The old tables become views over it. | One identity per person. `legacyNames` preserves every historical free-text spelling, so old rows still attribute correctly. |
| free-text staff names in `cases.assignedTo`, `intakeEntries.staff`, `callAudits.auditorName`, `noteLog[].addedBy`, and so on | **Kept as strings** (for parity), **plus** a nullable `…PersonId` beside each | Renames can't break history. Reports keep matching on the string exactly as today until a fix is approved. |
| `noteLog` embedded array, whole-array writes | Same field, but written through `addNote` / `deleteNote` mutations that append or remove **one** entry server-side | Removes last-write-wins data loss (Inv §9.14) without changing any credit arithmetic |
| client-supplied `createdAt` / `updatedAt` / `completedAt` / `approvedAt` / `addedAt` | Same fields and format (ISO UTC strings), **stamped by the server** | Parity: the same format feeds the same `slice(0,10)` logic. Integrity: clients can't backdate. |
| `v.string()` enums (case type, status, priority, auth status, intake category/result, appointment fields) | `v.union(v.literal…)` validators. Legacy values are allowed on read and rejected on new writes. | Server validation; historic rows still load |
| `appointments.apptDateTime` (no offset) | Unchanged string, plus `apptTz: "America/New_York"` | Documents the intended meaning, so the display fix (if approved) is mechanical |
| `reports.deletedSnapshot: v.any()` | A typed snapshot validator, with the original `_id` kept | Undo restores rows and keeps Remove-import working (Inv §9.18, fix-flagged) |
| — (none) | **`auditLog`** `{actor, action, table, docId, fields changed (names only, no values), at}` | HIPAA audit controls. Covers every write, every export, Patient ID history views and recording plays. Holds **no PHI values**. |
| `directoryEntries`, `userPreferences` (unused), `callAuditMigrationLedger` | Not migrated (the ledger is archived with the export) | Dead or superseded (Inv §7) |
| Convex Auth tables | **Not migrated.** Accounts are re-provisioned; users set a password on first login or use SSO. | Avoids carrying over unverified self-signups (S2). Password hashes could be moved only if the owner insists, same library. |
| `_storage` files (recordings, screenshots, photos) | Copied, with new storage IDs; every `…StorageId` reference remapped by the migration script and verified by size and SHA-256 | Convex storage IDs don't carry between projects |

### 3.2 Unchanged 1:1

- Cases, tasks and case managed lists: `cases` (plus `…PersonId` fields), `patientIdHistory`, `tasks` (read-only), `precertProviders`, `reverificationRequesters`.
- Intake and Piedmont: `intakeEntries`, `intakeDailyMetrics`, `piedmontEpicReferrals`, `piedmontEpicProviders`.
- Booked Tracker: `appointments`, `appointmentDropdownOptions`, `reports`, `appointmentPresence` (ephemeral, not migrated).
- Billing: `billingEntries`.
- Directory: `clinicWidgets`, `clinicProviders`, `departmentWidgets`, `departmentMembers`.
- Call Audits: `callAudits`, `callAuditRosterChanges`, `intakeCallAudits`, `intakeCallAuditReactions`, `intakeHighlights`, `intakeHighlightReactions`.
- Verification pages: `verificationPageUpdates`, `verificationPageAcknowledgements` (with their `userId` remapped to the new users).

### 3.3 Migration mapping rules

- Every old `_id` is kept in a `legacyId` field, which lets reconciliation and rollback deltas be traced.
- `users`-linked rows (acknowledgements, presence, preferences) are remapped by email to newly provisioned users. Unmatched rows are reported, never dropped silently.
- Seeds never run in production. All defaults arrive with the migrated data, which removes the "empty list re-seeds itself" behaviour.

---

## 4. Permission and role model translation

### 4.1 Enforcement architecture

- Every public function is built from wrapper functions:
  - `authedQuery` / `authedMutation`: signed-in, active account, email verified.
  - `capabilityMutation(cap)` / `capabilityQuery(cap)`: additionally requires the named capability.
- A CI test enumerates **every** exported public function and asserts that an unauthenticated call is rejected. The expected allowlist of exceptions is **empty**.
- Internal functions (crons, migrations) are `internal*` only. There are no public one-off migrations (fixes Inv §8).
- Client-side gates stay for a clean UI but are never the enforcement.

### 4.2 Role matrix (target)

| Action | Staff | Call Audit user | Assigned auditor | Admin | Patient-ID override |
|---|---|---|---|---|---|
| Read/write own-module records (cases, intake, billing, booked, Piedmont) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Delete one case; **Reset all cases** | ✗ (D5) | ✗ | ✗ | ✓ | ✓ if also admin |
| Ins Verifiers export | ✓ (as today) | ✓ | ✓ | ✓ | ✓ |
| Intake / Booked / Piedmont export | ✗ | ✗ | ✗ | ✓ **server-side**: export built by a gated function and logged | — |
| Booked import, per-tab reset, Queue actions | ✗ | ✗ | ✗ | ✓ | — |
| Intake Log reset, Piedmont reset | ✗ | ✗ | ✗ | ✓ | — |
| Staff rosters (all teams), managed lists | ✗ (D5) | ✗ | ✗ | ✓ | — |
| Directory clinic/department edits | ✓ (as today; confirm) | ✓ | ✓ | ✓ | — |
| Change a set Patient ID | ✗, **rejected with an error** instead of silently ignored | ✗ | ✗ | ✗ | ✓ (logged) |
| View Patient ID history | ✗ | ✗ | ✗ | ✓ | ✓ if also admin |
| Call Audits: list, create, update, upload, react | ✗ | ✓ | ✓ | ✓ | — |
| Call Audits: restricted feedback | ✗ | ✗ | ✓, checked against the **stored** auditor, and changing `auditorName` requires admin | ✓ | — |
| Call Audits: delete, roster, all Intake-audit writes and playback, Highlight purge | ✗ | ✗ | ✗ | ✓ | — |
| Grant/revoke capabilities | ✗ | ✗ | ✗ | ✓ (logged; cannot revoke own admin) | — |

- **Closed by construction:**
  - S3: `videoStorageId` accepted only from the validated upload action; `updateProfileImage` accepts only a new image upload of the caller's own.
  - S4: import IDs are recorded by the server, never taken from the client.
  - The auditor-rename bypass.
- The Patient ID override stays a **separate capability** from `admin`, as today. Only the owner may grant it.

---

## 5. Test plan: proving feature parity before cutover

### 5.1 Method

1. **Reference instance.**
   - Deploy `reference/original/` unmodified to an isolated Convex *dev* deployment the owner creates.
   - It holds **synthetic fixtures only**: generated, no PHI.
   - This is a copy of the original code, not production. It lets both apps run against the **same data**.
2. **Oracle tests.**
   - The original pure computations are imported unchanged into `packages/parity`:
     - `precertOngoingEvents`, the `casesByDay` reducer, the intake bucket matchers, `buildDayColumns`, `summarize`, `bucketCounts`, `getStaffWorkload`, `getDashboardSummary`, `getPreCertCategories`
     - the export row mappers, `qualifiesForYtdConsultSnapshot`, `effectiveValues`, `calculateScore`, the intake QA/compliance/pass/risk functions
   - The new implementation must produce **identical output** on:
     - the fixture set
     - 10,000 generated randomised datasets per function (fast-check property tests)
     - fixed clocks at the edge times listed in §5.2
3. **Playwright parity runs.**
   - The same scripted journeys run against the reference instance and the new staging app, both loaded from the same fixture snapshot.
   - Every number, row count, badge and exported file (compared cell by cell) is extracted and diffed. **Zero differences** is the pass bar, except for rows marked "deliberate deviation" (§0, D5 and the security set).
4. **Permission matrix suite:** every cell of §4.2, called directly against the backend (not through the UI), for each role, including signed-out.
5. **Staff acceptance:** a named user per team runs a scripted checklist on staging, with fixture data, and signs it off.

### 5.2 Test cases by module (IDs are stable; each maps to automated tests)

**Ins Verifiers (INV)**

*Patient ID lock and history*
- **INV-01:** A non-override user edits a case whose Patient ID is set. The update is **rejected** (a deliberate deviation from the silent revert), the stored ID is unchanged, and no history row is written.
- **INV-02:** The override user changes a set ID. The ID is updated and a `patientIdHistory` row records the old value, new value, changedBy and a server timestamp.
- **INV-03:** The override user saves the same ID. No history row.
- **INV-04:** A case with a blank Patient ID: any staff user can set it once. After that, INV-01 applies.
- **INV-05:** Patient ID history: an admin can read it; staff, signed-out users and the override account without admin are all rejected.

*Auth-status and approval timestamps*
- **INV-06:** Auth Status → cancelled stamps `authCancelledAt`. Moving away clears it. cancelled → cancelled keeps the original stamp.
- **INV-07:** Approving a Pre-Cert case (approved or partial) stamps `completedAt` (if blank) and `approvedAt` (once) and leaves Status unchanged. Parity with D1.

*Views and badges*
- **INV-08:** Buckets. A case with status `in_progress` → Pending. An unknown legacy status string → Pending. `on_hold` → On Hold. The Pre-Cert and non-Pre-Cert splits are correct for all 11 case types.
- **INV-09:** Expiring (clock fixed at 2026-10-05 10:00 local):
  - DOS 2026-10-12 → in the tab.
  - DOS 2026-10-13 → out.
  - DOS 2026-10-04 with auth `pending_pre_auth` → not in the tab, but counted in the Expiring badge.
  - The same case with auth `approved` → neither.
- **INV-10:** Urgent tab = priority urgent, open. The Urgent badge additionally needs blank/pending auth. The Priority badge ignores the date range.
- **INV-11:** Completed tab date picker uses the UTC date of `completedAt`. A case completed at 2026-10-05T02:30Z appears under 2026-10-05.

*Notes, workload, audit markers, export*
- **INV-12:** Note log. Two users add notes concurrently and **both** survive (a deliberate fix, §3.1). Any user can delete a note (parity). A deletion is audit-logged.
- **INV-13:** Staff Workload counts only open statuses, with Verification and Pre-Cert split correctly by priority. The Call Audits line counts only Completed audits, matched case-insensitively by name.
- **INV-14:** Documentation Audit set, cleared and filtered (All / Audited / Not Audited). The label `reviewed` shows "In Progress" (parity).
- **INV-15:** Export.
  - The xlsx has exactly the 15 columns in order.
  - The PDF and print have 9 columns, including the "Pre-Cert Task" column holding Auth Status (parity).
  - A Completed range excludes cases with no `completedAt`.
  - Output is cell-identical to the reference on fixtures.
  - Print output is HTML-escaped (security fix; the visible text is identical).

*Verification pages*
- **INV-16:** Acknowledgement is one per user per page and idempotent. An update needs text or a screenshot. Neither is possible signed out.

**Pre-Cert credit and productivity (PC, SP, RP)**

*Pre-Cert credit (PC)*
- **PC-01:** A case created with notes where creator = assignee gives 1 On-going event on the creation date. Creator ≠ assignee gives 0.
- **PC-02:** 3 `noteLog` entries by the same person on the same day give 3 events (per-note, not per-day).
- **PC-03:** A case with no notes gives 0.
- **PC-04:** A direct Notes-box edit credits `notesUpdatedBy` on `notesUpdatedAt`. A second edit moves the credit (parity).
- **PC-05:** An Approved (or Partial Approval) case: every note event counts as Approved, including notes written before approval.
- **PC-06:** Approved **and** Status In Progress: each note counts as both Approved **and** On-going (parity D1). The Qualified Total includes both.
- **PC-07:** Completed + Denied: no On-going and no Approved credit.
- **PC-08:** Approved, then Auth cancelled on day C: notes before C → Approved; notes on or after C → On-going, even while the case is Completed.
- **PC-09:** Cancelled, never approved, Completed: notes before C → none; on or after C → On-going.
- **PC-10:** Cancelled with `authCancelledAt` missing: the cancel date falls back to the `updatedAt` date.
- **PC-11:** A note at 2026-10-05T23:30-04:00 (= 2026-10-06T03:30Z) is credited to 2026-10-06 (the UTC slice; parity D3).

*Staff Daily Productivity (SP)*
- **SP-01:** A range covering a Sat and Sun shows no weekend columns. Activity dated on the weekend is excluded from row totals and from the This Week/This Month cards.
- **SP-02:** Task Completed counts non-Pre-Cert completed cases by `completedAt` date. Pre-Cert completions are not counted here.
- **SP-03:** Call Audits. An audit with status In Progress → 0. Completed → counted on its `dateReviewed`.
- **SP-04:** Intake buckets.
  - Inbound entry `other_concerns`, count 4 → Inbound Other +4.
  - Outbound `missed_appt` with result `informed_pt` → **not counted anywhere** (parity).
  - Outbound `missed_appt` with result `booked_consult_appt` → Outbound New PT.
  - `scheduling` with result `no_ans_lvm` → VM/No Answer (parity).
- **SP-05:** Boost categories appear in BOOST APPTS only, and are excluded from Total Outbound and from the Qualified Total.
- **SP-06:** The Qualified Total equals the three team sums for every day and for the range, in the print output too.
- **SP-07:** Rows totalling 0 are hidden.

*Reports tab (RP)*
- **RP-01:** Tasks Completed = completed tasks + completed cases, excluding approved/partial Pre-Cert. A completed **Denied** Pre-Cert case **is** counted here and not in SP-02 (parity).
- **RP-02:** The KPI cards ignore the Team filter. Intake Activity includes Boost.
- **RP-03:** Intake Team Call Audits uses the manual metric. The Verification rows use Completed audits.
- **RP-04:** Weekends are included.
- **RP-05:** The Created/Completed range appears only with the Verification Team filter and behaves per Inv §5.3.
- **RP-06:** The team priority for a person on several rosters is Intake > Verification > Billing > Other.
- **RP-07:** The Boost report uses its own date range.

**Intake (IN)**

*Activity Log*
- **IN-01:** One entry with Count 5 → the Activity Log shows 1 row, and every report shows 5 (Inv §6.3; do not "fix").
- **IN-02:** Save rules. Count > 0 with no category → error. A category with Count 0 → the entry is dropped (and metrics still save if filled). A Boost category → Result stripped.
- **IN-03:** Metrics upsert. Saving metrics twice for the same staff and day → the second **overwrites** the first (parity; fix-flagged).
- **IN-04:** Raw Entries shows one row per non-zero metric. Deleting one row deletes that day's whole metrics record (parity; fix-flagged, a confirm dialog added).
- **IN-05:** The Intake Log excludes Boost. The direction filter uses the category definition. There are 25 rows per page.
- **IN-06:** Export (admin, server-gated): columns Patient ID, Staff, Call Reason, Resolution, Notes, Date. The Date column comes from `createdAt` (parity). There is no Count column. A non-admin calling the export function directly is rejected.
- **IN-07:** Reset is admin-only and deletes intake entries only; metrics survive.

*Intake reports*
- **IN-08:** Productivity cards include the Boost column and the Admin total, including manual Call Audits. The hard-coded former staff member is excluded.
- **IN-09:** Activity Reports. Boost is excluded from the Inbound/Outbound tables. The Admin table's Boost rows ignore the staff filter.
- **IN-10:** The Daily view for a viewer at UTC+8 matches the reference instance under the same browser timezone (parity, including the off-by-one).

*Piedmont: Epic*
- **IN-11:** At least one of REF ID, MR# or CHART is required.
- **IN-12:** Export (admin): 6 columns, including the hidden REF ID and MR#.
- **IN-13:** Reset and To Provider add/remove are admin-only on the server.

**Booked Tracker (BK)**

*Groups, YTD and dashboard*
- **BK-01:** Cascades.
  - Boost → Consult only.
  - SMB Follow Up → the 7 service types.
  - Changing location clears an invalid provider.
  - An unknown source string counts as SMB.
- **BK-02:** YTD. A Consult / non-Medical-Weight-Loss / current-ET-year row snapshots its status on create. A later status change doesn't change YTD. A row created before the feature snapshots on first touch. A row from a prior year with a snapshot stays in YTD (parity; fix-flagged).
- **BK-03:** Dashboard on a fixture of 10 rows (4 Showed, 2 No-Show, 1 Cancelled, 3 Pending): Conversion = 40% and Show Rate = 57% (4/7). Clinic Show Rate excludes appointments after today.

*Import, reset and the Queue*
- **BK-04:** Import.
  - Header aliases map correctly.
  - A blank source becomes `SMB-PLD`.
  - A name-only row is skipped.
  - The server records the created IDs.
  - A non-admin direct call is rejected.
- **BK-05:** Reset on the SMB tab deletes SMB rows only and snapshots them. Undo restores them. Undo twice is rejected.
- **BK-06:** Remove imported data deletes only that batch. A client cannot inject IDs (S4 closed).
- **BK-07:** Queue: the latest 100 entries, with closed ones hidden. All actions are admin-only on the server.

*Export, notifications and presence*
- **BK-08:** Export: 12 columns; cell-identical to the reference, with the browser at America/New_York.
- **BK-09:** Notifications cover today (ET) or past Pending appointments. Presence appears within 5 s and clears within 15 s.

**Billing (BL)**
- **BL-01:** Count is clamped to at least 1. An entry with no category shows as "Legacy Billing Task" and is excluded from the This Month category table.
- **BL-02:** Fax/NPC counts only billing-roster names (an Intake person with the same name is not pulled in).
- **BL-03:** The Billing summary in Reports equals Σ `tasksCompleted` per category over the window.

**Call Audits (CA)**

*Scoring*
- **CA-01:** Verification score. The ratings [5,5,4,0,…] → the mean over non-zero ratings / 5 × 100, rounded. All zero → 0. The server rejects a missing criterion or a non-integer rating.
- **CA-02:** Pre-certification swaps exactly one criterion.
- **CA-03:** Intake QA/Compliance.

  | QA | Compliance | Result | Risk |
  |---|---|---|---|
  | 85 | 100 | Pass | Low |
  | 84 | 100 | Fail | Low |
  | 100 | 99 | Fail | Moderate |
  | any | 50 | Fail | High |
  | any | HIPAA unscored | Fail | High |

  Client-sent scores are ignored.

*Access*
- **CA-04:** Restricted feedback. The assigned auditor can edit it. Another roster user is rejected. Renaming `auditorName` without admin is rejected (bypass closed).
- **CA-05:** Recordings. MP4, WebM and MP3 pass the magic-byte check. A renamed `.txt` fails and its upload is deleted. `kind=intake` playback is admin-only. A client-supplied `videoStorageId` is rejected (S3 closed).
- **CA-06:** A non-allowlisted user sees an access message, not the global error screen (fix).
- **CA-07:** Reactions are one per user per audit or highlight; the same emoji toggles, a different one swaps.

**Directory, Settings and managed lists (DR)**
- **DR-01:** Clinic and department edits persist. Provider and member removal is immediate. Editable fields follow the department name rules.
- **DR-02:** Removing a managed-list value (a provider or requester) keeps it on saved cases. The Request-by field still shows it as "(saved)".
- **DR-03:** Settings: password change via OTP, name, photo.

**Security and platform (SEC)**
- **SEC-01:** Every public function rejects a signed-out caller. The test enumerates the functions automatically.
- **SEC-02:** A `signUp` flow is rejected on the server.
- **SEC-03:** An unverified email gets no capabilities, even if it matches a seeded role.
- **SEC-04:** The whole §4.2 matrix.
- **SEC-05:** Logs contain no PHI.
  - A log scan over a full test run finds no fixture Patient IDs, MR#s, phone numbers or emails.
  - Error messages never echo field values.
- **SEC-06:** No secrets in the repo (secret scan in CI). Env vars are listed only in the docs.
- **SEC-07:** The audit log records every write, export, Patient ID history view and recording play, with no field values.
- **SEC-08:** Sessions expire after inactivity (the timeout value is the owner's call; 30 minutes suggested) and on sign-out.

### 5.3 Exit criteria for parity sign-off

- 100% of oracle and property tests pass.
- 0 unexplained Playwright diffs.
- 100% of the SEC suite passes.
- Staff sign-off for each phase.
- The owner signs the decision log (§0) for every deliberate deviation.

---

## 6. Cutover plan

### 6.1 Pre-cutover gates

| Gate | Condition |
|---|---|
| **G0** | BAA signed for the backend (Convex, or the fallback) and for email if it carries PHI. Owner-owned accounts. MFA policy decided. |
| **G1** | Parity sign-off (§5.3) on staging with fixtures |
| **G2** | **Owner's written approval to handle live data**, for the rehearsal |
| **G3** | Rehearsal migration passes reconciliation (§6.3) |
| **G4** | Owner's written go/no-go for cutover |

### 6.2 Rehearsal (after G2)

The owner, or Viktor on the owner's behalf, produces a **read-only export** of production:
- the Convex snapshot export
- the storage files

That export is the only production interaction; nothing is written to production. The export is:
- encrypted
- stored only in BAA-covered storage
- imported into **staging**
- deleted from staging after reconciliation, unless the owner decides otherwise

### 6.3 Reconciliation (rehearsal and real cutover)

1. **Row counts** per table: old vs new, with zero unexplained difference.
2. **Field checksums:** a per-table hash over key fields (IDs, dates, status, counts), old vs new.
3. **Storage:** every file's size and SHA-256 matches, and every reference resolves.
4. **Report parity on real data.** Just before the freeze, capture from the old app:
   - Staff Daily Productivity and Qualified Total for the last 8 working weeks
   - Reports for the last 3 months
   - Intake Activity Reports for the last month
   - the Booked Dashboard
   - export files
   
   The new app must produce identical figures on the migrated data.
5. **Permissions:** each real user's capabilities are printed and signed off by the owner.

### 6.4 Cutover window (suggested: a weekend, since the team works Mon–Fri)

**Friday, before the freeze**
1. **Fri 17:00 ET:** announce the freeze.
2. **Fri 18:00 ET:** staff stop writing to the old app. The freeze is enforced by policy, because production isn't modified. Optionally, the owner approves a one-line production change to disable writes.
3. Final production export → import → reconciliation (§6.3).

**Saturday–Sunday**
4. Provision accounts. Send invite and verification emails.
5. The owner and one lead per team smoke-test with real data.

**Monday**
6. **Mon 07:00 ET:** go/no-go (G4). On go, staff move to the new URL and the old app remains available **read-only by policy**.

### 6.5 Fallback period

- The old app stays up, unchanged and read-only by policy, for **30 days** after go-live. It is the fallback and the reference for any disputed number.
- After 30 days, and with owner approval, it is archived.
  - A final export is kept under the clinic's record-retention policy.
  - Viktor hosting is closed.

---

## 7. Rollback plan

- **Triggers** (any one, during or after cutover):
  - reconciliation mismatch
  - a P1 defect: staff can't log core work, a wrong number in a productivity report, or a permission failure
  - the owner's call
- **Before go-live:** abort. The old app is untouched and staff simply continue in it on Monday.
- **After go-live, within the 30-day window:**
  1. Staff return to the old app, which has been unchanged since the freeze.
  2. Every write made in the new app after go-live is identified through `auditLog` plus `legacyId`, and exported as a **delta file**.
  3. The delta is re-entered into the old app. With the owner's written approval, it may be replayed through a script run by the owner, since that writes to production.
  4. Fix the cause, re-run §5 and §6.
- **Bounded risk:** the old app's data is frozen at the cutover point. The delta covers only the days since go-live, and the audit log identifies every one of those writes.

---

## 8. Security items outside the rebuild

The live app's holes (Inv §0: S1–S5) exist **today**, and the rebuild does not fix them until cutover. Whether to hot-fix production is the owner's decision, and it would be a production change. The smallest effective patch is to add a sign-in check to every exported function and to disable `signUp`, in the Viktor app. If the owner wants it, a patch list can be written as a separate document.

---

## 9. What approval of this plan authorises

Approving this plan authorises **Phase 0 only**, in the new environment, with synthetic data:
- the repo restructure
- the new Convex project, which the owner creates
- the reference instance
- CI
- auth and roles
- the parity harness

**Each later phase, G2 (live data) and G4 (cutover) need their own written approval.**
