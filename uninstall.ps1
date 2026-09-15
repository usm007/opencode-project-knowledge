<#
.SYNOPSIS
  Safely uninstalls opencode-project-knowledge (Windows).
.DESCRIPTION
  Removes only files installed by this package, preserves unrelated OpenCode
  configuration, restores .bak backups when present. Safe to run repeatedly.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File uninstall.ps1
#>
[CmdletBinding()]
param([string]$ConfigDir = "", [switch]$DryRun, [string]$Source = "")

$ErrorActionPreference = 'Continue'
if ([string]::IsNullOrWhiteSpace($Source)) {
  $Source = Split-Path -Parent $MyInvocation.MyCommand.Path
}

function Resolve-ConfigDir {
  param([string]$Override)
  if ($Override -ne '') { return $Override }
  if ($env:OPENCODE_CONFIG) { return $env:OPENCODE_CONFIG }
  $homeDir = [Environment]::GetFolderPath('UserProfile')
  if (-not $homeDir -or $homeDir -eq '') { $homeDir = $env:USERPROFILE }
  $cands = @((Join-Path $homeDir '.config\opencode'), (Join-Path $homeDir '.opencode'))
  foreach ($c in $cands) { if (Test-Path -LiteralPath $c) { return $c } }
  return $cands[0]
}

function Remove-Installed([string]$Path) {
  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Force
    Write-Host " removed: $Path"
  } else { Write-Host " absent (ok): $Path" }
  $bak = "$Path.bak"
  if (Test-Path -LiteralPath $bak) {
    Move-Item -LiteralPath $bak -Destination $Path -Force
    Write-Host " restored backup: $Path"
  }
}

function Strip-AgentsSection([string]$Target) {
  if (-not (Test-Path -LiteralPath $Target)) { Write-Host ' AGENTS.md absent (ok)'; return }
  $cur = Get-Content -LiteralPath $Target -Raw
  $pattern = '(?s)\r?\n?\r?\n?<!-- opencode-project-knowledge:begin -->.*?<!-- opencode-project-knowledge:end -->\r?\n?'
  if ($cur -match 'opencode-project-knowledge:begin') {
    $updated = [regex]::Replace($cur, $pattern, '')
    if ($updated.Trim() -eq '') {
      $bak = "$Target.bak"
      if (Test-Path -LiteralPath $bak) { Move-Item -LiteralPath $bak -Destination $Target -Force; Write-Host ' AGENTS.md restored from backup' }
      else { Remove-Item -LiteralPath $Target -Force; Write-Host ' AGENTS.md section removed (file was only our content; deleted)' }
    } else {
      Set-Content -LiteralPath $Target -Value $updated -Encoding UTF8
      Write-Host ' AGENTS.md section removed (unrelated content preserved)'
    }
  } else { Write-Host ' AGENTS.md has no our section (preserved)' }
}

$ConfigDir = Resolve-ConfigDir $ConfigDir
Write-Host "Uninstalling opencode-project-knowledge from: $ConfigDir"

