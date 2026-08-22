# Remote rollback failsafe (2026-08-21)

These scripts undo the linked-project deploy of member nudge. They are **not** forward migrations. Do not move them into `supabase/migrations`.

## What was applied

- Project: `fdykfiejzmwdesczduun`
- Git: `40e204b` on `feature/offline-maps-tracking-nudge`
- Migrations pushed: `202608160001_default_route_leader`, `202608210001_member_nudge`
- Function deployed: `send-member-nudge` (`verify_jwt = false`)
- Current test APK: `dist/triptrack-release-nudge-20260821.apk` (also `android/app/build/outputs/apk/release/app-release.apk`)
- No older APK was on disk. App rollback is rebuild from `12e4e98` (`feature/next-version`) plus the schema/function undo below.

Remote `create_trip` and `list_trip_alert_events` matched the pre-nudge definitions in the down scripts before push.

## Undo nudge only

From the repo root:

```powershell
powershell -File scripts/rollback-member-nudge.ps1
```

Or step by step:

```powershell
npx supabase db query --linked -f supabase/rollbacks/202608210001_member_nudge.down.sql
npx supabase functions delete send-member-nudge
adb install -r android/app/build/outputs/apk/release/app-release-pre-nudge-20260821.apk
```

## Also undo default Route Leader on create_trip

```powershell
npx supabase db query --linked -f supabase/rollbacks/202608160001_default_route_leader.down.sql
```

After a schema rollback, do **not** run `supabase db push` again unless you intend to re-apply those migrations. The remote migration history will still list them as applied; re-applying requires a new forward migration or repairing `supabase_migrations.schema_migrations`.
