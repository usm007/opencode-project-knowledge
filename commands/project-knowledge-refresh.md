# /project-knowledge-refresh

Incremental refresh of project knowledge. Updates only what changed.

```bash
node project-knowledge/refresh.js <repoRoot>        # mark stale + update baseline metadata
node project-knowledge/refresh.js <repoRoot> --mark-only   # only mark stale
node project-knowledge/refresh.js <repoRoot> --clear       # clear resolved stale state
node project-knowledge/refresh.js <repoRoot> --dry-run     # preview affected modules, write nothing
```

Flow: file change → affected module detection → mark stale in
`.project/state/stale.json` → targeted doc updates (by agent, reading source)
→ baseline metadata update in `knowledge.json` → clear resolved stale state.

Rules:

- Preserve unaffected documentation.
- Never silently regenerate the whole knowledge base (full `--force`
  bootstrap only when explicitly invoked).
- `.project/state/stale.json` is ephemeral; do not require it committed.
