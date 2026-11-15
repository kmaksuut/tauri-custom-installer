"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runUpgrade = runUpgrade;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const picocolors_1 = __importDefault(require("picocolors"));
const config_1 = require("../utils/config");
const init_1 = require("./init");
function detectInstalledTemplate(targetDir, tciTemplate) {
    if (typeof tciTemplate === 'string' && tciTemplate.trim().length > 0) {
        return (0, init_1.normalizeTemplateName)(tciTemplate);
    }
    const pkgPath = node_path_1.default.join(targetDir, 'package.json');
    if (node_fs_1.default.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(node_fs_1.default.readFileSync(pkgPath, 'utf8'));
            const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
            if (deps.three)
                return 'futuristic-3d';
            if (deps.react)
                return 'react';
            if (deps.svelte)
                return 'svelte';
            if (deps.vue)
                return 'vue';
        }
        catch {
            // ignore
        }
    }
    return 'vanilla';
}
async function runUpgrade(options = {}) {
    const cwd = process.cwd();
    const targetDir = node_path_1.default.join(cwd, 'installer');
    const cliVersion = (0, init_1.getCliPackageVersion)();
    console.log(picocolors_1.default.cyan(`\n🔄 Upgrading Tauri Custom Installer workspace to v${cliVersion}...\n`));
    if (!node_fs_1.default.existsSync(targetDir)) {
        console.error(picocolors_1.default.red(`❌ Directory 'installer/' was not found in ${cwd}.`));
        console.error(picocolors_1.default.gray(`Run \`tci init\` first to create an installer.\n`));
        process.exit(1);
    }
    const tciConfigPath = node_path_1.default.join(cwd, 'tci.config.json');
    let rawTciConfig = {};
    if (node_fs_1.default.existsSync(tciConfigPath)) {
        try {
            rawTciConfig = JSON.parse(node_fs_1.default.readFileSync(tciConfigPath, 'utf8'));
        }
        catch {
            console.log(picocolors_1.default.yellow(`⚠️  Could not parse existing tci.config.json; skipping config update.`));
        }
    }
    const template = options.template
        ? (0, init_1.normalizeTemplateName)(options.template)
        : detectInstalledTemplate(targetDir, rawTciConfig.template);
    const templateDir = (0, init_1.resolveTemplateDir)(cwd, template);
    if (!templateDir) {
        console.error(picocolors_1.default.red(`❌ Template '${template}' not found.`));
        console.error(picocolors_1.default.gray(`Available templates: ${init_1.AVAILABLE_TEMPLATES.join(', ')}\n`));
        process.exit(1);
    }
    const appConfig = (0, config_1.detectAppConfig)(cwd);
    const actions = [
        `Template baseline: ${template}`,
        `Sync @tauri-custom-installer/client SDK & tauri-custom-installer-core (v${cliVersion})`,
        `Sync installer/src/installer.config.json, Cargo.toml, and tauri.conf.json (${appConfig.appName} v${appConfig.version})`,
        `Refresh installer/src-tauri/build.rs and capabilities/`,
        `Update installer/AGENTS.md, .gitignore, and package.json installer scripts`,
    ];
    if (options.resetUi) {
        actions.push(`Reset UI files (installer/src/, index.html, frontend config) from '${template}' template`);
    }
    else {
        actions.push(`Preserve existing custom UI files under installer/src/`);
    }
    if (options.dryRun) {
        console.log(picocolors_1.default.yellow(`🧪 Dry-run mode enabled — planned upgrade actions:`));
        for (const step of actions) {
            console.log(`  • ${step}`);
        }
        console.log();
        return;
    }
    if (options.resetUi) {
        for (const rel of ['index.html', 'package.json', 'vite.config.ts', 'tsconfig.json', 'src']) {
            const srcPath = node_path_1.default.join(templateDir, rel);
            const destPath = node_path_1.default.join(targetDir, rel);
            if (!node_fs_1.default.existsSync(srcPath))
                continue;
            if (node_fs_1.default.statSync(srcPath).isDirectory()) {
                (0, init_1.copyDirSync)(srcPath, destPath);
            }
            else {
                node_fs_1.default.copyFileSync(srcPath, destPath);
            }
        }
    }
    // Sync template Rust runtime glue (build.rs, capabilities, src/main.rs) cleanly
    for (const rel of [
        node_path_1.default.join('src-tauri', 'build.rs'),
        node_path_1.default.join('src-tauri', 'capabilities'),
        node_path_1.default.join('src-tauri', 'src', 'main.rs'),
    ]) {
        const srcPath = node_path_1.default.join(templateDir, rel);
        const destPath = node_path_1.default.join(targetDir, rel);
        if (!node_fs_1.default.existsSync(srcPath))
            continue;
        if (node_fs_1.default.statSync(srcPath).isDirectory()) {
            (0, init_1.copyDirSync)(srcPath, destPath);
        }
        else {
            node_fs_1.default.mkdirSync(node_path_1.default.dirname(destPath), { recursive: true });
            node_fs_1.default.copyFileSync(srcPath, destPath);
        }
    }
    // Record detected template in tci.config.json if absent
    if (node_fs_1.default.existsSync(tciConfigPath) && typeof rawTciConfig === 'object' && !rawTciConfig.template) {
        try {
            const updated = { template, ...rawTciConfig };
            node_fs_1.default.writeFileSync(tciConfigPath, JSON.stringify(updated, null, 2));
        }
        catch {
            // ignore
        }
    }
    (0, init_1.syncInstallerMetadataAndSdk)(cwd, targetDir, appConfig, true);
    (0, init_1.writeInstallerAgentsMd)(targetDir, template);
    (0, init_1.ensureProjectGitignore)(cwd);
    (0, init_1.ensureRootPackageScripts)(cwd);
    console.log(picocolors_1.default.green(`✔ Installer workspace upgraded (${template})`));
    console.log(picocolors_1.default.gray(`  App: ${appConfig.appName} v${appConfig.version} (${appConfig.identifier})`));
    if (options.resetUi) {
        console.log(picocolors_1.default.yellow(`  UI reset from template '${template}'. Re-install UI dependencies if needed.`));
    }
    else {
        console.log(picocolors_1.default.gray(`  Custom UI under installer/src/ was preserved (pass --reset-ui to overwrite).`));
    }
    console.log();
}
