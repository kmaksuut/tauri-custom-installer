"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInit = runInit;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_readline_1 = __importDefault(require("node:readline"));
const picocolors_1 = __importDefault(require("picocolors"));
const config_1 = require("../utils/config");
function promptChoice(question, choices, defaultIndex = 0) {
    return new Promise((resolve) => {
        if (!process.stdin.isTTY) {
            resolve(choices[defaultIndex]);
            return;
        }
        const rl = node_readline_1.default.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        console.log(picocolors_1.default.bold(question));
        choices.forEach((c, idx) => {
            const isDefault = idx === defaultIndex;
            console.log(`  ${picocolors_1.default.cyan(`${idx + 1})`)} ${c} ${isDefault ? picocolors_1.default.gray('(default)') : ''}`);
        });
        rl.question(picocolors_1.default.yellow(`Enter choice [1-${choices.length}]: `), (answer) => {
            rl.close();
            const num = parseInt(answer.trim(), 10);
            if (!isNaN(num) && num >= 1 && num <= choices.length) {
                resolve(choices[num - 1]);
            }
            else {
                resolve(choices[defaultIndex]);
            }
        });
    });
}
function findDirUpwards(startDir, subPath) {
    let curr = node_path_1.default.resolve(startDir);
    while (curr) {
        const candidate = node_path_1.default.join(curr, subPath);
        if (node_fs_1.default.existsSync(candidate)) {
            return candidate;
        }
        const parent = node_path_1.default.dirname(curr);
        if (parent === curr)
            break;
        curr = parent;
    }
    return null;
}
async function runInit(options) {
    const cwd = process.cwd();
    const pm = (0, config_1.detectPackageManager)(cwd);
    let template = options.template;
    let installMode = options.mode || 'perUser';
    if (!template) {
        if (options.yes) {
            template = 'react';
        }
        else {
            const frameworkMap = {
                'React 19 + Tailwind CSS + Lucide (Recommended)': 'react',
                'Svelte 5 + TypeScript': 'svelte',
                'Vue 3 + TypeScript': 'vue',
                'Vanilla HTML/CSS/TypeScript': 'vanilla',
            };
            const choice = await promptChoice('\n? Which framework would you like for your custom installer UI?', Object.keys(frameworkMap), 0);
            template = frameworkMap[choice] || 'react';
        }
    }
    if (!options.mode && !options.yes && process.stdin.isTTY) {
        const modeMap = {
            'Per-user (%LOCALAPPDATA%, no UAC prompt, Recommended)': 'perUser',
            'Per-machine (Program Files, requires Administrator)': 'perMachine',
            'Both (let the end user choose in UI)': 'both',
        };
        const modeChoice = await promptChoice('\n? Which installation scope should be used by default?', Object.keys(modeMap), 0);
        installMode = modeMap[modeChoice] || 'perUser';
    }
    const targetDir = node_path_1.default.join(cwd, 'installer');
    console.log(picocolors_1.default.cyan(`\n✨ Initializing Tauri Custom Installer with template: ${picocolors_1.default.bold(template)}`));
    if (node_fs_1.default.existsSync(targetDir) && !options.force) {
        console.log(picocolors_1.default.yellow(`⚠️  Directory 'installer/' already exists.`));
        console.log(picocolors_1.default.gray(`Use --force to overwrite.\n`));
        return;
    }
    const appConfig = (0, config_1.detectAppConfig)(cwd);
    if (options.name) {
        appConfig.appName = options.name;
    }
    // Locate template directory (first inside packaged CLI `templates/`, then upwards in monorepo)
    const packagedTemplateDir = node_path_1.default.resolve(__dirname, '..', 'templates', template);
    const templateDir = node_fs_1.default.existsSync(packagedTemplateDir)
        ? packagedTemplateDir
        : findDirUpwards(__dirname, node_path_1.default.join('templates', template)) ||
            findDirUpwards(cwd, node_path_1.default.join('templates', template));
    if (!templateDir) {
        console.error(picocolors_1.default.red(`❌ Template '${template}' not found.`));
        console.error(picocolors_1.default.gray(`Available templates: react, svelte, vue, vanilla`));
        process.exit(1);
    }
    copyDirSync(templateDir, targetDir);
    // Write installer/src/installer.config.json for UI dev server defaults
    const installerConfigPath = node_path_1.default.join(targetDir, 'src', 'installer.config.json');
    const installerConfigData = {
        appName: appConfig.appName,
        appId: appConfig.identifier,
        appVersion: appConfig.version,
        publisher: appConfig.publisher,
        executableName: appConfig.executableName,
        requiredBytes: 50 * 1024 * 1024,
    };
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(installerConfigPath), { recursive: true });
    node_fs_1.default.writeFileSync(installerConfigPath, JSON.stringify(installerConfigData, null, 2));
    // Write root tci.config.json (single source of truth)
    const tciConfigPath = node_path_1.default.join(cwd, 'tci.config.json');
    if (!node_fs_1.default.existsSync(tciConfigPath) || options.force) {
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
        node_fs_1.default.writeFileSync(tciConfigPath, JSON.stringify(tciConfig, null, 2));
    }
    // Ensure .tci/ and .payload_staging are in .gitignore
    const gitignorePath = node_path_1.default.join(cwd, '.gitignore');
    if (node_fs_1.default.existsSync(gitignorePath)) {
        const gi = node_fs_1.default.readFileSync(gitignorePath, 'utf8');
        if (!gi.includes('.tci/')) {
            node_fs_1.default.writeFileSync(gitignorePath, `${gi.trimEnd()}\n.tci/\ninstaller/.payload_staging/\n`);
        }
    }
    // Resolve client SDK dependency in installer/package.json
    const monorepoClientDir = findDirUpwards(cwd, node_path_1.default.join('packages', 'client'));
    const packagedClientDir = node_path_1.default.resolve(__dirname, '..', 'vendor', 'client');
    const cliBundledClientDir = node_fs_1.default.existsSync(packagedClientDir)
        ? packagedClientDir
        : findDirUpwards(__dirname, node_path_1.default.join('packages', 'client'));
    const installerPkgPath = node_path_1.default.join(targetDir, 'package.json');
    if (node_fs_1.default.existsSync(installerPkgPath)) {
        try {
            const pkg = JSON.parse(node_fs_1.default.readFileSync(installerPkgPath, 'utf8'));
            const appSlug = appConfig.appName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
            pkg.name = `${appSlug}-installer-ui`;
            if (pkg.dependencies) {
                if (monorepoClientDir) {
                    const clientRelPath = node_path_1.default.relative(targetDir, monorepoClientDir).replace(/\\/g, '/');
                    pkg.dependencies['@tauri-custom-installer/client'] = `file:${clientRelPath}`;
                }
                else if (cliBundledClientDir) {
                    const vendoredClientDir = node_path_1.default.join(targetDir, '.tci-sdk', 'client');
                    copyDirSync(cliBundledClientDir, vendoredClientDir, true);
                    pkg.dependencies['@tauri-custom-installer/client'] = 'file:./.tci-sdk/client';
                }
                else {
                    pkg.dependencies['@tauri-custom-installer/client'] = '^0.2.0';
                }
            }
            node_fs_1.default.writeFileSync(installerPkgPath, JSON.stringify(pkg, null, 2));
        }
        catch {
            // ignore
        }
    }
    // Customize installer/src-tauri/Cargo.toml if present
    const monorepoCoreDir = findDirUpwards(cwd, node_path_1.default.join('packages', 'core'));
    const packagedCoreDir = node_path_1.default.resolve(__dirname, '..', 'vendor', 'core');
    const cliBundledCoreDir = node_fs_1.default.existsSync(packagedCoreDir)
        ? packagedCoreDir
        : findDirUpwards(__dirname, node_path_1.default.join('packages', 'core'));
    const installerCargoPath = node_path_1.default.join(targetDir, 'src-tauri', 'Cargo.toml');
    if (node_fs_1.default.existsSync(installerCargoPath)) {
        try {
            let cargoStr = node_fs_1.default.readFileSync(installerCargoPath, 'utf8');
            const cargoPkgName = `${appConfig.appName
                .toLowerCase()
                .replace(/[^a-z0-9_-]/g, '-')}-installer`;
            cargoStr = cargoStr.replace(/name\s*=\s*"tauri-custom-installer-template-[^"]*"/, `name = "${cargoPkgName}"`);
            if (monorepoCoreDir) {
                const coreRelPath = node_path_1.default
                    .relative(node_path_1.default.join(targetDir, 'src-tauri'), monorepoCoreDir)
                    .replace(/\\/g, '/');
                cargoStr = cargoStr.replace(/path\s*=\s*"[^"]*packages\/core"/g, `path = "${coreRelPath}"`);
                const rootCargo = node_path_1.default.join(node_path_1.default.dirname(node_path_1.default.dirname(monorepoCoreDir)), 'Cargo.toml');
                const relMember = node_path_1.default
                    .relative(node_path_1.default.dirname(rootCargo), node_path_1.default.join(targetDir, 'src-tauri'))
                    .replace(/\\/g, '/');
                if (node_fs_1.default.existsSync(rootCargo)) {
                    const rootCargoText = node_fs_1.default.readFileSync(rootCargo, 'utf8');
                    if (!rootCargoText.includes(relMember) && !cargoStr.includes('[workspace]')) {
                        cargoStr += '\n[workspace]\n';
                    }
                }
            }
            else if (cliBundledCoreDir) {
                const vendoredCoreDir = node_path_1.default.join(targetDir, 'src-tauri', 'core');
                copyDirSync(cliBundledCoreDir, vendoredCoreDir);
                cargoStr = cargoStr.replace(/path\s*=\s*"[^"]*packages\/core"/g, `path = "./core"`);
                if (!cargoStr.includes('[workspace]')) {
                    cargoStr += '\n[workspace]\n';
                }
            }
            cargoStr = cargoStr.replace(/features\s*=\s*\[\s*"wry"\s*\]/, 'features = ["wry", "custom-protocol"]');
            node_fs_1.default.writeFileSync(installerCargoPath, cargoStr);
        }
        catch {
            // ignore
        }
    }
    // Customize installer/src-tauri/tauri.conf.json
    const tauriConfPath = node_path_1.default.join(targetDir, 'src-tauri', 'tauri.conf.json');
    if (node_fs_1.default.existsSync(tauriConfPath)) {
        try {
            const conf = JSON.parse(node_fs_1.default.readFileSync(tauriConfPath, 'utf8'));
            conf.productName = `${appConfig.appName} Setup`;
            conf.identifier = `${appConfig.identifier}.installer`;
            conf.version = appConfig.version;
            if (conf.bundle) {
                conf.bundle.active = false;
                conf.bundle.targets = [];
            }
            node_fs_1.default.writeFileSync(tauriConfPath, JSON.stringify(conf, null, 2));
        }
        catch {
            // ignore
        }
    }
    // Copy user's app icons into installer/src-tauri/icons if present
    const userIconsDir = node_path_1.default.join(cwd, 'src-tauri', 'icons');
    const installerIconsDir = node_path_1.default.join(targetDir, 'src-tauri', 'icons');
    if (node_fs_1.default.existsSync(userIconsDir) && node_fs_1.default.existsSync(installerIconsDir)) {
        for (const iconFile of ['icon.ico', '32x32.png', '128x128.png', '128x128@2x.png']) {
            const srcIcon = node_path_1.default.join(userIconsDir, iconFile);
            if (node_fs_1.default.existsSync(srcIcon)) {
                node_fs_1.default.copyFileSync(srcIcon, node_path_1.default.join(installerIconsDir, iconFile));
            }
        }
    }
    // Add scripts to root package.json if exists
    const rootPkgPath = node_path_1.default.join(cwd, 'package.json');
    if (node_fs_1.default.existsSync(rootPkgPath)) {
        try {
            const pkg = JSON.parse(node_fs_1.default.readFileSync(rootPkgPath, 'utf8'));
            pkg.scripts = pkg.scripts || {};
            if (!pkg.scripts['installer:dev']) {
                pkg.scripts['installer:dev'] = 'tauri-custom-installer dev';
            }
            if (!pkg.scripts['installer:build']) {
                pkg.scripts['installer:build'] = 'tauri-custom-installer build';
            }
            node_fs_1.default.writeFileSync(rootPkgPath, JSON.stringify(pkg, null, 2));
            console.log(picocolors_1.default.green(`✔ Configured installer scripts in package.json`));
        }
        catch {
            // ignore
        }
    }
    const installCmd = pm === 'bun' ? 'bun install' : `${pm} install`;
    const runCmd = pm === 'bun' ? 'bun run' : `${pm} run`;
    console.log(picocolors_1.default.green(`✔ Created tci.config.json & synced metadata (${appConfig.appName} v${appConfig.version})`));
    console.log(picocolors_1.default.green(`\n✔ Custom installer initialized successfully in ./installer/`));
    console.log(picocolors_1.default.cyan(`\nNext steps:`));
    console.log(`  1. ${picocolors_1.default.bold(`cd installer && ${installCmd}`)}`);
    console.log(`  2. ${picocolors_1.default.bold(`${runCmd} installer:dev`)} (live UI preview with HMR & simulator)`);
    console.log(`  3. ${picocolors_1.default.bold(`${runCmd} installer:build`)} (compile standalone setup .exe)\n`);
}
function copyDirSync(src, dest, includeDist = false) {
    node_fs_1.default.mkdirSync(dest, { recursive: true });
    const entries = node_fs_1.default.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = node_path_1.default.join(src, entry.name);
        const destPath = node_path_1.default.join(dest, entry.name);
        if (entry.name === 'node_modules' ||
            entry.name === 'target' ||
            (!includeDist && entry.name === 'dist') ||
            entry.name === '.git' ||
            entry.name === 'bun.lock' ||
            entry.name === 'bun.lockb' ||
            entry.name === 'gen') {
            continue;
        }
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath, includeDist);
        }
        else {
            node_fs_1.default.copyFileSync(srcPath, destPath);
        }
    }
}
