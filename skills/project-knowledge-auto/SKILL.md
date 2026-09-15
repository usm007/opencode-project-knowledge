---
name: project-knowledge-auto
description: Automatically use or bootstrap per-repository project knowledge (.project/) — compact context before work, targeted retrieval, incremental refresh. Use at the start of any substantial coding task in any repo.
---

# Project Knowledge (automatic)

Use the installed CLI utilities under `<config>/project-knowledge/` (or the
bundled `project-knowledge/` when running from this repo). No MCP required.

## 1. Compact context first (preferred)

```bash
node <config>/project-knowledge/context.js <repoRoot> "<one-line task>"
```

- Produces ~30–40 lines: project, type, architecture, relevant subsystem,
  modules, constraints, decisions, freshness, confidence.
- Then load detail docs ONLY for the touched subsystem (`.project/modules.md`
  is the map). Never inject the whole knowledge base or large source excerpts.

## 2. Bootstrap when `.project/` is missing

```bash
node <config>/project-knowledge/bootstrap.mjs <repoRoot>   # add --dry-run to preview
```

- Safe: detects project type, inspects structure, writes `.project/` stubs +
  baseline `knowledge.json`, creates root `AGENTS.md` only if missing.
- Never overwrites user files (unless `--force`), never touches source,
  never commits, respects `.gitignore`, excludes build output/caches/vendor/
  deps/binaries/secrets.
- Complete `(agent)` stubs with targeted source reads before relying on them.

## 3. Status (read-only) and incremental refresh

```bash
node <config>/project-knowledge/status.js <repoRoot>
node <config>/project-knowledge/refresh.js <repoRoot>   # --dry-run previews; --clear resolves
```

- Status reports: knowledge age, baseline, changed files, affected modules,
  stale sections, low-confidence areas, missing knowledge, detected type.
- Refresh marks only affected modules stale, updates baseline metadata,
  preserves unaffected docs. Never silently regenerates everything.

## 4. Rules

- Source code > generated knowledge. On conflict, follow source and update
  the affected `.project/` rows.
- Label FACT / INFERENCE / UNCERTAINTY; never fabricate.
- Never record secrets. `.project/state/stale.json` is ephemeral.
