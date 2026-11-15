const fs = require('node:fs');
const path = require('node:path');

const cliRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(cliRoot, '..', '..');

const COMMON_IGNORE = new Set([
  'node_modules',
  'target',
  '.git',
  'bun.lock',
  'bun.lockb',
  'package-lock.json',
  'gen',
  'payload',
  '.tci',
  '.tci-sdk',
  '.payload_staging',
]);

function copyFilteredDir(src, dest, extraIgnore = new Set()) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (COMMON_IGNORE.has(entry.name) || extraIgnore.has(entry.name)) {
      continue;
    }
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyFilteredDir(s, d, extraIgnore);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

// 1. Sync /templates into packages/cli/templates so `npm pack` / `npm publish` includes them
const rootTemplates = path.join(repoRoot, 'templates');
const cliTemplates = path.join(cliRoot, 'templates');
if (fs.existsSync(rootTemplates)) {
  fs.rmSync(cliTemplates, { recursive: true, force: true });
  copyFilteredDir(rootTemplates, cliTemplates, new Set(['dist']));
}

// 2. Sync packages/client, packages/core, and prebuilt tci-runtime.exe (if present) into packages/cli/vendor
const vendorDir = path.join(cliRoot, 'vendor');
fs.rmSync(vendorDir, { recursive: true, force: true });
copyFilteredDir(
  path.join(repoRoot, 'packages', 'client'),
  path.join(vendorDir, 'client'),
  new Set(['tests', 'src'])
);
copyFilteredDir(
  path.join(repoRoot, 'packages', 'core'),
  path.join(vendorDir, 'core'),
  new Set(['dist', 'tests'])
);

const runtimeExe = path.join(repoRoot, 'target', 'release', 'tci-runtime.exe');
if (fs.existsSync(runtimeExe)) {
  const vendorRuntimeDir = path.join(vendorDir, 'runtime');
  fs.mkdirSync(vendorRuntimeDir, { recursive: true });
  fs.copyFileSync(runtimeExe, path.join(vendorRuntimeDir, 'tci-runtime.exe'));
}
