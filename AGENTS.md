# AGENTS.md - TripTrack Engineering Guide

## Stack

- Expo SDK 54, React Native 0.81.5, React 19.1, and TypeScript 5.9.
- Supabase Auth, Postgres, Realtime, Storage, Vault, Cron, and Edge Functions.
- MapLibre/OpenFreeMap is the default map provider; Google Maps is optional external configuration.
- Android package `com.triptrack.app`, min SDK 31, target/compile SDK 36, OpenJDK 21, and NDK 27.1.12297006.

## Architecture

- `src/context` owns authenticated application state and trip subscriptions.
- `src/services/supabase` is the typed client data-access layer.
- `src/services/offlineSyncQueue.ts` is a durable serialized write-ahead queue. Preserve stable IDs, ordering, leases, bounded backoff, location coalescing, and photo partial-success state.
- `supabase/migrations` contains forward-only schema, RPC, RLS, trigger, and scheduled-job changes.
- `supabase/functions` contains authenticated Edge Functions. Authenticate infrastructure requests before creating or using a service-role client.
- Expo Push Service sends notifications; Android transport requires an ignored Google Services file or EAS file secret.

## Product Constraints

- Keep the current MVP scope. Do not add chat, SOS, social feeds, public tracking links, payments, or unrelated analytics.
- Trip location and stop writes require active membership and an active trip.
- Push preferences affect delivery only; warning and critical state remain visible in the app.
- Do not weaken notification idempotency, recipient deduplication, author exclusion, membership checks, or hysteresis.

## Security

- Never commit `.env`, `google-services.json`, service-role keys, Vault secrets, upload keystores, signing passwords, device captures, or release artifacts.
- Client code may use only the Supabase publishable key. Privileged keys remain server-side.
- Add RLS and transactional pgTAP coverage for every database-access change.
- Do not deploy Supabase functions/migrations or publish store artifacts unless explicitly requested.

## Required Verification

```bash
npm ci
npx expo install --check
npm run verify
npx expo-doctor
```

- Add focused Jest tests with application changes.
- Add pgTAP tests with migrations or security-policy changes.
- Test native map, location, photo, deep-link, and notification changes on a development build.
- Do not create a production AAB/APK during routine verification.
