<#
.SYNOPSIS
  Installs opencode-project-knowledge once for the current user (Windows + OpenCode).
.DESCRIPTION
  Idempotent. Detects the OpenCode config dir, installs global AGENTS.md section,
  skill, plugin, project-knowledge utilities, templates and commands. Backs up
  replaced files, preserves unrelated config, verifies the installation.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install.ps1
#>
[CmdletBinding()]
param(
  [string]$Source = "",
  [string]$ConfigDir = "",
  [switch]$DryRun,
  [switch]$AllowDowngrade
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Source)) {
  $Source = Split-Path -Parent $MyInvocation.MyCommand.Path
}
$pkgVersion = '1.2.0'
try { $v = Get-Content -LiteralPath (Join-Path $Source 'VERSION') -ErrorAction Stop; if ($v) { $pkgVersion = ($v | Select-Object -First 1).Trim() } } catch {}

function Resolve-ConfigDir {
  param([string]$Override)
  if ($Override -ne '') { return $Override }
  if ($env:OPENCODE_CONFIG) { return $env:OPENCODE_CONFIG }
  $homeDir = [Environment]::GetFolderPath('UserProfile')
  if (-not $homeDir -or $homeDir -eq '') { $homeDir = $env:USERPROFILE }
  $cands = @(
    (Join-Path $homeDir '.config\opencode'),
    (Join-Path $homeDir '.opencode')
  )
  foreach ($c in $cands) { if (Test-Path -LiteralPath $c) { return $c } }
  return $cands[0]
}

function Compare-Versions([string]$a, [string]$b) {
  # Returns -1 if $a -lt $b, 0 if equal, 1 if $a -gt $b (numeric per segment).
  $pa = ($a -split '\.'); $pb = ($b -split '\.')
  $n = [Math]::Max($pa.Count, $pb.Count)
  for ($i = 0; $i -lt $n; $i++) {
    $x = 0; $y = 0
    if ($i -lt $pa.Count) { [int]::TryParse(($pa[$i] -replace '[^0-9].*$', ''), [ref]$x) | Out-Null }
    if ($i -lt $pb.Count) { [int]::TryParse(($pb[$i] -replace '[^0-9].*$', ''), [ref]$y) | Out-Null }
    if ($x -lt $y) { return -1 }
    if ($x -gt $y) { return 1 }
  }
  return 0
}

function Verify-Checksums([string]$ManifestPath, [string]$TargetConfigDir) {
  # Verifies installed payload files against the source SHA256SUMS manifest.
  # Returns an array of failure strings (empty = ok). Files that are merged
  # rather than copied (AGENTS.md) and the version stamp are skipped.
  $fails = @()
  if (-not (Test-Path -LiteralPath $ManifestPath)) {
    Write-Host 'WARNING: SHA256SUMS not found in source; skipping checksum verification.' -ForegroundColor Yellow
    return $fails
  }
  foreach ($line in (Get-Content -LiteralPath $ManifestPath)) {
    if ($line -match '^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$') {
      $hash = $Matches[1].ToLower()
      $rel = $Matches[2].Trim() -replace '/', '\'
      if ($rel -match '^(AGENTS\.md|VERSION|install\.|uninstall\.|SHA256SUMS|tools[/\\]|antigravity[/\\])') { continue }
      $target = Join-Path $TargetConfigDir $rel
      if (-not (Test-Path -LiteralPath $target)) { $fails += "missing: $rel"; continue }
      $actual = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLower()
      if ($actual -ne $hash) { $fails += "checksum mismatch: $rel" }
    }
  }
  return $fails
}

function Backup-File([string]$Path) {
  # Back up pre-existing user content only on first install; on upgrade the
  # existing files are our own payload (or already backed up), so skip.
  if ($script:isUpgrade) { return }
  if (Test-Path -LiteralPath $Path) {
    $bak = "$Path.bak"
    if (-not (Test-Path -LiteralPath $bak)) { Copy-Item -LiteralPath $Path -Destination $bak -Force }
  }
}

