# SMB Beltline Tracker (Bari Ops Tracker): Step 1 Source Inventory

**Status:** Step 1 (analysis) only. Nothing has been built. No production system was touched.
**Source analysed:** `SMB-Beltline-Tracker-Source-2026-09-25.zip` (the Viktor source export, dated 2026-09-25).
- The export's `SHA256SUMS.txt` verified every file.
- The zip is byte-identical to the one committed to `Wence-W/SMB-BELTLINE-TRACKER` on 2026-09-28.

**Method**
- Every backend file (`convex/*.ts`, 5,741 lines) was read in full.
- Frontend modules (about 24,000 lines excluding `components/ui/*`) were read in full, split across four reviewers.
- High-impact claims were re-checked directly against the source.
- Citations are `path:line`, relative to the export root.

**Privacy**
- This document contains no patient identifiers.
- It contains no staff email addresses. The source contains about 20 of them in hard-coded allowlists; they are referred to here by role only.
- It does not reproduce source code.

---

## 0. Read this first: findings that affect the live app today

These are properties of the **current production code**. They are not rebuild concerns. Fixing them means changing the live app, which is outside this project's no-touch boundary, so they are listed for the owner to decide on.

| # | Finding | Evidence |
|---|---|---|
| S1 | **92 of 149 browser-callable backend functions have no authentication check.** Examples:<br>• `cases.listAll` returns every case: Patient ID, insurance, auth #, notes.<br>• `cases.deleteAll` and `tasks.deleteAll` wipe all rows.<br>• Staff, billing, intake, appointments, directory and provider-list edits and deletes.<br>In Convex, a public function is callable by anyone who knows the deployment URL, and that URL ships in the frontend bundle. The UI's route guard (`ProtectedRoute`) does not protect the functions. | Scan of every `export const … = query/mutation/action`, comments stripped. Examples: `convex/cases.ts:49-54`, `:247-252`, `:391-397`; `convex/tasks.ts:117-123`; `convex/billing.ts` (all of it) |
| S2 | **Self-signup is open, with no email verification, and privileges are granted by email string.** Sign-up side:<br>• The Password provider has no `verify` step and no profile restriction.<br>• `/signup` is routed and linked from the login page.<br>Privilege side:<br>• Admin rights = 4 hard-coded emails.<br>• Call Audit access (patient IDs, recordings) = 21 hard-coded emails, 7 of which are `@bariops.local` demo/test addresses.<br>Consequence: anyone who registers an allowlisted address that has no account yet gets that address's rights. Viktor SSO also sets `allowDangerousEmailAccountLinking: true`. | `convex/viktorSpaceAuthConfig.ts:28-35`; `src/components/SignUp.tsx:80`; `convex/permissions.ts:10-15`; `convex/callAuditPermissions.ts:7-31`; `src/lib/viktor-spaces-access/authjs.ts:90-93` |
| S3 | **Recording access can be widened.**<br>• `callAudits.create/update` accept any client-supplied `videoStorageId`, bypassing the validated upload path.<br>• `users.updateProfileImage` turns any storage ID into a permanent public URL. | `convex/callAudits.ts:56,366,400`; `convex/users.ts:32-46` |
| S4 | **Fake import entries can make an admin delete appointments.** `reports.logReportEvent` is ungated and accepts arbitrary `importedIds`. An admin who clicks "Remove imported data" on a planted entry deletes those appointments. | `convex/reports.ts:13-35`, `:66-88` |
| S5 | **The legacy Verification Call Audits deployment (`quaint-parrot-788`) is described in code as "broadly public".** Its `callAudits:listAll` is still read unauthenticated every 30 s. | `convex/callAuditMigration.ts:10,74-76`; `src/lib/verificationCallAudits.ts:8-14,40-60` |
| S6 | **The full source zip is in a public GitHub repo** (`Wence-W/SMB-BELTLINE-TRACKER`, pushed 2026-09-28 08:11 ET). The export's own README says to keep it private. This combines with S1 to form an exploit roadmap. | Verified by anonymous clone |

---

## 1. Stack and hosting (as built)