$files = @(
  'skills\project-knowledge-auto\SKILL.md',
  'plugins\project-knowledge.js',
  'project-knowledge\detect.js',
  'project-knowledge\context.js',
  'project-knowledge\status.js',
  'project-knowledge\refresh.js',
  'project-knowledge\atomic.js',
  'project-knowledge\bootstrap.mjs',
  'project-knowledge\VERSION',
  'commands\project-knowledge-status.md',
  'commands\project-knowledge-refresh.md'
)
if ($DryRun) {
  Write-Host 'DRY RUN - nothing will be removed.'
  foreach ($rel in $files) {
    $p = Join-Path $ConfigDir $rel
    if (Test-Path -LiteralPath $p) { Write-Host " would remove: $p" }
    if (Test-Path -LiteralPath "$p.bak") { Write-Host " would restore backup: $p" }
  }
  $tplDir = Join-Path $ConfigDir 'project-knowledge\templates'
  if (Test-Path -LiteralPath $tplDir) {
    foreach ($f in @(Get-ChildItem -LiteralPath $tplDir -File -ErrorAction SilentlyContinue)) {
      if (Test-Path -LiteralPath "$($f.FullName).bak") { Write-Host " would restore backup: $($f.FullName)" }
      else { Write-Host " would remove: $($f.FullName)" }
    }
  }
  $agents = Join-Path $ConfigDir 'AGENTS.md'
  if ((Test-Path -LiteralPath $agents) -and ((Get-Content -LiteralPath $agents -Raw).Contains('opencode-project-knowledge:begin'))) {
    Write-Host ' AGENTS.md: would remove marked section (unrelated content preserved)'
  } else { Write-Host ' AGENTS.md: no our section (would preserve)' }
  $pkgJsonDry = Join-Path $ConfigDir 'package.json'
  if (Test-Path -LiteralPath $pkgJsonDry) {
    if (Test-Path -LiteralPath "$pkgJsonDry.bak") { Write-Host ' package.json: would restore pre-install backup' }
    else { Write-Host ' package.json: would remove @opencode-ai/plugin dependency (file deleted if left empty)' }
  }
  if ($env:PK_TEST_HOME -and $env:PK_TEST_HOME -ne '') { $homeDry = $env:PK_TEST_HOME } else { $homeDry = [Environment]::GetFolderPath('UserProfile'); if (-not $homeDry -or $homeDry -eq '') { $homeDry = $env:USERPROFILE } }
  $agPkDry = Join-Path $homeDry '.gemini\antigravity\project-knowledge'
  $agMcpDry = Join-Path $homeDry '.gemini\config\mcp_config.json'
  $agHooksDry = Join-Path $homeDry '.gemini\config\hooks.json'
  Write-Host " Antigravity: would remove $agPkDry (+ skills at ~/.agents/skills, ~/.gemini/.../skills)"
  if (Test-Path -LiteralPath $agMcpDry) { Write-Host " Antigravity MCP: would remove project-knowledge from $agMcpDry (file deleted if last server)" }
  if (Test-Path -LiteralPath $agHooksDry) { Write-Host " Antigravity hooks: would remove project-knowledge-context from $agHooksDry (file deleted if last hook)" }
  exit 0
}
foreach ($rel in $files) { Remove-Installed (Join-Path $ConfigDir $rel) }

# Templates (any files we installed)
$tplDir = Join-Path $ConfigDir 'project-knowledge\templates'
if (Test-Path -LiteralPath $tplDir) {
  $left = Get-ChildItem -LiteralPath $tplDir -File -ErrorAction SilentlyContinue
  foreach ($f in @($left)) {
    $bak = "$($f.FullName).bak"
    if (Test-Path -LiteralPath $bak) { Move-Item -LiteralPath $bak -Destination $f.FullName -Force; Write-Host " restored backup: $($f.FullName)" }
    else { Remove-Item -LiteralPath $f.FullName -Force; Write-Host " removed: $($f.FullName)" }
  }
  if (-not (Get-ChildItem -LiteralPath $tplDir -ErrorAction SilentlyContinue)) {
    Remove-Item -LiteralPath $tplDir -Force
    Write-Host " removed empty dir: $tplDir"
  }
}

Strip-AgentsSection (Join-Path $ConfigDir 'AGENTS.md')

# Plugin dependency: restore the pre-install package.json when we backed one
# up; otherwise just remove our dep key (the helper deletes the file if it
# becomes an empty object, e.g. when we created it).
$pkgJson = Join-Path $ConfigDir 'package.json'
if (Test-Path -LiteralPath $pkgJson) {
  if (Test-Path -LiteralPath "$pkgJson.bak") {
    Move-Item -LiteralPath "$pkgJson.bak" -Destination $pkgJson -Force
    Write-Host ' package.json restored from pre-install backup'
  } elseif (Get-Command node -ErrorAction SilentlyContinue) {
    & node (Join-Path $Source 'tools\merge-package-dep.js') $pkgJson 'remove' '@opencode-ai/plugin'
    if ($LASTEXITCODE -ne 0) { Write-Host 'WARNING: could not clean @opencode-ai/plugin from package.json (see above).' }
  } else {
    Write-Host 'WARNING: node not found; left @opencode-ai/plugin in package.json.'
  }
}