function Backup-Always([string]$Path) {
  # For Antigravity: first install of that platform should still back up,
  # even when OpenCode was already installed (isUpgrade true).
  if (Test-Path -LiteralPath $Path) {
    $bak = "$Path.bak"
    if (-not (Test-Path -LiteralPath $bak)) { Copy-Item -LiteralPath $Path -Destination $bak -Force }
  }
}

function Install-File([string]$From, [string]$To) {
  $dir = Split-Path -Parent $To
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  Backup-File $To
  Copy-Item -LiteralPath $From -Destination $To -Force
}

function Merge-Agents([string]$Target, [string]$Snippet) {
  $markerBegin = '<!-- opencode-project-knowledge:begin -->'
  $markerEnd = '<!-- opencode-project-knowledge:end -->'
  $snippetText = Get-Content -LiteralPath $Snippet -Raw
  $wrapped = "$markerBegin`r`n$snippetText`r`n$markerEnd"
  if (-not (Test-Path -LiteralPath $Target)) {
    Set-Content -LiteralPath $Target -Value $wrapped -Encoding UTF8
    return 'created'
  }
  $cur = Get-Content -LiteralPath $Target -Raw
  if ($cur.Contains($markerBegin)) {
    $pattern = '(?s)<!-- opencode-project-knowledge:begin -->.*?<!-- opencode-project-knowledge:end -->'
    $updated = [regex]::Replace($cur, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $wrapped })
    Backup-File $Target
    Set-Content -LiteralPath $Target -Value $updated -Encoding UTF8
    return 'upgraded'
  }
  Backup-File $Target
  Add-Content -LiteralPath $Target -Value ("`r`n`r`n" + $wrapped) -Encoding UTF8
  return 'merged'
}

$ConfigDir = Resolve-ConfigDir $ConfigDir
Write-Host "opencode-project-knowledge v$pkgVersion"
Write-Host "source: $Source"
Write-Host "config: $ConfigDir"

# Detect existing installation
$installedVersion = ''
$versionFile = Join-Path $ConfigDir 'project-knowledge\VERSION'
$script:isUpgrade = Test-Path -LiteralPath $versionFile
if (Test-Path -LiteralPath $versionFile) { $installedVersion = ((Get-Content -LiteralPath $versionFile | Select-Object -First 1) + '').Trim() }
if ($installedVersion -ne '') {
  Write-Host "existing installation detected: v$installedVersion"
  $cmp = Compare-Versions $pkgVersion $installedVersion
  if ($cmp -lt 0 -and -not $AllowDowngrade) {
    Write-Host "REFUSED: installed v$installedVersion is newer than package v$pkgVersion. Re-run with -AllowDowngrade to proceed." -ForegroundColor Red
    exit 1
  } elseif ($cmp -lt 0) {
    Write-Host "WARNING: downgrading v$installedVersion -> v$pkgVersion (explicitly allowed)." -ForegroundColor Yellow
  } elseif ($cmp -eq 0) {
    Write-Host 'same version: reinstalling idempotently.'
  } else {
    Write-Host "upgrading v$installedVersion -> v$pkgVersion."
  }
}

