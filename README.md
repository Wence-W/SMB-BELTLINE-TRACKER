# SMB Beltline Tracker

A secure, production-oriented operational tracker scaffold for bariatric verification, intake, billing, and call audits.

## Status

This repository started as an empty scaffold. The codebase now includes a working application foundation with:

- React 19 + Vite + TypeScript frontend
- Tailwind-based dark operational layout
- Express API with JWT-based auth and protected routes
- Socket.IO real-time connection hook
- Seeded cases, intake, billing, and archive data
- Business-rule tests for QA status, case filters, intake totals, and productivity cleanup

## Important security note

This project is not connected to production systems or live patient data. Synthetic test accounts only. Do not place PHI in this repo or in public environment variables. The project is designed for an owner-approved security/privacy review before any live patient or recording data is introduced.

## Quick start

1. Install dependencies:
   - `npm install`
2. Start the app:
   - `npm run dev`
3. Open the app at `http://localhost:5173`
4. Sign in with the demo account:
   - Email: `admin@smb.local`
   - Password: `changeMe123!`

## Scripts

- `npm run dev` — runs the Express API and Vite frontend together
- `npm run build` — production build
- `npm run test` — Vitest suite
- `npm run server` — runs the backend only

## Environment

Use `.env.example` for non-secret placeholders and local config. Keep all secrets out of the repo.

## Security and review requirements

Before introducing real patient identifiers, recordings, or PHI, the owner must confirm:

- hosting provider suitability and contract review
- admin allowlist and account provisioning workflow
- privacy/security review for Tier 3 data handling
- migration scope and no-live-data policy

## Implementation boundaries

This scaffold is intentionally a strong operational foundation, not a complete full-parity replacement for every legacy workflow from a missing source system. The initial implementation focuses on:

- secure auth and protected routes
- dashboard shell and module navigation
- cases with filters and staffing model
- intake logging with totals
- bookings tracker and billing overview
- verification and archive pages
- business logic regression tests

The exact final parity list and migration tasks remain subject to owner approval and source-system inventory before any real data migration.
