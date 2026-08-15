# TripTrack Handoff

## Current Architecture

- Expo SDK 54, React Native 0.81.5, React 19.1.0, TypeScript 5.9.
- Supabase Auth, Postgres, Realtime, Storage, Vault, Cron, and Edge Functions.
- MapLibre with OpenFreeMap is the active zero-billing map provider. Google Maps remains an externally configured optional provider.
- Android package: `com.triptrack.app`; min SDK 31, target/compile SDK 36.
- The native Android project is intentionally committed. Expo Doctor's app-config sync warning is disabled only after manually verifying the generated manifest, resources, permissions, deep links, and icon configuration.

## Completed

- Email/password, Magic Link, password reset, native deep links, and persisted sessions.
- Trip lifecycle, membership, live/background location, offline queue, durable stop photos, and account deletion function.
- Canonical Route Leader route, authoritative separation, warning/critical hysteresis, leader transfer, and realtime UI.
- Stop, stale-location, and route-lag push functions with authenticated infrastructure invocation and idempotent delivery claims.
- Per-member, per-trip push preferences for warning, critical, stop, and stale-location notifications. Missing rows default to enabled.
- RLS, Storage policies, pg_net stop trigger, 15-minute stale-location Cron, and notification secret storage in Vault.
- Production icon assets and Android adaptive launcher resources.
- All 23 canonical leader-route pgTAP tests passed on the QA Supabase project.
- Two-device route progress and a 200 m warning delivery/tap were validated during physical-device QA.

## Required Before Release Build

1. Run the final TypeScript and Expo validation commands after the last changes.
2. Run `supabase/tests/notification_preferences.test.sql` against the linked QA project and confirm all tests pass.
3. Complete two-device preference QA: disable each category for one member and verify only that trip/category is suppressed while in-app warning/critical state remains visible.
4. Confirm production Supabase public configuration and optional Google Maps key are provided through the release environment without committing secrets.
5. Back up the private upload keystore and user-level Gradle signing properties to a secure password manager or encrypted offline location. The local release variant is configured and verified.
6. Publish and confirm the public Privacy Policy and Account Deletion URLs used for store submission.
7. Increment `versionCode` for every subsequent Play upload.

## Release Safety

- Release builds do not use `android/app/debug.keystore`.
- The upload keystore is stored at `C:/Users/Naeem/.triptrack-signing/triptrack-upload.jks`; its credentials are stored in the user-level Gradle properties file and must never be copied into the repository.
- Never commit Supabase service-role keys, Vault secrets, signing files, passwords, or production credentials.
- Provide Android FCM configuration through `GOOGLE_SERVICES_JSON`; the project-specific file is intentionally excluded from Git history.
- Do not run Firebase deployment commands; Firebase is no longer the application backend.
- Do not build or upload a production artifact until final QA and signing configuration are complete.
