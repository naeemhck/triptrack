# Contributing to TripTrack

## Workflow

1. Create a focused branch such as `fix/offline-lease` or `feature/trip-alert-preferences`.
2. Keep each commit limited to one behavior change and include the tests that prove it.
3. Do not commit `.env`, Google Services files, Supabase secrets, signing keys, device captures, or generated release artifacts.
4. Open a pull request against `master` and describe behavior, risk, validation, and any required migration or deployment step.

## Required Checks

Run these commands before opening a pull request:

```bash
npm ci
npx expo install --check
npm run verify
npm run build:check
npm run test:db
npx expo-doctor
```

Database changes must include a forward-only migration and transactional pgTAP coverage. Edge Function changes must preserve authentication before privileged client creation and must test idempotency or delivery deduplication where relevant.

## Pull Request Checklist

- The change is within the current TripTrack product scope.
- TypeScript, ESLint, Jest, Expo dependency checks, and Expo Doctor pass.
- New behavior has focused tests.
- Database migrations have matching RLS and pgTAP coverage.
- No credentials or user data appear in code, fixtures, logs, screenshots, or history.
- Native changes were tested in a development build on a supported Android device.
- Production artifacts were not committed.

## Commit Messages

Use Conventional Commit subjects such as `fix: preserve uploaded photo state during retry`, `test: cover stop detector departure`, or `refactor: extract trip detail runtime`. Avoid mixing formatting, generated files, refactors, and product behavior in one commit.
