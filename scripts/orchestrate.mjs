#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const modeArg = args.find((a) => !a.startsWith('-')) || 'all';
const validModes = new Set(['clean', 'sync', 'audit', 'audit:ui', 'audit:diff', 'verify', 'all']);

if (!validModes.has(modeArg)) {
  console.error(
    `Unknown mode '${modeArg}'. Usage: node scripts/orchestrate.mjs [clean|sync|audit|audit:ui|audit:diff|verify|all] [--dry-run]`
  );
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listTemplateDirs() {
  const templatesRoot = path.join(ROOT, 'templates');
  if (!fs.existsSync(templatesRoot)) return [];
  return fs
    .readdirSync(templatesRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getPathSize(target) {
  try {
    const st = fs.lstatSync(target);
    if (st.isSymbolicLink()) return 0;
    if (!st.isDirectory()) return st.size;
    let sum = 0;
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      sum += getPathSize(path.join(target, entry.name));
    }
    return sum;
  } catch {
    return 0;
  }
}

function pruneEmptyDirs(dir, protectedNames) {
  let removed = 0;
  if (!fs.existsSync(dir)) return 0;
  const st = fs.lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink()) return 0;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (protectedNames.has(entry.name) || entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      removed += pruneEmptyDirs(path.join(dir, entry.name), protectedNames);
    }
  }

  if (dir !== ROOT && !protectedNames.has(path.basename(dir))) {
    try {
      const remaining = fs.readdirSync(dir);
      if (remaining.length === 0) {
        if (!dryRun) {
          fs.rmdirSync(dir);
        }
        console.log(`  ${dryRun ? '[dry-run] ' : ''}Pruned empty directory: ${path.relative(ROOT, dir)}`);
        removed++;
      }
    } catch {
      // ignore
    }
  }
  return removed;
}

function runClean() {
  console.log(`\n[orchestrate:clean] Scanning disposable build/staging artifacts${dryRun ? ' (dry-run)' : ''}...`);
  const candidates = [];

  for (const tpl of listTemplateDirs()) {
    for (const sub of [
      'dist',
      path.join('src-tauri', 'gen'),
      path.join('src-tauri', 'payload'),
      '.tci',
      '.tci-sdk',
      '.payload_staging',
    ]) {
      candidates.push(path.join(ROOT, 'templates', tpl, sub));
    }
  }

  const sampleDir = path.join(ROOT, 'examples', 'sample-tauri-app');
  if (fs.existsSync(sampleDir)) {
    candidates.push(
      path.join(sampleDir, 'dist'),
      path.join(sampleDir, 'src-tauri', 'gen'),
      path.join(sampleDir, 'installer', 'dist'),
      path.join(sampleDir, 'installer', 'src-tauri', 'gen'),
      path.join(sampleDir, 'installer', 'src-tauri', 'payload'),
      path.join(sampleDir, 'installer', '.tci'),
      path.join(sampleDir, 'installer', '.tci-sdk'),
      path.join(sampleDir, 'installer', '.payload_staging')
    );
  }

  let removedCount = 0;
  let reclaimed = 0;

  for (const abs of candidates) {
    if (!fs.existsSync(abs)) continue;
    const st = fs.lstatSync(abs);
    if (st.isSymbolicLink()) continue;
    const size = getPathSize(abs);
    reclaimed += size;
    removedCount++;
    const rel = path.relative(ROOT, abs);
    if (dryRun) {
      console.log(`  [dry-run] Would remove ${rel} (${formatBytes(size)})`);
    } else {
      fs.rmSync(abs, { recursive: true, force: true });
      console.log(`  ✔ Removed ${rel} (${formatBytes(size)})`);
    }
  }

  const pruned = pruneEmptyDirs(
    ROOT,
    new Set(['.git', 'node_modules', 'target', 'templates', 'packages', 'assets', 'docs'])
  );

  if (removedCount === 0 && pruned === 0) {
    console.log('  ✔ No stale artifacts or empty directories found.');
  } else {
    console.log(
      `  ✔ Clean finished (${removedCount} artifact path(s), ~${formatBytes(reclaimed)}, ${pruned} empty dir(s)).`
    );
  }
}

