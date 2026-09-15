# Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| No context / `.project/` missing | New repo | `node <config>/project-knowledge/bootstrap.mjs <repo>` then `context.js` |
| `knowledge.json is malformed` | Hand edit broke JSON | `node bootstrap.mjs <repo> --baseline-only` regenerates metadata |
| `stale.json` parse error | Corrupt ephemeral state | Delete `.project/state/stale.json`, re-run `refresh.js` |
| `git unavailable` in status | No Git / not a repo | Normal — filesystem analysis still works |
| Wrong project type | Ambiguous markers | Check `detect.js --json` evidence; mixed repos report `mixed:true` |
| AGENTS.md duplicated section | Ran old installer twice | Markers make install idempotent; remove extras, keep one block |
| Plugin does nothing | Unsupported OpenCode API | Expected — CLI tools + AGENTS.md + skill are the core path |
| `REFUSED: installed vX is newer` | Downgrade blocked | Re-run installer with `-AllowDowngrade` / `--allow-downgrade` if intentional |
| `checksum mismatch: <file>` | Tampered or hand-edited source payload | Re-fetch the distribution, or run `npm run checksums` if you changed payload intentionally |
| `SHA256SUMS is stale` (CI) | Payload changed without regenerating manifest | Run `npm run checksums` and commit the result |
| `Timed out waiting for lock` | A parallel bootstrap/refresh is stuck or crashed | Wait for it to finish; locks older than 60s are auto-cleared, or delete `.project/.lock` if no other process is running |
| Context too generic | Stubs not completed | Finish `(agent)` stubs with real source reads |
| Secrets in knowledge | Agent pasted env values | Remove, add pattern to `.gitignore`, never record secret values |

## Debug commands

```bash
node project-knowledge/detect.js <repo> --json
node project-knowledge/context.js <repo> "task hint"
node project-knowledge/status.js <repo>
node project-knowledge/refresh.js <repo> --files "src/changed.ts"
node project-knowledge/bootstrap.mjs <repo> --baseline-only
```

Exit codes: `0` ok, `1` bad usage, `2` repo not found.
