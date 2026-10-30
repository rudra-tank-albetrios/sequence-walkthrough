# Copies the sequence-walkthrough skill into your personal Claude Code skills folder.
# Run from the unzipped kit folder:  powershell -ExecutionPolicy Bypass -File .\install-claude-code.ps1
$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'sequence-walkthrough'
if (-not (Test-Path (Join-Path $src 'SKILL.md'))) { throw "sequence-walkthrough\SKILL.md not found next to this script." }
$skills = Join-Path $env:USERPROFILE '.claude\skills'
$dest = Join-Path $skills 'sequence-walkthrough'
New-Item -ItemType Directory -Force $skills | Out-Null
if (Test-Path $dest) {
  # Outside the skills folder, so Claude Code doesn't load the old copy as a second skill.
  $backups = Join-Path $env:USERPROFILE '.claude\skill-backups'
  New-Item -ItemType Directory -Force $backups | Out-Null
  $backup = Join-Path $backups "sequence-walkthrough-$(Get-Date -Format yyyyMMdd-HHmmss)"
  Move-Item $dest $backup
  Write-Host "Moved the old copy to $backup"
}
Copy-Item $src $dest -Recurse
Write-Host "Installed to $dest"
Write-Host "Start a new Claude Code session, then type /sequence-walkthrough or ask for a walkthrough diagram."
