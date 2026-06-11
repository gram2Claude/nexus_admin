# Register plan sync in Task Scheduler (NEXADM-15): 3 runs daily,
# 5 minutes after WGP sync (08:05 / 14:05 / 17:05 MSK). Log: scripts/sync/sync.log.
# Generates a cmd wrapper so /TR needs no embedded quotes (schtasks quoting hell).
# Idempotent. ASCII-only: PS 5.1 reads BOM-less files as ANSI.
$ErrorActionPreference = "Stop"

$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$node = (Get-Command node).Source
$envFile = Join-Path $repo ".env.local"
if (-not (Test-Path $envFile)) { throw ".env.local not found in $repo - sync needs DATABASE_URL" }

$wrapper = Join-Path $PSScriptRoot "sync-run.cmd"
$lines = @(
    "@echo off",
    "cd /d `"$repo`"",
    "`"$node`" --env-file=.env.local scripts\sync\sync-plan.mjs >> scripts\sync\sync.log 2>&1"
)
[System.IO.File]::WriteAllLines($wrapper, $lines)

# 23:05 added (review 3.1): without it the 17:05->08:05 gap is 15h and the 12h
# staleness warning fires every morning as a false positive.
foreach ($time in "08:05", "14:05", "17:05", "23:05") {
    $name = "nexus-admin-sync-" + $time.Replace(":", "")
    schtasks /Create /F /TN $name /SC DAILY /ST $time /TR "`"$wrapper`""
}
Write-Output "Done: 4 Task Scheduler entries registered (wrapper: $wrapper)."
