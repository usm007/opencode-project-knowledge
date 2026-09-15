# Configuration

## OpenCode config location

| OS | Default |
|----|---------|
| Windows | `%USERPROFILE%\.config\opencode` (fallback `%USERPROFILE%\.opencode`) |
| Linux/macOS | `~/.config/opencode` |

Override with `OPENCODE_CONFIG` env var, or `--config DIR` (`.sh`) /
`-ConfigDir DIR` (`.ps1`).

## What gets installed where

| Source (this repo) | Installed (global config) |
|---|---|
| `AGENTS.md` | merged section in `<config>/AGENTS.md` between markers |
| `skills/project-knowledge-auto/SKILL.md` | `<config>/skills/project-knowledge-auto/SKILL.md` |
| `plugins/project-knowledge.js` | `<config>/plugins/project-knowledge.js` |
| `project-knowledge/*.js, *.mjs` | `<config>/project-knowledge/` |
| `project-knowledge/templates/*` | `<config>/project-knowledge/templates/` |
| `commands/*.md` | `<config>/commands/` |
| `VERSION` | `<config>/project-knowledge/VERSION` |

## Behavior knobs

- `bootstrap.mjs <repo> [--force] [--baseline-only] [--dry-run] [--json]` —
  `--force` overwrites docs but backs up existing content to
  `.project/.backup/<timestamp>/` first; `--dry-run` prints the plan and
  writes nothing. Unknown keys in an existing `knowledge.json` are preserved.
- `refresh.js <repo> [--mark-only] [--clear] [--dry-run] [--files "a,b"]` —
  renames are tracked on both sides; ignored untracked files are filtered via
  `git check-ignore`.
- `status.js <repo> [--json]` — read-only.
- `context.js <repo> [task hint] [--json]` — keyword-matched relevant
  subsystem; `--json` for machine-readable output.

## Installer options

- `-DryRun` (`install.ps1`/`uninstall.ps1`) / `--dry-run` (`install.sh`/
  `uninstall.sh`): print the plan, change nothing.
- Downgrades are refused by default when the installed version is newer than
  the package; override with `-AllowDowngrade` / `--allow-downgrade`.
- Installed payload files are verified against `SHA256SUMS` (SHA-256).
  Regenerate it after payload changes: `npm run checksums` (CI enforces
  `npm run checksums:check`).

## Upgrades

Re-run the installer; it detects `<config>/project-knowledge/VERSION`,
replaces payload files (with `.bak` backups on first replace), and merges the
`AGENTS.md` section in place. Unrelated config is untouched.

The installer also ensures `@opencode-ai/plugin` is a dependency in the
config `package.json` (merged, never clobbered). OpenCode runs `bun install`
automatically at startup so the custom `project_context` tool is available
without a manual step.
