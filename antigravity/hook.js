'use strict';
/**
 * antigravity/hook.js — PreInvocation hook for Antigravity IDE/CLI.
 *
 * Called with JSON on stdin (see antigravity hooks docs):
 *   { invocationNum, workspacePaths, conversationId, transcriptPath, ... }
 * Returns JSON on stdout:
 *   { injectSteps: [{ ephemeralMessage: "<PROJECT CONTEXT>" }] }
 * or { injectSteps: [] } when there is nothing to inject.
 *
 * This does NOT rewrite the engine — it delegates to context.js.
 * Installed at <antigravity-home>/project-knowledge/hook.js and referenced
 * from hooks.json (command: node <path>).
 */

const fs = require('fs');
const path = require('path');

function resolveEngine(rel) {
  const candidates = [
    path.join(__dirname, rel),
    path.join(__dirname, '..', 'project-knowledge', path.basename(rel)),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return candidates[0];
}

let buildContext = null;
try { buildContext = require(resolveEngine('context.js')).buildContext; } catch {}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => resolve(data));
    if (process.stdin.isTTY) resolve('');
  });
}

async function main() {
  let input = {};
  // Antigravity pipes JSON; also support empty stdin (manual test)
  if (!process.stdin.isTTY) {
    const raw = await readStdin();
    if (raw.trim()) {
      try { input = JSON.parse(raw); } catch { input = {}; }
    }
  } else if (process.argv[2]) {
    // manual: node hook.js <repoRoot>
    input.workspacePaths = [process.argv[2]];
  }

  const roots = Array.isArray(input.workspacePaths) ? input.workspacePaths : [];
  const root = roots[0] || process.cwd();

  if (!buildContext) {
    process.stdout.write(JSON.stringify({ injectSteps: [] }));
    return;
  }

  let text = '';
  try {
    const out = buildContext(path.resolve(root), '');
    text = out.text || '';
    // Only inject when there is a baseline or detectable context; suppress empty/unknown noise.
    if (!out.hasKnowledge && out.detection && out.detection.primary === 'unknown') {
      // No .project/ and no detectable type — still helpful as bootstrap hint, keep short.
      text = 'PROJECT CONTEXT: no .project/ baseline yet — run `node <config>/project-knowledge/bootstrap.mjs <root>` to create one. ' + text.split('\n').slice(0, 3).join(' / ');
    }
  } catch {
    process.stdout.write(JSON.stringify({ injectSteps: [] }));
    return;
  }

  if (!text) {
    process.stdout.write(JSON.stringify({ injectSteps: [] }));
    return;
  }

  // Inject as ephemeralMessage so it does not persist in the transcript.
  process.stdout.write(JSON.stringify({
    injectSteps: [{ ephemeralMessage: text }],
  }));
}

main().catch(() => {
  try { process.stdout.write(JSON.stringify({ injectSteps: [] })); } catch {}
});
