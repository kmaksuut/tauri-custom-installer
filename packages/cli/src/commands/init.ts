import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import pc from 'picocolors';
import { detectAppConfig, detectPackageManager } from '../utils/config';

export interface InitOptions {
  template?: string;
  name?: string;
  mode?: 'perUser' | 'perMachine' | 'both';
  yes?: boolean;
  force?: boolean;
}

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

function findDirUpwards(startDir: string, subPath: string): string | null {
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

export async function runInit(options: InitOptions): Promise<void> {
  const cwd = process.cwd();
  const pm = detectPackageManager(cwd);
  let template = options.template;
  if (
    template === '3d' ||
    template === 'gaming' ||
    template === 'gaming-3d' ||
    template === 'three' ||
    template === 'threejs'
  ) {
    template = 'futuristic-3d';
  }
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

  // Locate template directory (first inside packaged CLI `templates/`, then upwards in monorepo)
  const packagedTemplateDir = path.resolve(__dirname, '..', 'templates', template);
  const templateDir = fs.existsSync(packagedTemplateDir)
    ? packagedTemplateDir
    : findDirUpwards(__dirname, path.join('templates', template)) ||
      findDirUpwards(cwd, path.join('templates', template));

  if (!templateDir) {
    console.error(pc.red(`❌ Template '${template}' not found.`));
    console.error(pc.gray(`Available templates: react, futuristic-3d, svelte, vue, vanilla`));
    process.exit(1);
  }

  copyDirSync(templateDir, targetDir);

  // Write installer/src/installer.config.json for UI dev server defaults
  const installerConfigPath = path.join(targetDir, 'src', 'installer.config.json');
  const installerConfigData = {
    appName: appConfig.appName,
    appId: appConfig.identifier,
    appVersion: appConfig.version,
    publisher: appConfig.publisher,
    executableName: appConfig.executableName,
    requiredBytes: 50 * 1024 * 1024,
  };
  fs.mkdirSync(path.dirname(installerConfigPath), { recursive: true });
  fs.writeFileSync(installerConfigPath, JSON.stringify(installerConfigData, null, 2));

  // Write root tci.config.json (single source of truth)
  const tciConfigPath = path.join(cwd, 'tci.config.json');
  if (!fs.existsSync(tciConfigPath) || options.force) {
    const tciConfig = {
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

  // Ensure .tci/ and .payload_staging are in .gitignore
  const gitignorePath = path.join(cwd, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gi = fs.readFileSync(gitignorePath, 'utf8');
    if (!gi.includes('.tci/')) {
      fs.writeFileSync(gitignorePath, `${gi.trimEnd()}\n.tci/\ninstaller/.payload_staging/\n`);
    }
  }

  // Resolve client SDK dependency in installer/package.json
  const monorepoClientDir = findDirUpwards(cwd, path.join('packages', 'client'));
  const packagedClientDir = path.resolve(__dirname, '..', 'vendor', 'client');
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
          pkg.dependencies['@tauri-custom-installer/client'] = '^0.2.0';
        }
      }
      fs.writeFileSync(installerPkgPath, JSON.stringify(pkg, null, 2));
    } catch {
      // ignore
    }
  }

  // Customize installer/src-tauri/Cargo.toml if present
  const monorepoCoreDir = findDirUpwards(cwd, path.join('packages', 'core'));
  const packagedCoreDir = path.resolve(__dirname, '..', 'vendor', 'core');
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
          /path\s*=\s*"[^"]*packages\/core"/g,
          `path = "${coreRelPath}"`
        );
        const rootCargo = path.join( path.dirname( path.dirname(monorepoCoreDir) ), 'Cargo.toml');
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
        cargoStr = cargoStr.replace(/path\s*=\s*"[^"]*packages\/core"/g, `path = "./core"`);
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

  // Copy user's app icons into installer/src-tauri/icons if present
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

  // Add scripts to root package.json if exists
  const rootPkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(rootPkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
      pkg.scripts = pkg.scripts || {};
      if (!pkg.scripts['installer:dev']) {
        pkg.scripts['installer:dev'] = 'tauri-custom-installer dev';
      }
      if (!pkg.scripts['installer:build']) {
        pkg.scripts['installer:build'] = 'tauri-custom-installer build';
      }
      fs.writeFileSync(rootPkgPath, JSON.stringify(pkg, null, 2));
      console.log(pc.green(`✔ Configured installer scripts in package.json`));
    } catch {
      // ignore
    }
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

function copyDirSync(src: string, dest: string, includeDist = false) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (
      entry.name === 'node_modules' ||
      entry.name === 'target' ||
      (!includeDist && entry.name === 'dist') ||
      entry.name === '.git' ||
      entry.name === 'bun.lock' ||
      entry.name === 'bun.lockb' ||
      entry.name === 'gen'
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
