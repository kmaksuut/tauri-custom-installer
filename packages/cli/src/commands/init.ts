import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import pc from 'picocolors';
import { type AppConfig, detectAppConfig, detectPackageManager } from '../utils/config';

export const AVAILABLE_TEMPLATES = [
  'react',
  'futuristic-3d',
  'svelte',
  'vue',
  'vanilla',
] as const;

export interface InitOptions {
  template?: string;
  name?: string;
  mode?: 'perUser' | 'perMachine' | 'both';
  yes?: boolean;
  force?: boolean;
}

const IGNORED_COPY_ENTRIES = new Set([
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

function promptChoice(question: string, choices: string[], defaultIndex = 0): Promise<string> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve(choices[defaultIndex]);
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(pc.bold(question));
    choices.forEach((c, idx) => {
      const isDefault = idx === defaultIndex;
      console.log(`  ${pc.cyan(`${idx + 1})`)} ${c} ${isDefault ? pc.gray('(default)') : ''}`);
    });

    rl.question(pc.yellow(`Enter choice [1-${choices.length}]: `), (answer) => {
      rl.close();
      const num = parseInt(answer.trim(), 10);
      if (!isNaN(num) && num >= 1 && num <= choices.length) {
        resolve(choices[num - 1]);
      } else {
        resolve(choices[defaultIndex]);
      }
    });
  });
}

export function normalizeTemplateName(template: string): string {
  const lower = template.trim().toLowerCase();
  if (
    lower === '3d' ||
    lower === 'gaming' ||
    lower === 'gaming-3d' ||
    lower === 'three' ||
    lower === 'threejs' ||
    lower === 'futuristic'
  ) {
    return 'futuristic-3d';
  }
  return lower;
}

export function getCliRootDir(): string {
  const candidates = [
    path.resolve(__dirname, '..', '..'),
    path.resolve(__dirname, '..'),
    __dirname,
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
  }
  return path.resolve(__dirname, '..', '..');
}

