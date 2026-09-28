# Export changes

- Disabled credential-bearing preview login, seeder, and test provider in export only.
- Redacted patient-ID literals in convex/intakeCallAudits.ts.
- Redacted patient-ID literals in src/components/productivity/BariVerificationProcessTab.tsx.
- Redacted patient-ID literals in src/components/productivity/IntakeTeamTab.tsx.
- Redacted patient-ID literals in src/components/productivity/PiedmontEpicPanel.tsx.
- Redacted patient-ID literals in src/components/productivity/ReportsTab.tsx.
- Removed commands pointing to excluded platform/test scripts; retained app/build/Convex commands.

Excluded: .git history, .env.local and original env example, node_modules, dist, scripts (including credential-bearing E2E tests), temporary files, original platform README, stale npm lockfile, working task notes, and all database/storage exports.

Retained: business source, generated Convex type helpers, schema, current Bun lockfile, favicon, authorized-user email allowlists, staff/provider defaults and existing aggregate historical activity data. Those are confidential business configuration, not portable user accounts. Keep this repository private.