- **Frontend:** React 19.2, Vite 8, TypeScript 5.9, Tailwind 4, React Router 7, Recharts 3, SheetJS `xlsx` 0.20.3 (from the SheetJS CDN), jsPDF 4 plus autotable, date-fns 4. Bun lockfile.
- **Backend:** Convex 1.31 (DB, functions, file storage, HTTP actions) with `@convex-dev/auth` 0.0.95.
- **Platform coupling (Viktor Spaces):**
  - Access-mode env var (`convex/viktorSpaceAuthEnv.ts`).
  - "Sign in with Viktor" OAuth (`src/lib/viktor-spaces-access/*`).
  - Password-reset email via the Viktor send-email API (`convex/ViktorSpacesEmail.ts`).
  - Viktor tools proxy (`convex/viktorTools.ts`, which the UI doesn't use).
  - SPA hosting (`vercel.json`, `viktor.space.json`).
- **Not in the export:**
  - **No `crons.ts`.** Email notifications for cases and tasks (assigned, due-soon, expiring, overdue, completed, updated) are sent by an **external "Viktor email cron"**. It calls the public, ungated `cases.markNotified`, `cases.markUpdateNotified`, `tasks.markNotified` and `tasks.markUpdateNotified` (`convex/cases.ts:254-274`, `convex/tasks.ts:62-87`; flags in `convex/schema.ts:38-44,158-162`). Its schedule, recipients and templates must come from Viktor or the owner.
  - E2E scripts (removed by the exporter because they contained credentials).
  - Data, storage files and accounts.

---

## 2. Authentication and account/roster model

**Sign-in methods** (`convex/viktorSpaceAuthConfig.ts`, `src/components/SignIn.tsx`)
1. **Email + password** (Convex Auth `Password`).
2. **Forgot or change password:** a 6-digit OTP, valid 15 minutes, emailed through the Viktor API (`convex/ViktorSpacesEmail.ts:107-124`; `src/pages/SettingsPage.tsx:129-170`).
3. **"Sign in with Viktor":** OAuth code flow with PKCE and state, scoped to this Space. Enabled only when `VIKTOR_AUTH_RESOURCE_ID` and `VIKTOR_AUTH_BASE_URL` are set. Auto sign-in via `?viktor_sign_in=auto` (`src/lib/viktor-spaces-access/authjs.ts`, `src/components/ViktorAutoSignIn.tsx`). This is the "workspace SSO option".
4. **Admin-created accounts:** `adminCreateAccount.createPasswordAccount`, an internal action run from the CLI (`convex/adminCreateAccount.ts`).
5. **Test login (`@test.local`):** the UI code is still present, but the backend provider was stripped from the export, so it always fails (`convex/testAuth.ts`, `convex/auth.ts:34-38` comment is stale).

**"No self-signup" is not true in code.** See S2. `/signup` exists (`src/auth/authenticated/AuthenticatedAppRoutes.tsx:25`) and the backend accepts `flow: "signUp"`.

**Route protection** is client-side only (`src/components/ProtectedRoute.tsx:66-78`). The whole app lives at `/dashboard?tab=…&sub=…`.

**Accounts → staff mapping.** There is no single roster. Four separate lists are matched in different ways:

| List | Table | Matched to login by | Used for |
|---|---|---|---|
| Verification staff | `staff {name,color,email?}` | `users.email === staff.email`: exact, case-sensitive, on the server (`convex/cases.ts:11-22`). The client matches case-insensitively (`src/pages/BariTrackerPage.tsx:227-236`). | Case assignee dropdown, Created By, `notesUpdatedBy`, verification-page authorship. It is also the required parent list for the Call Audit roster. |
| Intake staff | `intakeStaff {name,email}` | **Not matched.** The email is stored but never used; attribution is a free-text name picked in the form. | Intake log staff picker, reports |
| Billing staff | `billingStaff {name,email}` | Not matched (same as intake) | Billing log, reports |
| Call Audit roster | `callAuditRoster {name,normalizedName,userEmail,active}` plus a change log | Email lookup, then **normalized name** compared to the audit's `auditorName` (`convex/callAuditPermissions.ts:75-96`). Two intake auditors are mapped by a hard-coded name→email map (`:102-136`). | Who may write restricted coaching feedback |

A person on several lists is placed in one team for reports, in this priority: Intake > Verification > Billing > Other (`src/components/productivity/ReportsTab.tsx:449-473`).

---

## 3. Permission model (as enforced vs as displayed)

Tier names are used below instead of emails.

| Tier | Definition | Server-enforced rights |
|---|---|---|
| **Signed-out / anyone with the URL** | none | Everything listed in S1 (92 functions) |
| **Signed-in user** | any account | The same, plus: preferences, presence, acknowledgements, verification-page updates, `callAudits.countsByAuditor`, profile |
| **Call Audit user** | 21-email allowlist (`convex/callAuditPermissions.ts:7-31`) | List/get Verification audits, Intake audits and Highlights. Create/update Verification audits. Upload Verification recordings and Highlights. React. Play Verification and Highlight recordings over HTTP. |
| **Assigned auditor** | roster row whose normalized name equals `auditorName` | Write restricted feedback (notes, coaching, missing-docs). The check runs only when those fields change, and against the *current* auditor name, so it can be bypassed by first renaming the auditor (`convex/callAudits.ts:386-397`). |
| **Admin (4 accounts)** | `RESTRICTED_ACTION_EMAILS` (`convex/permissions.ts:10-15`), mirrored client-side (`src/lib/permissions.ts:8-13`) | Booked Tracker import, reset per tab, Queue (remove import, undo reset, close). Intake Log reset. Piedmont reset. Intake staff add/remove. Piedmont To-Provider list. Booked Scheduler/Provider options. Patient ID history read. Call Audit delete. Roster management. All Intake-audit writes, uploads and playback. Highlight purge. |
| **Patient-ID override (1 account)** | a single hard-coded email (`convex/cases.ts:29`, `src/lib/permissions.ts:27`). It is *also* one of the 4 admins, but is deliberately a separate constant. | Change a Patient ID after it has been set. Each change is logged to `patientIdHistory`. |

**Gated in the UI only; the server does not enforce these.** Each can be done by calling the backend directly.
- Intake Log **Export**, Booked Tracker **Export**, Piedmont **Export** and **Queue visibility**. All data comes from ungated list queries (`convex/intake.ts:51-56`, `convex/appointments.ts:53-58`, `convex/piedmontReferrals.ts:65-70`, `convex/reports.ts:37-45`).

**Not gated anywhere, in the UI or on the server:**
- Case delete and **Reset (delete all cases)** (`src/pages/BariTrackerPage.tsx:725-731`).
- Ins Verifiers export.
- Staff, provider and requester list management.
- Documentation Audit.
- Bookmarks.
- Billing staff and entries.
- Directory edits.
- Note deletion.

> ⚠ **Differs from the brief:** the brief says the 4 admins have "roster/deletes" rights. In code, most deletes and roster edits are open to everyone. Only the Intake staff roster, the Call Audit roster and Call Audit deletes are admin-only.

---

## 4. Module map (navigation)

All modules live under `/dashboard`. Views are chosen by `?tab=` and `?sub=` (`src/pages/OperationsPage.tsx:148-159`; sidebar in `src/components/AppSidebar.tsx`). No navigation item is hidden by role.

```
Dashboard                         tab=cases&sub=dashboard        CasesDashboard charts (+ "classic overview")
Call Audits                       tab=call-audits                Dashboard · Verification Audits · Intake Audits · Intake Highlights ·
                                                                 Highlights · Reports · Storage · Verification Summary (external)
Staff Daily Productivity          tab=staff-productivity         sub-views: Staff Daily Productivity | Qualified Activities Total
  └ Reports                       tab=reports                    per-staff/team performance tables, Boost report, Billing summary
Historical Activity               tab=historical                 static 24-month archive (2024-08 → 2026-07), charts + trend
Intake                            tab=intake                     (!) renders the REPORTS view: Activity Reports / Daily / Weekly / Monthly
  ├ Intake Directory              tab=directory                  Clinic · Departments · Intake Team (roster)   ← the "Beltline Directory"
  ├ Activity Log                  tab=intake-reports             (!) renders the LOG view: Intake Activity · Piedmont: Epic · Raw Entries
  └ Booked Tracker                tab=intake-booked              Dashboard · All · SMB · Boost · Year-to-Date Consults
Billing                           tab=billing                    roster, Fax Docs / New Patient Chart logging, "This Month" table
  └ Activity Log                  tab=billing-activity           categorized billing log
Ins Verifiers                     tab=cases&sub=verification_team  Staff Workload cards
  ├ Cases                         tab=cases&sub=all_cases        in-page: Dashboard · All Cases · Pre-Cert · Verification Team
  ├ Urgent / Priority / Expiring / Completed   tab=urgent|priority|expiring|completed
  ├ Verification Workflow Process tab=verification-process       static SOP + Updates log + acknowledgements
  └ Verification Guidelines       tab=verification-guidelines    static SOP (pop-up comment rules) + Updates + acknowledgements
Settings                          /settings                      profile name/photo, change password
```

`(!)` The tab names are swapped relative to their labels (`src/pages/OperationsPage.tsx:619-625`). The rebuild must keep the *labels* users know.

**Not in the brief:** Call Audits (a whole module, migrated from two earlier apps), Historical Activity, the Reports tab, the Intake Reports views, Settings, and the legacy (unused) Task Management tool.

---

## 5. Modules in detail

### 5.1 Ins Verifiers (cases)

**Case types** (`src/lib/types.ts:5-16`; labels at `src/components/bari/CaseModal.tsx:87-99`)
- Verification: `urgent`, `initial_consult`, `followup_consult`, `no_appointment`, `reverification`, `predetermination`.
- Pre-Cert: `precert_bari`, `precert_veins`, `precert_general`, `precert_modified_urgent`, `precert_egd`.

**Status:** `new`, `in_progress`, `completed`, `on_hold`, `reassigned`, `cancelled`.
- Legacy `pending`, `approved`, `partial_approval` and `denied` were migrated on 2026-07-22 (`convex/cases.ts:300-329`).

**Priority:** `urgent`, `high`, `standard`.

**Auth Status** (Pre-Cert only): `pending_pre_auth`, `approved`, `partial_approval`, `denied`, `peer_to_peer`, `appeal`, `pending_pred`, `cancelled`. `cancelled` was added 2026-09-02.

**Case modal** (`src/components/bari/CaseModal.tsx`)

| Field | Rule |
|---|---|
| Patient ID | Required |
| DOS | Optional |
| Expiration Date | Optional |
| Case Type | Defaults to `initial_consult` |
| Status | Required |
| Request by | Reverification only; managed list |
| Auth Status | Pre-Cert only |
| Provider | Pre-Cert only; managed list |
| Priority | Defaults to `standard` |
| Assigned To | Staff list |
| Insurance Provider | — |
| Authorization # | — |
| Notes | — |

- Fields that don't apply to the chosen case type are cleared on save (`:238-250`).
- **Created By** is not on the form. It is set on add from the logged-in user's staff name, or "Unknown" (`src/pages/BariTrackerPage.tsx:227-268`).
- **`completedAt`** is stamped when status becomes Completed **or** a Pre-Cert auth becomes Approved or Partial Approval. It is never cleared (`CaseModal.tsx:262-278`).
- **`approvedAt`** is stamped once and never cleared.
- **Approval does not change Status** (see §6.1).

**Patient ID lock** (`convex/cases.ts:110-128`)
- Once a non-blank Patient ID exists, any other caller's new value is **silently replaced** by the stored one; no error is raised.
- Only the override account can change it. Each change writes `patientIdHistory` (old, new, changedBy, changedAt), going forward only.
- The history is readable only by the 4 admins (`:170-183`; UI `CaseModal.tsx:15-63,313-315`).
- The UI locks the field as a courtesy (`:283-352`).
- Uniqueness of Patient ID is not enforced anywhere.

**Note log** (`src/components/bari/CaseNotesModal.tsx`)
- "Added by" is a **manual staff picker**, remembered in localStorage.
- Each add or delete writes the **whole array** through ungated `updateNotes`, last write wins. Any user can delete any note.
- The Edit modal also resends a stale `noteLog` snapshot (`BariTrackerPage.tsx:85`).
- Direct edits to the Notes box are stamped server-side with `notesUpdatedAt`/`notesUpdatedBy`, **latest edit only** (`convex/cases.ts:139-156`).

**Views**

| View | Rows shown | Evidence |
|---|---|---|
| All Cases | Non-Pre-Cert cases, in status sub-tabs New / Pending / Completed / Reassigned / Cancelled / On Hold. "Pending" = everything not in the other buckets. Completed has a date picker on the UTC `completedAt` date. | `src/pages/BariTrackerPage.tsx:454-499,947-992` |
| Pre-Cert | Same buckets, with an Auth Status filter | `:500-551` |
| Urgent | Tasks with priority urgent, not completed/cancelled; plus cases with **priority** urgent and an open status | `src/pages/OperationsPage.tsx:194-203,304-314` |
| Priority | Urgent + high, for tasks and open cases. High was added 2026-07-17. | `:204-215,293-303` |
| Expiring | Tasks: `expirationDate` within 7 days **or already past**. Cases: **DOS** 0–7 days ahead (past DOS excluded; the case `expirationDate` field is not used). | `:281-287,331-337`; `src/lib/computations.ts:32-39` |
| Completed | Completed tasks, plus completed cases. Filters: date picker, range, staff, case type, priority, sort (added 2026-09-24), Documentation Audit (All / Audited / Not Audited). Other Cases are listed before Pre-Cert. Clicking a Patient ID toggles a **multi-select** audit bookmark. | `:216-280,485-510`; `convex/cases.ts:199-212` |
| Created/Completed range | Shared Created/Completed date range on every tab (Gretchen 2026-08-13) | — |

**Sidebar badges** (`src/components/AppSidebar.tsx:117-148`)
- **Priority** = open high/urgent cases + open high/urgent tasks. It ignores the date range.
- **Urgent** = open urgent cases where Auth Status is blank, `pending_pre_auth` or `pending_pred`.
- **Expiring** = cases whose DOS is **past** and whose Auth Status needs an update.

> Badge ≠ tab: the Expiring badge counts past-due DOS, which the Expiring tab never shows.

**Documentation Audit / QA** (`convex/cases.ts:214-245`; `src/lib/docAudit.ts`; `src/components/tasks/DocAuditModal.tsx`)
- Statuses: `reviewed` (the UI label is **"In Progress"**) or `audited`. Blank means Not Audited.
- Fields: auditor name (free text, required in the UI only), notes, and a server timestamp.
- It is independent of workflow status.
- Any user can set it; the server doesn't check that the case is Completed.

**Staff Workload cards** (`src/lib/computations.ts:143-167`; `src/components/bari/StaffWorkload.tsx`)
- Counts **open** cases only (Wence 2026-07-22), split into Verification and Pre-Cert, each broken down by urgent/high/standard.
- Extra lines (all-time totals):
  - Fax Docs and New Patient Chart (sums of `intakeDailyMetrics`).
  - Call Audits: **Completed** audits via `countsByAuditor`, matched by lowercased name.
  - Inbound Other Concern.
  - Urgent Tasks.
  - Expiring Tasks (≤ 7 days, past-due included).
- Staff can log Fax / Chart / Other Concern from the card.

**Dashboards**
- **`CasesDashboard`** (`src/components/bari/CasesDashboard.tsx:189-261`)
  - Cohort = cases **created** in range, by UTC date.
  - KPIs:
    - Total
    - Open
    - Completed
    - Completion Rate
    - Urgent
    - Auth Approved (approved + partial)
    - Auth Pending
  - Charts: breakdowns by status, type, priority, auth status and top-10 staff; created vs completed per day; monthly volume.
- **Classic overview:**
  - SummaryCards (`computations.ts:169-183`).
  - Urgent Bari section (by **caseType** `urgent`, not priority).
  - Consult sections.
  - **Pre-Cert Tracker**, where "Approved" = `approved` **only**, excluding `partial_approval` (`computations.ts:107`). This is inconsistent with the rest of the app.

**Export** (`src/components/bari/ExportDialog.tsx`; `src/lib/exportUtils.ts`)
- **Who can use it:** anyone.
- **Filtering:**
  - The popup is pre-filled from the on-screen filters (Wence 2026-09-24).
  - Adds a Completed From/To filter on top.
  - The source is **all cases**.
  - A completed range excludes cases with no `completedAt`.
- **Formats:**
  - **Excel** (SheetJS, `bari-ops-tracker.xlsx`), 15 columns: Patient ID, DOS, Expiration Date, Case Type, Status, Auth Status, Priority, Assigned To, Insurance Provider, Authorization #, Notes, Created At, Updated At, Completed At, Approved At. Not exported: Provider, Request by, Created By, note log, doc audit.
  - **PDF** (jsPDF, landscape) and **Print** (HTML): 9 columns, where the "Pre-Cert Task" column actually holds Auth Status. The summary line shows Total / Completed / Remaining / Approved; Print adds Productivity %.
- Print HTML is not escaped (`exportUtils.ts:254-269`).

**Verification Workflow Process / Guidelines** (`src/components/productivity/BariVerificationProcessTab.tsx`, `BariVerificationGuidelinesTab.tsx`, `VerificationUpdatesAndAck.tsx`; `convex/verificationPages.ts`)
- **The SOP text is hard-coded in the page.**
  - Process covers 10 steps: Slack update, patient profile, Bari sheet, call script, export, pop-up comment, footnotes, task notes, task category (scenarios A/B/C), and the tracker update.
  - Guidelines has 5 pop-up/comment rules: specific-CPT reverification, onshore reverification, predetermination (with its Telehealth exception), COB updates, and PCP referral. Each comes with fixed pop-up strings.
  - There is **no logic that enforces** these rules; they are reference text only.
- **DB-backed parts, per page:**
  - An **Updates log** of text and/or a screenshot, newest first. It cannot be edited or deleted. The upload URL is ungated.
  - A **one-click acknowledgement**, one per user per page. It is track-only, never a gate, and the list is visible to all.
- **The brief says "signature log".** In code it is a one-click acknowledgement with a name, email and timestamp, not a signature.

**Tasks** (legacy)
- The `tasks` table and TaskTable views remain: tasks appear in the Urgent, Priority, Expiring and Completed views.
- **There is no way to create a task in the UI** (`src/pages/OperationsPage.tsx:102,354`).
- Reports counts completed tasks, even though a comment calls the tool "essentially unused" (`ReportsTab.tsx:197-199`).

### 5.2 Staff Daily Productivity and Qualified Activities Total (`src/components/productivity/StaffProductivityTab.tsx`)

**Period and columns**
- Period presets: Today, Week (the default, Mon–Sun), Month, Custom.
- **Columns are weekdays only** (Wence 2026-08-26, `:109-120`).
- Rows whose total is 0 are hidden (`:369-371`).

**Verification Team section**
- **Task Completed** = non-Pre-Cert cases with status completed, dated by `completedAt` (`:225-228`).
- **Pre-Cert Approved** and **Pre-Cert On-going**: see §6.1.

**Intake Team section**
- The **sums** of `count`, bucketed as follows (`:283-356`):
  - Inbound: New PT, Veins, FU, Other, and Total Inbound.
  - Outbound: New PT, Veins, FU, Other Concern (Missing Info, Confirm Appt, Prioritylist, Referral, legacy), Callback, VM/No Answer, and Total Outbound.
- Also shown:
  - EMAILS, GHL CHATS, NEW PT INPUT and FAX DOCS from `intakeDailyMetrics`.
  - **CALL AUDITS** from real Completed audits by `dateReviewed` (Wence 2026-08-26).
  - Total Booked (New PT / Veins / FU).
  - A separate **BOOST APPTS** block.

**Billing section:** `Σ billingEntries.tasksCompleted`.

**Qualified Activities Total** (`:429-457`, Wence 2026-08-26)
- **Verification** = Task Completed + Pre-Cert Approved + Pre-Cert On-going + Call Audits (Completed).
- **Intake** = Total Inbound + Total Outbound + emails + GHL chats + new-PT input + fax docs.
- **Billing** = billing tasks.
- **Boost rows and subtotal rows are excluded.**
- This Week and This Month cards are computed on weekdays only.

**Print:** HTML print of either view. There is no Excel export.

**⚠ Silently dropped categories.** In the outbound buckets, the active categories **`missed_appt`** and **`scheduling`** are counted **only if** their Result is Booked Consult, Booked FU or No-Ans/LVM.
- For Scheduling this is intended: "data-entry only, omitted from reporting", Wence 2026-08-27 (`src/lib/intakeTypes.ts:28-30`). Even so, a booked result still leaks it in.
- For **Missed Appt** it looks unintended. Missed Appt entries with other results appear nowhere in this sheet or the Qualified total.

### 5.3 Reports tab (`src/components/productivity/ReportsTab.tsx`)

**Data and period**
- Sources: tasks, cases, intake entries, billing entries, the three rosters, daily metrics, and call-audit counts.
- Period: Today / This Week / This Month / Custom.
- The Verification Team filter adds Created and Completed date ranges (Wence/Gretchen 2026-08-13; `:122-154`).
- **Weekends are *not* excluded here.**

**KPI cards** (all staff; they **ignore the Team filter**)
- Tasks Completed = completed tasks + completed cases, **excluding approved/partial-approval Pre-Cert** (Wence 2026-07-22, `:190-217`).
  - This includes non-approved Pre-Cert completions, e.g. Denied.
  - It therefore **differs from Staff Productivity's "Task Completed"**, which excludes all Pre-Cert and has no tasks table.
- Approved (Pre-Cert rule).
- Intake Activity = `Σ count` of **all** intake entries, **including Boost** (`:288-291`).
- Billing Tasks = `Σ tasksCompleted`, including legacy uncategorized rows.

**Tables**
- **Staff Performance Summary** (Verification / Other): Tasks Completed, Approved, Pre-Cert On-going, Call Audits (Completed audits), Fax Docs, New Patient Chart, Inbound Others.
- **Boost Productivity Report:** Boost categories only. It has its **own** date range and is scoped by team.
- **Intake Team Performance Summary:** Inbound/Outbound (`Σ count` by stored direction), plus metrics. **Here "Call Audits" = the manually typed `intakeDailyMetrics.callAudits`**, with no status gate (`:355-363`).
- **Billing Team Performance Summary:** per category, plus Fax and New Patient (Wence 2026-08-14).

**Exports:** none.

### 5.4 Intake: Activity Log (`src/components/productivity/IntakeTeamTab.tsx`, `view="log"`)

**Form fields**
- Patient ID
- Staff (intake roster)
- Category (Inbound / Outbound / Boost groups)
- Count (default 1)
- Result (hidden for Boost)
- Notes
- Five metric fields: Emails Sent, GHL Chats, New Patient Chart, Call Audits, Fax Docs

**Date handling:** **there is no date field.** The date is the UTC "today" at page load and goes stale if the tab is left open (`:39-41,85`).

**Save rules** (`:105-180`)
- Count > 0 with no category is an error.
- A category with Count 0 is dropped silently.
- Metrics are **upserted per staff/date and overwrite** the day's values. A second save on the same day replaces the first (`convex/intake.ts:144-159`).

**Category tree** (`src/lib/intakeTypes.ts:14-80`)

| Group | Categories | Results |
|---|---|---|
| **Inbound** | Appointment / Billing / MA Concern, Inquiries, Other Inbound | Provided Info, Processed Request, Booked Consult, Booked FU, Transferred, Authorized, Failed Call |
| **Outbound** | Missing Info, Confirm Appt, Prioritylist, Referral, Callback, Missed Appt, Scheduling (data-entry only) | Booked Consult, Booked FU, No Ans/LVM, Informed PT, Confirmed Appt, Invalid Number, Not Interested/WCB |
| **Boost** (outbound, no Result) | Booked, No Show, Cancelled | — |

- 12 deprecated legacy categories are retained for display and mapped into report buckets (`:37-49,100-135`).

**Views**
- **Intake Log** (Wence 2026-07-24):
  - **Boost entries are excluded** (Wence 2026-07-28, `:255-258`).
  - Filters: date, range, staff, direction. 25 rows per page.
  - Clicking a row edits Patient Chart, Call Reason and Resolution.
- **Raw Entries:** one row per non-zero **metric** per staff/day. **Deleting one row deletes the whole metrics record for that day**, with no confirm (`:1279-1284`).
- **Piedmont: Epic:** see §5.7.
- **Export Excel** (admins only, **UI gate only**)
  - Covers the Boost-excluded, filtered log.
  - Columns: Patient ID, Staff, Call Reason, Resolution, Notes, Date. **Count is not exported.**
  - The Date column uses `createdAt` while the filter uses `date` (`src/lib/exportUtils.ts:361-383`).
- **Reset:** admin-only on the server and in the UI. It deletes intake entries only, with no undo.

### 5.5 Intake: Reports views (`IntakeTeamTab.tsx`, `view="reports"`; sidebar label "Intake")

**Daily / Weekly / Monthly Productivity** (per staff)
- Columns: Consult, Follow Up, Inbound, Outbound, **Boost** (included), **Admin** (sum of the 5 metrics, including the **manual** Call Audits number), Total. All are **sums of `count`** (`:315-352`).
- One former staff member is hard-coded out by first name (Wence 2026-07-21, `:292-297`).
- **The "Daily" view is off by one day for viewers east of UTC** (`src/lib/intakeTypes.ts:232-237`). The staff appear to work from UTC+8.

**Activity Reports**
- Inbound and Outbound tables list categories and results with counts, **Boost excluded** (`:513`).
- The Admin Task table lists workstreams plus Boost rows.
  - Boost here is **company-wide**: it ignores the staff filter (Wence 2026-07-22) and the hard-coded exclusion.

**Weekends:** no weekend exclusion anywhere in Intake.

### 5.6 Intake: Booked Tracker (`src/components/productivity/BookedTrackerPanel.tsx`, `src/components/booked/*`)

**Appointment fields**
- Patient ID
- Phone
- Email
- Source
- Date & Time (stored as `YYYY-MM-DDTHH:mm` Eastern, with no offset)
- Appointment Type
- Service Type
- Clinic
- Provider
- Status: Pending / Showed / No-Show / Cancelled
- Scheduler
- Four "Update Synchronization" checkboxes
- `fullName` survives on old rows only

**All fields are optional** (Gretchen 2026-08-05, `AppointmentModal.tsx:115-119`).

**Source groups and cascades** (`src/lib/appointmentOptions.ts`, mirrored in `convex/appointmentOptions.ts`)
- **Boost** = exactly the source `Boost`. **Everything else is SMB**, including unknown imported sources.
- Appointment types: SMB gets Consult and Follow Up; Boost gets Consult only.
- Service types are set per group and type.
- Providers are set per clinic: 4 at Atlanta, 4 at Stockbridge, 3 at Newnan.
- Schedulers: 6 defaults.
- Admins can add or deactivate Scheduler and Provider choices through override rows. FiltersBar and the Dashboard still use the **static** lists.

**Tabs**
- **All**, **SMB** and **Boost**.
- **Year to Date Consults** (Wence 2026-09-18)
  - A row qualifies when Consult ∧ not Medical Weight Loss ∧ its year equals the current ET year.
  - The status shown is a **snapshot captured the first time the row qualifies, and it is immutable**.
  - Once snapshotted, a row stays in YTD **forever**; there is no rollover at year end (`src/lib/ytdConsults.ts:19`; `convex/appointments.ts:28-42,84-93`).

**Dashboard** (`AppointmentReport.tsx:281-287`)
- Counts: Total, SMB, Boost, Completed (= Showed), Cancelled, No-Shows.
- **Conversion Rate** = Showed ÷ **all** rows. The denominator includes Pending and future appointments.
- **Clinic Show Rate** = Showed ÷ (Showed + No-Show + Cancelled), for appointments dated no later than today.
- Charts: status pie, source pie, daily and monthly volume.

**Import** (admin only; server-enforced)
- Accepts `.xlsx`, `.xls` or `.csv` (first sheet), with header aliases.
- Datetimes are parsed in **browser-local** time.
- Unknown sources are kept (and count as SMB). Blank source becomes `SMB-PLD`.
- The Queue entry records the created IDs so the import can be undone.

**Export** (admins only, **UI gate only**)
- Exports the current tab plus filters to `booked-tracker.xlsx`.
- 12 columns: Status, Patient ID, Phone, Email, Source, Date & Time, Type, Service, Location, Provider, Scheduler, Created.

**Reset** (admin only; server-enforced)
- Scoped to the current tab (All / SMB / Boost). A full snapshot is stored so the reset can be **undone** from the Queue.
- The confirm text still says "cannot be undone".

**Queue / Report badge** (admin UI)
- Shows the last 100 events, minus closed ones.
- Actions: Remove imported data, Undo reset (re-inserts rows with **new IDs**), Close.

**Other behaviour**
- **Notifications:** appointments today (ET), or Pending ones in the past. Re-evaluated every 30 s; not gated.
- **Presence:** "X is also viewing". Heartbeat every 5 s; a viewer is stale after 15 s.

**Timezone:** display and dashboard parsing of `apptDateTime` shifts times for viewers **not** on Eastern time (`src/lib/dateFormat.ts:70-81`; `AppointmentReport.tsx:64-75`). Notifications and YTD read the string directly and are correct.

### 5.7 Intake: Piedmont: Epic (`src/components/productivity/PiedmontEpicPanel.tsx`; `convex/piedmontReferrals.ts`)

**Fields**
- Date
- REF ID
- MR#
- CHART
- To Provider (managed list, 5 seeded)
- Referring Provider (free text)

At least one of REF ID, MR# or CHART is required.

**Table:** shows Date, CHART, To Provider and Referring Provider. REF ID and MR# are **hidden but exported**. Clicking a row edits it, for any user.

**Restricted actions**

| Action | UI | Server |
|---|---|---|
| Export (xlsx, 6 columns) | admins | **not gated** |
| Reset | admins | admins |
| To Provider add/remove | admins | admins |

The To Provider seed is ungated and re-runs whenever the list is empty.

### 5.8 Intake Directory (the "Beltline Directory") (`src/pages/DirectoryPage.tsx`; `convex/intakeDirectory.ts`)

- **Clinic cards** (3 seeded): name, address, fax, providers.
- **Department cards** (4 seeded): extension, Slack channel, members with location tag or assignment.
  - Which fields can be edited is keyed on hard-coded department names.
- **Intake Team tab:** the intake roster, name only. Add/remove is admin-only on the server.
- **Everyone can edit clinics and departments.** None of these mutations check authentication. Removing a provider or member takes effect immediately.
- The older `directoryEntries` table and `convex/directory.ts` are superseded and unused.
- **The brief calls this "self-serve".** That matches in the sense that anyone can edit it.

### 5.9 Billing (`src/components/productivity/BillingTab.tsx`; `convex/billing.ts`, with no authentication at all)

**Activity Log**
- Categories: New Claims, A/R Aging, Emails, Boost Billing. Rows with no category show as "Legacy Billing Task".
- The count is clamped to at least 1.
- Entries can be edited and deleted inline.

**Fax Docs / New Patient Chart:** writes the same `intakeDailyMetrics` upsert, so it has the **same overwrite behaviour**.

**"This Month's Billing Productivity"**
- Per staff, by category plus Fax and NPC.
- Only billing-roster names are counted for Fax and NPC, which avoids collisions with Intake names.

**Performance Summary:** lives in the Reports tab.

**Manage Staff:** unrestricted.

### 5.10 Call Audits (`src/pages/CallAuditsPage.tsx`, `src/components/callAudits/*`; `convex/callAudits.ts`, `intakeCallAudits.ts`, `intakeHighlights.ts`, `callAuditPermissions.ts`, `http.ts`)

This is the one module with real server-side access control.

**Verification audits**
- **Fields:** dateReviewed, callDate, verifier, auditor, duration, Patient ID, category (Insurance Verification or Pre-certification), status, recording, 16-criterion rubric (0–5), coaching, doc flags, score.
- **Statuses:** Not Started, Recording Downloaded, In Progress, Completed.
- **Rubric:** 5 groups. For Pre-certification, one criterion is swapped (`:90-145`).
- **Score** = round(mean of ratings > 0 ÷ 5 × 100).
- **UI thresholds:** ≥ 90 green, ≥ 75 amber. "Needs coaching" < 75.
- **Recordings:**
  - mp4, webm or mov, up to 750 MB, with magic-byte checks.
  - Streamed through the authenticated HTTP endpoint `/call-audit-recording` in 15 MiB ranges.

**Intake audits** (migrated from Base44, 2026-08-17)
- 19-criterion rubric.
- **QA %** = mean of rated items. **Compliance %** = mean of the 2 HIPAA items.
- **Pass** iff QA ≥ 85 **and** Compliance = 100.
- **Risk** is set by Compliance: 100 → Low, ≥ 60 → Moderate, below 60 → High. These values are derived on the server; client values are ignored (Wence 2026-08-20; `convex/intakeCallAudits.ts:195-238`).
- **All writes and playback are admin-only.**
- Reactions: one emoji per user per audit, from 5 options.

**Intake Highlights**
- A clip plus specialist plus category, with 👍 reactions.
- Upload checks MIME type and size only.

**Verification Summary tab:** polls the legacy public deployment (S5).

**Migration helpers:** `callAuditMigration.migrateAll` (admin) pulls from the legacy deployment. A ledger makes it idempotent. One field mapping looks inverted: `docChartUpdated` → `docNotesIncomplete` (`convex/callAuditMigration.ts:231`).

### 5.11 Historical Activity (`src/components/productivity/HistoricalActivityTab.tsx`; `src/data/historicalActivity.json`)

- A static JSON archive: 24 months from 2024-08 to 2026-07, 9 categories, aggregate counts only.
- Shows a line chart per category and a trend: last 3 months vs the prior 3.
- Read-only.

### 5.12 Settings

- Profile name.
- Photo, with crop.
- Change password (OTP).
- Two leftover template placeholder strings.
- Theme is stored in localStorage. `preferences.ts` (colour theme and animation) is unused.

---

## 6. Business-logic "landmines" from the brief, verified

### 6.1 Pre-Cert "On-going" vs "Approved" credit: **CONFIRMED, with 4 caveats**

The same logic is copied in `StaffProductivityTab.tsx:79-95,179-224` and `ReportsTab.tsx:64-80,228-287`. It is marked "MUST stay identical".

**Credit events:** one per note (Wence 2026-08-28, per-note, retroactive):
- The initial Notes box, credited to the creator on the creation date, **only if creator = assignee** (Wence 2026-07-29).
- Every `noteLog` entry, credited to its "Added by" on its date.
- The **latest** direct Notes-box edit.
- Creating a case with no notes gives no credit (Wence 2026-07-23).

**Approved:** every note event on a case whose Auth Status is Approved or Partial Approval (Wence 2026-08-07). That includes notes written **before** approval.

**On-going:** every note event on a Pre-Cert case whose Status is not Completed.
- Completed cases are excluded (Wence 2026-08-07).
- **Exception:** Auth Status Cancelled (Wence 2026-09-02). `authCancelledAt` is stamped on the server (`convex/cases.ts:129-138`).
  - Notes on or after the cancel date count as On-going even on a Completed case.
  - Notes before it keep their Approved credit (if `approvedAt` is set). Otherwise they count as On-going only if the case isn't Completed.
  - If `authCancelledAt` is missing, the cancel date falls back to `updatedAt`.

**Caveats**
- **(a) Possible double credit.** Approving does not set Status to Completed (`CaseModal.tsx:251-279`). So an Approved case left In Progress credits **every note twice**, as Approved *and* On-going, and the Qualified Total sums both.
- **(b) Comment-only rule.** `ReportsTab.tsx:257-260` describes a 2026-07-27 "same-day approval by assignee" exception that **no code implements**.
- **(c) Latest edit only.** Only the latest direct Notes-box edit is credited. Each new edit moves the credit to the new date and person, retroactively removing the earlier credit.
- **(d) UTC dates.** Credit dates are the **UTC** date of the timestamp (`dateOnly = iso.slice(0,10)`), while day columns and weekday filtering use the viewer's local calendar.
  - For a UTC+8 team, work done before 08:00 local lands on the previous day.
  - Monday-morning work before 08:00 local lands on Sunday UTC and is **dropped** by the weekday filter.

### 6.2 Call Audits count only when Completed: **CONFIRMED for real audit records; two places do not follow it**

**Follows the rule:** `callAudits.countsByAuditor` counts only `status === "Completed"`, grouped by auditor name and `dateReviewed` (Wence 2026-08-26, `convex/callAudits.ts:240-260`). It feeds:
- Staff Productivity's CALL AUDITS row and the Qualified Total.
- The Reports Verification rows.
- The Staff Workload card.

**Does not follow it:** these use the **manually typed** `intakeDailyMetrics.callAudits` number, with no status concept:
- Reports → Intake Team Performance Summary (`ReportsTab.tsx:355-363`).
- Intake Productivity "Admin" column (`IntakeTeamTab.tsx:349-352`).

**Intake audits** (`intakeCallAudits`) are **not counted in any productivity rollup**.

### 6.3 Intake: Activity Log = row count, Reports = summed quantity: **CONFIRMED (intentional; keep)**

- **Activity Log headers count rows:**
  - `Intake Log ({n} entries)` (`IntakeTeamTab.tsx:779`)
  - Raw Entries
  - Piedmont
- **Every report sums `count`:**
  - Intake productivity cards (`:315-336`)
  - Activity Reports (`:548-566`)
  - Staff Productivity (`StaffProductivityTab.tsx:288-291`)
  - Reports tab (`ReportsTab.tsx:288-291`)
- One entry with Count 5 is 1 row in the log and 5 in the reports.

### 6.4 Boost excluded from certain tallies: **CONFIRMED; the exclusion is inconsistent across views**

| View | Boost intake entries | Evidence |
|---|---|---|
| Intake Log table and its export | **Excluded** | `IntakeTeamTab.tsx:255-258,800` |
| Activity Reports Inbound/Outbound tables | **Excluded** | `:513` |
| Activity Reports Admin table | Included, company-wide | `:517-530` |
| Intake Productivity cards | **Included** (own column + Total) | `:329-336` |
| Staff Daily Productivity | Own "BOOST APPTS" block, not in Total Outbound | `StaffProductivityTab.tsx:358-417` |
| **Qualified Activities Total** | **Excluded** | `:424-446` |
| Reports tab "Intake Activity" KPI | **Included** | `ReportsTab.tsx:288-291` |
| Reports tab Boost Productivity Report | Boost only | `:709-788` |

**Boost appointments** in the Booked Tracker are not excluded; they are split out. The dashboard has an SMB/Boost split, and Conversion and Show Rate include both.

**Billing's "Boost Billing" category** is counted like any other billing category everywhere.

### 6.5 Working-week-only reporting: **ONLY PARTLY TRUE**

- **Excludes Sat/Sun:** Staff Daily Productivity and Qualified Activities Total, including their This Week/This Month cards (Wence 2026-08-26, `StaffProductivityTab.tsx:109-120`).
- **Does *not* exclude weekends:**
  - Reports tab
  - Intake Daily/Weekly/Monthly and Activity Reports
  - Billing "This Month"
  - Cases Dashboard
  - Booked Tracker Dashboard
- For Staff Daily Productivity, see also the UTC boundary effect in §6.1(d).

---

## 7. Data model (33 app tables + Convex Auth tables)

The schema is `convex/schema.ts`. Auth tables come from `@convex-dev/auth`: `users`, `authAccounts`, `authSessions`, `authRefreshTokens`, `authVerificationCodes`, `authVerifiers`, `authRateLimits`. File storage (`_storage`) holds recordings, screenshots and profile photos.

| Area | Table | Purpose / notes |
|---|---|---|
| Verification | `cases` | Core case record.<br>• Dates are ISO strings.<br>• `noteLog` is an embedded array.<br>• Notification flags.<br>• Audit bookmark.<br>• Doc-audit fields.<br>• `authCancelledAt`.<br>• `createdBy` was cleared for all cases on 2026-07-28 (`cases.ts:370-389`). |
| | `patientIdHistory` | Patient ID change log, going forward only |
| | `tasks` | Legacy task tool (no create UI) |
| | `staff` | Verification roster; `email` links the login |
| | `precertProviders`, `reverificationRequesters` | Managed dropdowns; removal does not change saved cases |
| Intake | `intakeEntries` | Call log.<br>• `direction`, `category`, `result`, `count`, `date` (YYYY-MM-DD).<br>• `patientId`.<br>• `otherInfo` is never populated. |
| | `intakeDailyMetrics` | One row per staff/date: 5 counters. **Shared by the Intake and Billing forms.** |
| | `intakeStaff` | Intake roster (the email is unused) |
| | `piedmontEpicReferrals`, `piedmontEpicProviders` | Epic referral log and To Provider list |
| Booked | `appointments` | Appointments plus the `ytdConsultStatus` snapshot and sync flags |
| | `appointmentDropdownOptions` | Scheduler/Provider overrides (active or inactive) |
| | `reports` | Import/export/reset event log. `deletedSnapshot` is `v.any()`. |
| | `appointmentPresence` | Ephemeral presence |
| Billing | `billingEntries`, `billingStaff` | Billing log (`tasksCompleted` is the count; `category` is optional for legacy rows) |
| Directory | `clinicWidgets`, `clinicProviders`, `departmentWidgets`, `departmentMembers` | Current directory |
| | `directoryEntries` | Superseded; unused |
| Call Audits | `callAudits`, `callAuditRoster`, `callAuditRosterChanges`, `callAuditMigrationLedger` | Verification audits and their access roster |
| | `intakeCallAudits`, `intakeCallAuditReactions`, `intakeHighlights`, `intakeHighlightReactions` | Intake audits, highlights and reactions |
| SOP | `verificationPageUpdates`, `verificationPageAcknowledgements` | Updates log and acknowledgements per page |
| User | `userPreferences` | Theme and animation (unused by the UI) |

**Data-model traits that won't map 1:1 onto a relational schema** (detail in Step 2):
- **Staff are referenced by free-text name everywhere** (`assignedTo`, `staff`, `auditorName`, `addedBy`), not by ID. Renaming a person breaks their history.
- **Timestamps are client-generated ISO strings** (`src/lib/store.ts:62-63`). The server trusts them.
- **Enum values are unvalidated strings** on the server for cases, tasks, intake and appointments.
- **Embedded arrays** (`noteLog`, `ratings`, `deletedSnapshot`) are overwritten wholesale.
- **Appointment datetimes have no timezone offset.**

---

## 8. Automations, reports and exports

| Item | Trigger | Logic | Gate |
|---|---|---|---|
| Case/task email notifications | **External Viktor cron (not in the export)** | Uses the `notified*` flags. `tasks.updateTask` resets them when the assignee, due date, status or expiration changes (`convex/tasks.ts:35-60`). | Mark-functions are ungated |
| Password-reset email | User action | Viktor send-email API | — |
| Client-side seeding | Page mount when a table is empty | Staff (8), providers (2), requesters (16), intake staff (5), billing staff (1), To Providers (5), clinics (3), departments (4) | Ungated. An emptied list re-seeds itself. |
| Booked Notifications | Every 30 s in the browser | Appointments today (ET) or past Pending ones | — |
| Verification Summary | Every 30 s | Legacy deployment summary | Ungated external |
| Exports | Manual | Cases (xlsx, pdf, print), Staff Productivity (print), Intake Log (xlsx), Booked (xlsx), Piedmont (xlsx) | See §3 |
| Import | Manual | Booked Tracker only (xlsx, xls, csv) | Admin (server) |
| One-off migrations still exposed as **public** mutations | Manual | `cases.migrateLegacyStatuses`, `backfillNotifiedAssigned`, `backfillPartialApprovalApprovedAt`, `clearInaccurateCreatedBy`, `appointments.migrateServiceTypeNames` | **Ungated.** Re-running `clearInaccurateCreatedBy` would wipe Created By again. |

---

## 9. Bugs and inconsistencies: replicate or fix?

Each of these needs an owner decision in Step 2. The default proposal is **replicate for parity testing, then fix behind an explicit approval**.

1. Pre-Cert double credit and UTC date boundary (§6.1 a, d).
2. Staff Productivity "Task Completed" and Reports "Tasks Completed" use different definitions (§5.3).
3. Missed Appt entries are silently absent from Staff Productivity (§5.2).
4. The Fax/NPC/metrics upsert overwrites values instead of adding. Raw Entries delete removes the whole day's record (§5.4).
5. The Intake form has no date field and uses the UTC date. Intake "Daily" is off by one day for UTC+ viewers (§5.4, §5.5).
6. Booked Tracker times shift for viewers outside Eastern time. Export and re-import shifts times (§5.6).
7. YTD Consults never roll over (§5.6).
8. Conversion Rate's denominator includes Pending and future appointments (§5.6).
9. Badges don't match their tabs: Expiring badge counts past DOS while the tab shows the next 7 days; Urgent badge applies an extra auth filter (§5.1).
10. Pre-Cert Tracker "Approved" excludes Partial Approval (§5.1).
11. `completedAt` and `approvedAt` are never cleared. `restoreToInProgress` exists but has no UI (§5.1).
12. Hidden Auth-Status filter still applies on the All Cases tab after switching from Pre-Cert (`BariTrackerPage.tsx:912-916`; `caseFilters.ts:32-33`).
13. Priority sorts alphabetically, not by severity (`caseFilters.ts:39-45`).
14. Note log is last-write-wins. Search does not cover notes (§5.1).
15. Stale roster values display as another person: Provider shows blank; Assigned To shows the first staff member (`CaseModal.tsx:532-618`).
16. DOS shows one day early in the mini case lists (`MiniCasesList.tsx:35-46`).
17. PDF column labelled "Pre-Cert Task" actually holds Auth Status. The Doc-audit value `reviewed` is labelled "In Progress".
18. Undo Reset re-creates rows with new IDs, which breaks older "Remove imported data" entries.
19. The Intake-audit migration field mapping looks inverted (§5.10).
20. Non-allowlisted users hit the global error screen when they open Call Audits (`CallAuditsPage.tsx:124`).

---

## 10. Open questions for the owner (needed before Step 2 is final)

1. **Viktor email cron:** what is its schedule, who receives it, and what do the templates say? Can Viktor export its configuration?
2. **Pre-Cert double credit** (§6.1a): is an Approved-but-In-Progress case meant to credit each note as both Approved and On-going?
3. **Weekends** (§6.5): should *all* reports be weekday-only, or only Staff Daily Productivity as today?
4. **Timezone of record:** is "the day" defined in Eastern time (clinic) or Philippine time (staff)? Today it is effectively UTC.
5. **Self-signup:** confirm it should be **off** in the rebuild, as the brief says.
6. **Deletes and roster edits:** should they become admin-only as the brief describes, or stay open as the code has them?
7. **Legacy Task tool:** keep it (read-only?) or retire it?
8. **The scaffold in `Wence-W/SMB-BELTLINE-TRACKER`** (Express + JWT, synthetic data): use it as a base or disregard it?
9. **Historical Activity archive:** is the JSON final, or will more months be added?
10. **Legacy deployment `quaint-parrot-788`:** is it still needed? The Verification Summary tab depends on it.
