import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { detectAppConfig } from '../utils/config';
import {
  AVAILABLE_TEMPLATES,
  copyDirSync,
  ensureProjectGitignore,
  ensureRootPackageScripts,
  getCliPackageVersion,
  normalizeTemplateName,
  resolveTemplateDir,
  syncInstallerMetadataAndSdk,
  writeInstallerAgentsMd,
} from './init';

export interface UpgradeOptions {
  template?: string;
  resetUi?: boolean;
  dryRun?: boolean;
  yes?: boolean;
}

function detectInstalledTemplate(targetDir: string, tciTemplate?: unknown): string {
  if (typeof tciTemplate === 'string' && tciTemplate.trim().length > 0) {
    return normalizeTemplateName(tciTemplate);
  }
  const pkgPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (deps.three) return 'futuristic-3d';
      if (deps.react) return 'react';
      if (deps.svelte) return 'svelte';
      if (deps.vue) return 'vue';
    } catch {
      // ignore
    }
  }
  return 'vanilla';
}

export async function runUpgrade(options: UpgradeOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const targetDir = path.join(cwd, 'installer');
  const cliVersion = getCliPackageVersion();

  console.log(pc.cyan(`\n🔄 Upgrading Tauri Custom Installer workspace to v${cliVersion}...\n`));

  if (!fs.existsSync(targetDir)) {
    console.error(pc.red(`❌ Directory 'installer/' was not found in ${cwd}.`));
    console.error(pc.gray(`Run \`tci init\` first to create an installer.\n`));
    process.exit(1);
  }

  const tciConfigPath = path.join(cwd, 'tci.config.json');
  let rawTciConfig: Record<string, unknown> = {};
  if (fs.existsSync(tciConfigPath)) {
    try {
      rawTciConfig = JSON.parse(fs.readFileSync(tciConfigPath, 'utf8'));
    } catch {
      console.log(pc.yellow(`⚠️  Could not parse existing tci.config.json; skipping config update.`));
    }
  }

  const template = options.template
    ? normalizeTemplateName(options.template)
    : detectInstalledTemplate(targetDir, rawTciConfig.template);

  const templateDir = resolveTemplateDir(cwd, template);
  if (!templateDir) {
    console.error(pc.red(`❌ Template '${template}' not found.`));
    console.error(pc.gray(`Available templates: ${AVAILABLE_TEMPLATES.join(', ')}\n`));
    process.exit(1);
  }

  const appConfig = detectAppConfig(cwd);
  const actions: string[] = [
    `Template baseline: ${template}`,
    `Sync @tauri-custom-installer/client SDK & tauri-custom-installer-core (v${cliVersion})`,
    `Sync installer/src/installer.config.json, Cargo.toml, and tauri.conf.json (${appConfig.appName} v${appConfig.version})`,
    `Refresh installer/src-tauri/build.rs and capabilities/`,
    `Update installer/AGENTS.md, .gitignore, and package.json installer scripts`,
  ];

  if (options.resetUi) {
    actions.push(`Reset UI files (installer/src/, index.html, frontend config) from '${template}' template`);
  } else {
    actions.push(`Preserve existing custom UI files under installer/src/`);
  }

  if (options.dryRun) {
    console.log(pc.yellow(`🧪 Dry-run mode enabled — planned upgrade actions:`));
    for (const step of actions) {
      console.log(`  • ${step}`);
    }
    console.log();
    return;
  }

  if (options.resetUi) {
    for (const rel of ['index.html', 'package.json', 'vite.config.ts', 'tsconfig.json', 'src']) {
      const srcPath = path.join(templateDir, rel);
      const destPath = path.join(targetDir, rel);
      if (!fs.existsSync(srcPath)) continue;
      if (fs.statSync(srcPath).isDirectory()) {
        copyDirSync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  // Sync template Rust runtime glue (build.rs, capabilities, src/main.rs) cleanly
  for (const rel of [
    path.join('src-tauri', 'build.rs'),
    path.join('src-tauri', 'capabilities'),
    path.join('src-tauri', 'src', 'main.rs'),
  ]) {
    const srcPath = path.join(templateDir, rel);
    const destPath = path.join(targetDir, rel);
    if (!fs.existsSync(srcPath)) continue;
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  }

  // Record detected template in tci.config.json if absent
  if (fs.existsSync(tciConfigPath) && typeof rawTciConfig === 'object' && !rawTciConfig.template) {
    try {
      const updated = { template, ...rawTciConfig };
      fs.writeFileSync(tciConfigPath, JSON.stringify(updated, null, 2));
    } catch {
      // ignore
    }
  }

  syncInstallerMetadataAndSdk(cwd, targetDir, appConfig, true);
  writeInstallerAgentsMd(targetDir, template);
  ensureProjectGitignore(cwd);
  ensureRootPackageScripts(cwd);

  console.log(pc.green(`✔ Installer workspace upgraded (${template})`));
  console.log(pc.gray(`  App: ${appConfig.appName} v${appConfig.version} (${appConfig.identifier})`));
  if (options.resetUi) {
    console.log(pc.yellow(`  UI reset from template '${template}'. Re-install UI dependencies if needed.`));
  } else {
    console.log(pc.gray(`  Custom UI under installer/src/ was preserved (pass --reset-ui to overwrite).`));
  }
  console.log();
}
