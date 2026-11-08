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

  // Locate template directory by checking relative locations
  const candidates = [
    path.resolve(__dirname, '..', '..', 'templates', template),
    path.resolve(__dirname, '..', 'templates', template),
    path.resolve(__dirname, '..', '..', '..', 'templates', template),
    path.resolve(__dirname, '..', '..', '..', '..', 'templates', template),
  ];

  let templateDir: string | null = null;
  for (const cand of candidates) {
    if (fs.existsSync(cand)) {
      templateDir = cand;
      break;
    }
  }

  if (!templateDir) {
    console.error(pc.red(`❌ Template '${template}' not found in any candidate path.`));
    console.error(pc.gray(`Available templates: react, svelte, vue, vanilla`));
    process.exit(1);
  }

  // Copy template files recursively
  copyDirSync(templateDir, targetDir);

  // Customize installer/package.json for local monorepo vs npm
  const installerPkgPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(installerPkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(installerPkgPath, 'utf8'));
      if (pkg.dependencies && pkg.dependencies['@tauri-custom-installer/client'] === 'workspace:*') {
        // Find packages/client by checking parent directories
        let packagesDir = path.resolve(cwd);
        while (packagesDir && !fs.existsSync(path.join(packagesDir, 'packages', 'client'))) {
          const parent = path.dirname(packagesDir);
          if (parent === packagesDir) break;
          packagesDir = parent;
        }

        const clientAbsPath = path.join(packagesDir, 'packages', 'client');
        if (fs.existsSync(clientAbsPath)) {
          const clientRelPath = path.relative(targetDir, clientAbsPath).replace(/\\/g, '/');
          pkg.dependencies['@tauri-custom-installer/client'] = `file:${clientRelPath}`;
        } else {
          pkg.dependencies['@tauri-custom-installer/client'] = '^0.1.0';
        }
      }
      fs.writeFileSync(installerPkgPath, JSON.stringify(pkg, null, 2));
    } catch {
      // ignore
    }
  }

  // Customize installer/src-tauri/Cargo.toml for local monorepo
  const installerCargoPath = path.join(targetDir, 'src-tauri', 'Cargo.toml');
  if (fs.existsSync(installerCargoPath)) {
    try {
      let cargoStr = fs.readFileSync(installerCargoPath, 'utf8');
        let packagesDir = path.resolve(cwd);
        while (packagesDir && !fs.existsSync(path.join(packagesDir, 'packages', 'core'))) {
          const parent = path.dirname(packagesDir);
          if (parent === packagesDir) break;
          packagesDir = parent;
        }

        const coreAbsPath = path.join(packagesDir, 'packages', 'core');
        if (fs.existsSync(coreAbsPath)) {
          const coreRelPath = path.relative(path.join(targetDir, 'src-tauri'), coreAbsPath).replace(/\\/g, '/');
          const cargoPkgName = `${appConfig.appName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}-installer`;
          cargoStr = cargoStr.replace(/name\s*=\s*"tauri-custom-installer-template-[^"]*"/, `name = "${cargoPkgName}"`);
          cargoStr = cargoStr.replace(/path\s*=\s*"[^"]*packages\/core"/g, `path = "${coreRelPath}"`);
          fs.writeFileSync(installerCargoPath, cargoStr);
        }
    } catch {
      // ignore
    }
  }
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
      pkg.scripts['installer:dev'] = 'tauri-custom-installer dev';
      pkg.scripts['installer:build'] = 'tauri-custom-installer build';
      fs.writeFileSync(rootPkgPath, JSON.stringify(pkg, null, 2));
      console.log(pc.green(`✔ Added installer scripts to package.json`));
    } catch {
      // ignore
    }
  }

  console.log(pc.green(`\n✔ Custom installer initialized successfully in ./installer/`));
  console.log(pc.cyan(`\nNext steps:`));
  console.log(`  1. ${pc.bold('cd installer && bun install')} (or npm install)`);
  console.log(`  2. ${pc.bold('bun run ../node_modules/.bin/tauri-custom-installer dev')} (to customize your UI)`);
  console.log(`  3. ${pc.bold('tauri-custom-installer build')} (to compile your custom setup executable)\n`);
}

function copyDirSync(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.name === 'node_modules' || entry.name === 'target' || entry.name === '.git') {
      continue;
    }

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
