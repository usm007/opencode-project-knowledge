# Architecture

This repo separates **global install** from **per-project knowledge** so one
install serves every repository. The engine is shared; thin adapters make it
work for **OpenCode and Antigravity IDE/CLI** without rewriting the engine.

```text
global (OpenCode: ~/.config/opencode/  |  Antigravity: ~/.gemini/ + ~/.agents/)
├── AGENTS.md                          merged section (auto-context rule)
├── skills/project-knowledge-auto/     skill (open Agent Skills spec — works in both)
├── plugins/project-knowledge.js       OpenCode plugin (ESM project_context tool)
├── antigravity/mcp-server.js          Antigravity MCP stdio server (same project_context)
├── antigravity/hook.js                Antigravity PreInvocation hook (ephemeral injection)
├── antigravity/plugin.json            Antigravity plugin manifest
├── commands/*.md                      /project-knowledge-status, /project-knowledge-refresh docs
└── project-knowledge/                 engine + templates (shared)
    ├── detect.js                      markers + manifests + extension census
    ├── context.js                     compact ~35-line PROJECT CONTEXT
    ├── bootstrap.mjs                  safe .project/ baseline creator
    ├── status.js                      read-only health report
    ├── refresh.js                     incremental stale-mark + baseline update
    ├── atomic.js                      crash-safe writes + cooperative file locking
    └── templates/                     .project/ document templates

per-repo (<any-repo>/.project/)
├── overview.md, architecture.md, modules.md, data-flow.md, dependencies.md
├── conventions.md, decisions.md, known-issues.md, test-map.md
├── knowledge.json                     baseline metadata (commit, timestamp, detection)
└── state/stale.json                   ephemeral stale markers (never commit)
```

## Data flow

```text
repo → detect → .project/ present?
       ├─ yes → context.js (overview + knowledge.json + stale) → PROJECT CONTEXT
       └─ no  → bootstrap.mjs (safe baseline) → context.js → PROJECT CONTEXT
task → targeted .project/*.md reads (modules.md is the map) → source reads
change → refresh.js (affected modules → stale) → agent updates docs → clear
```

## Design choices

- **No rewrite for second platform.** The engine stays CJS + ESM; a CJS MCP
  stdio wrapper + hook adapter exposes the same `project_context` in
  Antigravity via `~/.gemini/config/mcp_config.json` + `hooks.json`.
- **No MCP required on OpenCode.** Filesystem + Git + instructions only;
  the plugin is a thin optional helper that degrades to CLI tools.
- **Token efficiency.** Small permanent summary + on-demand detail +
  incremental refresh; never full re-analysis per save.
- **Safety.** Bootstrap never overwrites user files, never touches source,
  never commits, respects `.gitignore`, excludes build output and secrets.
- **Crash/concurrency-safe writes.** All `.project/` writes go through
  `project-knowledge/atomic.js`: temp-file + fsync + rename (readers never see
  half-written JSON), plus a cooperative `.project/.lock` directory lock with
  orphan expiry (60s) and waiter timeout. `--dry-run` takes no lock and writes
  nothing.
- **Graceful degradation** at every layer (missing files, no Git, bad JSON,
  unknown language, missing plugin API).
