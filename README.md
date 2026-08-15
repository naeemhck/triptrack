# TripTrack

[![CI](https://github.com/naeemhck/triptrack/actions/workflows/ci.yml/badge.svg)](https://github.com/naeemhck/triptrack/actions/workflows/ci.yml)

TripTrack is an Expo/React Native application for private group trips. Members share live locations, record photo stops, follow a canonical Route Leader route, and receive separation or stale-location alerts. The mobile client is backed by Supabase and supports durable offline synchronization.

## Architecture

- **Mobile:** Expo SDK 54, React Native 0.81.5, React 19, and TypeScript.
- **Backend:** Supabase Auth, Postgres, Row Level Security, Realtime, Storage, Vault, Cron, and Edge Functions.
- **Maps:** MapLibre/OpenFreeMap by default, with an optional Google Maps provider.
- **Notifications:** Expo Push Service with Android delivery through Firebase Cloud Messaging. No Firebase database or Cloud Functions backend is used.
- **Reliability:** Application-owned photo storage and a serialized AsyncStorage write-ahead queue with stable IDs, leases, bounded backoff, and replay-safe server operations.
- **Diagnostics:** Privacy-safe structured error reporting through Sentry when an optional DSN is configured; disabled otherwise.

## Prerequisites

- Node.js 22 and npm.
- Android Studio, Android SDK 36, OpenJDK 21, and an Android 12 or newer device for Android development.
- A Supabase project with the migrations under `supabase/migrations` applied.
- Docker Desktop only when running the optional local Supabase stack or pgTAP suite.

## Setup

```bash
git clone https://github.com/naeemhck/triptrack.git
cd triptrack
npm ci
cp .env.example .env
```

Fill `.env` with your project values. Never commit this file.

| Variable                                  | Required            | Purpose                                                                 |
| ----------------------------------------- | ------------------- | ----------------------------------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`                | Yes                 | Supabase project URL from Project Settings > API.                       |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`    | Yes                 | Publishable client key. Never use the service-role key in the app.      |
| `EXPO_PUBLIC_EAS_PROJECT_ID`              | Push builds         | Expo project ID used to obtain an Expo push token.                      |
| `EXPO_PUBLIC_SENTRY_DSN`                  | Optional            | Public Sentry DSN for production crash reporting.                       |
| `GOOGLE_SERVICES_JSON`                    | Android push builds | Local path or EAS file secret containing the Android FCM configuration. |
| `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY` | Optional            | Restricted Android Maps SDK key when selecting Google Maps.             |
| `EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY`     | Optional            | Restricted iOS Maps SDK key when selecting Google Maps.                 |

For local Android development, place the downloaded FCM configuration at `google-services.json`; `app.config.js` detects the ignored local file. In EAS, provide `GOOGLE_SERVICES_JSON` as a file secret.

## Running

```bash
npm start
npm run android
```

MapLibre/OpenFreeMap is the zero-billing default. Background location, MapLibre native rendering, and push notifications require a development build rather than Expo Go.

## Verification

```bash
npm run verify
npm run build:check
npm run test:db
npx expo install --check
npx expo-doctor
```

`npm run verify` runs Prettier, TypeScript, ESLint, and 106 Jest assertions with coverage. Coverage enforcement includes Trip Detail presentation, location tracking, automatic stop detection, the offline queue, photo recovery, backoff policy, Supabase auth/trip contracts, validation boundaries, data mappers, and shared utilities. `npm run build:check` produces an ignored Android JavaScript export to prove Metro can bundle the application without creating a release artifact.

CI runs static analysis, coverage tests, and the local pgTAP database suite as independent jobs. It retains the LCOV report, scans JavaScript and TypeScript with CodeQL, reviews pull-request dependency changes at high severity, and fails on critical production dependency advisories. Expo SDK upgrades remain compatibility-controlled through `expo install --check` and Dependabot rather than forced npm major-version rewrites.

Database tests are transactional pgTAP files:

```bash
npx supabase start
npx supabase test db
```

The canonical leader-route suite contains 23 server-side assertions. Notification preference tests cover enabled defaults, membership enforcement, and self-only RLS behavior.

### Development Container

The checked-in devcontainer provides Node.js 22, the lockfile-pinned Supabase CLI, and access to the host Docker engine. It supports JavaScript verification and the complete local Supabase stack. Native Android builds still use the host Android Studio, SDK 36, and JDK 21 toolchain.

In VS Code, run **Dev Containers: Reopen in Container**, then:

```bash
npx supabase start
npx supabase test db
npm run verify
npm run build:check
```

The local Supabase stack is development-only and must not be exposed to external traffic.

## Supabase Development

Link only a development project, review migrations, and apply them through the Supabase CLI. Edge Function secrets such as `DATABASE_WEBHOOK_SECRET`, `CRON_SECRET`, and the service-role key belong only in Supabase server-side secret storage. They must never appear in `EXPO_PUBLIC_*` variables.

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase migration list
npx supabase db lint --linked --schema public
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for change and review requirements, [SECURITY.md](SECURITY.md) for private reporting and dependency policy, and [CODEX_HANDOFF.md](CODEX_HANDOFF.md) for the current release-readiness state.

Sentry is optional at runtime. Creating a Sentry project and configuring `EXPO_PUBLIC_SENTRY_DSN` enables event delivery; source-map upload credentials must be stored only in the EAS or CI secret store.

## License

No license is granted. The source is publicly visible, but reuse, redistribution, and derivative works require permission from the copyright owner.