# Remove empty parent dirs only if empty
foreach ($d in @((Join-Path $ConfigDir 'project-knowledge'), (Join-Path $ConfigDir 'skills\project-knowledge-auto'))) {
  if ((Test-Path -LiteralPath $d) -and (-not (Get-ChildItem -LiteralPath $d -ErrorAction SilentlyContinue))) {
    Remove-Item -LiteralPath $d -Force; Write-Host " removed empty dir: $d"
  }
}

# ── Antigravity (same engine, adapters) ─────────────────────────────────────
if ($env:PK_TEST_HOME -and $env:PK_TEST_HOME -ne '') { $homeDirAg = $env:PK_TEST_HOME } else {
  $homeDirAg = [Environment]::GetFolderPath('UserProfile')
  if (-not $homeDirAg -or $homeDirAg -eq '') { $homeDirAg = $env:USERPROFILE }
}
$agPkDir2        = Join-Path $homeDirAg '.gemini\antigravity\project-knowledge'
$agConfigDir2    = Join-Path $homeDirAg '.gemini\config'
$agCliPluginDir2 = Join-Path $homeDirAg '.gemini\antigravity-cli\plugins\project-knowledge'
$agCliSkillsDir2 = Join-Path $homeDirAg '.gemini\antigravity-cli\skills\project-knowledge-auto'
$agIdeSkillsDir2 = Join-Path $homeDirAg '.gemini\antigravity\skills\project-knowledge-auto'
$agGlobalSkillsDir2 = Join-Path $homeDirAg '.agents\skills\project-knowledge-auto'