function getManagedManifests() {
  const templates = listTemplateDirs();
  const packageJsons = [
    'packages/cli/package.json',
    'packages/client/package.json',
    ...templates.map((t) => `templates/${t}/package.json`),
  ];
  const sampleInstallerPkg = 'examples/sample-tauri-app/installer/package.json';
  if (fs.existsSync(path.join(ROOT, sampleInstallerPkg))) {
    packageJsons.push(sampleInstallerPkg);
  }

  const cargoTomls = [
    'packages/core/Cargo.toml',
    'packages/runtime/Cargo.toml',
    ...templates.map((t) => `templates/${t}/src-tauri/Cargo.toml`),
  ];
  const sampleInstallerCargo = 'examples/sample-tauri-app/installer/src-tauri/Cargo.toml';
  if (fs.existsSync(path.join(ROOT, sampleInstallerCargo))) {
    cargoTomls.push(sampleInstallerCargo);
  }

  return { packageJsons, cargoTomls };
}

function updateCargoPackageField(content, key, newValue) {
  // Scope replacement strictly inside `[package]` header block so dependency versions are untouched
  return content.replace(/(\[package\][\s\S]*?(?=\n\[|$))/, (pkgSection) => {
    const re = new RegExp(`^(${key}\\s*=\\s*")[^"]*(")`, 'm');
    if (re.test(pkgSection)) {
      return pkgSection.replace(re, `$1${newValue}$2`);
    }
    return pkgSection;
  });
}

function readCargoPackageField(content, key) {
  const pkgMatch = content.match(/\[package\]([\s\S]*?)(?=\n\[|$)/);
  if (!pkgMatch) return null;
  const re = new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm');
  const m = pkgMatch[1].match(re);
  return m ? m[1] : null;
}

function runSync() {
  const rootPkg = readJson(path.join(ROOT, 'package.json'));
  const targetVersion = rootPkg.version;
  const repoGitUrl = rootPkg.repository?.url || 'https://github.com/kmaksuut/tauri-custom-installer.git';
  const repoWebUrl = repoGitUrl.replace(/\.git$/, '');

  console.log(
    `\n[orchestrate:sync] Synchronizing canonical version (${targetVersion}) & repo (${repoWebUrl})${dryRun ? ' (dry-run)' : ''}...`
  );

  const { packageJsons, cargoTomls } = getManagedManifests();
  let updated = 0;

  for (const rel of packageJsons) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const raw = fs.readFileSync(abs, 'utf8');
    const pkg = JSON.parse(raw);
    let changed = false;

    if (pkg.version !== targetVersion) {
      pkg.version = targetVersion;
      changed = true;
    }
    if (pkg.repository && typeof pkg.repository === 'object' && pkg.repository.url !== repoGitUrl) {
      pkg.repository.url = repoGitUrl;
      changed = true;
    }

    if (changed) {
      updated++;
      if (dryRun) {
        console.log(`  [dry-run] Would sync ${rel}`);
      } else {
        fs.writeFileSync(abs, JSON.stringify(pkg, null, 2) + '\n');
        console.log(`  ✔ Synced ${rel}`);
      }
    }
  }

  for (const rel of cargoTomls) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const raw = fs.readFileSync(abs, 'utf8');
    let next = updateCargoPackageField(raw, 'version', targetVersion);
    if (readCargoPackageField(next, 'repository') !== null) {
      next = updateCargoPackageField(next, 'repository', repoWebUrl);
    }

    if (next !== raw) {
      updated++;
      if (dryRun) {
        console.log(`  [dry-run] Would sync ${rel}`);
      } else {
        fs.writeFileSync(abs, next);
        console.log(`  ✔ Synced ${rel}`);
      }
    }
  }

  if (updated === 0) {
    console.log('  ✔ All npm and Cargo manifests are already synchronized.');
  }
}

