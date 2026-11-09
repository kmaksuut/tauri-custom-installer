const fs = require('node:fs');
const path = require('node:path');

const cliRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(cliRoot, '..', '..');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (
      entry.name === 'node_modules' ||
      entry.name === 'target' ||
      entry.name === 'dist' ||
      entry.name === '.git' ||
      entry.name === 'bun.lock' ||
      entry.name === 'bun.lockb' ||
      entry.name === 'gen'
    ) {
      continue;
    }
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function copyDirIncludeDist(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (
      entry.name === 'node_modules' ||
      entry.name === 'target' ||
      entry.name === '.git' ||
      entry.name === 'bun.lock' ||
      entry.name === 'bun.lockb'
    ) {
      continue;
    }
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirIncludeDist(s, d);
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
  copyDir(rootTemplates, cliTemplates);
}

// 2. Sync packages/client and packages/core into packages/cli/vendor for standalone external installs
const vendorDir = path.join(cliRoot, 'vendor');
fs.rmSync(vendorDir, { recursive: true, force: true });
copyDirIncludeDist(path.join(repoRoot, 'packages', 'client'), path.join(vendorDir, 'client'));
copyDir(path.join(repoRoot, 'packages', 'core'), path.join(vendorDir, 'core'));
