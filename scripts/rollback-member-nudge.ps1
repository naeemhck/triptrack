# Failsafe undo for the member-nudge Supabase deploy.
# Run from the repo root only if you need to revert that feature.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host 'Rolling back member-nudge schema on the linked project...'
npx supabase db query --linked -f supabase/rollbacks/202608210001_member_nudge.down.sql
if ($LASTEXITCODE -ne 0) { throw "Schema rollback failed with exit $LASTEXITCODE" }

Write-Host 'Deleting send-member-nudge Edge Function...'
npx supabase functions delete send-member-nudge
if ($LASTEXITCODE -ne 0) {
  Write-Warning "Function delete failed. Delete it from the Supabase dashboard if it still exists."
}

Write-Host 'Nudge rollback complete. To also undo default Route Leader assignment, run:'
Write-Host '  npx supabase db query --linked -f supabase/rollbacks/202608160001_default_route_leader.down.sql'
Write-Host 'To rebuild the previous app, check out 12e4e98 and run assembleRelease again.'
