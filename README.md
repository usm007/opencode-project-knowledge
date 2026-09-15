# OpenCode Project Knowledge

Universal, one-time-installable project understanding for **OpenCode and Antigravity IDE/CLI**.
Install once, open **any** repository, and get efficient project context automatically
— no per-project setup. The engine is the same on both platforms; thin adapters expose
the same `project_context` as an OpenCode plugin and an Antigravity MCP server + hook.

## What it does

- **Detects** the project type (Python, JS/TS, Vue, React, Electron, C#/.NET,
  Java, C/C++, PHP, Go, Rust, Android, mixed, or unknown→generic).
- **Bootstraps** a concise `.project/` knowledge baseline safely when missing.
- **Injects** a compact (~35-line) `PROJECT CONTEXT` at task start — never the
  whole knowledge base, never large source excerpts.
- **Refreshes** incrementally: file change → affected modules → stale markers
  → targeted doc updates → baseline update.
- Works with **local filesystem + Git only**. On OpenCode: no MCP required
  (plugin + instructions); on Antigravity: same engine via MCP `project_context`
  + `PreInvocation` hook + skills (open Agent Skills spec).

## Install (Windows, one click)

1. Get this repository onto your machine (Clone it, or Download ZIP from
   GitHub and extract it anywhere).
2. Double-click **`Install.bat`**.
3. Done. No admin rights needed — it installs for your Windows user only, and
   the window stays open so you can see the result.

To remove it later, double-click **`Uninstall.bat`** (your other OpenCode
settings are left untouched).

Advanced (terminal — does exactly the same thing):

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
powershell -ExecutionPolicy Bypass -File install.ps1 -DryRun   # preview only
```

Once this repo is published on GitHub, this one-liner will also work
(replace `<owner>/<repo>` with the real location):

```powershell
irm https://raw.githubusercontent.com/<owner>/<repo>/main/install.ps1 | iex
```

Linux/macOS:

```bash
./install.sh
```

Uninstall (terminal — same as Uninstall.bat):

```powershell
powershell -ExecutionPolicy Bypass -File uninstall.ps1
```

```bash
./uninstall.sh
```

## How automatic operation works

1. Open any repo in OpenCode **or** Antigravity.
2. Global `AGENTS.md` + `project-knowledge-auto` skill fire before substantial work (Antigravity also auto-injects via its `PreInvocation` hook and exposes `project_context` via MCP).
3. `.project/` present → `context.js` builds `PROJECT CONTEXT` from
   `overview.md` + `knowledge.json` + `state/stale.json`; only the touched
   subsystem's detail docs are read via the `modules.md` map.
4. `.project/` absent → `bootstrap.mjs` creates it safely (detects type,
   respects `.gitignore`, skips build output/secrets, never touches source,
   never commits, creates root `AGENTS.md` only if missing).
5. Edits → `refresh.js` marks affected modules stale; agent updates only those
   docs; `status.js` reports health read-only.

Debug directly:

```bash
node project-knowledge/detect.js <repo> --json
node project-knowledge/context.js <repo> "one-line task"
node project-knowledge/status.js <repo>
node project-knowledge/refresh.js <repo>
node project-knowledge/bootstrap.mjs <repo>
```

## Supported project types

Python · JavaScript · TypeScript · Vue · React (incl. Next/Angular hints) ·
Electron · C#/.NET · Java · C · C++ · PHP · Go · Rust · Android · Ruby · Dart ·
Swift · Docker-aware · **mixed-language** · **unknown → generic structural analysis**.

## Global vs project-local

| Global (installed once, `~/.config/opencode/` + `~/.gemini/` + `~/.agents/`) | Project-local (per repo, `.project/`) |
|---|---|
| `AGENTS.md` section, skill, plugin (OpenCode) / MCP + hook + plugin (Antigravity), `project-knowledge/*.js`, templates, commands | `overview.md`, `architecture.md`, `modules.md`, `data-flow.md`, `dependencies.md`, `conventions.md`, `decisions.md`, `known-issues.md`, `test-map.md`, `knowledge.json`, `state/stale.json` |

## Limitations

- Heuristic detection (markers + extension census) can misread exotic layouts —
  `detect.js --json` shows evidence; source always wins.
- Bootstrap stubs contain `(agent)` placeholders until completed with real reads.
- Git-absent repos lose change tracking (filesystem fallback only).
- The plugin is optional/defensive; CLI + instructions are the guaranteed path.
  It ships as ESM per OpenCode's documented plugin format and installs its
  `@opencode-ai/plugin` dependency automatically at first OpenCode startup.

## Security

Never records passwords, API keys, tokens, certificates, or env secret values.
Respects `.gitignore` + `info/exclude`; skips `node_modules/bin/obj/dist/build/
target/vendor`, caches, binaries, and secret-like paths. See `docs/`.

## Safety guarantees

- `--force` bootstrap backs up overwritten docs to `.project/.backup/<timestamp>/`.
- Your own keys in `knowledge.json` survive regeneration; pre-existing payload
  files are backed up (`.bak`) on first install and restored on uninstall.
- Installers refuse silent downgrades, support `--dry-run`/`-DryRun` previews,
  and verify installed files against `SHA256SUMS`.
- `npm test` (52 unit + E2E) runs on Windows + Linux via CI (`--allow-downgrade`
  and POSIX paths covered on Ubuntu).

## Contributing

See [`docs/development.md`](docs/development.md). Requires Node ≥ 18, no deps.
Run `npm test` before PRs. Bump `VERSION` on releases.

## Layout

```text
├── README.md  LICENSE  VERSION  AGENTS.md  package.json
├── install.ps1  uninstall.ps1  install.sh  uninstall.sh
├── project-knowledge/  skills/  plugins/  commands/  antigravity/
├── tools/  tests/  docs/  examples/
```