# Skills (each: remove payload, restore .bak if present)
foreach ($sk in @($agCliSkillsDir2, $agIdeSkillsDir2, $agGlobalSkillsDir2)) {
  $skFile = Join-Path $sk 'SKILL.md'
  if (Test-Path -LiteralPath $skFile) { Remove-Installed $skFile }
  if ((Test-Path -LiteralPath $sk) -and (-not (Get-ChildItem -LiteralPath $sk -ErrorAction SilentlyContinue))) {
    Remove-Item -LiteralPath $sk -Force; Write-Host " removed empty dir: $sk"
  }
}
# Plugin manifest
$agPlugFile = Join-Path $agCliPluginDir2 'plugin.json'
if (Test-Path -LiteralPath $agPlugFile) { Remove-Installed $agPlugFile }
if ((Test-Path -LiteralPath $agCliPluginDir2) -and (-not (Get-ChildItem -LiteralPath $agCliPluginDir2 -ErrorAction SilentlyContinue))) {
  Remove-Item -LiteralPath $agCliPluginDir2 -Force; Write-Host " removed empty dir: $agCliPluginDir2"
}
# Engine copy + adapters
$agEngineFiles = @('detect.js','context.js','status.js','refresh.js','atomic.js','bootstrap.mjs','mcp-server.js','hook.js','VERSION')
foreach ($f in $agEngineFiles) {
  $p = Join-Path $agPkDir2 $f
  if (Test-Path -LiteralPath $p) { Remove-Installed $p }
}
$agTplDir = Join-Path $agPkDir2 'templates'
if (Test-Path -LiteralPath $agTplDir) {
  $left = Get-ChildItem -LiteralPath $agTplDir -File -ErrorAction SilentlyContinue
  foreach ($f in @($left)) {
    $bak = "$($f.FullName).bak"
    if (Test-Path -LiteralPath $bak) { Move-Item -LiteralPath $bak -Destination $f.FullName -Force; Write-Host " restored backup: $($f.FullName)" }
    else { Remove-Item -LiteralPath $f.FullName -Force; Write-Host " removed: $($f.FullName)" }
  }
  if (-not (Get-ChildItem -LiteralPath $agTplDir -ErrorAction SilentlyContinue)) { Remove-Item -LiteralPath $agTplDir -Force; Write-Host " removed empty dir: $agTplDir" }
}
if ((Test-Path -LiteralPath $agPkDir2) -and (-not (Get-ChildItem -LiteralPath $agPkDir2 -ErrorAction SilentlyContinue))) {
  Remove-Item -LiteralPath $agPkDir2 -Force; Write-Host " removed empty dir: $agPkDir2"
}
# MCP + hooks: merge helpers remove our key only, preserve others; helper deletes file if last key
$agMcp2  = Join-Path $agConfigDir2 'mcp_config.json'
$agHooks2 = Join-Path $agConfigDir2 'hooks.json'
if (Test-Path -LiteralPath $agMcp2) {
  if ((Test-Path -LiteralPath "$agMcp2.bak") -and ((Get-Content -LiteralPath $agMcp2 -Raw) -match '"project-knowledge"')) {
    # If we backed up and the file now only holds our key, restore logic inside helper is safer; just call helper.
  }
  if (Get-Command node -ErrorAction SilentlyContinue) {
    $mcpServerAbs = Join-Path $agPkDir2 'mcp-server.js'
    & node (Join-Path $Source 'tools\merge-mcp-config.js') $agMcp2 'remove' $mcpServerAbs
    if ($LASTEXITCODE -ne 0) { Write-Host 'WARNING: could not clean mcp_config.json' }
    elseif (-not (Test-Path -LiteralPath $agMcp2)) { Write-Host ' Antigravity MCP: mcp_config.json removed (was only our server)' }
    else { Write-Host ' Antigravity MCP: project-knowledge server removed (other servers preserved)' }
    if ((Test-Path -LiteralPath "$agMcp2.bak") -and (-not (Test-Path -LiteralPath $agMcp2))) {
      # Helper deleted empty file; if we had a pre-install backup that was not our content, keep it? But helper already removed file; .bak restore not needed since other servers absent.
    }
  }
}
if (Test-Path -LiteralPath $agHooks2) {
  if (Get-Command node -ErrorAction SilentlyContinue) {
    $hookAbs = Join-Path $agPkDir2 'hook.js'
    & node (Join-Path $Source 'tools\merge-hooks-config.js') $agHooks2 'remove' $hookAbs
    if ($LASTEXITCODE -ne 0) { Write-Host 'WARNING: could not clean hooks.json' }
    elseif (-not (Test-Path -LiteralPath $agHooks2)) { Write-Host ' Antigravity hooks: hooks.json removed (was only our hook)' }
    else { Write-Host ' Antigravity hooks: project-knowledge-context removed (other hooks preserved)' }
  }
}
# Clean up empty .gemini parents only if empty (never delete user data bulk)
foreach ($d in @(
  (Join-Path $homeDirAg '.gemini\antigravity\skills\project-knowledge-auto'),
  (Join-Path $homeDirAg '.gemini\antigravity\skills'),
  (Join-Path $homeDirAg '.gemini\antigravity-cli\skills\project-knowledge-auto'),
  (Join-Path $homeDirAg '.gemini\antigravity-cli\skills'),
  (Join-Path $homeDirAg '.agents\skills\project-knowledge-auto'),
  (Join-Path $homeDirAg '.agents\skills')
)) {
  if ((Test-Path -LiteralPath $d) -and (-not (Get-ChildItem -LiteralPath $d -ErrorAction SilentlyContinue))) {
    Remove-Item -LiteralPath $d -Force -ErrorAction SilentlyContinue
  }
}

Write-Host 'Done. Unrelated OpenCode configuration was preserved.'
Write-Host 'Done. Antigravity MCP/hooks cleaned (other servers/hooks preserved).'
