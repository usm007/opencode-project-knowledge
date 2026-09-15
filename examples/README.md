# Examples

## Compact context (output of `context.js`)

```text
PROJECT CONTEXT
Project: demo-shop (1.2.0)
Type: typescript / react
Architecture: component SPA (src/) with Express API (server/) — see .project/architecture.md
Relevant subsystem: checkout flow
Relevant modules: src/checkout/*, server/routes/checkout.ts
Important constraints: run `npm test` before push; follow eslint flat config
Relevant decisions: Stripe for payments (docs/adr-003.md)
Knowledge freshness: 2026-09-01 (~13d ago); clean
Confidence: high
Full details: read only the needed .project/*.md file(s) per the modules map; do not paste large source excerpts.
```

## Minimal `.project/knowledge.json`

See [`../project-knowledge/templates/knowledge.json`](../project-knowledge/templates/knowledge.json).

## Status output

```text
PROJECT KNOWLEDGE STATUS
root: E:\repos\demo-shop
detected type: typescript (typescript, react)
knowledge age: 2026-09-01 (~13d ago)
baseline: abc123 @ 2026-09-01 (214 files)
changed files: M src/checkout/cart.ts
stale sections: src/ — changed: src/checkout/cart.ts
low-confidence: none
missing knowledge: none
```
