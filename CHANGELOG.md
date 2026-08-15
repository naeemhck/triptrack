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

### Security

- Infrastructure Edge Functions authenticate webhook and Cron requests before privileged database access.
- Android production signing uses credentials outside the repository.
- Project-specific Google Services configuration and environment values are excluded from Git history.