export function getCliPackageVersion(): string {
  try {
    const pkgPath = path.join(getCliRootDir(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (typeof pkg.version === 'string' && pkg.version.trim().length > 0) {
        return pkg.version.trim();
      }
    }
  } catch {
    // ignore
  }
  return '0.2.0';
}

export function findDirUpwards(startDir: string, subPath: string): string | null {
  let curr = path.resolve(startDir);
  while (curr) {
    const candidate = path.join(curr, subPath);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return null;
}

export function resolveTemplateDir(cwd: string, template: string): string | null {
  const cliRoot = getCliRootDir();
  const packagedTemplateDir = path.join(cliRoot, 'templates', template);
  if (fs.existsSync(packagedTemplateDir)) {
    return packagedTemplateDir;
  }
  return (
    findDirUpwards(__dirname, path.join('templates', template)) ||
    findDirUpwards(cwd, path.join('templates', template))
  );
}

export function ensureProjectGitignore(cwd: string): void {
  const gitignorePath = path.join(cwd, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    return;
  }
  const gi = fs.readFileSync(gitignorePath, 'utf8');
  const additions: string[] = [];
  for (const entry of [
    '.tci/',
    'installer/.payload_staging/',
    'installer/src-tauri/payload/',
    'certs/',
    '*.pfx',
    '*.p12',
    '*.key',
    '*.key.pem',
  ]) {
    if (!gi.includes(entry)) {
      additions.push(entry);
    }
  }
  if (additions.length > 0) {
    fs.writeFileSync(gitignorePath, `${gi.trimEnd()}\n${additions.join('\n')}\n`);
  }
}

export function ensureRootPackageScripts(cwd: string): boolean {
  const rootPkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(rootPkgPath)) {
    return false;
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
    pkg.scripts = pkg.scripts || {};
    let changed = false;
    const defaults: Record<string, string> = {
      'installer:dev': 'tauri-custom-installer dev',
      'installer:build': 'tauri-custom-installer build',
      'installer:upgrade': 'tauri-custom-installer upgrade',
      'installer:clean': 'tauri-custom-installer clean',
    };
    for (const [k, v] of Object.entries(defaults)) {
      if (!pkg.scripts[k]) {
        pkg.scripts[k] = v;
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(rootPkgPath, JSON.stringify(pkg, null, 2));
    }
    return changed;
  } catch {
    return false;
  }
}

export function writeInstallerAgentsMd(targetDir: string, templateName: string): void {
  const lines = [
    '# Installer Workspace Guide (AI & Developers)',
    '',
    `This \`./installer\` directory was scaffolded by \`tauri-custom-installer\` using the \`${templateName}\` template.`,
    '',
    '## Architecture & Single Source of Truth',
    '',
    '- **Project configuration**: Edit `../tci.config.json` at the repository root (name, identifier, version, install scope, shortcuts, hooks, compression, signing).',
    '- **UI dev defaults**: `src/installer.config.json` is generated/synced by `tci init`, `tci upgrade`, and `tci build` — keep app metadata synchronized in `../tci.config.json`.',
    '- **UI SDK**: Use `InstallerApi` / `createInstallerStore` / framework hooks from `@tauri-custom-installer/client`. Do not invent raw `@tauri-apps/api/core` `invoke()` calls outside the SDK wrapper.',
    '- **Rust core & Single-File SFX**: By default, `tci build` compiles the web UI, packs the app payload (`.tar.zst` or `.zip`), and appends `[ui.zip][payload][manifest][footer]` to the prebuilt Rust runtime (`tci-runtime.exe`). Keep `src-tauri/tauri.conf.json` `bundle.active = false`.',
    '',
    '## Common Workflows',
    '',
    '- Live UI preview + safe registry sandbox (`TCI_DRY_RUN=1`): `tci dev`',
    '- Build standalone `*-setup.exe`: `tci build`',
    '- Refresh SDK, core crate, and metadata after upgrading `tci`: `tci upgrade`',
    '- Remove staging/temp build artifacts: `tci clean`',
    '- Diagnose toolchain and config sync: `tci check`',
    '',
    '## UI Editing Rules',
    '',
    '1. Always call `InstallerApi.validateInstallPath(path, requiredBytes)` before starting installation and surface validation/permission errors to the user.',
    '2. Call `InstallerApi.checkRunning(executableName, installDir)` before overwriting an existing install and offer `InstallerApi.killRunning(pids, executableName, installDir)`.',
    '3. Never shell out to PowerShell/CMD/VBScript or bypass TCI security boundaries; all OS operations (Win32 COM shortcuts, Registry, SFX extraction, uninstaller) run through `tauri-custom-installer-core`.',
    '',
  ];
  fs.writeFileSync(path.join(targetDir, 'AGENTS.md'), lines.join('\n'), 'utf8');
}

export function syncInstallerMetadataAndSdk(
  cwd: string,
  targetDir: string,
  appConfig: AppConfig,
  syncIcons = true
): void {
  const cliRoot = getCliRootDir();
  const cliVersion = getCliPackageVersion();

  // Preserve custom requiredBytes if installer.config.json already exists
  const installerConfigPath = path.join(targetDir, 'src', 'installer.config.json');
  let requiredBytes = 50 * 1024 * 1024;
  if (fs.existsSync(installerConfigPath)) {
    try {
      const existingCfg = JSON.parse(fs.readFileSync(installerConfigPath, 'utf8'));
      if (typeof existingCfg.requiredBytes === 'number' && existingCfg.requiredBytes > 0) {
        requiredBytes = existingCfg.requiredBytes;
      }
    } catch {
      // ignore
    }
  }

  const installerConfigData = {
    appName: appConfig.appName,
    appId: appConfig.identifier,
    appVersion: appConfig.version,
    publisher: appConfig.publisher,
    executableName: appConfig.executableName,
    requiredBytes,
  };
  fs.mkdirSync(path.dirname(installerConfigPath), { recursive: true });
  fs.writeFileSync(installerConfigPath, JSON.stringify(installerConfigData, null, 2));

  // Resolve client SDK dependency in installer/package.json
  const monorepoClientDir = findDirUpwards(cwd, path.join('packages', 'client'));
  const packagedClientDir = path.join(cliRoot, 'vendor', 'client');
  const cliBundledClientDir = fs.existsSync(packagedClientDir)
    ? packagedClientDir
    : findDirUpwards(__dirname, path.join('packages', 'client'));

  const installerPkgPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(installerPkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(installerPkgPath, 'utf8'));
      const appSlug = appConfig.appName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      pkg.name = `${appSlug}-installer-ui`;
      if (pkg.dependencies) {
        if (monorepoClientDir) {
          const clientRelPath = path.relative(targetDir, monorepoClientDir).replace(/\\/g, '/');
          pkg.dependencies['@tauri-custom-installer/client'] = `file:${clientRelPath}`;
        } else if (cliBundledClientDir) {
          const vendoredClientDir = path.join(targetDir, '.tci-sdk', 'client');
          copyDirSync(cliBundledClientDir, vendoredClientDir, true);
          pkg.dependencies['@tauri-custom-installer/client'] = 'file:./.tci-sdk/client';
        } else {
          pkg.dependencies['@tauri-custom-installer/client'] = `^${cliVersion}`;
        }
      }
      fs.writeFileSync(installerPkgPath, JSON.stringify(pkg, null, 2));
    } catch {
      // ignore
    }
  }

  // Customize installer/src-tauri/Cargo.toml if present
  const monorepoCoreDir = findDirUpwards(cwd, path.join('packages', 'core'));
  const packagedCoreDir = path.join(cliRoot, 'vendor', 'core');
  const cliBundledCoreDir = fs.existsSync(packagedCoreDir)
    ? packagedCoreDir
    : findDirUpwards(__dirname, path.join('packages', 'core'));

  const installerCargoPath = path.join(targetDir, 'src-tauri', 'Cargo.toml');
  if (fs.existsSync(installerCargoPath)) {
    try {
      let cargoStr = fs.readFileSync(installerCargoPath, 'utf8');
      const cargoPkgName = `${appConfig.appName
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-')}-installer`;
      cargoStr = cargoStr.replace(
        /name\s*=\s*"tauri-custom-installer-template-[^"]*"/,
        `name = "${cargoPkgName}"`
      );

      if (monorepoCoreDir) {
        const coreRelPath = path
          .relative(path.join(targetDir, 'src-tauri'), monorepoCoreDir)
          .replace(/\\/g, '/');
        cargoStr = cargoStr.replace(
          /path\s*=\s*"(?:[^"]*packages\/core|\.\/core)"/g,
          `path = "${coreRelPath}"`
        );
        const rootCargo = path.join(path.dirname(path.dirname(monorepoCoreDir)), 'Cargo.toml');
        const relMember = path
          .relative(path.dirname(rootCargo), path.join(targetDir, 'src-tauri'))
          .replace(/\\/g, '/');
        if (fs.existsSync(rootCargo)) {
          const rootCargoText = fs.readFileSync(rootCargo, 'utf8');
          if (!rootCargoText.includes(relMember) && !cargoStr.includes('[workspace]')) {
            cargoStr += '\n[workspace]\n';
          }
        }
      } else if (cliBundledCoreDir) {
        const vendoredCoreDir = path.join(targetDir, 'src-tauri', 'core');
        copyDirSync(cliBundledCoreDir, vendoredCoreDir);
        cargoStr = cargoStr.replace(
          /path\s*=\s*"(?:[^"]*packages\/core|\.\/core)"/g,
          `path = "./core"`
        );
        if (!cargoStr.includes('[workspace]')) {
          cargoStr += '\n[workspace]\n';
        }
      }
      cargoStr = cargoStr.replace(
        /features\s*=\s*\[\s*"wry"\s*\]/,
        'features = ["wry", "custom-protocol"]'
      );
      fs.writeFileSync(installerCargoPath, cargoStr);
    } catch {
      // ignore
    }
  }

  // Customize installer/src-tauri/tauri.conf.json
  const tauriConfPath = path.join(targetDir, 'src-tauri', 'tauri.conf.json');
  if (fs.existsSync(tauriConfPath)) {
    try {
      const conf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
      conf.productName = `${appConfig.appName} Setup`;
      conf.identifier = `${appConfig.identifier}.installer`;
      conf.version = appConfig.version;
      if (conf.bundle) {
        conf.bundle.active = false;
        conf.bundle.targets = [];
      }
      fs.writeFileSync(tauriConfPath, JSON.stringify(conf, null, 2));
    } catch {
      // ignore
    }
  }

  if (syncIcons) {
    const userIconsDir = path.join(cwd, 'src-tauri', 'icons');
    const installerIconsDir = path.join(targetDir, 'src-tauri', 'icons');
    if (fs.existsSync(userIconsDir) && fs.existsSync(installerIconsDir)) {
      for (const iconFile of ['icon.ico', '32x32.png', '128x128.png', '128x128@2x.png']) {
        const srcIcon = path.join(userIconsDir, iconFile);
        if (fs.existsSync(srcIcon)) {
          fs.copyFileSync(srcIcon, path.join(installerIconsDir, iconFile));
        }
      }
    }
  }
}

