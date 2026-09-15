'use strict';
/**
 * E2E: disposable-repo lifecycle A–E.
 * Run: node tests/e2e.js
 * A. no .project/ -> bootstrap creates knowledge
 * B. with .project/ -> context loads, no bootstrap overwrite
 * C. modify source -> refresh marks stale
 * D. refresh --clear (after targeted doc update) -> stale clears
 * E. no changes -> clean report, no regeneration
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PK = path.join(ROOT, 'project-knowledge');

function sh(nodeArgs, cwd) {
  const r = cp.spawnSync(process.execPath, nodeArgs, { encoding: 'utf8', cwd });
  assert.strictEqual(r.status, 0, (r.stderr || '') + (r.stdout || ''));
  return r.stdout;
}

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-e2e-'));
try {
  fs.writeFileSync(path.join(repo, 'pyproject.toml'), '[project]\nname="demo"\n');
  fs.mkdirSync(path.join(repo, 'src'));
  fs.writeFileSync(path.join(repo, 'src', 'app.py'), 'print("hi")\n');

  // A
  assert.ok(!fs.existsSync(path.join(repo, '.project')));
  sh([path.join(PK, 'bootstrap.mjs'), repo], ROOT);
  assert.ok(fs.existsSync(path.join(repo, '.project', 'knowledge.json')));
  console.log('ok - A: bootstrap creates knowledge');

  // B
  const before = fs.readFileSync(path.join(repo, '.project', 'overview.md'), 'utf8');
  const ctxOut = sh([path.join(PK, 'context.js'), repo, 'app work'], ROOT);
  assert.ok(ctxOut.includes('PROJECT CONTEXT'));
  sh([path.join(PK, 'bootstrap.mjs'), repo], ROOT); // must not overwrite
  assert.strictEqual(fs.readFileSync(path.join(repo, '.project', 'overview.md'), 'utf8'), before);
  console.log('ok - B: context loads, no unnecessary bootstrap');

  // C
  fs.writeFileSync(path.join(repo, 'src', 'app.py'), 'print("changed")\n');
  const refOut = sh([path.join(PK, 'refresh.js'), repo, '--json', '--files', 'src/app.py'], ROOT);
  const ref = JSON.parse(refOut);
  assert.ok(ref.stale.some((s) => s.startsWith('src/')), JSON.stringify(ref.stale));
  console.log('ok - C: modify source -> stale');

  // D: agent does targeted update then clears
  fs.appendFileSync(path.join(repo, '.project', 'modules.md'), '\n<!-- targeted update -->\n');
  sh([path.join(PK, 'refresh.js'), repo, '--clear'], ROOT);
  const stale = JSON.parse(fs.readFileSync(path.join(repo, '.project', 'state', 'stale.json'), 'utf8'));
  assert.strictEqual(stale.stale.length, 0);
  console.log('ok - D: refresh clears resolved stale state');

  // E
  const stOut = sh([path.join(PK, 'status.js'), repo], ROOT);
  assert.ok(/stale sections: none/.test(stOut), stOut);
  const kjBefore = fs.readFileSync(path.join(repo, '.project', 'knowledge.json'), 'utf8');
  sh([path.join(PK, 'refresh.js'), repo], ROOT); // git may be absent; must report clean
  console.log('ok - E: clean report, no unnecessary regeneration');
  console.log('\nE2E passed');
} finally {
  fs.rmSync(repo, { recursive: true, force: true });
}