function collectFilesRecursive(dir, exts) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'target') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFilesRecursive(full, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

function stripRustComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function collectUiAuditIssues(templates) {
  const errors = [];
  for (const tpl of templates) {
    const tplRoot = path.join(ROOT, 'templates', tpl);
    const readmePath = path.join(tplRoot, 'README.md');
    if (!fs.existsSync(readmePath) || fs.readFileSync(readmePath, 'utf8').trim().length < 50) {
      errors.push(`Template '${tpl}' missing detailed README.md`);
    }

    const srcFiles = collectFilesRecursive(path.join(tplRoot, 'src'), ['.ts', '.tsx', '.svelte', '.vue']);
    const indexHtml = fs.existsSync(path.join(tplRoot, 'index.html'))
      ? fs.readFileSync(path.join(tplRoot, 'index.html'), 'utf8')
      : '';
    const combinedSrc = srcFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n') + '\n' + indexHtml;

    if (!combinedSrc.includes('@tauri-custom-installer/client')) {
      errors.push(`Template '${tpl}' does not import '@tauri-custom-installer/client'`);
    }

    const usesManagedStore =
      combinedSrc.includes('createInstallerStore') || combinedSrc.includes('useInstaller');
    if (!usesManagedStore && !combinedSrc.includes('validateInstallPath')) {
      errors.push(`Template '${tpl}' does not validate installation paths via SDK`);
    }
    if (!usesManagedStore && !combinedSrc.includes('checkRunning')) {
      errors.push(`Template '${tpl}' does not check running processes via SDK`);
    }

    const lower = combinedSrc.toLowerCase();
    for (const marker of ['welcome', 'installing', 'completed', 'uninstall']) {
      if (!lower.includes(marker)) {
        errors.push(`Template '${tpl}' is missing UI flow handler for '${marker}'`);
      }
    }
    if (!lower.includes('error')) {
      errors.push(`Template '${tpl}' is missing visible error state handling`);
    }

    if (tpl === 'futuristic-3d') {
      const threeCanvasPath = path.join(tplRoot, 'src', 'components', 'ThreeCanvas.tsx');
      if (!fs.existsSync(threeCanvasPath)) {
        errors.push(`Template 'futuristic-3d' missing src/components/ThreeCanvas.tsx`);
      } else {
        const tc = fs.readFileSync(threeCanvasPath, 'utf8');
        if (!tc.includes('try') || !tc.includes('WebGLRenderer') || !tc.includes('Math.max(')) {
          errors.push(`Template 'futuristic-3d' ThreeCanvas.tsx must wrap WebGLRenderer in try/catch and clamp height`);
        }
      }
    }
  }
  return errors;
}

function runAuditUi() {
  console.log('\n[orchestrate:audit:ui] Auditing all UI templates for state parity, READMEs, and WebGL guards...');
  const templates = listTemplateDirs();
  const errors = collectUiAuditIssues(templates);
  if (errors.length > 0) {
    console.error(`\n❌ UI audit failed with ${errors.length} issue(s):`);
    for (const err of errors) {
      console.error(`  • ${err}`);
    }
    process.exit(1);
  }
  console.log(`  ✔ All ${templates.length} UI templates passed parity, README, and safety checks.`);
}

function scanDiffAndSecrets() {
  const errors = [];
  const forbiddenFileRe = /\.(pfx|p12|key|env)(\.pem|\.local)?$/i;
  const gitStatus = spawnSync('git', ['status', '--porcelain'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
  });
  if (gitStatus.status === 0) {
    for (const line of gitStatus.stdout.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const rel = trimmed.slice(2).trim();
      if (forbiddenFileRe.test(rel) || rel.startsWith('certs/')) {
        errors.push(`Sensitive secret/certificate file in workspace status: ${rel}`);
      }
    }
  }

  const trackedList = spawnSync('git', ['ls-files'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
  });
  if (trackedList.status === 0) {
    for (const rel of trackedList.stdout.split(/\r?\n/)) {
      if (!rel) continue;
      if (forbiddenFileRe.test(rel) || rel.startsWith('certs/')) {
        errors.push(`Tracked sensitive file must not be in git: ${rel}`);
      }
    }
  }

  const gitDiff = spawnSync('git', ['diff', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
  });
  if (gitDiff.status === 0 && gitDiff.stdout) {
    for (const line of gitDiff.stdout.split(/\r?\n/)) {
      if (!line.startsWith('+') || line.startsWith('+++')) continue;
      if (/-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/.test(line)) {
        errors.push('Detected private key PEM material inside git diff');
      }
    }
  }

  // Ensure CLI and template frontend sources avoid unsafe dynamic code evaluation
  for (const rootRel of ['packages/cli/src', ...listTemplateDirs().map((t) => `templates/${t}/src`)]) {
    const files = collectFilesRecursive(path.join(ROOT, rootRel), ['.ts', '.tsx', '.svelte', '.vue']);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      if (/\beval\s*\(/.test(content) || /\bnew\s+Function\s*\(/.test(content)) {
        errors.push(`Unsafe dynamic evaluation found in ${path.relative(ROOT, file)}`);
      }
    }
  }

  return errors;
}

function collectCoreAndRepoAuditIssues() {
  const errors = [];

  const rootPkg = readJson(path.join(ROOT, 'package.json'));
  const expectedVersion = rootPkg.version;
  const repoGitUrl = rootPkg.repository?.url || '';
  const repoWebUrl = repoGitUrl.replace(/\.git$/, '');
  const { packageJsons, cargoTomls } = getManagedManifests();

  // 1. Version & Repository Parity
  for (const rel of packageJsons) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      errors.push(`Missing package manifest: ${rel}`);
      continue;
    }
    const pkg = readJson(abs);
    if (pkg.version !== expectedVersion) {
      errors.push(`Version mismatch in ${rel}: found '${pkg.version}', expected '${expectedVersion}' (run orchestrate:sync)`);
    }
    if (pkg.repository?.url && pkg.repository.url !== repoGitUrl) {
      errors.push(`Repository mismatch in ${rel}: found '${pkg.repository.url}', expected '${repoGitUrl}'`);
    }
  }

  for (const rel of cargoTomls) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      errors.push(`Missing Cargo manifest: ${rel}`);
      continue;
    }
    const raw = fs.readFileSync(abs, 'utf8');
    const ver = readCargoPackageField(raw, 'version');
    if (ver !== expectedVersion) {
      errors.push(`Cargo version mismatch in ${rel}: found '${ver}', expected '${expectedVersion}' (run orchestrate:sync)`);
    }
    const repo = readCargoPackageField(raw, 'repository');
    if (repo !== null && repo !== repoWebUrl) {
      errors.push(`Cargo repository mismatch in ${rel}: found '${repo}', expected '${repoWebUrl}'`);
    }
    const homepage = readCargoPackageField(raw, 'homepage');
    if (homepage !== null && homepage !== repoWebUrl) {
      errors.push(`Cargo homepage mismatch in ${rel}: found '${homepage}', expected '${repoWebUrl}'`);
    }
  }

  // 2. Security Invariants in packages/core/src
  const coreChecks = [
    { file: 'packages/core/src/extractor.rs', patterns: ['get_authoritative_manifest', 'sanitize_archive_entry_path', 'MAX_SINGLE_FILE_BYTES', 'MAX_TOTAL_EXTRACTED_BYTES', 'is_reparse_point'] },
    { file: 'packages/core/src/uninstaller.rs', patterns: ['pub fn is_reparse_point', 'is_dangerous_install_path', 'has_tci_artifacts'] },
    { file: 'packages/core/src/commands.rs', patterns: ['get_authoritative_manifest', 'is_allowed_hook_registry_key', 'has_reparse_ancestor', 'remove_stale_registrations', 'install_certificate_file'] },
    { file: 'packages/core/src/certs.rs', patterns: ['normalize_allowed_store', 'parse_certificate_bytes', 'verify_cert_thumbprint', 'is_reparse_point', 'is_dry_run'] },
    { file: 'packages/core/src/footer.rs', patterns: ['TCI_FOOTER_MAGIC_V2', 'transform_armor_bytes'] },
    { file: 'packages/core/src/lib.rs', patterns: ['percent_decode_path', 'sanitize_archive_entry_path'] },
    { file: 'packages/core/src/models.rs', patterns: ['#[serde(default)]'] },
  ];

  for (const chk of coreChecks) {
    const abs = path.join(ROOT, chk.file);
    if (!fs.existsSync(abs)) {
      errors.push(`Missing Rust core file: ${chk.file}`);
      continue;
    }
    const src = fs.readFileSync(abs, 'utf8');
    for (const pat of chk.patterns) {
      if (!src.includes(pat)) {
        errors.push(`Security/compatibility invariant '${pat}' missing from ${chk.file}`);
      }
    }
  }

  // Ensure OS integration modules never shell out to scripting engines
  for (const rel of [
    'packages/core/src/shortcuts.rs',
    'packages/core/src/registry.rs',
    'packages/core/src/certs.rs',
    'packages/core/src/disk.rs',
    'packages/core/src/process.rs',
    'packages/core/src/uninstaller.rs',
  ]) {
    const codeOnly = stripRustComments(fs.readFileSync(path.join(ROOT, rel), 'utf8')).toLowerCase();
    for (const forbidden of ['powershell', 'cmd.exe', 'wscript', 'cscript', 'certutil']) {
      if (codeOnly.includes(forbidden)) {
        errors.push(`Forbidden shell tool '${forbidden}' referenced in ${rel}`);
      }
    }
  }

  // 3. Template Parity, READMEs & CLI Registration
  const templates = listTemplateDirs();
  const initTs = fs.readFileSync(path.join(ROOT, 'packages', 'cli', 'src', 'commands', 'init.ts'), 'utf8');
  for (const tpl of templates) {
    const tplRoot = path.join(ROOT, 'templates', tpl);
    for (const req of [
      'README.md',
      'index.html',
      'package.json',
      'src/installer.config.json',
      'src-tauri/Cargo.toml',
      'src-tauri/tauri.conf.json',
      'src-tauri/build.rs',
      'src-tauri/src/main.rs',
      'src-tauri/capabilities/default.json',
    ]) {
      if (!fs.existsSync(path.join(tplRoot, req))) {
        errors.push(`Template '${tpl}' missing required file: ${req}`);
      }
    }
    if (!initTs.includes(`'${tpl}'`)) {
      errors.push(`Template '${tpl}' is not registered in packages/cli/src/commands/init.ts`);
    }
  }
  errors.push(...collectUiAuditIssues(templates));

  // 4. Cross-AI Contributor Tooling
  for (const aiFile of [
    'AGENTS.md',
    'CLAUDE.md',
    '.cursor/rules/tauri-custom-installer.mdc',
    '.github/copilot-instructions.md',
    '.agents/skills/tci-orchestrator/SKILL.md',
    '.agents/skills/tci-template-author/SKILL.md',
    '.agents/skills/tci-security-auditor/SKILL.md',
    '.agents/skills/tci-ui-expert/SKILL.md',
    '.agents/skills/tci-test-engineer/SKILL.md',
  ]) {
    const abs = path.join(ROOT, aiFile);
    if (!fs.existsSync(abs) || fs.readFileSync(abs, 'utf8').trim().length < 50) {
      errors.push(`Missing or empty AI tooling file: ${aiFile}`);
    }
  }

  // 5. Tarball & Packaging Hygiene
  for (const npmignoreRel of ['.npmignore', 'packages/cli/.npmignore']) {
    const abs = path.join(ROOT, npmignoreRel);
    if (!fs.existsSync(abs)) {
      errors.push(`Missing ${npmignoreRel}`);
    } else {
      const content = fs.readFileSync(abs, 'utf8');
      for (const rule of ['templates/*/dist/', 'templates/*/node_modules/', 'templates/*/src-tauri/gen/', 'templates/*/src-tauri/payload/', '*.pfx', '*.key.pem']) {
        if (!content.includes(rule)) {
          errors.push(`${npmignoreRel} is missing ignore rule '${rule}'`);
        }
      }
    }
  }

  for (const tpl of templates) {
    if (fs.existsSync(path.join(ROOT, 'templates', tpl, '.payload_staging'))) {
      errors.push(`Stale staging directory present: templates/${tpl}/.payload_staging (run orchestrate:clean)`);
    }
  }

  errors.push(...scanDiffAndSecrets());
  return { errors, manifestCount: packageJsons.length + cargoTomls.length, templateCount: templates.length };
}

