# SMB Beltline Tracker — actual source export

Snapshot prepared September 25, 2026 from the existing Tracker source.
This is the React/TypeScript frontend and Convex backend, not a newly
generated replacement. See EXPORT-CHANGES.md for safety-related changes.

## Important

- Upload to a **private** GitHub repository. This contains internal business
  logic, staff email allowlists, directory defaults, and aggregate historical
  activity. It is not intended as a public template.
- No live database, uploaded recordings/files, login accounts, passwords,
  deployment keys, or environment secrets are included.
- This is a source handoff, **not a turnkey standalone deployment** and not a
  security/compliance certification. Do not put real patient data into a new
  deployment before completing security/privacy and hosting reviews.
- The original running Tracker was not changed by this export.

## Put it in GitHub

1. Create a private repository.
2. Extract this ZIP.
3. Upload the contents of the extracted project folder into the repository
   root, preserving all subfolders and dotfiles. Use Git/GitHub Desktop if
   browser upload limits get in the way.
4. Give your developer/coding agent access and the handoff checklist below.

## Local frontend build

Install Bun and use the committed bun.lock:

```sh
bun install --frozen-lockfile
cp .env.example .env.local
# Replace the placeholder URL with your NEW isolated Convex deployment.
bun run build
bun run dev
```

Building the frontend does not initialize a backend, provision accounts,
configure password reset email, or migrate records.

## Required standalone-hosting work

1. Create a NEW isolated Convex project; configure Convex Auth signing keys,
   JWKS, SITE_URL, auth domain, and redirect URLs using current Convex Auth
   setup guidance. Never copy the working app's deployment credentials.
2. Set backend `VIKTOR_SPACES_ACCESS_MODE=authenticated` and frontend
   `VITE_VIKTOR_SPACES_ACCESS_MODE=authenticated`. Keep preview test auth off.
3. Replace/configure `convex/ViktorSpacesEmail.ts`: password-reset email currently
   depends on the Viktor email service. Do not assume it works outside Viktor.
4. Inventory platform integrations before enabling them: optional Viktor OAuth,
   `convex/viktorTools.ts`, legacy audit-source URLs, migration helpers, media
   endpoints and CORS allowlist in `convex/http.ts`. Supply new permitted
   origins; disable legacy migration access unless explicitly approved.
5. Provision authorized users securely, preserving the approved access roster.
   Accounts are not in this ZIP. Review backend signup behavior: hiding the
   signup page alone does not prevent direct account creation.
6. Review ALL backend access checks and file handling before deployment.
   This export preserves existing business source; it is not a claim that
   every inherited endpoint is production-safe.
7. Review admin email allowlists and Wence-only Patient ID edit permission;
   do not accidentally grant these permissions to new generic users.
8. Connect only to the NEW backend. After setup, `bun run sync` pushes Convex
   code; `bun run sync:build` pushes backend code AND builds the frontend.
   Do not run these commands with credentials for the working Tracker.
9. Host the built frontend with SPA routing and the correct frontend env.
   GitHub alone is not a database/app host.
10. Rebuild regression tests with synthetic fixtures. Original E2E scripts
    were omitted because some contain credentials and real-record references.
11. Back up, reconcile and obtain explicit owner approval before any separate
    migration of records, storage files, or users. Keep the old app available
    until cutover is approved.

## Included modules

Dashboard; Cases/Tasks and Verification views; Documentation QA; Patient ID
history; Intake productivity/logging/Piedmont referrals/directory; Booked
Tracker; Billing; Call Audits and highlights; Staff Daily Productivity;
Historical Activity; Reports; Verification process/guidelines/acknowledgements;
Excel/PDF/print helpers.

Generated Convex type helpers are included for source compilation; regenerate
them against your own backend as part of setup.
