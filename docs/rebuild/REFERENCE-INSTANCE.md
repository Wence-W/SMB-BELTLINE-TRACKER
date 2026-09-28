# Reference instance: the original app on synthetic data

The parity method (plan section 5.1) runs the **original** code, unmodified, beside the rebuild on the **same synthetic data**. It is a copy of the code, not production, and it never holds PHI.

## Owner steps (one time)

1. In the owner's Convex account (not Viktor's), create a project named `beltline-reference`. This project needs no BAA, because it holds synthetic data only.
2. Create a deploy key for its **dev** deployment and keep it out of git.

## Deploy the original, unchanged

```sh
cd reference/original
bun install --frozen-lockfile
export CONVEX_DEPLOY_KEY=<reference dev deploy key>   # never commit
npx convex env set VIKTOR_SPACES_ACCESS_MODE authenticated
npx @convex-dev/auth                                  # sets JWT_PRIVATE_KEY, JWKS, SITE_URL
bunx convex dev --once                                # pushes the original backend
```

## Load synthetic fixtures

```sh
cd ../..
bun run fixtures 20260928                             # writes fixtures/generated/20260928/*.jsonl
for table in staff intakeStaff billingStaff cases intakeEntries intakeDailyMetrics billingEntries; do
  (cd reference/original && npx convex import --table "$table" "../../fixtures/generated/20260928/$table.jsonl" --replace -y)
done
```

`tests/convex/fixtures-original-schema.test.ts` already proves every row passes the original schema, so the import is expected to succeed.

## Sign-in accounts (synthetic)

The original's test login was stripped from the export. Create password accounts with its own internal helper:

```sh
cd reference/original
npx convex run adminCreateAccount:createPasswordAccount '{"email":"alex@example.invalid","password":"<local only>","name":"Alex"}'
```

Match `staff.email` for the names the case logic resolves by email, and add an admin-list address only if a test needs admin behaviour. Do that on this reference copy only; it never touches `reference/` in git.

## Rules

- Synthetic data only. Never import a production export here.
- Never point the rebuild at this deployment, or this deployment at the rebuild.
- Playwright parity runs (from Phase 1 on) read both apps' screens and exports and diff them.
