import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import pc from 'picocolors';
import { detectAppConfig } from '../utils/config';

export interface InitOptions {
  template?: string;
  name?: string;
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
  let template = options.template;

  if (!template) {
    const frameworkMap: Record<string, string> = {
      'React 19 + Tailwind CSS + Lucide (Recommended)': 'react',
      'Svelte 5 + Tailwind': 'svelte',
      'Vue 3 + Tailwind': 'vue',
      'Vanilla HTML/CSS/TypeScript': 'vanilla',
    };
    const choice = await promptChoice(
      '\n? Which framework would you like for your custom installer UI?',
      Object.keys(frameworkMap),
      0
    );
    template = frameworkMap[choice] || 'react';
  }

  const targetDir = path.join(cwd, 'installer');

  console.log(pc.cyan(`\n✨ Initializing Tauri Custom Installer with template: ${pc.bold(template)}`));

  if (fs.existsSync(targetDir) && !options.force) {
    console.log(pc.yellow(`⚠️  Directory 'installer/' already exists.`));
    console.log(pc.gray(`Use --force to overwrite.\n`));
    return;
  }

  const appConfig = detectAppConfig(cwd);
  if (options.name) {
    appConfig.appName = options.name;
  }

  // Locate template directory by checking relative locations from CLI __dirname or cwd
  const templateDir =
    findDirUpwards(__dirname, path.join('templates', template)) ||
    findDirUpwards(cwd, path.join('templates', template));

  if (!templateDir) {
    console.error(pc.red(`❌ Template '${template}' not found.`));
    console.error(pc.gray(`Available templates: react, svelte, vue, vanilla`));
    process.exit(1);
  }

  // Copy template files recursively
  copyDirSync(templateDir, targetDir);

  // Write installer/src/installer.config.json with real app metadata
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

  // Determine if cwd is inside the tauri-custom-installer monorepo or an external project
  const monorepoClientDir = findDirUpwards(cwd, path.join('packages', 'client'));
  const cliBundledClientDir = findDirUpwards(__dirname, path.join('packages', 'client'));

  const installerPkgPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(installerPkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(installerPkgPath, 'utf8'));
      if (pkg.dependencies) {
        if (monorepoClientDir) {
          const clientRelPath = path.relative(targetDir, monorepoClientDir).replace(/\\/g, '/');
          pkg.dependencies['@tauri-custom-installer/client'] = `file:${clientRelPath}`;
        } else if (cliBundledClientDir) {
          // External project: vendor client SDK into installer/.tci-sdk/client for offline/git installs
          const vendoredClientDir = path.join(targetDir, '.tci-sdk', 'client');
          copyDirSync(cliBundledClientDir, vendoredClientDir);
          pkg.dependencies['@tauri-custom-installer/client'] = 'file:./.tci-sdk/client';
        } else {
          pkg.dependencies['@tauri-custom-installer/client'] = '^0.1.0';
        }
      }
      fs.writeFileSync(installerPkgPath, JSON.stringify(pkg, null, 2));
    } catch {
      // ignore
    }
  }

  // Customize installer/src-tauri/Cargo.toml
  const monorepoCoreDir = findDirUpwards(cwd, path.join('packages', 'core'));
  const cliBundledCoreDir = findDirUpwards(__dirname, path.join('packages', 'core'));

  const installerCargoPath = path.join(targetDir, 'src-tauri', 'Cargo.toml');
  if (fs.existsSync(installerCargoPath)) {
    try {
      let cargoStr = fs.readFileSync(installerCargoPath, 'utf8');
      const cargoPkgName = `${appConfig.appName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}-installer`;
      cargoStr = cargoStr.replace(
        /name\s*=\s*"tauri-custom-installer-template-[^"]*"/,
        `name = "${cargoPkgName}"`
      );

      if (monorepoCoreDir) {
        const coreRelPath = path
          .relative(path.join(targetDir, 'src-tauri'), monorepoCoreDir)
          .replace(/\\/g, '/');
        cargoStr = cargoStr.replace(/path\s*=\s*"[^"]*packages\/core"/g, `path = "${coreRelPath}"`);
      } else if (cliBundledCoreDir) {
        // External project: vendor core crate into installer/src-tauri/core and isolate workspace
        const vendoredCoreDir = path.join(targetDir, 'src-tauri', 'core');
        copyDirSync(cliBundledCoreDir, vendoredCoreDir);
        cargoStr = cargoStr.replace(/path\s*=\s*"[^"]*packages\/core"/g, `path = "./core"`);
        if (!cargoStr.includes('[workspace]')) {
          cargoStr += '\n[workspace]\n';
        }
      }
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
      fs.writeFileSync(tauriConfPath, JSON.stringify(conf, null, 2));
    } catch {
      // ignore
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

  console.log(pc.green(`✔ Synced application metadata (${appConfig.appName} v${appConfig.version}) into installer/src/installer.config.json`));
  console.log(pc.green(`\n✔ Custom installer initialized successfully in ./installer/`));
  console.log(pc.cyan(`\nNext steps:`));
  console.log(`  1. ${pc.bold('cd installer && bun install')} (or npm install)`);
  console.log(`  2. ${pc.bold('bun run installer:dev')} (to preview & customize your installer UI)`);
  console.log(`  3. ${pc.bold('bun run installer:build')} (to compile your standalone setup .exe)\n`);
}

function copyDirSync(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (
      entry.name === 'node_modules' ||
      entry.name === 'target' ||
      entry.name === 'dist' ||
      entry.name === '.git'
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
