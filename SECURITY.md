# Security Policy

## Supported Code

TripTrack is currently unreleased. Security corrections are applied to the `master` branch and will be included in the first production release after release QA is complete.

## Reporting a Vulnerability

Report suspected vulnerabilities privately through the repository's GitHub Security Advisory **Report a vulnerability** flow. Do not open a public issue containing credentials, user data, exploit details, location records, or notification tokens.

Include the affected component, reproduction steps, impact, and any suggested mitigation. Never include production credentials or private trip data.

## Dependency Policy

- CI blocks critical production advisories with `npm audit --omit=dev --audit-level=critical`.
- High and moderate advisories are reviewed against Expo SDK compatibility and Dependabot updates.
- Breaking `npm audit fix --force` rewrites are not accepted without an Expo SDK migration and physical-device regression testing.
- `npx expo install --check` must pass after dependency changes.

## Secrets

Only publishable mobile configuration may use `EXPO_PUBLIC_*`. Supabase service-role credentials, webhook/Cron secrets, Sentry upload tokens, Google Services configuration, and Android production signing material must remain in their platform secret stores or ignored local files.
