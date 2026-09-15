#!/usr/bin/env bash
# Safely uninstalls opencode-project-knowledge (Linux/macOS). Idempotent.
set -uo pipefail
CONFIG=""
DRY_RUN=0
SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
need_value() { if [ $# -lt 2 ]; then echo "Missing value for $1" >&2; exit 1; fi; }
while [ $# -gt 0 ]; do case "$1" in --config) need_value "$@"; CONFIG="$2"; shift 2;; --dry-run) DRY_RUN=1; shift;; --source) need_value "$@"; SOURCE="$2"; shift 2;; *) shift;; esac; done
if [ -z "$CONFIG" ]; then CONFIG="${OPENCODE_CONFIG:-$HOME/.config/opencode}"; fi
echo "Uninstalling from: $CONFIG"
rm_step() { if [ -f "$1" ]; then rm -f "$1"; echo " removed: $1"; else echo " absent (ok): $1"; fi
  if [ -f "$1.bak" ]; then mv -f "$1.bak" "$1"; echo " restored backup: $1"; fi; }
for rel in skills/project-knowledge-auto/SKILL.md plugins/project-knowledge.js project-knowledge/detect.js project-knowledge/context.js project-knowledge/status.js project-knowledge/refresh.js project-knowledge/atomic.js project-knowledge/bootstrap.mjs project-knowledge/VERSION commands/project-knowledge-status.md commands/project-knowledge-refresh.md; do
  if [ "$DRY_RUN" = 1 ]; then
    [ -f "$CONFIG/$rel" ] && echo " would remove: $CONFIG/$rel"
    [ -f "$CONFIG/$rel.bak" ] && echo " would restore backup: $CONFIG/$rel"
  else
    rm_step "$CONFIG/$rel"
  fi
done
if [ "$DRY_RUN" = 1 ]; then
  if [ -d "$CONFIG/project-knowledge/templates" ]; then
    for f in "$CONFIG"/project-knowledge/templates/*; do [ -e "$f" ] || continue; echo " would remove: $f"; done
  fi
  if [ -f "$CONFIG/AGENTS.md" ] && grep -q "opencode-project-knowledge:begin" "$CONFIG/AGENTS.md"; then
    echo " AGENTS.md: would remove marked section (unrelated content preserved)"
  else
    echo " AGENTS.md: no our section (would preserve)"
  fi
  if [ -f "$CONFIG/package.json" ]; then
    if [ -f "$CONFIG/package.json.bak" ]; then echo " package.json: would restore pre-install backup";
    else echo " package.json: would remove @opencode-ai/plugin dependency (file deleted if left empty)"; fi
  fi
  AG_HOME_DRY="${PK_TEST_HOME:-$HOME}"
  AG_PK_DRY="$AG_HOME_DRY/.gemini/antigravity/project-knowledge"
  echo " Antigravity: would remove $AG_PK_DRY (+ skills at ~/.agents/skills, ~/.gemini/.../skills)"
  [ -f "$AG_HOME_DRY/.gemini/config/mcp_config.json" ] && echo " Antigravity MCP: would remove project-knowledge from ~/.gemini/config/mcp_config.json (file deleted if last server)"
  [ -f "$AG_HOME_DRY/.gemini/config/hooks.json" ] && echo " Antigravity hooks: would remove project-knowledge-context from ~/.gemini/config/hooks.json (file deleted if last hook)"
  echo "DRY RUN - nothing was removed."
  exit 0
fi
if [ -d "$CONFIG/project-knowledge/templates" ]; then
  for f in "$CONFIG"/project-knowledge/templates/*; do [ -e "$f" ] || continue
    if [ -f "$f.bak" ]; then mv -f "$f.bak" "$f"; echo " restored backup: $f"; else rm -f "$f"; echo " removed: $f"; fi; done
  rmdir "$CONFIG/project-knowledge/templates" 2>/dev/null || true
fi
if [ -f "$CONFIG/AGENTS.md" ] && grep -q "opencode-project-knowledge:begin" "$CONFIG/AGENTS.md"; then
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$CONFIG/AGENTS.md" <<'PY'
import re, sys
t = sys.argv[1]
cur = open(t).read()
upd = re.sub(r"\n?\n?<!-- opencode-project-knowledge:begin -->.*?<!-- opencode-project-knowledge:end -->\n?", "", cur, flags=re.S)
if upd.strip() == "":
    import os
    bak = t + ".bak"
    if os.path.exists(bak):
        import shutil; shutil.move(bak, t); print(" AGENTS.md restored from backup")
    else:
        os.remove(t); print(" AGENTS.md section removed (file deleted)")
else:
    open(t, "w").write(upd); print(" AGENTS.md section removed (unrelated content preserved)")
PY
  else
    # No python3: POSIX awk fallback strips the marked block.
    awk '
      { lines[NR]=$0 }
      END {
        out=""; inblock=0; blanks=0;
        for (i=1;i<=NR;i++) {
          if (index(lines[i], "opencode-project-knowledge:begin")) { inblock=1; continue; }
          if (inblock) { if (index(lines[i], "opencode-project-knowledge:end")) inblock=0; continue; }
          if (lines[i] ~ /^[[:space:]]*$/) { blanks++; continue; }
          while (blanks > 0 && out == "") blanks--;
          while (blanks > 1) blanks--;
          while (blanks > 0) { out = out "\n"; blanks--; }
          out = out lines[i] "\n";
        }
        printf "%s", out;
      }
    ' "$CONFIG/AGENTS.md" > "$CONFIG/AGENTS.md.new" && mv "$CONFIG/AGENTS.md.new" "$CONFIG/AGENTS.md" \
      || { rm -f "$CONFIG/AGENTS.md.new"; echo " AGENTS.md strip failed" >&2; exit 1; }
    if [ ! -s "$CONFIG/AGENTS.md" ]; then
      if [ -f "$CONFIG/AGENTS.md.bak" ]; then mv -f "$CONFIG/AGENTS.md.bak" "$CONFIG/AGENTS.md"; echo " AGENTS.md restored from backup";
      else rm -f "$CONFIG/AGENTS.md"; echo " AGENTS.md section removed (file deleted)"; fi
    else
      echo " AGENTS.md section removed (unrelated content preserved)"
    fi
  fi
else
  echo " AGENTS.md has no our section (preserved)"
fi
# Plugin dependency: restore the pre-install package.json when we backed one
# up; otherwise just remove our dep key (the helper deletes the file if it
# becomes an empty object, e.g. when we created it).
if [ -f "$CONFIG/package.json" ]; then
  if [ -f "$CONFIG/package.json.bak" ]; then
    mv -f "$CONFIG/package.json.bak" "$CONFIG/package.json"; echo " package.json restored from pre-install backup"
  elif command -v node >/dev/null 2>&1; then
    if node "$SOURCE/tools/merge-package-dep.js" "$CONFIG/package.json" remove "@opencode-ai/plugin"; then :;
    else echo "WARNING: could not clean @opencode-ai/plugin from package.json."; fi
  else
    echo "WARNING: node not found; left @opencode-ai/plugin in package.json."
  fi
fi
rmdir "$CONFIG/project-knowledge" 2>/dev/null || true
rmdir "$CONFIG/skills/project-knowledge-auto" 2>/dev/null || true
echo "Done. Unrelated OpenCode configuration was preserved."

# ── Antigravity (same engine, adapters) ──────────────────────────────────────
AG_HOME="${PK_TEST_HOME:-$HOME}"
AG_PK_DIR="$AG_HOME/.gemini/antigravity/project-knowledge"
AG_CONFIG_DIR="$AG_HOME/.gemini/config"
AG_CLI_PLUGIN_DIR="$AG_HOME/.gemini/antigravity-cli/plugins/project-knowledge"
AG_CLI_SKILLS_DIR="$AG_HOME/.gemini/antigravity-cli/skills/project-knowledge-auto"
AG_IDE_SKILLS_DIR="$AG_HOME/.gemini/antigravity/skills/project-knowledge-auto"
AG_GLOBAL_SKILLS_DIR="$AG_HOME/.agents/skills/project-knowledge-auto"
for sk in "$AG_CLI_SKILLS_DIR" "$AG_IDE_SKILLS_DIR" "$AG_GLOBAL_SKILLS_DIR"; do
  if [ "$DRY_RUN" = 1 ]; then :; else rm_step "$sk/SKILL.md"; rmdir "$sk" 2>/dev/null || true; fi
done
# Also clean up the intermediate skills parents if empty
rmdir "$AG_HOME/.gemini/antigravity-cli/skills" 2>/dev/null || true
rmdir "$AG_HOME/.gemini/antigravity/skills" 2>/dev/null || true
rmdir "$AG_HOME/.agents/skills" 2>/dev/null || true
if [ -f "$AG_CLI_PLUGIN_DIR/plugin.json" ]; then rm_step "$AG_CLI_PLUGIN_DIR/plugin.json"; fi
rmdir "$AG_CLI_PLUGIN_DIR" 2>/dev/null || true
rmdir "$AG_HOME/.gemini/antigravity-cli/plugins" 2>/dev/null || true
for f in detect.js context.js status.js refresh.js atomic.js bootstrap.mjs mcp-server.js hook.js VERSION; do [ -f "$AG_PK_DIR/$f" ] && rm_step "$AG_PK_DIR/$f"; done
if [ -d "$AG_PK_DIR/templates" ]; then
  for f in "$AG_PK_DIR"/templates/*; do [ -e "$f" ] || continue
    if [ -f "$f.bak" ]; then mv -f "$f.bak" "$f"; echo " restored backup: $f"; else rm -f "$f"; echo " removed: $f"; fi; done
  rmdir "$AG_PK_DIR/templates" 2>/dev/null || true
fi
rmdir "$AG_PK_DIR" 2>/dev/null || true
rmdir "$AG_HOME/.gemini/antigravity/project-knowledge" 2>/dev/null || true
AG_MCP="$AG_CONFIG_DIR/mcp_config.json"
AG_HOOKS="$AG_CONFIG_DIR/hooks.json"
if [ -f "$AG_MCP" ]; then
  if command -v node >/dev/null 2>&1; then
    if node "$SOURCE/tools/merge-mcp-config.js" "$AG_MCP" remove "$AG_PK_DIR/mcp-server.js"; then
      [ -f "$AG_MCP" ] && echo " Antigravity MCP: project-knowledge server removed (other servers preserved)" || echo " Antigravity MCP: mcp_config.json removed (was only our server)"
    else echo "WARNING: could not clean mcp_config.json."; fi
  else echo "WARNING: node not found; left mcp_config entry."; fi
fi
if [ -f "$AG_HOOKS" ]; then
  if command -v node >/dev/null 2>&1; then
    if node "$SOURCE/tools/merge-hooks-config.js" "$AG_HOOKS" remove "$AG_PK_DIR/hook.js"; then
      [ -f "$AG_HOOKS" ] && echo " Antigravity hooks: project-knowledge-context removed (other hooks preserved)" || echo " Antigravity hooks: hooks.json removed (was only our hook)"
    else echo "WARNING: could not clean hooks.json."; fi
  else echo "WARNING: node not found; left hooks entry."; fi
fi
# Clean empty .gemini parents only if empty (never delete user data bulk)
for d in "$AG_HOME/.gemini/antigravity/skills/project-knowledge-auto" "$AG_HOME/.gemini/antigravity/skills" \
         "$AG_HOME/.gemini/antigravity-cli/skills/project-knowledge-auto" "$AG_HOME/.gemini/antigravity-cli/skills" \
         "$AG_HOME/.agents/skills/project-knowledge-auto" "$AG_HOME/.agents/skills"; do
  [ -d "$d" ] && rmdir "$d" 2>/dev/null || true
done
echo "Done. Antigravity MCP/hooks cleaned (other servers/hooks preserved)."
