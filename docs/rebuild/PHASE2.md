# Phase 2 (Billing): status

**Scope approved** by the owner on 2026-09-28: the Billing tab (overview) and the Billing Activity Log, with synthetic data only. No production system was touched, and no live data was used. The Billing Team Performance Summary is part of Reports (Phase 6).

## Done (on branch `claude/fervent-hawking-zlg14s`)

| Piece | Backend | Screen | Parity and tests |
|---|---|---|---|
| **Billing Activity Log**: log, inline edit, delete, Date From/To | `convex/billing.ts` | `BillingPage view="log"` (sidebar: Billing → Activity Log, `?tab=billing-activity`) | `tests/convex/billing.test.ts`; differential test below |
| **Log Fax Docs / New Patient Chart** | `convex/dailyMetrics.ts` `setBillingCounts` | Billing overview (`?tab=billing`) | Same |
| **This Month's Billing Productivity** table | `billing.listEntries`, `dailyMetrics.list` | Billing overview | `tests/parity/billing.test.ts` |
| **Billing Staff** roster | `people` with the Billing team (`access.listTeam`); membership edited by admins | Shared `TeamRosterPanel` (also used by the Intake Team tab) | Existing access tests |

### How parity is proven

- **Backend, differential.** `tests/convex/billing-differential.test.ts` runs the ORIGINAL `convex/billing.ts` and `convex/intake.ts` in memory under the original schema, next to the rebuild. It applies 150 random sequences of add, edit, delete and Fax/NPC saves to both. The original's browser steps for Save (read the day's row, then upsert the whole row) are reproduced. The stored billing and metric rows must be identical.
- **Screen numbers.** `tests/parity/billing.test.ts` compares the rebuild's table against a **verbatim copy** of the original's `categoryTotals` / `metricTotals` closures on 5,000 random data sets, including row order. The extractor now copies closures from inside a component (`packages/parity/extract-oracles.ts`, pinned by the source file's SHA-256). It also checks the labels, "Legacy Billing Task", `inDateRange` and `isInCurrentMonth`, plus three synthetic fixture sets.
- **The tests catch real breaks.** Three deliberate breaks were each caught, then reverted:
  - `|| 1` changed to `?? 1` in the totals;
  - Fax Docs added to the stored value instead of replacing it;
  - `round` changed to `floor` in the count clamp.
- **Plan cases:**
  - **BL-01** (count is at least 1; a legacy row shows the legacy label and stays out of the table) is covered.
  - **BL-02** (Fax/NPC counts only Billing-roster names) is covered.
  - **BL-03** belongs to Reports (Phase 6).

Behaviour kept exactly as production (parity), even where it's surprising:
- A Fax Docs / New Patient Chart save **replaces** that day's two values; it doesn't add to them.
- A count of 0, blank or a negative number becomes 1, and 2.5 becomes 3.
- The Date From/To filter scopes the log table only; the overview has no range control.
- The default date is the **UTC** calendar day, as in the original (see F2).

**Local result:**
- All 34 public functions are gated, and SEC-01 covers every one.
- 127 tests pass under UTC, Asia/Manila and America/Los_Angeles.
- Typecheck, lint and build are clean.
- CI on GitHub was green for the Phase 1 commit and the gitleaks fix.

## Deliberate differences from production (owner to confirm in `DECISIONS.md`)

1. **Billing Staff is admin-managed (D5).** Production lets anyone add or remove Billing staff, and it seeded one real person on first load. Here the roster is the people with the Billing team, changed under Admin, and nothing is seeded.
2. **Staff is picked from the roster, and the server checks it.** A new or edited row must name an active Billing team member. The row still stores the name string, as today, plus the person's id. Anyone signed in may log for a Billing person, as in production.
3. **The server rejects bad input** the original silently stored:
   - a category other than the four;
   - a date that isn't a real `YYYY-MM-DD`;
   - a non-finite count;
   - Fax/NPC values that aren't whole numbers of zero or more.

   The screen can't produce any of these.
4. **Server timestamps.** `createdAt` and `updatedAt` are set by the server.
5. **Fax/NPC merge on the server.** The original browser re-sent the day's other Intake values it had loaded, which could overwrite a concurrent Intake edit. The stored result is otherwise identical (proven by the differential test).
6. **Editing a row whose staff name has left the roster.** The row keeps its name unless someone picks a person. The original saved the same result, but its picker wrongly *displayed* the first roster name.
7. **Single-entry delete stays open to staff.** D5 keeps single-row edits open. Say if deletes should be admin-only.

## Not reachable, so not replicated

The original looked up category labels on a plain object. A category named like a built-in object property (e.g. `constructor`) would have been counted. No such row can exist: the original screen only ever sent the four categories, and the rebuild's server rejects anything else.

## Findings

- **F2: the default date is the UTC day.** It's in `DECISIONS.md` under D3. For a US viewer in the evening (after 8 pm Eastern), the Billing forms default to **tomorrow's** date. Manila viewers aren't affected. It's kept for parity until D3 is decided.

## Not verified yet

- **The signed-in screens have not been exercised in a browser**, for the same reason as Phase 1: there's no Convex deployment yet (G0), and the local backend download is blocked by this environment's network policy.

## Next

**Phase 3 was approved; see PHASE3.md.** Still open: G0, the reference project, the history rewrite on `main`, and decisions D1, D2, D3 (urgent: F1 and F2), D8, D10, P1-a, P1-b and P2-a to P2-c.
