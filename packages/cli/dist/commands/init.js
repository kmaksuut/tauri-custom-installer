"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AVAILABLE_TEMPLATES = void 0;
exports.normalizeTemplateName = normalizeTemplateName;
exports.getCliRootDir = getCliRootDir;
exports.getCliPackageVersion = getCliPackageVersion;
exports.findDirUpwards = findDirUpwards;
exports.resolveTemplateDir = resolveTemplateDir;
exports.ensureProjectGitignore = ensureProjectGitignore;
exports.ensureRootPackageScripts = ensureRootPackageScripts;
exports.writeInstallerAgentsMd = writeInstallerAgentsMd;
exports.syncInstallerMetadataAndSdk = syncInstallerMetadataAndSdk;
exports.runInit = runInit;
exports.copyDirSync = copyDirSync;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_readline_1 = __importDefault(require("node:readline"));
const picocolors_1 = __importDefault(require("picocolors"));
const config_1 = require("../utils/config");
exports.AVAILABLE_TEMPLATES = [
    'react',
    'futuristic-3d',
    'svelte',
    'vue',
    'vanilla',
];
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
function normalizeTemplateName(template) {
    const lower = template.trim().toLowerCase();
    if (lower === '3d' ||
        lower === 'gaming' ||
        lower === 'gaming-3d' ||
        lower === 'three' ||
        lower === 'threejs' ||
        lower === 'futuristic') {
        return 'futuristic-3d';
    }
    return lower;
}
function getCliRootDir() {
    const candidates = [
        node_path_1.default.resolve(__dirname, '..', '..'),
        node_path_1.default.resolve(__dirname, '..'),
        __dirname,
    ];
    for (const dir of candidates) {
        if (node_fs_1.default.existsSync(node_path_1.default.join(dir, 'package.json'))) {
            return dir;
        }
    }
    return node_path_1.default.resolve(__dirname, '..', '..');
}
function getCliPackageVersion() {
    try {
        const pkgPath = node_path_1.default.join(getCliRootDir(), 'package.json');
        if (node_fs_1.default.existsSync(pkgPath)) {
            const pkg = JSON.parse(node_fs_1.default.readFileSync(pkgPath, 'utf8'));
            if (typeof pkg.version === 'string' && pkg.version.trim().length > 0) {
                return pkg.version.trim();
            }
        }
    }
    catch {
        // ignore
    }
    return '0.2.0';
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
function resolveTemplateDir(cwd, template) {
    const cliRoot = getCliRootDir();
    const packagedTemplateDir = node_path_1.default.join(cliRoot, 'templates', template);
    if (node_fs_1.default.existsSync(packagedTemplateDir)) {
        return packagedTemplateDir;
    }
    return (findDirUpwards(__dirname, node_path_1.default.join('templates', template)) ||
        findDirUpwards(cwd, node_path_1.default.join('templates', template)));
}
function ensureProjectGitignore(cwd) {
    const gitignorePath = node_path_1.default.join(cwd, '.gitignore');
    if (!node_fs_1.default.existsSync(gitignorePath)) {
        return;
    }
    const gi = node_fs_1.default.readFileSync(gitignorePath, 'utf8');
    const additions = [];
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
        node_fs_1.default.writeFileSync(gitignorePath, `${gi.trimEnd()}\n${additions.join('\n')}\n`);
    }
}
function ensureRootPackageScripts(cwd) {
    const rootPkgPath = node_path_1.default.join(cwd, 'package.json');
    if (!node_fs_1.default.existsSync(rootPkgPath)) {
        return false;
    }
    try {
        const pkg = JSON.parse(node_fs_1.default.readFileSync(rootPkgPath, 'utf8'));
        pkg.scripts = pkg.scripts || {};
        let changed = false;
        const defaults = {
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
            node_fs_1.default.writeFileSync(rootPkgPath, JSON.stringify(pkg, null, 2));
        }
        return changed;
    }
    catch {
        return false;
    }
}
function writeInstallerAgentsMd(targetDir, templateName) {
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
    node_fs_1.default.writeFileSync(node_path_1.default.join(targetDir, 'AGENTS.md'), lines.join('\n'), 'utf8');
}
function syncInstallerMetadataAndSdk(cwd, targetDir, appConfig, syncIcons = true) {
    const cliRoot = getCliRootDir();
    const cliVersion = getCliPackageVersion();
    // Preserve custom requiredBytes if installer.config.json already exists
    const installerConfigPath = node_path_1.default.join(targetDir, 'src', 'installer.config.json');
    let requiredBytes = 50 * 1024 * 1024;
    if (node_fs_1.default.existsSync(installerConfigPath)) {
        try {
            const existingCfg = JSON.parse(node_fs_1.default.readFileSync(installerConfigPath, 'utf8'));
            if (typeof existingCfg.requiredBytes === 'number' && existingCfg.requiredBytes > 0) {
                requiredBytes = existingCfg.requiredBytes;
            }
        }
        catch {
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
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(installerConfigPath), { recursive: true });
    node_fs_1.default.writeFileSync(installerConfigPath, JSON.stringify(installerConfigData, null, 2));
    // Resolve client SDK dependency in installer/package.json
    const monorepoClientDir = findDirUpwards(cwd, node_path_1.default.join('packages', 'client'));
    const packagedClientDir = node_path_1.default.join(cliRoot, 'vendor', 'client');
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
                    pkg.dependencies['@tauri-custom-installer/client'] = `^${cliVersion}`;
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
    const packagedCoreDir = node_path_1.default.join(cliRoot, 'vendor', 'core');
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
                cargoStr = cargoStr.replace(/path\s*=\s*"(?:[^"]*packages\/core|\.\/core)"/g, `path = "${coreRelPath}"`);
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
                cargoStr = cargoStr.replace(/path\s*=\s*"(?:[^"]*packages\/core|\.\/core)"/g, `path = "./core"`);
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
    if (syncIcons) {
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
    }
}
async function runInit(options) {
    const cwd = process.cwd();
    const pm = (0, config_1.detectPackageManager)(cwd);
    let template = options.template ? normalizeTemplateName(options.template) : undefined;
    let installMode = options.mode || 'perUser';
    if (!template) {
        if (options.yes) {
            template = 'react';
        }
        else {
            const frameworkMap = {
                'React 19 + Tailwind CSS + Lucide (Recommended)': 'react',
                'Futuristic 3D Gaming (Three.js WebGL Hologram + Audio SFX)': 'futuristic-3d',
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
    const templateDir = resolveTemplateDir(cwd, template);
    if (!templateDir) {
        console.error(picocolors_1.default.red(`❌ Template '${template}' not found.`));
        console.error(picocolors_1.default.gray(`Available templates: ${exports.AVAILABLE_TEMPLATES.join(', ')}`));
        process.exit(1);
    }
    copyDirSync(templateDir, targetDir);
    // Write root tci.config.json (single source of truth)
    const tciConfigPath = node_path_1.default.join(cwd, 'tci.config.json');
    if (!node_fs_1.default.existsSync(tciConfigPath) || options.force) {
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
        node_fs_1.default.writeFileSync(tciConfigPath, JSON.stringify(tciConfig, null, 2));
    }
    ensureProjectGitignore(cwd);
    syncInstallerMetadataAndSdk(cwd, targetDir, appConfig, true);
    writeInstallerAgentsMd(targetDir, template);
    if (ensureRootPackageScripts(cwd)) {
        console.log(picocolors_1.default.green(`✔ Configured installer scripts in package.json`));
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
        if (entry.isSymbolicLink()) {
            continue;
        }
        const srcPath = node_path_1.default.join(src, entry.name);
        const destPath = node_path_1.default.join(dest, entry.name);
        if (IGNORED_COPY_ENTRIES.has(entry.name) ||
            (!includeDist && entry.name === 'dist')) {
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