if ($DryRun) {
  Write-Host 'DRY RUN - no changes will be made.'
  Write-Host 'Would ensure directories:'
  foreach ($d in @('project-knowledge\templates','skills\project-knowledge-auto','plugins','commands')) {
    Write-Host " - $(Join-Path $ConfigDir $d)"
  }
  $agentsTarget = Join-Path $ConfigDir 'AGENTS.md'
  if (-not (Test-Path -LiteralPath $agentsTarget)) { Write-Host 'AGENTS.md: would create with marked section' }
  elseif ((Get-Content -LiteralPath $agentsTarget -Raw).Contains('opencode-project-knowledge:begin')) { Write-Host 'AGENTS.md: would upgrade marked section in place' }
  else { Write-Host 'AGENTS.md: would append marked section (existing content preserved)' }
  Write-Host 'Would install payload files (OpenCode):'
  $payload = @('skills\project-knowledge-auto\SKILL.md','plugins\project-knowledge.js','project-knowledge\detect.js','project-knowledge\context.js','project-knowledge\status.js','project-knowledge\refresh.js','project-knowledge\atomic.js','project-knowledge\bootstrap.mjs') + @((Get-ChildItem -LiteralPath (Join-Path $Source 'project-knowledge\templates') -File -ErrorAction SilentlyContinue | ForEach-Object { "project-knowledge\templates\$($_.Name)" })) + @('commands\project-knowledge-status.md','commands\project-knowledge-refresh.md')
  foreach ($p in $payload) { Write-Host " - $(Join-Path $ConfigDir $p)" }
  Write-Host "Would write version stamp: $versionFile"
  Write-Host 'Would ensure @opencode-ai/plugin dependency (for the project_context tool) in config package.json (OpenCode runs bun install automatically at startup)'
  # Antigravity preview
  if ($env:PK_TEST_HOME -and $env:PK_TEST_HOME -ne '') { $homeDirAg = $env:PK_TEST_HOME }
  else { $homeDirAg = [Environment]::GetFolderPath('UserProfile'); if (-not $homeDirAg -or $homeDirAg -eq '') { $homeDirAg = $env:USERPROFILE } }
  $agPk = Join-Path $homeDirAg '.gemini\antigravity\project-knowledge'
  $agMcp = Join-Path $homeDirAg '.gemini\config\mcp_config.json'
  $agHooks = Join-Path $homeDirAg '.gemini\config\hooks.json'
  Write-Host 'Would install Antigravity adapter:'
  Write-Host " - $agPk\mcp-server.js, hook.js (+ engine copy)"
  Write-Host " - skills to ~/.agents/skills, ~/.gemini/antigravity/skills, ~/.gemini/antigravity-cli/skills"
  Write-Host " - plugin: ~/.gemini/antigravity-cli/plugins/project-knowledge/plugin.json"
  Write-Host " - MCP: $agMcp (project-knowledge server)"
  Write-Host " - hooks: $agHooks (PreInvocation project-knowledge-context)"
  exit 0
}

$dirs = @(
  (Join-Path $ConfigDir 'project-knowledge\templates'),
  (Join-Path $ConfigDir 'skills\project-knowledge-auto'),
  (Join-Path $ConfigDir 'plugins'),
  (Join-Path $ConfigDir 'commands')
)
foreach ($d in $dirs) { if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null } }

# 1. AGENTS.md (merge, never clobber)
$agentsResult = Merge-Agents (Join-Path $ConfigDir 'AGENTS.md') (Join-Path $Source 'AGENTS.md')
Write-Host "AGENTS.md: $agentsResult"

# 2. Skill
Install-File (Join-Path $Source 'skills\project-knowledge-auto\SKILL.md') (Join-Path $ConfigDir 'skills\project-knowledge-auto\SKILL.md')

# 3. Plugin
Install-File (Join-Path $Source 'plugins\project-knowledge.js') (Join-Path $ConfigDir 'plugins\project-knowledge.js')

# 4-5. Utilities + templates
foreach ($f in @('detect.js','context.js','status.js','refresh.js','atomic.js','bootstrap.mjs')) {
  Install-File (Join-Path $Source "project-knowledge\$f") (Join-Path $ConfigDir "project-knowledge\$f")
}
foreach ($t in Get-ChildItem -LiteralPath (Join-Path $Source 'project-knowledge\templates') -File) {
  Install-File $t.FullName (Join-Path $ConfigDir "project-knowledge\templates\$($t.Name)")
}

# 6. Commands (status/refresh docs)
foreach ($c in @('project-knowledge-status.md','project-knowledge-refresh.md')) {
  $src = Join-Path $Source "commands\$c"
  if (Test-Path -LiteralPath $src) { Install-File $src (Join-Path $ConfigDir "commands\$c") }
}

