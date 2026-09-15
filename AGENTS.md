# Global agent instructions — opencode-project-knowledge v1.2.0

> Installed once into the user's OpenCode configuration. Generic: no project-specific
> assumptions, no machine-specific paths, no credentials.

## Project knowledge (automatic, every repo)

Your FIRST action on any substantial coding task inside a repository — before
deep exploration — is one cheap call to get the compact PROJECT CONTEXT
(~30–40 lines, less than one grep):

1. Find the repo root (nearest `.git` ancestor or cwd). Check for `.project/`.
2. If `.project/overview.md` + `.project/knowledge.json` exist: read them
   (plus freshness from `.project/state/stale.json`) and produce the compact
   PROJECT CONTEXT below. Load detail docs (`.project/modules.md` is the map)
   ONLY for the touched subsystem.
3. If `.project/` is absent: run
   `node <config>/project-knowledge/bootstrap.mjs <root>` (safe: writes only
   `.project/` + root `AGENTS.md` when missing; never source, never commits),
   complete the `(agent)` stubs with targeted reads, then continue the task.
   Alternatively call the `project_context` tool when available, or
   `node <config>/project-knowledge/context.js <root> "<task>"`.
4. Source code outranks generated knowledge; if they conflict, follow source
   and update the affected `.project/` rows.

### PROJECT CONTEXT shape

```text
PROJECT CONTEXT
Project: ...
Type: ...
Architecture: ...
Relevant subsystem: ...
Relevant modules: ...
Important constraints: ...
Relevant decisions: ...
Knowledge freshness: ...
Confidence: ...
```

Do NOT inject the entire knowledge base. Do NOT paste large source excerpts.
The knowledge system is an accelerator, not a substitute for source code.

## Knowledge rules

- Distinguish FACT (verified in repo) / INFERENCE (strongly suggested) /
  UNCERTAINTY (unknown). Never fabricate architecture or behavior.
- Never record passwords, API keys, tokens, certificates, secrets, or env
  secret values. Respect `.gitignore`, `node_modules`, `bin`, `obj`, `dist`,
  `build`, `target`, `vendor`, caches, and generated output.
- After behavior changes, update only affected `.project/` rows; refresh
  baseline metadata (`node <config>/project-knowledge/refresh.js <root>`).
  `.project/state/stale.json` is ephemeral — never require it committed.

## Graceful degradation

- `knowledge.json` missing → regenerate metadata safely via bootstrap.
- Detail doc missing → use remaining knowledge.
- Git unavailable → use filesystem timestamps/structure.
- Plugin API unavailable → fall back to these instructions + CLI tools.
- Unknown language → generic structural analysis.
- Malformed state → repair safely (delete + regenerate `state/stale.json`).

## Future code-intelligence hook (optional, no MCP required)

The core system works with local filesystem + Git only. A future code-graph /
MCP layer may sit alongside `.project/` but must not replace it.
