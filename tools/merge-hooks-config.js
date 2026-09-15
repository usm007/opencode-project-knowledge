'use strict';
/**
 * tools/merge-hooks-config.js — idempotently add/remove our PreInvocation
 * hook in an Antigravity `hooks.json`.
 *
 * Antigravity hooks.json shapes (both accepted):
 *   { "my-hook": { "PreInvocation": [{ "type":"command","command":"node ..."}]}}
 * The key is an arbitrary hook name; we use `project-knowledge-context`.
 *
 * Usage:
 *   node merge-hooks-config.js <hooks.json> <add|remove> <absHookJs>
 * Exit codes: 0 ok, 1 usage, 2 malformed JSON
 */
const fs = require('fs');
const path = require('path');

const [cfgPath, action, hookJs] = process.argv.slice(2);
if (!cfgPath || (action !== 'add' && action !== 'remove') || (action === 'add' && !hookJs)) {
  console.error('Usage: node merge-hooks-config.js <hooks.json> <add|remove> <absHookJs>');
  process.exit(1);
}

const KEY = 'project-knowledge-context';

let existed = fs.existsSync(cfgPath);
let cfg = {};
if (existed) {
  try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch {
    console.error(`Refusing to modify malformed JSON: ${cfgPath}`);
    process.exit(2);
  }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    console.error(`Refusing to modify non-object JSON: ${cfgPath}`);
    process.exit(2);
  }
} else {
  if (action === 'remove') { console.log('hooks.json absent (ok)'); process.exit(0); }
  cfg = {};
}

function expectedCommand(abs) { return `node "${abs}"`; }

if (action === 'add') {
  const abs = path.resolve(hookJs);
  const cmd = expectedCommand(abs);
  const cur = cfg[KEY];
  const curCmd = cur && cur.PreInvocation && cur.PreInvocation[0] && cur.PreInvocation[0].command;
  // Normalize: compare resolved absolute path inside the stored command string
  const same = typeof curCmd === 'string' && path.resolve(curCmd.replace(/^node\s+"?/, '').replace(/"?\s*$/, '')) === abs;
  if (same) {
    console.log(`hooks.${KEY} already present (ok)`);
    process.exit(0);
  }
  cfg[KEY] = {
    PreInvocation: [{ type: 'command', command: cmd, timeout: 10 }],
  };
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`added hooks.${KEY} -> ${cmd}`);
} else {
  if (!Object.prototype.hasOwnProperty.call(cfg, KEY)) {
    console.log(`hooks.${KEY} absent (ok)`);
    process.exit(0);
  }
  delete cfg[KEY];
  if (Object.keys(cfg).length === 0) {
    fs.rmSync(cfgPath);
    console.log('removed empty hooks.json');
    process.exit(0);
  }
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`removed hooks.${KEY}`);
}
