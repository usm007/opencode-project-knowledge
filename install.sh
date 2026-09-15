#!/usr/bin/env bash
# Installs opencode-project-knowledge once for the current user (Linux/macOS).
# Idempotent. Usage: ./install.sh [--source DIR] [--config DIR] [--dry-run] [--allow-downgrade]
set -euo pipefail
SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG=""
DRY_RUN=0
ALLOW_DOWNGRADE=0
need_value() { if [ $# -lt 2 ]; then echo "Missing value for $1" >&2; exit 1; fi; }
while [ $# -gt 0 ]; do case "$1" in
  --source) need_value "$@"; SOURCE="$2"; shift 2;;
  --config) need_value "$@"; CONFIG="$2"; shift 2;;
  --dry-run) DRY_RUN=1; shift;;
  --allow-downgrade) ALLOW_DOWNGRADE=1; shift;;
  *) echo "Unknown arg: $1" >&2; exit 1;;
esac; done
PKG_VERSION="$(head -n1 "$SOURCE/VERSION" | tr -d ' \r\n')"
ver_lt() { # true (0) if $1 < $2 - pure awk, no GNU sort -V (absent on macOS)
  [ "$1" = "$2" ] && return 1
  awk -v a="$1" -v b="$2" 'BEGIN {
    n = split(a, pa, /\./); m = split(b, pb, /\./);
    len = (n > m ? n : m);
    for (i = 1; i <= len; i++) {
      x = (i <= n ? pa[i] : 0) + 0; y = (i <= m ? pb[i] : 0) + 0;
      if (x < y) exit 0; if (x > y) exit 1;
    }
    exit 1;
  }'
}
resolve_config() {
  if [ -n "${OPENCODE_CONFIG:-}" ]; then echo "$OPENCODE_CONFIG"; return; fi
  if [ -d "$HOME/.config/opencode" ]; then echo "$HOME/.config/opencode"; return; fi
  echo "$HOME/.config/opencode"
}
[ -z "$CONFIG" ] && CONFIG="$(resolve_config)"
# Only back up pre-existing user content on first install; on upgrade the
# existing files are our own payload, so skip backups.
IS_UPGRADE=0
[ -f "$CONFIG/project-knowledge/VERSION" ] && IS_UPGRADE=1
echo "opencode-project-knowledge v$PKG_VERSION"
echo "source: $SOURCE"
echo "config: $CONFIG"
if [ -f "$CONFIG/project-knowledge/VERSION" ]; then
  INSTALLED="$(head -n1 "$CONFIG/project-knowledge/VERSION" | tr -d ' \r\n')"
  echo "existing installation detected: v$INSTALLED"
  if ver_lt "$PKG_VERSION" "$INSTALLED" && [ "$ALLOW_DOWNGRADE" != 1 ]; then
    echo "REFUSED: installed v$INSTALLED is newer than package v$PKG_VERSION. Re-run with --allow-downgrade to proceed." >&2
    exit 1
  elif ver_lt "$PKG_VERSION" "$INSTALLED"; then
    echo "WARNING: downgrading v$INSTALLED -> v$PKG_VERSION (explicitly allowed)."
  fi
fi
if [ "$DRY_RUN" = 1 ]; then
  echo "DRY RUN - no changes will be made."
  echo "Would ensure directories: $CONFIG/project-knowledge/templates $CONFIG/skills/project-knowledge-auto $CONFIG/plugins $CONFIG/commands"
  if [ ! -f "$CONFIG/AGENTS.md" ]; then echo "AGENTS.md: would create with marked section";
  elif grep -q "opencode-project-knowledge:begin" "$CONFIG/AGENTS.md"; then echo "AGENTS.md: would upgrade marked section in place";
  else echo "AGENTS.md: would append marked section (existing content preserved)"; fi
  echo "Would install: skills/project-knowledge-auto/SKILL.md plugins/project-knowledge.js project-knowledge/{detect,context,status,refresh,atomic}.js project-knowledge/bootstrap.mjs templates/* commands/*"
  echo "Would ensure @opencode-ai/plugin dependency in $CONFIG/package.json"
  echo "Would write version stamp: $CONFIG/project-knowledge/VERSION"
  echo "Would install Antigravity adapter:"
  echo " - \$HOME/.gemini/antigravity/project-knowledge/mcp-server.js, hook.js (+ engine copy)"
  echo " - skills to ~/.agents/skills, ~/.gemini/antigravity/skills, ~/.gemini/antigravity-cli/skills"
  echo " - plugin: ~/.gemini/antigravity-cli/plugins/project-knowledge/plugin.json"
  echo " - MCP: ~/.gemini/config/mcp_config.json (project-knowledge server)"
  echo " - hooks: ~/.gemini/config/hooks.json (PreInvocation project-knowledge-context)"
  exit 0
