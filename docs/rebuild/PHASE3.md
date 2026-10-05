# Phase 3 (Intake): status

**Scope approved** in writing by the owner, after Phase 2. It covers:
- the Intake Activity Log: log form, Intake Log, entry window, Raw Entries, Export and Reset;
- Piedmont: Epic;
- the Intake reports: Activity Reports and Daily/Weekly/Monthly Productivity.

Synthetic data only. No production system was touched, and no live data was used. The Booked Tracker view under Intake is Phase 4.

## Done (on branch `claude/fervent-hawking-zlg14s`)

| Piece | Backend | Screen | Tests |
|---|---|---|---|
| **Log Intake Activity** (category count + daily metrics in one save) | `convex/intake.ts` `logActivity`: the original screen's save rules now run on the server | `IntakePage view="log"`, Intake Activity tab | `tests/convex/intake.test.ts`; differential test |
| **Intake Log** (filters, 25 per page, copy Patient ID, entry window: Edit / Delete / Close) | `listEntries`, `updateEntryDetails`, `deleteEntry`; shared filter `convex/lib/intakeLog.ts` | Same tab | Same, plus parity |
| **Export Excel / Reset** (admin) | `exportEntries` builds the rows on the server and logs the export; `resetEntries` deletes in batches and logs the reset | Toolbar, admins only | IN-06, IN-07 tests |
| **Raw Entries** | `dailyMetrics.deleteMetric` | Raw Entries tab | IN-04 |
| **Piedmont: Epic** | `convex/piedmont.ts` (log, edit, admin Export/Reset); To Provider is a managed list | `components/intake/PiedmontEpicPanel.tsx`; inline "Manage To Provider list" is back for admins | `tests/convex/piedmont.test.ts` |
| **Reports** | none (computed in the screen from the same data) | `IntakePage view="reports"`; sidebar **Intake** (`?tab=intake`) | Parity, IN-08 to IN-10 |

The original's routes are kept, including that they look swapped: `?tab=intake` opens the reports and the "Activity Log" child is `?tab=intake-reports`.

### How parity is proven

- **Backend, differential.** `tests/convex/intake-differential.test.ts` runs the ORIGINAL `convex/intake.ts` in memory under the original schema, next to the rebuild. It applies 150 random sequences of saves, entry edits, deletes and Raw Entries deletes to both. The original screen's own save and edit steps are reproduced on the original side. The stored entries and metrics must be identical, and the rebuild must refuse exactly the saves the original screen refused.
- **Screen logic.** `tests/parity/intake.test.ts` checks against a **verbatim copy** of the original component's own code: the Intake Log rows, Raw Entries, the productivity summaries, and every Activity Reports table and total. It runs 3,000 random data sets, including legacy and unknown categories, mismatched directions, the excluded name and malformed date filters. The extractor now copies `useMemo`/`useCallback` values from inside a component, using no-op stand-ins, so the copied statements stay unchanged.
- **Also checked against the original:**
  - the category, result and bucket taxonomy;
  - the period helpers (2,000 random dates, in UTC, Manila and Los Angeles);
  - both export column sets.
- **The tests catch real breaks.** Five deliberate breaks were each caught, then reverted:
  - Boost no longer counted in its own column;
  - the log sort reversed;
  - Boost rows following the staff picker;
  - the metrics no longer replaced on save;
  - a Boost entry keeping its Result.
- **Plan cases:** IN-01 to IN-10 are covered. IN-10 (the Manila day shift) is pinned as a test that runs both apps under Asia/Manila.

### Kept exactly as production (parity), even where it's surprising

- One entry with Count 5 is **one** log row and counts **5** in every report.
- Saving metrics again for the same person and day **replaces** all five values. It also overwrites the Fax Docs / New Patient Chart that Billing saved for that day, as today.
- **Raw Entries Delete removes that day's whole metrics row**, not just the line clicked. The screen now asks first and says so; that confirmation was approved with the plan (IN-04).
- Boost entries never appear in the Intake Log. The Admin Task table's Boost rows ignore the staff picker.
- Export's **Date** column is when the entry was logged (Eastern time), not the activity date. There is no Count column.
- **From the Philippines, Daily Productivity shows the previous day** (IN-10; see F1 and D3).

## Deliberate differences from production (owner to confirm in `DECISIONS.md`)

1. **P3-a: counts and metric values must be whole numbers of zero or more.** The original's number boxes let someone type `1.5` or `-2` and stored it. The rebuild shows "Enter a whole number."
2. **P3-b: the server checks Result and Call Reason against the entry's direction.** A legacy Call Reason already on an entry can be kept. The original screen only offered valid choices; the server now enforces them.
3. **P3-c: the excluded-name list is data.** The original hard-coded one former staff member's name into the Intake productivity views. It's now the admin list "Names left out of Intake productivity" (Admin → Dropdown lists), and the migration loads the original name. No name is in code.
4. **P3-d: To Provider must come from the list.** A row's existing value is kept on edit.
5. **P3-e: Export runs on the server, admin only, and is logged** for both Intake and Piedmont. The original hid the Piedmont Export button from non-admins, but anyone could have built the file. Reset was already admin-only on the server, and still is.
6. **P3-f: the Excel files come from a small built-in writer.** The original's SheetJS build is downloaded from SheetJS's own site, which this environment's network policy blocks (HTTP 403); the npm copy is an old version with known advisories. The new writer gives the same columns, header row, sheet names, file names and 18-character column widths. Every cell is written as text, so a note starting with `=` is never treated as a formula.
7. **Staff are picked from the Intake team roster** (P1-a). Anyone signed in may log for an Intake person, as today.
8. **Single-entry delete and Raw Entries delete stay open to staff.** D5 keeps single-row edits open. Say if either should be admin-only.

## Findings

- **F3: clearing an entry's notes doesn't clear them.** In the original entry window, emptying the Notes box and pressing Save sends "no change", so the old note stays stored. It still shows in the table and the export, even though the window briefly shows "No additional notes." The rebuild reproduces this for parity; it's a one-line fix once you approve it.
- **IN-10 / F1:** from UTC+8, the Daily Productivity card and its date box point at the previous day. This is the same root cause as F1 and is part of the D3 decision.

## Not verified yet

- **The signed-in screens have not been exercised in a browser**, for the same reason as Phases 1 and 2: there's no Convex deployment yet (G0). They typecheck, lint and build.

## Local result

- All 46 public functions are gated, and SEC-01 covers every one.
- 170 tests pass under UTC, Asia/Manila and America/Los_Angeles.
- Typecheck, lint and build are clean.

## Next

**Phase 4 (Booked Tracker) needs the owner's written approval.** Still open: G0, the reference project, the history rewrite on `main`, and decisions D1, D2, D3 (urgent: F1, F2, IN-10), D8, D10, P1-a, P1-b, P2-a to P2-c and P3-a to P3-f, plus F3.