function runAudit() {
  console.log('\n[orchestrate:audit] Running security, manifest parity, template, and hygiene audits...');
  const { errors, manifestCount, templateCount } = collectCoreAndRepoAuditIssues();

  if (errors.length > 0) {
    console.error(`\n❌ Audit failed with ${errors.length} issue(s):`);
    for (const err of errors) {
      console.error(`  • ${err}`);
    }
    process.exit(1);
  }

  console.log(`  ✔ All ${manifestCount} manifests, ${templateCount} templates, security invariants, AI docs, and hygiene checks passed!`);
}

function runAuditDiff() {
  console.log('\n[orchestrate:audit:diff] Auditing git diff, secret/certificate hygiene, and security invariants...');
  const { errors, manifestCount, templateCount } = collectCoreAndRepoAuditIssues();
  if (errors.length > 0) {
    console.error(`\n❌ Diff & security audit failed with ${errors.length} issue(s):`);
    for (const err of errors) {
      console.error(`  • ${err}`);
    }
    process.exit(1);
  }
  console.log(`  ✔ Diff, secret scan, ${manifestCount} manifests, ${templateCount} templates, and all security invariants passed!`);
}

function execStep(label, cmd, stepArgs, cwd = ROOT) {
  console.log(`\n  → ${label}: ${cmd} ${stepArgs.join(' ')}`);
  const res = spawnSync(cmd, stepArgs, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (res.status !== 0) {
    throw new Error(`Step failed (${label}) with exit code ${res.status}`);
  }
}

function verifyPackCleanliness(pkgRelDir) {
  const cwd = path.join(ROOT, pkgRelDir);
  const res = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts', '--loglevel=error'], {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (res.status !== 0) {
    throw new Error(`npm pack --dry-run failed in ${pkgRelDir || '.'}: ${res.stderr}`);
  }
  const firstBrace = res.stdout.indexOf('{');
  const firstBracket = res.stdout.indexOf('[');
  let jsonStart = -1;
  let jsonEnd = -1;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    jsonStart = firstBrace;
    jsonEnd = res.stdout.lastIndexOf('}');
  } else if (firstBracket !== -1) {
    jsonStart = firstBracket;
    jsonEnd = res.stdout.lastIndexOf(']');
  }
  if (jsonStart === -1 || jsonEnd <= jsonStart) {
    throw new Error(`Unexpected npm pack --json output in ${pkgRelDir || '.'}`);
  }
  const parsed = JSON.parse(res.stdout.slice(jsonStart, jsonEnd + 1));
  const packInfo = Array.isArray(parsed)
    ? parsed[0]
    : Array.isArray(parsed?.files)
      ? parsed
      : Object.values(parsed || {})[0];
  const files = (packInfo?.files || []).map((f) => f.path);
  const bad = files.filter(
    (p) =>
      /^templates\/[^/]+\/(dist|node_modules|src-tauri\/gen|src-tauri\/payload|src-tauri\/target)\//.test(p) ||
      /^vendor\/(core\/target|client\/tests)\//.test(p)
  );
  if (bad.length > 0) {
    throw new Error(
      `Clean tarball check failed in ${pkgRelDir || '.'}: unexpected artifact(s): ${bad.slice(0, 5).join(', ')}`
    );
  }
  console.log(`  ✔ Clean tarball verified for ${pkgRelDir || 'root'} (${files.length} files, ${formatBytes(packInfo?.unpackedSize || 0)} unpacked)`);
}