fi
mkdir -p "$CONFIG/project-knowledge/templates" "$CONFIG/skills/project-knowledge-auto" "$CONFIG/plugins" "$CONFIG/commands"
backup() { if [ "$IS_UPGRADE" = 1 ]; then return 0; fi; [ -f "$1" ] && [ ! -f "$1.bak" ] && cp "$1" "$1.bak"; :; }
backup_always() { [ -f "$1" ] && [ ! -f "$1.bak" ] && cp "$1" "$1.bak"; :; }
install_file() { mkdir -p "$(dirname "$2")"; backup "$2" 2>/dev/null || true; cp -f "$1" "$2"; }
install_file_always() { mkdir -p "$(dirname "$2")"; backup_always "$2" 2>/dev/null || true; cp -f "$1" "$2"; }
BEGIN="<!-- opencode-project-knowledge:begin -->"
END="<!-- opencode-project-knowledge:end -->"
merge_agents_block() { # $1 = target AGENTS.md, $2 = snippet AGENTS.md
  if [ ! -r "$2" ]; then echo "snippet not readable: $2" >&2; return 1; fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$1" "$2" <<'PY'
import sys
target, snippet = sys.argv[1], open(sys.argv[2]).read()
cur = open(target).read()
wrapped = "<!-- opencode-project-knowledge:begin -->\n" + snippet + "\n<!-- opencode-project-knowledge:end -->"
import re
open(target, "w").write(re.sub(r"<!-- opencode-project-knowledge:begin -->.*?<!-- opencode-project-knowledge:end -->", lambda m: wrapped, cur, flags=re.S))
PY
  else
    # No python3: POSIX awk fallback replaces the marked block verbatim.
    awk -v snipfile="$2" '
      BEGIN { snip=""; while ((getline line < snipfile) > 0) snip = snip line "\n"; close(snipfile) }
      { lines[NR]=$0 }
      END {
        out=""; inblock=0;
        for (i=1;i<=NR;i++) {
          if (index(lines[i], "opencode-project-knowledge:begin")) {
            out = out "<!-- opencode-project-knowledge:begin -->\n" snip "<!-- opencode-project-knowledge:end -->\n";
            inblock=1; continue;
          }
          if (inblock) { if (index(lines[i], "opencode-project-knowledge:end")) inblock=0; continue; }
          out = out lines[i] "\n";
        }
        printf "%s", out;
      }
    ' "$1" > "$1.new" && mv "$1.new" "$1" || { rm -f "$1.new"; echo "AGENTS.md merge failed" >&2; return 1; }
  fi
}
if [ ! -f "$CONFIG/AGENTS.md" ]; then
  { echo "$BEGIN"; cat "$SOURCE/AGENTS.md"; echo "$END"; } > "$CONFIG/AGENTS.md"
  echo "AGENTS.md: created"
elif grep -q "opencode-project-knowledge:begin" "$CONFIG/AGENTS.md"; then
  backup "$CONFIG/AGENTS.md"
  merge_agents_block "$CONFIG/AGENTS.md" "$SOURCE/AGENTS.md"
  echo "AGENTS.md: upgraded"
else
  backup "$CONFIG/AGENTS.md"
  { printf '\n\n'; echo "$BEGIN"; cat "$SOURCE/AGENTS.md"; echo "$END"; } >> "$CONFIG/AGENTS.md"
  echo "AGENTS.md: merged"
