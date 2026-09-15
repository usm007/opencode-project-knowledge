# Knowledge format (`.project/`)

Per-project knowledge lives in `<repo>/.project/`:

```text
.project/
├── overview.md        one-screen summary (FACT/INFERENCE/UNCERTAINTY)
├── architecture.md    style + key areas (inference unless proven)
├── modules.md         THE MAP: area → path → purpose + key files
├── data-flow.md       entry → service → storage for one real operation
├── dependencies.md    real manifests + exact commands
├── conventions.md     real lint/format configs + naming
├── decisions.md       confirmed decisions only (never invent)
├── known-issues.md    reproduced issues with file refs only
├── test-map.md        real test paths + exact run commands
├── knowledge.json     machine baseline (see below)
└── state/stale.json   ephemeral stale markers — never commit
```

## `knowledge.json`

```jsonc
{
  "project": "name",
  "tool": "opencode-project-knowledge",
  "generatedAt": "ISO timestamp",
  "baseline": { "commit": "git sha|null", "timestamp": "ISO", "fileCount": 0 },
  "detection": { "primary": "python", "languages": [], "mixed": false, "frameworks": [] },
  "architecture": "one-line guess",
  "manifests": ["package.json"],
  "entryPoints": ["src/index.ts"],
  "lowConfidence": ["project-type"],
  "filesSample": ["src/a.ts"]
}
```

## Rules

- Every claim is **FACT** (verified), **INFERENCE** (strongly suggested), or
  **UNCERTAINTY** (unknown). Never fabricate.
- Prefer references (paths, symbols, commands) over copied content.
- Source code, tests, config, and Git state outrank generated knowledge.
- Never record secrets; respect `.gitignore`; skip build output/caches/vendor.
- `state/stale.json` shape: `{ "version": 1, "updatedAt": "ISO", "stale": ["src/ — changed: …"] }`.
- Ephemeral / do-not-commit: `state/` and `.backup/` (forced-overwrite
  backups). Unknown keys you add to `knowledge.json` survive regeneration.