# 6b. Plugin dependency for the project_context custom tool.
# Merged (never clobbered): existing version specs are left untouched.
# OpenCode runs `bun install` automatically at startup when package.json exists.
$pkgJson = Join-Path $ConfigDir 'package.json'
if (Test-Path -LiteralPath $pkgJson) { Backup-File $pkgJson }
& node (Join-Path $Source 'tools\merge-package-dep.js') $pkgJson 'add' '@opencode-ai/plugin' '^1.3.3'
if ($LASTEXITCODE -ne 0) {
  Write-Host 'WARNING: could not merge @opencode-ai/plugin into config package.json (see above). The plugin will load without its custom tool until the dependency is installed.' -ForegroundColor Yellow
} else {
  Write-Host 'package.json: @opencode-ai/plugin dependency ensured (bun install runs automatically at OpenCode startup)'
}

# 7. Version stamp
Set-Content -LiteralPath $versionFile -Value $pkgVersion -Encoding UTF8

# ── 8. Antigravity IDE/CLI (same engine, thin adapters — no rewrite) ──────────
# Runs alongside OpenCode; does not touch OpenCode config. Installs to
# ~/.gemini (shared by Antigravity IDE + CLI) and ~/.agents (open skills spec).
# Tests may set PK_TEST_HOME to sandbox this away from the real home.
if ($env:PK_TEST_HOME -and $env:PK_TEST_HOME -ne '') { $homeDirAg = $env:PK_TEST_HOME }
else {
  $homeDirAg = [Environment]::GetFolderPath('UserProfile')
  if (-not $homeDirAg -or $homeDirAg -eq '') { $homeDirAg = $env:USERPROFILE }
}
$agPkDir        = Join-Path $homeDirAg '.gemini\antigravity\project-knowledge'
$agConfigDir    = Join-Path $homeDirAg '.gemini\config'
$agCliPluginDir = Join-Path $homeDirAg '.gemini\antigravity-cli\plugins\project-knowledge'
$agCliSkillsDir = Join-Path $homeDirAg '.gemini\antigravity-cli\skills\project-knowledge-auto'
$agIdeSkillsDir = Join-Path $homeDirAg '.gemini\antigravity\skills\project-knowledge-auto'
$agGlobalSkillsDir = Join-Path $homeDirAg '.agents\skills\project-knowledge-auto'

# Engine copy (so mcp-server / hook resolve ./context.js relative to themselves after install)
foreach ($d in @($agPkDir, (Join-Path $agPkDir 'templates'), $agCliPluginDir, $agCliSkillsDir, $agIdeSkillsDir, $agGlobalSkillsDir, $agConfigDir)) {
  if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}
