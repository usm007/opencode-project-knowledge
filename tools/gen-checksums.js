'use strict';
/**
 * tools/gen-checksums.js — generates/verifies SHA256SUMS for the distributable payload.
 * Usage:
 *   node tools/gen-checksums.js           # write SHA256SUMS
 *   node tools/gen-checksums.js --check   # verify SHA256SUMS is current (exit 1 if stale)
 * The installers verify installed payload files against this manifest.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function payloadFiles() {
  const files = [
    'AGENTS.md',
    'VERSION',
    'Install.bat',
    'Uninstall.bat',
    'install.ps1',
    'uninstall.ps1',
    'install.sh',
    'uninstall.sh',
  ];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = path.relative(ROOT, full).replace(/\\/g, '/');
      if (e.isDirectory()) walk(full);
      else if (/\.(js|mjs|md|json)$/.test(e.name)) files.push(rel);
    }
  };
  for (const d of ['project-knowledge', 'skills', 'plugins', 'commands', 'antigravity', 'tools']) walk(path.join(ROOT, d));
  return [...new Set(files)].sort();
}

function computeManifest() {
  const lines = [];
  for (const rel of payloadFiles()) {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    lines.push(`${hash}  ${rel}`);
  }
  return lines.join('\n') + '\n';
}

if (require.main === module) {
  const manifest = computeManifest();
  const out = path.join(ROOT, 'SHA256SUMS');
  if (process.argv.includes('--check')) {
    let current = null;
    try { current = fs.readFileSync(out, 'utf8'); } catch { /* missing */ }
    if (current !== manifest) {
      console.error('SHA256SUMS is stale or missing. Run: npm run checksums');
      process.exit(1);
    }
    console.log(`SHA256SUMS current (${payloadFiles().length} files).`);
  } else {
    fs.writeFileSync(out, manifest);
    console.log(`Wrote SHA256SUMS (${payloadFiles().length} files).`);
  }
}

module.exports = { computeManifest, payloadFiles };
