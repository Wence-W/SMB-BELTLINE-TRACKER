# Decision log

Every deliberate deviation from production behaviour needs the owner's sign-off here before parity sign-off (plan section 5.3).

| # | Decision | Status | Default in build | Notes |
|---|---|---|---|---|
| D1 | Pre-Cert double credit (Approved + In Progress) | **Open** | Replicate | Pinned by oracle tests |
| D2 | Weekends in reports | **Open** | Replicate (Staff Daily Productivity only) | |
| D3 | Timezone of record | **Open, now urgent** | Replicate | See findings F1 and F2 below |
| D4 | Self-signup | Approved with plan (2026-09-28) | Off, enforced on the server | `convex/auth.ts` `passwordProfile` |
| D5 | Deletes and roster edits admin-only | Approved with plan | Admin-only (deviation) | Applied in Phase 1 to the Pre-Cert Provider and Request-by lists and all team rosters |
| D6 | Legacy Task tool | Approved with plan | Read-only | |
| D7 | Starter app | Approved with plan | Discarded | Removed in Phase 0 |
| D8 | Viktor email cron | **Open (inputs needed)** | Rebuilt in-app | Needs schedule, recipients, templates |
| D9 | Historical Activity JSON | Approved with plan | Carried over | |
| D10 | Legacy `quaint-parrot-788` | **Open** | Drop the tab | |
| SEC | Session idle timeout | **Open** | 30 min server + browser; 12 h maximum | `convex/auth.ts` |
| P1-a | Intake Team roster = people with the Intake team (needs a login email) | **Open** | As built | Consequence of the single-roster design; see PHASE1.md |
| P1-b | Managed lists edited on an admin page until Phases 3–5 restore the inline Manage buttons | **Open** | As built | |
| SEC | Password minimum length | **Open** | 12 characters | `convex/auth.ts` |
| P2-a | Billing Staff roster = people with the Billing team, admin-managed | **Open** | As built (D5) | Production: anyone edits, with one seeded name. See PHASE2.md |
| P2-b | Server rejects input the original silently stored (unknown category, bad date, non-finite count, fractional/negative Fax/NPC) | **Open** | As built | The screen can't produce these |
| P2-c | Deleting one Billing entry stays open to all staff | **Open** | Open (D5: single-row edits stay open) | Say if it should be admin-only |

## Findings made during Phase 0

### F1: Staff Daily Productivity shows the wrong days for viewers east of UTC

The original's `buildDayColumns` has a local-versus-UTC mismatch:
- It picks weekdays and labels with the viewer's local calendar.
- It stamps each column's date with `toDateInputValue()`, which is a UTC slice.

For a viewer in the Philippines (UTC+8), each column holds the **previous** day's data:

| Label | Data shown |
|---|---|
| Mon Sep 7 | Sun Sep 6 |
| Tue Sep 8 | Mon Sep 7 |
| Wed Sep 9 | Tue Sep 8 |
| Thu Sep 10 | Wed Sep 9 |
| Fri Sep 11 | Thu Sep 10 |

**Friday's activity never appears, and Sunday's does.** For Eastern and UTC viewers it is correct.

This is proven by `tests/parity/precert-oracle.test.ts` ("week of 2026-09-07 as seen from Asia/Manila"), which runs the original code verbatim.

If the team views reports from the Philippines, today's weekly numbers are shifted by a day. The rebuild reproduces the shift for parity until D3 is decided.

## Findings made during Phase 2

### F2: Billing forms default to the UTC date

The original Billing tab fills its Date fields with `new Date().toISOString().slice(0, 10)`, which is the **UTC** day. For a viewer in US Eastern time after 8 pm (EDT), the default date is **tomorrow**, so an entry logged without changing the date lands on the wrong day. Manila (UTC+8) viewers get the correct day.

The "This Month" table, by contrast, uses the viewer's local month. The rebuild reproduces both for parity (`apps/web/src/lib/dates.ts`) until D3 is decided.