foreach ($f in @('detect.js','context.js','status.js','refresh.js','atomic.js','bootstrap.mjs')) {
  $src = Join-Path $Source "project-knowledge\$f"
  $dst = Join-Path $agPkDir $f
  if (Test-Path -LiteralPath $dst) { Backup-Always $dst }
  Copy-Item -LiteralPath $src -Destination $dst -Force
}
foreach ($t in Get-ChildItem -LiteralPath (Join-Path $Source 'project-knowledge\templates') -File -ErrorAction SilentlyContinue) {
  $dst = Join-Path $agPkDir "templates\$($t.Name)"
  if (Test-Path -LiteralPath $dst) { Backup-Always $dst }
  Copy-Item -LiteralPath $t.FullName -Destination $dst -Force
}
# Adapters (no deps, CJS stdio)
foreach ($pair in @(
  @((Join-Path $Source 'antigravity\mcp-server.js'), (Join-Path $agPkDir 'mcp-server.js')),
  @((Join-Path $Source 'antigravity\hook.js'),       (Join-Path $agPkDir 'hook.js'))
)) {
  if (Test-Path -LiteralPath $pair[0]) {
    if (Test-Path -LiteralPath $pair[1]) { Backup-Always $pair[1] }
    Copy-Item -LiteralPath $pair[0] -Destination $pair[1] -Force
  }
}
# Plugin manifest (antigravity-cli)
$agPluginSrc = Join-Path $Source 'antigravity\plugin.json'
if (Test-Path -LiteralPath $agPluginSrc) {
  $agPluginDst = Join-Path $agCliPluginDir 'plugin.json'
  if (Test-Path -LiteralPath $agPluginDst) { Backup-Always $agPluginDst }
  Copy-Item -LiteralPath $agPluginSrc -Destination $agPluginDst -Force
}
# Skills — same SKILL.md (open Agent Skills spec) in all Antigravity homes
$skillSrc = Join-Path $Source 'skills\project-knowledge-auto\SKILL.md'
foreach ($dst in @(
  (Join-Path $agCliSkillsDir 'SKILL.md'),
  (Join-Path $agIdeSkillsDir 'SKILL.md'),
  (Join-Path $agGlobalSkillsDir 'SKILL.md')
)) {
  if (Test-Path -LiteralPath $dst) { Backup-Always $dst }
  Copy-Item -LiteralPath $skillSrc -Destination $dst -Force
}
# MCP + hooks JSON: idempotent merge (never clobber other servers/hooks)
$agMcpPath   = Join-Path $agConfigDir 'mcp_config.json'
$agHooksPath = Join-Path $agConfigDir 'hooks.json'
$agMcpServer = Join-Path $agPkDir 'mcp-server.js'
$agHookJs    = Join-Path $agPkDir 'hook.js'
if (Test-Path -LiteralPath $agMcpPath)   { Backup-Always $agMcpPath }
if (Test-Path -LiteralPath $agHooksPath) { Backup-Always $agHooksPath }
& node (Join-Path $Source 'tools\merge-mcp-config.js') $agMcpPath 'add' $agMcpServer
if ($LASTEXITCODE -ne 0) { Write-Host 'WARNING: could not merge mcp_config.json (see above).' -ForegroundColor Yellow } else { Write-Host "Antigravity MCP: $agMcpPath (project-knowledge server)" }
& node (Join-Path $Source 'tools\merge-hooks-config.js') $agHooksPath 'add' $agHookJs
if ($LASTEXITCODE -ne 0) { Write-Host 'WARNING: could not merge hooks.json (see above).' -ForegroundColor Yellow } else { Write-Host "Antigravity hooks: $agHooksPath (PreInvocation project-knowledge-context)" }
Write-Host 'Antigravity: installed (same engine, MCP + skill + hook adapters)'
# Also mirror the VERSION stamp for Antigravity
Set-Content -LiteralPath (Join-Path $agPkDir 'VERSION') -Value $pkgVersion -Encoding UTF8

# Verify
$errors = @()
foreach ($p in @(
  (Join-Path $ConfigDir 'AGENTS.md'),
  (Join-Path $ConfigDir 'skills\project-knowledge-auto\SKILL.md'),
  (Join-Path $ConfigDir 'plugins\project-knowledge.js'),
  (Join-Path $ConfigDir 'project-knowledge\detect.js'),
  (Join-Path $ConfigDir 'project-knowledge\context.js'),
  (Join-Path $ConfigDir 'project-knowledge\status.js'),
  (Join-Path $ConfigDir 'project-knowledge\refresh.js'),
  (Join-Path $ConfigDir 'project-knowledge\atomic.js'),
  (Join-Path $ConfigDir 'project-knowledge\bootstrap.mjs'),
  $versionFile
)) { if (-not (Test-Path -LiteralPath $p)) { $errors += "missing: $p" } }

