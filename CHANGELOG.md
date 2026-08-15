# Changelog

All notable changes to TripTrack are documented here.

## [1.0.0] - Unreleased

### Added

- Supabase authentication, database, realtime, storage, Edge Functions, RLS, and pgTAP migrations.
- Durable offline location, stop, and photo synchronization.
- Canonical Route Leader tracking with authoritative member separation and alert hysteresis.
- Per-member, per-trip push notification preferences.
- MapLibre/OpenFreeMap and optional Google Maps providers.
- Email/password, Magic Link, and password-reset authentication flows.
- Expo-compatible Jest, ESLint, CI, and dependency update automation.
- Component-level tests for trip cards, member route status, and background permission choices.
- Shared Zod validation at authentication, invite, and trip-creation boundaries.
- Optional privacy-safe Sentry diagnostics for fatal, offline-sync, stop-detection, and location errors.
- State-machine and Trip Detail presentation coverage with enforced 75% global thresholds.
- Supabase auth and trip service contract tests for normalized inputs and RPC boundaries.

### Changed

- Split Trip Detail presentation, runtime synchronization, and styles into focused modules below 500 lines.
- Run static analysis and coverage as separate CI jobs and retain LCOV reports.

### Security

- Infrastructure Edge Functions authenticate webhook and Cron requests before privileged database access.
- Android production signing uses credentials outside the repository.
- Project-specific Google Services configuration and environment values are excluded from Git history.