function runVerify() {
  console.log('\n[orchestrate:verify] Building packages, running test suites, and checking npm tarballs...');
  execStep('Build Client SDK', 'npm', ['--prefix', 'packages/client', 'run', 'build']);
  execStep('Test Client SDK', 'npm', ['--prefix', 'packages/client', 'run', 'test']);
  execStep('Build CLI Toolkit', 'npm', ['--prefix', 'packages/cli', 'run', 'build']);
  execStep('Test CLI Toolkit', 'npm', ['--prefix', 'packages/cli', 'run', 'test']);
  const localTsc = path.join(ROOT, 'packages', 'cli', 'node_modules', 'typescript', 'bin', 'tsc');
  if (fs.existsSync(localTsc)) {
    execStep('Typecheck Vanilla Template', 'node', [localTsc, '-p', 'templates/vanilla/tsconfig.json', '--noEmit']);
  }
  execStep('Test Rust Core', 'cargo', ['test', '--package', 'tauri-custom-installer-core']);
  verifyPackCleanliness('.');
  verifyPackCleanliness('packages/cli');
  console.log('\n  ✔ Full verification suite passed.');
}

async function main() {
  if (modeArg === 'clean') {
    runClean();
  } else if (modeArg === 'sync') {
    runSync();
  } else if (modeArg === 'audit') {
    runAudit();
  } else if (modeArg === 'audit:ui') {
    runAuditUi();
  } else if (modeArg === 'audit:diff') {
    runAuditDiff();
  } else if (modeArg === 'verify') {
    runVerify();
  } else {
    runClean();
    runSync();
    runAudit();
    runVerify();
  }
}

main().catch((err) => {
  console.error(`\n❌ Orchestrator failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