# Syntax checks
try { node --check (Join-Path $ConfigDir 'project-knowledge\detect.js') } catch { $errors += 'detect.js syntax check failed' }
try { node --check (Join-Path $ConfigDir 'project-knowledge\context.js') } catch { $errors += 'context.js syntax check failed' }
try { node --check (Join-Path $ConfigDir 'project-knowledge\status.js') } catch { $errors += 'status.js syntax check failed' }
try { node --check (Join-Path $ConfigDir 'project-knowledge\refresh.js') } catch { $errors += 'refresh.js syntax check failed' }
try { node --check (Join-Path $ConfigDir 'project-knowledge\atomic.js') } catch { $errors += 'atomic.js syntax check failed' }
# Plugin is ESM (per OpenCode plugin format), but plain Node loads installed
# .js as CJS (config package.json has no "type" field), so validate identical
# bytes via a temp .mjs copy. The no-dependency path must resolve to {}.
$pluginSrc = Join-Path $ConfigDir 'plugins\project-knowledge.js'
try {
  $pluginTmp = Join-Path ([IO.Path]::GetTempPath()) ("pk-plugin-check-" + [Guid]::NewGuid().ToString('N') + '.mjs')
  Copy-Item -LiteralPath $pluginSrc -Destination $pluginTmp -Force
  $env:PK_PLUGIN_CHECK = $pluginTmp
  & node -e "const { pathToFileURL } = require('node:url'); import(pathToFileURL(process.env.PK_PLUGIN_CHECK).href).then(async (m) => { if (typeof m.ProjectKnowledgePlugin !== 'function') throw new Error('missing ProjectKnowledgePlugin export'); await m.ProjectKnowledgePlugin({}); }).catch((e) => { console.error(String((e && e.message) || e)); process.exit(1); })"
  $pluginCheckCode = $LASTEXITCODE
  Remove-Item -LiteralPath $pluginTmp -Force -ErrorAction SilentlyContinue
  Remove-Item Env:\PK_PLUGIN_CHECK -ErrorAction SilentlyContinue
  if ($pluginCheckCode -ne 0) { $errors += 'plugin load check failed' }
} catch {
  $errors += 'plugin load check failed'
}

# No machine-specific paths in installed payload
$bad = Select-String -LiteralPath @((Join-Path $ConfigDir 'project-knowledge\detect.js'),(Join-Path $ConfigDir 'project-knowledge\context.js'),(Join-Path $ConfigDir 'project-knowledge\bootstrap.mjs')) -Pattern 'C:\\Users\\Admin' -SimpleMatch -ErrorAction SilentlyContinue
if ($bad) { $errors += 'hard-coded machine path detected in payload' }

# Checksum verification against source manifest (OpenCode mapping)
foreach ($e in (Verify-Checksums (Join-Path $Source 'SHA256SUMS') $ConfigDir)) { $errors += $e }

# Antigravity quick verify: adapters exist and parse; mcp_config/hooks merge preserved others
foreach ($p in @(
  (Join-Path $agPkDir 'mcp-server.js'),
  (Join-Path $agPkDir 'hook.js'),
  (Join-Path $agPkDir 'detect.js'),
  (Join-Path $agPkDir 'context.js'),
  (Join-Path $agCliPluginDir 'plugin.json'),
  (Join-Path $agCliSkillsDir 'SKILL.md'),
  (Join-Path $agIdeSkillsDir 'SKILL.md'),
  (Join-Path $agGlobalSkillsDir 'SKILL.md')
)) { if (-not (Test-Path -LiteralPath $p)) { $errors += "missing (antigravity): $p" } }
try { node --check (Join-Path $agPkDir 'mcp-server.js') } catch { $errors += 'antigravity mcp-server.js syntax check failed' }
try { node --check (Join-Path $agPkDir 'hook.js') } catch { $errors += 'antigravity hook.js syntax check failed' }
try { node --check (Join-Path $Source 'tools\merge-mcp-config.js') } catch { $errors += 'merge-mcp-config.js syntax check failed' }
try { node --check (Join-Path $Source 'tools\merge-hooks-config.js') } catch { $errors += 'merge-hooks-config.js syntax check failed' }

if ($errors.Count -gt 0) {
  Write-Host 'INSTALL FAILED:' -ForegroundColor Red
  $errors | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
  exit 1
}

Write-Host ''
Write-Host 'SUCCESS: opencode-project-knowledge installed.' -ForegroundColor Green
Write-Host "OpenCode: open any repository - compact project context is automatic (see $ConfigDir\AGENTS.md)."
Write-Host "Antigravity: MCP project_context + skills + PreInvocation hook installed (see $agConfigDir\mcp_config.json)."
Write-Host "Debug (OpenCode): node `"$ConfigDir\project-knowledge\detect.js`" <repo> | node `"$ConfigDir\project-knowledge\context.js`" <repo>"
Write-Host "Debug (Antigravity MCP): node `"$agPkDir\mcp-server.js`" (via mcp_config.json)"
