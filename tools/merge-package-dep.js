'use strict';
/**
 * tools/merge-package-dep.js — idempotently add/remove one dependency in a
 * package.json used by the installers. Never touches existing version specs.
 *
 * Usage: node merge-package-dep.js <package.json> <add|remove> <name> [version]
 * Exit codes: 0 ok (message on stdout), 1 bad usage, 2 malformed JSON.
 *
 * - add: creates the file when missing; adds the dep only when absent
 *   (an existing spec, even a different version, is left untouched).
 * - remove: deletes the dep key when present; deletes the whole file when
 *   the result would be an empty `{}` object.
 */
const fs = require('fs');

const [pkgPath, action, name, version] = process.argv.slice(2);
if (!pkgPath || (action !== 'add' && action !== 'remove') || !name || (action === 'add' && !version)) {
  console.error('Usage: node merge-package-dep.js <package.json> <add|remove> <name> [version]');
  process.exit(1);
}

const existed = fs.existsSync(pkgPath);
let pkg = null;
if (existed) {
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    console.error(`Refusing to modify malformed JSON (fix it first): ${pkgPath}`);
    process.exit(2);
  }
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
    console.error(`Refusing to modify non-object JSON: ${pkgPath}`);
    process.exit(2);
  }
} else {
  if (action === 'remove') {
    console.log('package.json absent (ok)');
    process.exit(0);
  }
  pkg = {};
}

if (!pkg.dependencies || typeof pkg.dependencies !== 'object' || Array.isArray(pkg.dependencies)) {
  pkg.dependencies = {};
}

if (action === 'add') {
  if (Object.prototype.hasOwnProperty.call(pkg.dependencies, name)) {
    console.log(`dependency already present (${name}@${pkg.dependencies[name]}), left untouched`);
    process.exit(0);
  }
  pkg.dependencies[name] = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`added ${name}@${version} to ${pkgPath}`);
} else {
  if (!Object.prototype.hasOwnProperty.call(pkg.dependencies, name)) {
    console.log('dependency absent (ok)');
    process.exit(0);
  }
  delete pkg.dependencies[name];
  if (Object.keys(pkg.dependencies).length === 0) delete pkg.dependencies;
  if (Object.keys(pkg).length === 0) {
    fs.rmSync(pkgPath);
    console.log('removed empty package.json');
    process.exit(0);
  }
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`removed ${name} from ${pkgPath}`);
}
