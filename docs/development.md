# Development

Requires Node.js ≥ 18. No runtime dependencies.

```bash
npm test            # node tests/run.js && node tests/e2e.js
node tests/run.js   # unit + installer matrix
node tests/e2e.js   # disposable-repo lifecycle A–E
```

## Layout

- `project-knowledge/` — engine (`detect.js`, `context.js`, `status.js`,
  `refresh.js`, `bootstrap.mjs`, `templates/`). Node built-ins only.
- `skills/`, `plugins/`, `commands/`, `AGENTS.md` — global integration.
- `install.ps1` / `uninstall.ps1` — Windows primary; `install.sh` /
  `uninstall.sh` — POSIX.
- `tests/` — no-dep suite + E2E. `docs/`, `examples/` — docs and samples.

## Conventions

- Keep the payload free of usernames, machine-specific home-directory paths,
  prior-project codenames, and secrets. Tests assert this.
- `detect.js`/`context.js`/`status.js`/`refresh.js`/`atomic.js` are CommonJS (CLI + require);
  `bootstrap.mjs` is ESM (imports `detect.js` via `createRequire`).
- `plugins/project-knowledge.js` is ESM (per OpenCode plugin format);
  the installer validates it by copying to a temp `.mjs` (plain Node
  loads `.js` as CJS when `package.json` has no `"type"` field).
- Bump `VERSION` with every release; installer stamps it to
  `<config>/project-knowledge/VERSION`.
- `.project/state/stale.json` is ephemeral — never commit it, here or in targets.