export async function runInit(options: InitOptions): Promise<void> {
  const cwd = process.cwd();
  const pm = detectPackageManager(cwd);
  let template = options.template ? normalizeTemplateName(options.template) : undefined;
  let installMode: 'perUser' | 'perMachine' | 'both' = options.mode || 'perUser';

  if (!template) {
    if (options.yes) {
      template = 'react';
    } else {
      const frameworkMap: Record<string, string> = {
        'React 19 + Tailwind CSS + Lucide (Recommended)': 'react',
        'Futuristic 3D Gaming (Three.js WebGL Hologram + Audio SFX)': 'futuristic-3d',
        'Svelte 5 + TypeScript': 'svelte',
        'Vue 3 + TypeScript': 'vue',
        'Vanilla HTML/CSS/TypeScript': 'vanilla',
      };
      const choice = await promptChoice(
        '\n? Which framework would you like for your custom installer UI?',
        Object.keys(frameworkMap),
        0
      );
      template = frameworkMap[choice] || 'react';
    }
  }

  if (!options.mode && !options.yes && process.stdin.isTTY) {
    const modeMap: Record<string, 'perUser' | 'perMachine' | 'both'> = {
      'Per-user (%LOCALAPPDATA%, no UAC prompt, Recommended)': 'perUser',
      'Per-machine (Program Files, requires Administrator)': 'perMachine',
      'Both (let the end user choose in UI)': 'both',
    };
    const modeChoice = await promptChoice(
      '\n? Which installation scope should be used by default?',
      Object.keys(modeMap),
      0
    );
    installMode = modeMap[modeChoice] || 'perUser';
  }

  const targetDir = path.join(cwd, 'installer');

  console.log(
    pc.cyan(`\n✨ Initializing Tauri Custom Installer with template: ${pc.bold(template)}`)
  );

  if (fs.existsSync(targetDir) && !options.force) {
    console.log(pc.yellow(`⚠️  Directory 'installer/' already exists.`));
    console.log(pc.gray(`Use --force to overwrite.\n`));
    return;
  }

  const appConfig = detectAppConfig(cwd);
  if (options.name) {
    appConfig.appName = options.name;
  }

  const templateDir = resolveTemplateDir(cwd, template);
  if (!templateDir) {
    console.error(pc.red(`❌ Template '${template}' not found.`));
    console.error(pc.gray(`Available templates: ${AVAILABLE_TEMPLATES.join(', ')}`));
    process.exit(1);
  }

  copyDirSync(templateDir, targetDir);

  // Write root tci.config.json (single source of truth)
  const tciConfigPath = path.join(cwd, 'tci.config.json');
  if (!fs.existsSync(tciConfigPath) || options.force) {
    const tciConfig = {
      template,
      productName: appConfig.appName,
      identifier: appConfig.identifier,
      version: appConfig.version,
      publisher: appConfig.publisher,
      ui: {
        root: './installer',
        outDir: './installer/dist',
      },
      install: {
        mode: installMode,
        shortcuts: {
          desktop: true,
          startMenu: true,
        },
        autostart: 'ask',
        runAfterInstall: true,
      },
      compression: 'zstd',
      output: './dist',
    };
    fs.writeFileSync(tciConfigPath, JSON.stringify(tciConfig, null, 2));
  }

  ensureProjectGitignore(cwd);
  syncInstallerMetadataAndSdk(cwd, targetDir, appConfig, true);
  writeInstallerAgentsMd(targetDir, template);

  if (ensureRootPackageScripts(cwd)) {
    console.log(pc.green(`✔ Configured installer scripts in package.json`));
  }

  const installCmd = pm === 'bun' ? 'bun install' : `${pm} install`;
  const runCmd = pm === 'bun' ? 'bun run' : `${pm} run`;

  console.log(
    pc.green(
      `✔ Created tci.config.json & synced metadata (${appConfig.appName} v${appConfig.version})`
    )
  );
  console.log(pc.green(`\n✔ Custom installer initialized successfully in ./installer/`));
  console.log(pc.cyan(`\nNext steps:`));
  console.log(`  1. ${pc.bold(`cd installer && ${installCmd}`)}`);
  console.log(`  2. ${pc.bold(`${runCmd} installer:dev`)} (live UI preview with HMR & simulator)`);
  console.log(`  3. ${pc.bold(`${runCmd} installer:build`)} (compile standalone setup .exe)\n`);
}

export function copyDirSync(src: string, dest: string, includeDist = false): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (
      IGNORED_COPY_ENTRIES.has(entry.name) ||
      (!includeDist && entry.name === 'dist')
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath, includeDist);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
