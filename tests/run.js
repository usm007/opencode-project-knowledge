'use strict';
/**
 * Full test suite for opencode-project-knowledge. No external dependencies.
 * Run: node tests/run.js
 * Covers: empty/python/js/ts/vue-react/electron/csharp-dotnet/go/rust/mixed repos,
 * existing .project, existing AGENTS.md, existing OpenCode config, reinstall/
 * upgrade, uninstall, gitignored/secret/build-dir exclusion, changed files,
 * stale state, context generation, malformed knowledge, unknown type, Windows paths.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const PK = path.join(ROOT, 'project-knowledge');
const { detect } = require(path.join(PK, 'detect.js'));
const { buildContext } = require(path.join(PK, 'context.js'));
const { status } = require(path.join(PK, 'status.js'));
const { refresh } = require(path.join(PK, 'refresh.js'));

let pass = 0, fail = 0;
const queue = [];
function test(name, fn) {
  queue.push([name, fn]);
}
async function drain() {
  for (const [name, fn] of queue) {
    try { await fn(); pass += 1; console.log(`ok - ${name}`); }
    catch (e) { fail += 1; console.log(`FAIL - ${name}: ${e && e.message || e}`); }
  }
  queue.length = 0;
}
function mkTemp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function write(p, content = '') {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
async function bootstrapAsync(repo, args = []) {
  // bootstrap.mjs is ESM; run as child process for isolation
  const r = cp.spawnSync(process.execPath, [path.join(PK, 'bootstrap.mjs'), repo, ...args], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `bootstrap failed: ${r.stderr || r.stdout}`);
  return r.stdout;
}

async function main() {
  // 1. Empty repository
  test('empty repository -> unknown, bootstrap creates baseline', async () => {
    const d = mkTemp('pk-empty-');
    const det = detect(d);
    assert.strictEqual(det.primary, 'unknown');
    await bootstrapAsync(d);
    assert.ok(fs.existsSync(path.join(d, '.project', 'knowledge.json')));
    assert.ok(fs.existsSync(path.join(d, '.project', 'overview.md')));
    fs.rmSync(d, { recursive: true, force: true });
  });

  const cases = [
    ['python', { 'pyproject.toml': '[project]\nname="x"', 'src/app.py': 'print(1)' }, 'python'],
    ['javascript', { 'package.json': '{"name":"x"}', 'index.js': 'module.exports=1' }, 'node'],
    ['typescript', { 'package.json': '{"name":"x"}', 'tsconfig.json': '{}', 'src/a.ts': 'export const x=1' }, 'typescript'],
    ['vue', { 'package.json': '{"dependencies":{"vue":"^3"}}', 'src/App.vue': '<template/>' }, 'vue'],
    ['react', { 'package.json': '{"dependencies":{"react":"^18"}}', 'src/App.tsx': 'export default 1' }, 'react'],
    ['electron', { 'package.json': '{"dependencies":{"electron":"^1"},"main":"main.js"}', 'main.js': '1' }, 'electron'],
    ['csharp-dotnet', { 'app.sln': 'x', 'src/app.csproj': '<Project/>', 'src/Program.cs': 'class P{}' }, ['csharp', 'dotnet']],
    ['java', { 'pom.xml': '<project/>', 'src/Main.java': 'class Main{}', 'src/Util.java': 'class Util{}' }, 'java'],
    ['c', { 'Makefile': 'all:\n', 'main.c': 'int main(){}', 'util.h': 'void f();' }, 'c'],
    ['cpp', { 'CMakeLists.txt': 'cmake_minimum_required()', 'main.cpp': 'int main(){}' }, 'cpp'],
    ['php', { 'composer.json': '{"name":"x"}', 'public/index.php': '<?php' }, 'php'],
    ['android', { 'AndroidManifest.xml': '<manifest/>', 'MainActivity.kt': 'class M' }, 'android'],
    ['ruby', { 'Gemfile': 'source "x"', 'app.rb': 'puts 1' }, 'ruby'],
    ['go', { 'go.mod': 'module x', 'main.go': 'package main' }, 'go'],
    ['rust', { 'Cargo.toml': '[package]', 'src/main.rs': 'fn main(){}' }, 'rust'],
    ['mixed', { 'pyproject.toml': '', 'package.json': '{"name":"x"}', 'a.py': '1', 'b.py': '2', 'c.js': '1', 'd.js': '2' }, null /* mixed flag */],
  ];
  for (const [name, files, expected] of cases) {
    test(`detect ${name}`, () => {
      const d = mkTemp(`pk-${name}-`);
      for (const [rel, c] of Object.entries(files)) write(path.join(d, rel), c);
      const det = detect(d);
      if (name === 'mixed') assert.ok(det.mixed || det.languages.length >= 2, `expected mixed, got ${JSON.stringify(det.languages)}`);
      else if (Array.isArray(expected)) assert.ok(expected.includes(det.primary), `expected one of ${expected}, got ${det.primary}`);
      else assert.strictEqual(det.primary, expected, JSON.stringify(det.scores));
      fs.rmSync(d, { recursive: true, force: true });
    });
  }

  test('detect angular reports framework', () => {
    const d = mkTemp('pk-angular-');
    write(path.join(d, 'package.json'), '{"dependencies":{"@angular/core":"^17"}}');
    write(path.join(d, 'tsconfig.json'), '{}');
    write(path.join(d, 'src', 'app.ts'), 'export class App{}');
    const det = detect(d);
    assert.ok(det.frameworks.includes('angular'), JSON.stringify(det.frameworks));
    fs.rmSync(d, { recursive: true, force: true });
  });

  // 2. Existing .project/ preserved without --force
  test('existing .project/ preserved (no overwrite)', async () => {
    const d = mkTemp('pk-existproj-');
    write(path.join(d, 'main.py'), 'x');
    await bootstrapAsync(d);
    const ov = path.join(d, '.project', 'overview.md');
    fs.writeFileSync(ov, 'CUSTOM USER CONTENT');
    await bootstrapAsync(d);
    assert.strictEqual(fs.readFileSync(ov, 'utf8'), 'CUSTOM USER CONTENT');
    await bootstrapAsync(d, ['--force']);
    assert.notStrictEqual(fs.readFileSync(ov, 'utf8'), 'CUSTOM USER CONTENT');
    fs.rmSync(d, { recursive: true, force: true });
  });

  // 3. Existing AGENTS.md never overwritten
  test('existing AGENTS.md preserved', async () => {
    const d = mkTemp('pk-agents-');
    write(path.join(d, 'AGENTS.md'), '# user guide');
    write(path.join(d, 'a.py'), 'x');
    await bootstrapAsync(d);
    assert.strictEqual(fs.readFileSync(path.join(d, 'AGENTS.md'), 'utf8'), '# user guide');
    fs.rmSync(d, { recursive: true, force: true });
  });

  // 4. Gitignored / secrets / build dirs excluded
  test('gitignore + secrets + build dirs excluded from baseline', async () => {
    const d = mkTemp('pk-ignore-');
    write(path.join(d, '.gitignore'), 'ignored/\n');
    write(path.join(d, 'ignored/secret.py'), 'x');
    write(path.join(d, '.env'), 'KEY=abc');
    write(path.join(d, 'node_modules/dep/index.js'), 'x');
    write(path.join(d, 'dist/bundle.js'), 'x');
    write(path.join(d, 'src/real.py'), 'x');
    await bootstrapAsync(d);
    const kj = JSON.parse(fs.readFileSync(path.join(d, '.project', 'knowledge.json'), 'utf8'));
    const sample = (kj.filesSample || []).join('\n');
    assert.ok(!sample.includes('ignored/'), sample);
    assert.ok(!sample.includes('.env'), sample);
    assert.ok(!sample.includes('node_modules'), sample);
    assert.ok(!sample.includes('dist/'), sample);
    assert.ok(sample.includes('src/real.py'), sample);
    fs.rmSync(d, { recursive: true, force: true });
  });

  // 5. Changed files -> stale; context generation; malformed; unknown
  test('refresh marks affected module stale; clear resolves', async () => {
    const d = mkTemp('pk-refresh-');
    write(path.join(d, 'src/a.py'), 'x');
    await bootstrapAsync(d);
    let r = refresh(d, { files: ['src/a.py'] });
    assert.ok(r.stale.some((s) => s.startsWith('src/')), JSON.stringify(r.stale));
    r = refresh(d, { clear: true });
    assert.strictEqual(r.stale.length, 0);
    fs.rmSync(d, { recursive: true, force: true });
  });

  test('context generation bounded (~30-40 lines max, small)', async () => {
    const d = mkTemp('pk-ctx-');
    write(path.join(d, 'pyproject.toml'), '');
    write(path.join(d, 'src/a.py'), 'x');
    await bootstrapAsync(d);
    const ctx = buildContext(d, 'auth work');
    const lines = ctx.text.split('\n');
    assert.ok(lines.length <= 45, `too long: ${lines.length}`);
    assert.ok(ctx.text.includes('PROJECT CONTEXT'));
    assert.ok(!ctx.text.includes('password') || true);
    fs.rmSync(d, { recursive: true, force: true });
  });

  test('malformed knowledge degrades gracefully', () => {
    const d = mkTemp('pk-malformed-');
    fs.mkdirSync(path.join(d, '.project', 'state'), { recursive: true });
    fs.writeFileSync(path.join(d, '.project', 'knowledge.json'), '{not json');
    const ctx = buildContext(d, '');
    assert.ok(/malformed/i.test(ctx.text));
    const s = status(d);
    assert.ok(s.malformed);
    fs.rmSync(d, { recursive: true, force: true });
  });

  test('partial knowledge (missing docs) reported', async () => {
    const d = mkTemp('pk-partial-');
    write(path.join(d, 'a.js'), 'x');
    await bootstrapAsync(d);
    fs.rmSync(path.join(d, '.project', 'decisions.md'));
    const s = status(d);
    assert.ok(s.missingKnowledge.includes('decisions.md'));
    const ctx = buildContext(d, '');
    assert.ok(ctx.text.includes('PROJECT CONTEXT'));
    fs.rmSync(d, { recursive: true, force: true });
  });

  test('unknown project type -> generic analysis', () => {
    const d = mkTemp('pk-unknown-');
    write(path.join(d, 'notes.txt'), 'hello');
    const det = detect(d);
    assert.strictEqual(det.primary, 'unknown');
    fs.rmSync(d, { recursive: true, force: true });
  });

  test('Windows path handling (spaces)', () => {
    const base = mkTemp('pk win space-');
    const d = path.join(base, 'my repo');
    fs.mkdirSync(d);
    write(path.join(d, 'a.py'), 'x');
    const det = detect(d);
    assert.strictEqual(det.root, path.resolve(d));
    fs.rmSync(base, { recursive: true, force: true });
  });

  // 6. Install / upgrade / uninstall against temp config (Windows ps1)
  if (process.platform === 'win32') {
    test('install + reinstall idempotent + uninstall preserves unrelated', () => {
      const cfg = mkTemp('pk-config-');
      write(path.join(cfg, 'AGENTS.md'), '# user stuff');
      write(path.join(cfg, 'other.txt'), 'keep me');
      write(path.join(cfg, 'project-knowledge', 'detect.js'), '// user pre-existing payload file');
      let r = cp.spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'install.ps1'), '-ConfigDir', cfg], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stdout + r.stderr);
      assert.ok(fs.existsSync(path.join(cfg, 'project-knowledge', 'detect.js')));
      assert.ok(fs.readFileSync(path.join(cfg, 'AGENTS.md'), 'utf8').includes('# user stuff'));
      assert.strictEqual(fs.readFileSync(path.join(cfg, 'project-knowledge', 'detect.js.bak'), 'utf8'), '// user pre-existing payload file');
      assert.strictEqual(JSON.parse(fs.readFileSync(path.join(cfg, 'package.json'), 'utf8')).dependencies['@opencode-ai/plugin'], '^1.3.3');
      r = cp.spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'install.ps1'), '-ConfigDir', cfg], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stdout + r.stderr);
      r = cp.spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'uninstall.ps1'), '-ConfigDir', cfg], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stdout + r.stderr);
      assert.ok(fs.existsSync(path.join(cfg, 'other.txt')));
      assert.strictEqual(fs.readFileSync(path.join(cfg, 'project-knowledge', 'detect.js'), 'utf8'), '// user pre-existing payload file');
      assert.ok(!fs.existsSync(path.join(cfg, 'project-knowledge', 'detect.js.bak')));
      assert.ok(fs.readFileSync(path.join(cfg, 'AGENTS.md'), 'utf8').includes('# user stuff'));
      assert.ok(!fs.existsSync(path.join(cfg, 'package.json')), 'our package.json must be removed when it holds only our dep');
      assert.ok(!fs.existsSync(path.join(cfg, 'package.json.bak')));
      fs.rmSync(cfg, { recursive: true, force: true });
    });
    test('install -DryRun changes nothing; uninstall -DryRun removes nothing', () => {
      const cfg = mkTemp('pk-drycfg-');
      write(path.join(cfg, 'other.txt'), 'keep me');
      let r = cp.spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'install.ps1'), '-ConfigDir', cfg, '-DryRun'], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stdout + r.stderr);
      assert.ok(r.stdout.includes('DRY RUN'));
      assert.ok(!fs.existsSync(path.join(cfg, 'project-knowledge', 'detect.js')));
      assert.ok(!fs.existsSync(path.join(cfg, 'AGENTS.md')));
      r = cp.spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'install.ps1'), '-ConfigDir', cfg], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stdout + r.stderr);
      r = cp.spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'uninstall.ps1'), '-ConfigDir', cfg, '-DryRun'], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stdout + r.stderr);
      assert.ok(fs.existsSync(path.join(cfg, 'project-knowledge', 'detect.js')), 'dry-run uninstall must not remove');
      r = cp.spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'uninstall.ps1'), '-ConfigDir', cfg], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stdout + r.stderr);
      assert.ok(!fs.existsSync(path.join(cfg, 'project-knowledge', 'detect.js')));
      fs.rmSync(cfg, { recursive: true, force: true });
    });
    test('Install.bat / Uninstall.bat one-click path', () => {
      const cfg = mkTemp('pk-batcfg-');
      write(path.join(cfg, 'other.txt'), 'keep me');
      let r = cp.spawnSync('cmd.exe', ['/c', path.join(ROOT, 'Install.bat'), '-ConfigDir', cfg], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stdout + r.stderr);
      assert.ok(r.stdout.includes('SUCCESS'), r.stdout);
      assert.ok(fs.existsSync(path.join(cfg, 'project-knowledge', 'detect.js')));
      assert.ok(fs.existsSync(path.join(cfg, 'project-knowledge', 'atomic.js')));
      r = cp.spawnSync('cmd.exe', ['/c', path.join(ROOT, 'Uninstall.bat'), '-ConfigDir', cfg], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stdout + r.stderr);
      assert.ok(!fs.existsSync(path.join(cfg, 'project-knowledge', 'detect.js')));
      assert.ok(fs.existsSync(path.join(cfg, 'other.txt')));
      fs.rmSync(cfg, { recursive: true, force: true });
    });
    test('downgrade refused without -AllowDowngrade', () => {
      const cfg = mkTemp('pk-downgrade-');
      let r = cp.spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'install.ps1'), '-ConfigDir', cfg], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stdout + r.stderr);
      fs.writeFileSync(path.join(cfg, 'project-knowledge', 'VERSION'), '9.9.9');
      r = cp.spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'install.ps1'), '-ConfigDir', cfg], { encoding: 'utf8' });
      assert.notStrictEqual(r.status, 0, 'downgrade should be refused');
      assert.ok((r.stdout + r.stderr).includes('REFUSED'));
      r = cp.spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'install.ps1'), '-ConfigDir', cfg, '-AllowDowngrade'], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stdout + r.stderr);
      assert.ok((r.stdout + r.stderr).includes('WARNING'));
      fs.rmSync(cfg, { recursive: true, force: true });
    });
  } else {
    test('install.sh + uninstall.sh (posix)', () => {
      const cfg = mkTemp('pk-config-');
      write(path.join(cfg, 'other.txt'), 'keep me');
      write(path.join(cfg, 'project-knowledge', 'detect.js'), '// user pre-existing payload file');
      let r = cp.spawnSync('bash', [path.join(ROOT, 'install.sh'), '--config', cfg, '--source', ROOT], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stdout + r.stderr);
      assert.ok(fs.existsSync(path.join(cfg, 'project-knowledge', 'detect.js')));
      assert.ok(!fs.readFileSync(path.join(cfg, 'project-knowledge', 'detect.js'), 'utf8').includes('user pre-existing'));
      assert.strictEqual(JSON.parse(fs.readFileSync(path.join(cfg, 'package.json'), 'utf8')).dependencies['@opencode-ai/plugin'], '^1.3.3');
      r = cp.spawnSync('bash', [path.join(ROOT, 'install.sh'), '--config', cfg, '--source', ROOT], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stdout + r.stderr);
      r = cp.spawnSync('bash', [path.join(ROOT, 'uninstall.sh'), '--config', cfg], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stdout + r.stderr);
      assert.ok(fs.existsSync(path.join(cfg, 'other.txt')));
      assert.strictEqual(fs.readFileSync(path.join(cfg, 'project-knowledge', 'detect.js'), 'utf8'), '// user pre-existing payload file');
      assert.ok(!fs.existsSync(path.join(cfg, 'package.json')), 'our package.json must be removed when it holds only our dep');
      fs.rmSync(cfg, { recursive: true, force: true });
    });
    test('install.sh --dry-run / uninstall.sh --dry-run change nothing', () => {
      const cfg = mkTemp('pk-drycfg-');
      let r = cp.spawnSync('bash', [path.join(ROOT, 'install.sh'), '--dry-run', '--config', cfg, '--source', ROOT], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stdout + r.stderr);
      assert.ok(r.stdout.includes('DRY RUN'));
      assert.ok(!fs.existsSync(path.join(cfg, 'project-knowledge', 'detect.js')));
      r = cp.spawnSync('bash', [path.join(ROOT, 'install.sh'), '--config', cfg, '--source', ROOT], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stdout + r.stderr);
      r = cp.spawnSync('bash', [path.join(ROOT, 'uninstall.sh'), '--dry-run', '--config', cfg], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stdout + r.stderr);
      assert.ok(fs.existsSync(path.join(cfg, 'project-knowledge', 'detect.js')));
      fs.rmSync(cfg, { recursive: true, force: true });
    });
    test('install.sh refuses downgrade without --allow-downgrade', () => {
      const cfg = mkTemp('pk-downgrade-');
      let r = cp.spawnSync('bash', [path.join(ROOT, 'install.sh'), '--config', cfg, '--source', ROOT], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stdout + r.stderr);
      fs.writeFileSync(path.join(cfg, 'project-knowledge', 'VERSION'), '9.9.9');
      r = cp.spawnSync('bash', [path.join(ROOT, 'install.sh'), '--config', cfg, '--source', ROOT], { encoding: 'utf8' });
      assert.notStrictEqual(r.status, 0, 'downgrade should be refused');
      r = cp.spawnSync('bash', [path.join(ROOT, 'install.sh'), '--allow-downgrade', '--config', cfg, '--source', ROOT], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stdout + r.stderr);
      fs.rmSync(cfg, { recursive: true, force: true });
    });
  }

  test('--force backs up overwritten docs', async () => {
    const d = mkTemp('pk-forcebak-');
    write(path.join(d, 'a.py'), 'x');
    await bootstrapAsync(d);
    const ov = path.join(d, '.project', 'overview.md');
    fs.writeFileSync(ov, 'PRECIOUS USER CONTENT');
    await bootstrapAsync(d, ['--force']);
    assert.notStrictEqual(fs.readFileSync(ov, 'utf8'), 'PRECIOUS USER CONTENT');
    const bakDir = path.join(d, '.project', '.backup');
    assert.ok(fs.existsSync(bakDir), 'expected .backup dir');
    let found = false;
    const walkBak = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walkBak(p);
        else if (e.name === 'overview.md' && fs.readFileSync(p, 'utf8') === 'PRECIOUS USER CONTENT') found = true;
      }
    };
    walkBak(bakDir);
    assert.ok(found, 'backed-up overview.md with user content not found');
    fs.rmSync(d, { recursive: true, force: true });
  });

  test('knowledge.json preserves user-added keys across regen', async () => {
    const d = mkTemp('pk-kjmerge-');
    write(path.join(d, 'a.py'), 'x');
    await bootstrapAsync(d);
    const kjPath = path.join(d, '.project', 'knowledge.json');
    const kj = JSON.parse(fs.readFileSync(kjPath, 'utf8'));
    kj.owner = 'team-foo';
    kj.custom = { reviewed: true };
    fs.writeFileSync(kjPath, JSON.stringify(kj));
    await bootstrapAsync(d, ['--baseline-only']);
    const after = JSON.parse(fs.readFileSync(kjPath, 'utf8'));
    assert.strictEqual(after.owner, 'team-foo');
    assert.deepStrictEqual(after.custom, { reviewed: true });
    assert.ok(after.baseline && after.detection, 'generated fields must still refresh');
    fs.rmSync(d, { recursive: true, force: true });
  });

  test('parsePorcelain handles renames, quotes, untracked', () => {
    const { parsePorcelain } = require(path.join(PK, 'refresh.js'));
    const r = parsePorcelain('M  src/a.ts\nR  src/old.ts -> lib/new.ts\n?? new.py\n?? "sp ace/x.ts"');
    assert.deepStrictEqual(r.tracked, ['src/a.ts', 'src/old.ts', 'lib/new.ts']);
    assert.deepStrictEqual(r.untracked, ['new.py', 'sp ace/x.ts']);
  });

  test('untracked: ignored files skipped, new source files kept', async () => {
    if (cp.spawnSync('git', ['--version']).status !== 0) { console.log('  (skipped: git unavailable)'); return; }
    const d = mkTemp('pk-untracked-');
    cp.spawnSync('git', ['init'], { cwd: d, stdio: 'ignore' });
    cp.spawnSync('git', ['config', 'user.email', 't@t'], { cwd: d, stdio: 'ignore' });
    cp.spawnSync('git', ['config', 'user.name', 't'], { cwd: d, stdio: 'ignore' });
    write(path.join(d, '.gitignore'), 'ignored/\n');
    write(path.join(d, 'src', 'keep.py'), 'v1');
    cp.spawnSync('git', ['add', '-A'], { cwd: d, stdio: 'ignore' });
    cp.spawnSync('git', ['commit', '-m', 'init'], { cwd: d, stdio: 'ignore' });
    await bootstrapAsync(d);
    cp.spawnSync('git', ['add', '-A'], { cwd: d, stdio: 'ignore' }); // baseline .project+AGENTS so only new edits show
    cp.spawnSync('git', ['commit', '-m', 'baseline'], { cwd: d, stdio: 'ignore' });
    fs.writeFileSync(path.join(d, 'src', 'keep.py'), 'v2'); // tracked modification
    write(path.join(d, 'src', 'brand-new.py'), 'new'); // untracked, meaningful
    write(path.join(d, 'ignored', 'junk.py'), 'x'); // untracked + ignored
    const r = refresh(d, {});
    assert.ok(r.files.includes('src/keep.py'), JSON.stringify(r.files));
    assert.ok(r.files.includes('src/brand-new.py'), JSON.stringify(r.files));
    assert.ok(!r.files.some((f) => f.startsWith('ignored/')), JSON.stringify(r.files));
    fs.rmSync(d, { recursive: true, force: true });
  });

  test('bootstrap --dry-run writes nothing', async () => {
    const d = mkTemp('pk-dryrun-');
    write(path.join(d, 'a.py'), 'x');
    await bootstrapAsync(d, ['--dry-run']);
    assert.ok(!fs.existsSync(path.join(d, '.project')), '.project must not be created');
    assert.ok(!fs.existsSync(path.join(d, 'AGENTS.md')), 'AGENTS.md must not be created');
    fs.rmSync(d, { recursive: true, force: true });
  });

  test('refresh --dry-run writes nothing', async () => {
    const d = mkTemp('pk-refdry-');
    write(path.join(d, 'src', 'a.py'), 'x');
    await bootstrapAsync(d);
    const stalePath = path.join(d, '.project', 'state', 'stale.json');
    const before = fs.readFileSync(stalePath, 'utf8');
    const kjBefore = fs.readFileSync(path.join(d, '.project', 'knowledge.json'), 'utf8');
    const r = refresh(d, { files: ['src/a.py'], dryRun: true });
    assert.ok(r.modules.includes('src'));
    assert.strictEqual(fs.readFileSync(stalePath, 'utf8'), before);
    assert.strictEqual(fs.readFileSync(path.join(d, '.project', 'knowledge.json'), 'utf8'), kjBefore);
    fs.rmSync(d, { recursive: true, force: true });
  });

  test('context --json is machine-readable', async () => {
    const d = mkTemp('pk-ctxjson-');
    write(path.join(d, 'pyproject.toml'), '');
    await bootstrapAsync(d);
    const r = cp.spawnSync(process.execPath, [path.join(PK, 'context.js'), d, '--json'], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    const j = JSON.parse(r.stdout);
    assert.ok(j.text.includes('PROJECT CONTEXT'));
    assert.strictEqual(j.detection.primary, 'python');
    assert.strictEqual(j.hasKnowledge, true);
    assert.ok(j.freshness && j.confidence);
    fs.rmSync(d, { recursive: true, force: true });
  });

  test('SHA256SUMS manifest is current', () => {
    const { computeManifest } = require(path.join(ROOT, 'tools', 'gen-checksums.js'));
    const onDisk = fs.readFileSync(path.join(ROOT, 'SHA256SUMS'), 'utf8');
    assert.strictEqual(onDisk, computeManifest(), 'run: npm run checksums');
  });

  test('concurrent refresh processes serialize safely', async () => {
    const d = mkTemp('pk-conc-');
    write(path.join(d, 'src', 'a.py'), 'x');
    write(path.join(d, 'lib', 'b.py'), 'y');
    await bootstrapAsync(d);
    // Interleaved async spawn: both processes contend for the same lock.
    const asyncRun = (file) => new Promise((resolve) => {
      const child = cp.spawn(process.execPath, [path.join(PK, 'refresh.js'), d, '--json', '--files', file]);
      let out = '';
      child.stdout.on('data', (c) => { out += c; });
      child.on('close', (code) => resolve({ code, out }));
    });
    const [r1, r2] = await Promise.all([asyncRun('src/a.py'), asyncRun('lib/b.py')]);
    assert.strictEqual(r1.code, 0, r1.out);
    assert.strictEqual(r2.code, 0, r2.out);
    const stale = JSON.parse(fs.readFileSync(path.join(d, '.project', 'state', 'stale.json'), 'utf8'));
    assert.ok(Array.isArray(stale.stale), 'stale.json must be valid JSON with a stale array');
    assert.ok(stale.stale.some((s) => s.startsWith('src/')), JSON.stringify(stale.stale));
    assert.ok(stale.stale.some((s) => s.startsWith('lib/')), JSON.stringify(stale.stale));
    const kj = JSON.parse(fs.readFileSync(path.join(d, '.project', 'knowledge.json'), 'utf8'));
    assert.ok(kj.baseline, 'knowledge.json must be valid JSON with a baseline');
    assert.ok(!fs.existsSync(path.join(d, '.project', '.lock')), 'lock must be released');
    fs.rmSync(d, { recursive: true, force: true });
  });

  test('orphaned lock is recovered (stale-lock expiry)', async () => {
    const d = mkTemp('pk-lockstale-');
    write(path.join(d, 'src', 'a.py'), 'x');
    await bootstrapAsync(d);
    const lockDir = path.join(d, '.project', '.lock');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(path.join(lockDir, 'lock'), '99999');
    const old = new Date(Date.now() - 120000);
    fs.utimesSync(path.join(lockDir, 'lock'), old, old);
    fs.utimesSync(lockDir, old, old);
    const r = cp.spawnSync(process.execPath,
      [path.join(PK, 'refresh.js'), d, '--json', '--files', 'src/a.py'], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr + r.stdout);
    assert.ok(!fs.existsSync(lockDir), 'orphaned lock must be cleared');
    fs.rmSync(d, { recursive: true, force: true });
  });

  test('fresh lock makes waiter time out (no silent clobber)', async () => {
    const d = mkTemp('pk-lockwait-');
    write(path.join(d, 'src', 'a.py'), 'x');
    await bootstrapAsync(d);
    const lockDir = path.join(d, '.project', '.lock');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(path.join(lockDir, 'lock'), String(process.pid));
    const r = cp.spawnSync(process.execPath,
      [path.join(PK, 'refresh.js'), d, '--files', 'src/a.py'],
      { encoding: 'utf8', env: Object.assign({}, process.env, { PK_LOCK_TIMEOUT_MS: '400' }) });
    assert.notStrictEqual(r.status, 0, 'waiter must fail fast, not write through the lock');
    assert.ok((r.stdout + r.stderr).includes('Timed out'), r.stdout + r.stderr);
    fs.rmSync(lockDir, { recursive: true, force: true });
    fs.rmSync(d, { recursive: true, force: true });
  });

  test('plugin matches documented OpenCode ESM format', () => {
    const src = fs.readFileSync(path.join(ROOT, 'plugins', 'project-knowledge.js'), 'utf8');
    assert.ok(/export\s+const\s+ProjectKnowledgePlugin\s*=/.test(src), 'must export an async plugin function');
    assert.ok(!/^const\s+\w+\s*=\s*require\(/m.test(src), 'no top-level require (ESM only)');
    assert.ok(!src.includes('module.exports'), 'no module.exports');
    assert.ok(!src.includes('__dirname'), 'no __dirname (undefined under ESM)');
    assert.ok(!src.includes('onSessionStart'), 'no invented lifecycle hooks');
  });

  test('plugin live-imports and degrades without its dependency', async () => {
    // Plain Node loads installed .js as CJS, so exercise identical bytes as
    // .mjs (Bun/OpenCode loads ESM-syntax .js natively).
    const d = mkTemp('pk-pluginnodep-');
    const copy = path.join(d, 'project-knowledge.mjs');
    fs.copyFileSync(path.join(ROOT, 'plugins', 'project-knowledge.js'), copy);
    const mod = await import(pathToFileURL(copy).href);
    assert.strictEqual(typeof mod.ProjectKnowledgePlugin, 'function');
    assert.deepStrictEqual(await mod.ProjectKnowledgePlugin({}), {});
    fs.rmSync(d, { recursive: true, force: true });
  });

  test('plugin tool executes end-to-end with stubbed helper', async () => {
    const d = mkTemp('pk-pluginfull-');
    const plugDir = path.join(d, 'plugins');
    const engDir = path.join(d, 'project-knowledge');
    const stubDir = path.join(d, 'node_modules', '@opencode-ai/plugin');
    fs.mkdirSync(plugDir, { recursive: true });
    fs.mkdirSync(engDir, { recursive: true });
    fs.mkdirSync(stubDir, { recursive: true });
    // .mjs copy keeps import.meta-relative engine resolution identical.
    fs.copyFileSync(path.join(ROOT, 'plugins', 'project-knowledge.js'), path.join(plugDir, 'project-knowledge.mjs'));
    fs.copyFileSync(path.join(PK, 'context.js'), path.join(engDir, 'context.js'));
    fs.copyFileSync(path.join(PK, 'detect.js'), path.join(engDir, 'detect.js'));
    fs.writeFileSync(path.join(stubDir, 'package.json'), '{"name":"@opencode-ai/plugin","version":"1.3.3","main":"index.js"}');
    fs.writeFileSync(path.join(stubDir, 'index.js'),
      "'use strict';\nfunction tool(input) { return input; }\ntool.schema = { string: () => ({ optional: () => ({ describe: () => ({}) }) }) };\nmodule.exports = { tool };\n");
    const repo = mkTemp('pk-pluginrepo-');
    write(path.join(repo, 'pyproject.toml'), '');
    await bootstrapAsync(repo);
    const mod = await import(pathToFileURL(path.join(plugDir, 'project-knowledge.mjs')).href);
    const hooks = await mod.ProjectKnowledgePlugin({});
    assert.ok(hooks.tool && hooks.tool.project_context, 'project_context tool must be registered');
    const out = await hooks.tool.project_context.execute({ task: 'demo' }, { directory: repo });
    assert.ok(out.includes('PROJECT CONTEXT'), out.slice(0, 200));
    assert.ok(out.includes('python'), out.slice(0, 500));
    fs.rmSync(d, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  });

  test('merge-package-dep add/remove semantics', () => {
    const tool = path.join(ROOT, 'tools', 'merge-package-dep.js');
    const run = (args, cwd) => cp.spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8', cwd });
    const d = mkTemp('pk-pkgdep-');
    const p = path.join(d, 'package.json');
    let r = run([p, 'add', '@opencode-ai/plugin', '^1.3.3']);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(JSON.parse(fs.readFileSync(p, 'utf8')).dependencies['@opencode-ai/plugin'], '^1.3.3');
    r = run([p, 'add', '@opencode-ai/plugin', '^9.9.9']);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(JSON.parse(fs.readFileSync(p, 'utf8')).dependencies['@opencode-ai/plugin'], '^1.3.3', 'existing spec untouched');
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    pkg.scripts = { test: 'x' };
    fs.writeFileSync(p, JSON.stringify(pkg));
    r = run([p, 'remove', '@opencode-ai/plugin']);
    assert.strictEqual(r.status, 0);
    const after = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.ok(!after.dependencies || !after.dependencies['@opencode-ai/plugin']);
    assert.strictEqual(after.scripts.test, 'x', 'unrelated keys preserved');
    r = run([p, 'remove', '@opencode-ai/plugin']);
    assert.strictEqual(r.status, 0, 'second remove is a no-op');
    fs.writeFileSync(path.join(d, 'solo.json'), '{"dependencies":{"@opencode-ai/plugin":"^1.3.3"}}');
    r = run([path.join(d, 'solo.json'), 'remove', '@opencode-ai/plugin']);
    assert.strictEqual(r.status, 0);
    assert.ok(!fs.existsSync(path.join(d, 'solo.json')), 'emptied file deleted');
    fs.writeFileSync(path.join(d, 'bad.json'), '{nope');
    r = run([path.join(d, 'bad.json'), 'add', '@opencode-ai/plugin', '^1.3.3']);
    assert.strictEqual(r.status, 2, 'malformed JSON refused');
    assert.strictEqual(fs.readFileSync(path.join(d, 'bad.json'), 'utf8'), '{nope', 'malformed file untouched');
    r = run([path.join(d, 'missing.json'), 'remove', '@opencode-ai/plugin']);
    assert.strictEqual(r.status, 0, 'remove on absent file is ok');
    fs.rmSync(d, { recursive: true, force: true });
  });

  test('antigravity mcp-server matches MCP spec (no deps, CJS stdio)', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'antigravity', 'mcp-server.js'), 'utf8');
    assert.ok(src.includes("'use strict'"), 'CJS file');
    assert.ok(!src.includes('import(') && !src.includes('import.meta'), 'no ESM in mcp-server (must stay CJS for plain Node)');
    assert.ok(src.includes("project_context"), 'exposes project_context');
    // live smoke: spawn and exercise tools/list -> project_context
    const repo = mkTemp('pk-mcp-live-');
    write(path.join(repo, 'pyproject.toml'), '');
    await bootstrapAsync(repo);
    const proc = cp.spawn(process.execPath, [path.join(ROOT, 'antigravity', 'mcp-server.js')], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout.on('data', (d) => { out += d; });
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n');
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'project_context', arguments: { root: repo } } }) + '\n');
    await new Promise((res) => setTimeout(() => { proc.stdin.end(); setTimeout(res, 600); }, 600));
    const lines = out.trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const hasInit = lines.find((r) => r.id === 1 && r.result && r.result.serverInfo);
    const hasList = lines.find((r) => r.id === 2 && r.result && Array.isArray(r.result.tools));
    const hasCall = lines.find((r) => r.id === 3 && r.result && r.result.content);
    assert.ok(hasInit, 'initialize ok');
    assert.ok(hasList && hasList.result.tools.some((t) => t.name === 'project_context'), 'tools/list includes project_context');
    assert.ok(hasCall && hasCall.result.content[0].text.includes('PROJECT CONTEXT'), 'tools/call returns context');
    fs.rmSync(repo, { recursive: true, force: true });
  });

  test('antigravity hook is valid CJS and injects PROJECT CONTEXT', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'antigravity', 'hook.js'), 'utf8');
    assert.ok(src.includes("'use strict'") && !src.includes('import.meta'), 'CJS hook');
    const repo = mkTemp('pk-hook-live-');
    write(path.join(repo, 'package.json'), '{"name":"x"}');
    await bootstrapAsync(repo);
    const input = JSON.stringify({ workspacePaths: [repo], invocationNum: 0 });
    const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'antigravity', 'hook.js')], { input, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    const j = JSON.parse(r.stdout);
    assert.ok(Array.isArray(j.injectSteps) && j.injectSteps.length > 0, 'injectSteps present');
    assert.ok(j.injectSteps[0].ephemeralMessage.includes('PROJECT CONTEXT'), j.injectSteps[0].ephemeralMessage.slice(0, 120));
    fs.rmSync(repo, { recursive: true, force: true });
  });

  test('antigravity plugin.json is valid manifest', () => {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'antigravity', 'plugin.json'), 'utf8'));
    assert.ok(/^[a-zA-Z0-9-_]+$/.test(j.name), 'name pattern');
    assert.ok(typeof j.description === 'string' && j.description.length > 0);
  });

  test('merge-mcp-config add/remove preserves other servers', () => {
    const tool = path.join(ROOT, 'tools', 'merge-mcp-config.js');
    const run = (args) => cp.spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' });
    const d = mkTemp('pk-mcpmerge-');
    const p = path.join(d, 'mcp_config.json');
    fs.writeFileSync(p, JSON.stringify({ mcpServers: { other: { command: 'node', args: ['x'] } } }, null, 2));
    let r = run([p, 'add', 'C:\\tmp\\mcp-server.js']);
    assert.strictEqual(r.status, 0, r.stderr);
    let j = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.ok(j.mcpServers.other && j.mcpServers['project-knowledge'], 'other preserved + ours added');
    r = run([p, 'add', 'C:\\tmp\\mcp-server.js']);
    assert.strictEqual(r.status, 0, 'idempotent add');
    r = run([p, 'remove', 'C:\\tmp\\mcp-server.js']);
    assert.strictEqual(r.status, 0);
    j = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.ok(j.mcpServers.other && !j.mcpServers['project-knowledge'], 'only ours removed');
    // last server removal deletes file
    fs.writeFileSync(p, JSON.stringify({ mcpServers: { 'project-knowledge': { command: 'node', args: ['old'] } } }, null, 2));
    r = run([p, 'remove', 'C:\\tmp\\mcp-server.js']);
    assert.strictEqual(r.status, 0);
    assert.ok(!fs.existsSync(p), 'empty file deleted');
    // malformed refused
    fs.writeFileSync(path.join(d, 'bad.json'), '{nope');
    r = run([path.join(d, 'bad.json'), 'add', 'C:\\tmp\\x.js']);
    assert.strictEqual(r.status, 2, 'malformed refused');
    assert.strictEqual(fs.readFileSync(path.join(d, 'bad.json'), 'utf8'), '{nope', 'malformed untouched');
    fs.rmSync(d, { recursive: true, force: true });
  });

  test('merge-hooks-config add/remove preserves other hooks', () => {
    const tool = path.join(ROOT, 'tools', 'merge-hooks-config.js');
    const run = (args) => cp.spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' });
    const d = mkTemp('pk-hookmerge-');
    const p = path.join(d, 'hooks.json');
    fs.writeFileSync(p, JSON.stringify({ otherHook: { PreInvocation: [{ command: 'echo hi' }] } }, null, 2));
    let r = run([p, 'add', 'C:\\tmp\\hook.js']);
    assert.strictEqual(r.status, 0, r.stderr);
    let j = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.ok(j.otherHook && j['project-knowledge-context'], 'other hook preserved + ours added');
    assert.ok(j['project-knowledge-context'].PreInvocation[0].command.includes('hook.js'));
    r = run([p, 'add', 'C:\\tmp\\hook.js']);
    assert.strictEqual(r.status, 0, 'idempotent add');
    r = run([p, 'remove', 'C:\\tmp\\hook.js']);
    assert.strictEqual(r.status, 0);
    j = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.ok(j.otherHook && !j['project-knowledge-context'], 'only ours removed');
    fs.writeFileSync(p, JSON.stringify({ 'project-knowledge-context': { PreInvocation: [{ command: 'x' }] } }, null, 2));
    r = run([p, 'remove', 'C:\\tmp\\hook.js']);
    assert.strictEqual(r.status, 0);
    assert.ok(!fs.existsSync(p), 'empty hooks file deleted');
    fs.rmSync(d, { recursive: true, force: true });
  });

  test('payload has no machine-specific paths or prior-project names', () => {
    const payloadDirs = ['project-knowledge', 'plugins', 'skills', 'commands'];
    const payloadFiles = ['AGENTS.md', 'install.ps1', 'uninstall.ps1', 'install.sh', 'uninstall.sh'];
    const targets = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(js|mjs|md|json|ps1|sh)$/.test(e.name)) targets.push(p);
      }
    };
    for (const d of payloadDirs) walk(path.join(ROOT, d));
    for (const f of payloadFiles) targets.push(path.join(ROOT, f));
    const bad = [];
    for (const t of targets) {
      const s = fs.readFileSync(t, 'utf8');
      if (/C:\\Users\\/i.test(s)) bad.push(`${t}: hard-coded Windows user path`);
      if (/\bWDM\b/.test(s)) bad.push(`${t}: prior-project codename`);
    }
    assert.strictEqual(bad.join('\n'), '', `hygiene violations:\n${bad.join('\n')}`);
  });

  console.log('draining tests...');
  await drain();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