fi
install_file "$SOURCE/skills/project-knowledge-auto/SKILL.md" "$CONFIG/skills/project-knowledge-auto/SKILL.md"
install_file "$SOURCE/plugins/project-knowledge.js" "$CONFIG/plugins/project-knowledge.js"
for f in detect.js context.js status.js refresh.js atomic.js bootstrap.mjs; do
  install_file "$SOURCE/project-knowledge/$f" "$CONFIG/project-knowledge/$f"
done
for t in "$SOURCE"/project-knowledge/templates/*; do
  [ -e "$t" ] || continue
  install_file "$t" "$CONFIG/project-knowledge/templates/$(basename "$t")"
done
for c in project-knowledge-status.md project-knowledge-refresh.md; do
  [ -f "$SOURCE/commands/$c" ] && install_file "$SOURCE/commands/$c" "$CONFIG/commands/$c"
done
# Plugin dependency for the project_context custom tool. Merged, never
# clobbered: an existing version spec is left untouched. OpenCode runs
# `bun install` automatically at startup when package.json exists.
if [ -f "$CONFIG/package.json" ]; then backup "$CONFIG/package.json"; fi
if node "$SOURCE/tools/merge-package-dep.js" "$CONFIG/package.json" add "@opencode-ai/plugin" "^1.3.3"; then
  echo "package.json: @opencode-ai/plugin dependency ensured (bun install runs automatically at OpenCode startup)"
else
  echo "WARNING: could not merge @opencode-ai/plugin into config package.json. The plugin will load without its custom tool until the dependency is installed."
fi
echo -n "$PKG_VERSION" > "$CONFIG/project-knowledge/VERSION"

# ── Antigravity IDE/CLI (same engine, thin adapters — no rewrite) ─────────────
AG_HOME="${PK_TEST_HOME:-$HOME}"
AG_PK_DIR="$AG_HOME/.gemini/antigravity/project-knowledge"
AG_CONFIG_DIR="$AG_HOME/.gemini/config"
AG_CLI_PLUGIN_DIR="$AG_HOME/.gemini/antigravity-cli/plugins/project-knowledge"
AG_CLI_SKILLS_DIR="$AG_HOME/.gemini/antigravity-cli/skills/project-knowledge-auto"
AG_IDE_SKILLS_DIR="$AG_HOME/.gemini/antigravity/skills/project-knowledge-auto"
AG_GLOBAL_SKILLS_DIR="$AG_HOME/.agents/skills/project-knowledge-auto"
mkdir -p "$AG_PK_DIR/templates" "$AG_CLI_PLUGIN_DIR" "$AG_CLI_SKILLS_DIR" "$AG_IDE_SKILLS_DIR" "$AG_GLOBAL_SKILLS_DIR" "$AG_CONFIG_DIR"
for f in detect.js context.js status.js refresh.js atomic.js bootstrap.mjs; do
  install_file_always "$SOURCE/project-knowledge/$f" "$AG_PK_DIR/$f"
done
for t in "$SOURCE"/project-knowledge/templates/*; do [ -e "$t" ] || continue; install_file_always "$t" "$AG_PK_DIR/templates/$(basename "$t")"; done
for pair_src in "$SOURCE/antigravity/mcp-server.js:$AG_PK_DIR/mcp-server.js" "$SOURCE/antigravity/hook.js:$AG_PK_DIR/hook.js"; do
  IFS=":" read -r src dst <<< "$pair_src"
  [ -f "$src" ] && install_file_always "$src" "$dst"
 done
if [ -f "$SOURCE/antigravity/plugin.json" ]; then install_file_always "$SOURCE/antigravity/plugin.json" "$AG_CLI_PLUGIN_DIR/plugin.json"; fi
for dst in "$AG_CLI_SKILLS_DIR/SKILL.md" "$AG_IDE_SKILLS_DIR/SKILL.md" "$AG_GLOBAL_SKILLS_DIR/SKILL.md"; do
  install_file_always "$SOURCE/skills/project-knowledge-auto/SKILL.md" "$dst"
 done
AG_MCP_PATH="$AG_CONFIG_DIR/mcp_config.json"
AG_HOOKS_PATH="$AG_CONFIG_DIR/hooks.json"
AG_MCP_SERVER="$AG_PK_DIR/mcp-server.js"
AG_HOOK_JS="$AG_PK_DIR/hook.js"
[ -f "$AG_MCP_PATH" ] && backup_always "$AG_MCP_PATH"
[ -f "$AG_HOOKS_PATH" ] && backup_always "$AG_HOOKS_PATH"
if node "$SOURCE/tools/merge-mcp-config.js" "$AG_MCP_PATH" add "$AG_MCP_SERVER"; then echo "Antigravity MCP: $AG_MCP_PATH (project-knowledge server)"; else echo "WARNING: could not merge mcp_config.json."; fi
if node "$SOURCE/tools/merge-hooks-config.js" "$AG_HOOKS_PATH" add "$AG_HOOK_JS"; then echo "Antigravity hooks: $AG_HOOKS_PATH (PreInvocation project-knowledge-context)"; else echo "WARNING: could not merge hooks.json."; fi
echo "Antigravity: installed (same engine, MCP + skill + hook adapters)"
echo -n "$PKG_VERSION" > "$AG_PK_DIR/VERSION"
sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1;
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1;
  else echo "missing-sha256-tool"; fi
}
if [ -f "$SOURCE/SHA256SUMS" ]; then
  while read -r hash rel _extra; do
    [ -n "$hash" ] || continue
    case "$rel" in AGENTS.md|VERSION|install.*|uninstall.*|SHA256SUMS|tools/*|antigravity/*) continue;; esac
    target="$CONFIG/$rel"
    if [ ! -f "$target" ]; then echo "checksum verify: missing $rel" >&2; exit 1; fi
    actual="$(sha256_file "$target")"
    if [ "$actual" != "$hash" ]; then echo "checksum mismatch: $rel" >&2; exit 1; fi
  done < "$SOURCE/SHA256SUMS"
  echo "checksums: verified"
else
  echo "WARNING: SHA256SUMS not found in source; skipping checksum verification."
fi
for f in detect.js context.js status.js refresh.js atomic.js; do node --check "$CONFIG/project-knowledge/$f"; done
for f in mcp-server.js hook.js; do node --check "$AG_PK_DIR/$f"; done
node --check "$SOURCE/tools/merge-mcp-config.js" && node --check "$SOURCE/tools/merge-hooks-config.js" || { echo "antigravity helper syntax check failed" >&2; exit 1; }
# Plugin is ESM (per OpenCode plugin format), but plain Node loads installed
# .js as CJS (config package.json has no "type" field), so validate identical
# bytes via a temp .mjs copy. The no-dependency path must resolve to {}.
PK_TMP="$(mktemp "${TMPDIR:-/tmp}/pk-plugin-check-XXXXXXXX.mjs")"
cp -f "$CONFIG/plugins/project-knowledge.js" "$PK_TMP"
if PK_PLUGIN_CHECK="$PK_TMP" node -e 'const { pathToFileURL } = require("node:url"); import(pathToFileURL(process.env.PK_PLUGIN_CHECK).href).then(async (m) => { if (typeof m.ProjectKnowledgePlugin !== "function") throw new Error("missing ProjectKnowledgePlugin export"); await m.ProjectKnowledgePlugin({}); }).catch((e) => { console.error(String((e && e.message) || e)); process.exit(1); })'; then
  echo "plugin: load check passed"
else
  echo "plugin load check failed" >&2; rm -f "$PK_TMP"; exit 1
fi
rm -f "$PK_TMP"
if grep -r "C:\\\\Users\\\\Admin" "$CONFIG/project-knowledge" 2>/dev/null; then echo "hard-coded path detected" >&2; exit 1; fi
if grep -r "C:\\\\Users\\\\Admin" "$AG_PK_DIR" 2>/dev/null; then echo "hard-coded path detected (antigravity)" >&2; exit 1; fi
echo ""
echo "SUCCESS: opencode-project-knowledge installed."
echo "OpenCode: open any repo — compact project context is automatic (see $CONFIG/AGENTS.md)."
echo "Antigravity: MCP project_context + skills + PreInvocation hook installed (see $AG_CONFIG_DIR/mcp_config.json)."
