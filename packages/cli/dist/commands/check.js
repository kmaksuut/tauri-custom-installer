"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCheck = runCheck;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const picocolors_1 = __importDefault(require("picocolors"));
const config_1 = require("../utils/config");
const exec_1 = require("../utils/exec");
const init_1 = require("./init");
function runCheck() {
    const cwd = process.cwd();
    console.log(picocolors_1.default.cyan(`\n🔍 Checking system prerequisites & workspace health (tci v${(0, init_1.getCliPackageVersion)()})...\n`));
    checkTool('Node.js', 'node', ['-v'], true);
    checkTool('Bun', 'bun', ['-v'], false);
    checkTool('Rust / Cargo', 'cargo', ['-V'], true);
    checkTool('Rustc', 'rustc', ['-V'], true);
    checkTool('Tauri CLI', 'cargo', ['tauri', '-V'], false);
    const cliRoot = (0, init_1.getCliRootDir)();
    const runtimeBin = node_path_1.default.join(cliRoot, 'vendor', 'runtime', 'tci-runtime.exe');
    if (node_fs_1.default.existsSync(runtimeBin)) {
        console.log(picocolors_1.default.green(`✔ Prebuilt SFX Runtime: ${runtimeBin}`));
    }
    else {
        console.log(picocolors_1.default.yellow(`⚠️  Prebuilt tci-runtime.exe not bundled (will compile via Cargo on first build)`));
    }
    // Project diagnostics when executed inside an app workspace
    const installerDir = node_path_1.default.join(cwd, 'installer');
    const tciConfigPath = node_path_1.default.join(cwd, 'tci.config.json');
    if (node_fs_1.default.existsSync(tciConfigPath) || node_fs_1.default.existsSync(installerDir)) {
        console.log(picocolors_1.default.cyan(`\n📦 Project Diagnostics (${cwd}):`));
        const appConfig = (0, config_1.detectAppConfig)(cwd);
        console.log(picocolors_1.default.gray(`  Detected app: ${appConfig.appName} v${appConfig.version} (${appConfig.identifier})`));
        if (node_fs_1.default.existsSync(tciConfigPath)) {
            try {
                JSON.parse(node_fs_1.default.readFileSync(tciConfigPath, 'utf8'));
                console.log(picocolors_1.default.green(`  ✔ tci.config.json is valid JSON`));
            }
            catch (err) {
                console.log(picocolors_1.default.red(`  ❌ tci.config.json has invalid JSON: ${String(err)}`));
            }
        }
        else {
            console.log(picocolors_1.default.yellow(`  ⚠️  Missing tci.config.json at project root`));
        }
        const installerConfigPath = node_path_1.default.join(installerDir, 'src', 'installer.config.json');
        if (node_fs_1.default.existsSync(installerConfigPath)) {
            try {
                const uiCfg = JSON.parse(node_fs_1.default.readFileSync(installerConfigPath, 'utf8'));
                if (uiCfg.appVersion !== appConfig.version || uiCfg.appName !== appConfig.appName) {
                    console.log(picocolors_1.default.yellow(`  ⚠️  installer/src/installer.config.json (${uiCfg.appName} v${uiCfg.appVersion}) differs from tci.config.json — run \`tci upgrade\``));
                }
                else {
                    console.log(picocolors_1.default.green(`  ✔ installer/src/installer.config.json is in sync`));
                }
            }
            catch {
                console.log(picocolors_1.default.red(`  ❌ installer/src/installer.config.json is invalid JSON`));
            }
        }
        const tauriConfPath = node_path_1.default.join(installerDir, 'src-tauri', 'tauri.conf.json');
        if (node_fs_1.default.existsSync(tauriConfPath)) {
            try {
                const tauriConf = JSON.parse(node_fs_1.default.readFileSync(tauriConfPath, 'utf8'));
                if (tauriConf.bundle?.active === false) {
                    console.log(picocolors_1.default.green(`  ✔ installer/src-tauri/tauri.conf.json bundle.active = false`));
                }
                else {
                    console.log(picocolors_1.default.yellow(`  ⚠️  installer/src-tauri/tauri.conf.json bundle.active should be false for SFX builds`));
                }
            }
            catch {
                console.log(picocolors_1.default.red(`  ❌ installer/src-tauri/tauri.conf.json is invalid JSON`));
            }
        }
        const installerPkgPath = node_path_1.default.join(installerDir, 'package.json');
        if (node_fs_1.default.existsSync(installerPkgPath)) {
            try {
                const pkg = JSON.parse(node_fs_1.default.readFileSync(installerPkgPath, 'utf8'));
                const sdkRef = pkg.dependencies?.['@tauri-custom-installer/client'];
                if (typeof sdkRef === 'string' && sdkRef.startsWith('file:')) {
                    const resolved = node_path_1.default.resolve(installerDir, sdkRef.slice(5));
                    if (node_fs_1.default.existsSync(resolved)) {
                        console.log(picocolors_1.default.green(`  ✔ Client SDK path exists (${sdkRef})`));
                    }
                    else {
                        console.log(picocolors_1.default.red(`  ❌ Missing Client SDK path (${sdkRef}) — run \`tci upgrade\``));
                    }
                }
            }
            catch {
                // ignore
            }
        }
        const cargoTomlPath = node_path_1.default.join(installerDir, 'src-tauri', 'Cargo.toml');
        if (node_fs_1.default.existsSync(cargoTomlPath)) {
            const cargoText = node_fs_1.default.readFileSync(cargoTomlPath, 'utf8');
            const match = cargoText.match(/tauri-custom-installer-core\s*=\s*\{[^}]*path\s*=\s*"([^"]+)"/);
            if (match) {
                const resolvedCore = node_path_1.default.resolve(node_path_1.default.join(installerDir, 'src-tauri'), match[1]);
                if (node_fs_1.default.existsSync(resolvedCore)) {
                    console.log(picocolors_1.default.green(`  ✔ Rust core crate path exists (${match[1]})`));
                }
                else {
                    console.log(picocolors_1.default.red(`  ❌ Missing Rust core crate path (${match[1]}) — run \`tci upgrade\``));
                }
            }
        }
        if (!node_fs_1.default.existsSync(node_path_1.default.join(installerDir, 'AGENTS.md'))) {
            console.log(picocolors_1.default.gray(`  ℹ️  Tip: run \`tci upgrade\` to generate installer/AGENTS.md for AI assistance`));
        }
        const stagingPath = node_path_1.default.join(installerDir, '.payload_staging');
        if (node_fs_1.default.existsSync(stagingPath)) {
            console.log(picocolors_1.default.yellow(`  ⚠️  Leftover installer/.payload_staging found — run \`tci clean\``));
        }
    }
    console.log(picocolors_1.default.green(`\n✔ System check completed.\n`));
}
function checkTool(name, cmd, args, required) {
    const out = (0, exec_1.tryExecOutput)(cmd, args);
    if (out !== null) {
        const firstLine = out.split(/\r?\n/)[0].trim();
        console.log(picocolors_1.default.green(`✔ ${name}: ${picocolors_1.default.gray(firstLine)}`));
    }
    else if (required) {
        console.log(picocolors_1.default.red(`❌ ${name}: Missing or not in PATH`));
    }
    else {
        console.log(picocolors_1.default.yellow(`⚠️  ${name}: Not detected (optional)`));
    }
}
