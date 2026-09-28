# SMB Beltline Tracker: rebuild

A feature-for-feature rebuild of the SMB Beltline Tracker (Bari Ops Tracker). It is **separate from, and never connected to,** the production app on Viktor Spaces.

- **Plan:** [`docs/rebuild/STEP2-PLAN.md`](docs/rebuild/STEP2-PLAN.md). The source analysis is in [`STEP1-INVENTORY.md`](docs/rebuild/STEP1-INVENTORY.md).
- **Status:** Phase 2 (Billing) done; see [`PHASE2.md`](docs/rebuild/PHASE2.md), [`PHASE1.md`](docs/rebuild/PHASE1.md) and [`PHASE0.md`](docs/rebuild/PHASE0.md).
- **Decisions and findings:** [`DECISIONS.md`](docs/rebuild/DECISIONS.md).

**Private repo. No PHI, ever:** tests and fixtures are synthetic only.

## Layout

| Path | What |
|---|---|
| `convex/` | Rebuilt backend. Every function goes through `convex/lib/functions.ts`. |
| `apps/web/` | Rebuilt React app |
| `packages/parity/` | Test oracles from the original code, the verbatim extractor, the synthetic fixture generator |
| `tests/` | Backend access tests (in-memory Convex) and parity tests |
| `reference/original/` | The 2026-09-25 source export, read-only. Used only as the test oracle and the reference instance. Never deployed to production. |

## Commands

```sh
bun install
bun run check            # typecheck + lint + function-wrapper guard + tests
bun run test             # tests only (set TZ=Asia/Manila to test as a UTC+8 viewer)
bun run fixtures [seed]  # write synthetic JSONL fixtures
bun run extract-oracles  # refresh verbatim oracle copies from reference/original
bun run dev:web          # web app; needs apps/web/.env.local (see .env.example)
```
