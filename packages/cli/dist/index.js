#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProgram = createProgram;
const commander_1 = require("commander");
const build_1 = require("./commands/build");
const cert_1 = require("./commands/cert");
const check_1 = require("./commands/check");
const clean_1 = require("./commands/clean");
const dev_1 = require("./commands/dev");
const init_1 = require("./commands/init");
const upgrade_1 = require("./commands/upgrade");
const winget_1 = require("./commands/winget");
function createProgram() {
    const program = new commander_1.Command();
    program
        .name('tauri-custom-installer')
        .alias('tci')
        .description('Build modern, web-based (React, Three.js 3D, Svelte, Vue, Solid, Vanilla) custom installers for Tauri v2')
        .version((0, init_1.getCliPackageVersion)());
    program
        .command('init')
        .description('Scaffold a custom installer UI workspace into ./installer')
        .option('-t, --template <type>', 'UI template: react, futuristic-3d, svelte, vue, vanilla')
        .option('-n, --name <appName>', 'Override application name')
        .option('-m, --mode <scope>', 'Default install scope: perUser, perMachine, both')
        .option('-y, --yes', 'Skip interactive prompts and use recommended defaults')
        .option('-f, --force', 'Overwrite existing installer directory')
        .action(init_1.runInit);
    program
        .command('dev')
        .description('Start installer UI dev server with safe mock API or TCI_DRY_RUN=1')
        .option('--tauri', 'Launch full Tauri native window with TCI_DRY_RUN=1 sandboxed registry')
        .action(dev_1.runDev);
    program
        .command('build')
        .description('Build the standalone single-file SFX setup executable')
        .option('-r, --release', 'Build release artifacts (default)', true)
        .option('-d, --debug', 'Include debug symbols')
        .option('--skip-app-build', 'Skip building the main Tauri app before bundling')
        .option('--arch <architecture>', 'Target architecture: x64, arm64, x86', 'x64')
        .option('--sign', 'Sign generated installer using config certificate/command')
        .option('--dry-run', 'Show build steps without creating output artifacts')
        .action(build_1.runBuild);
    program
        .command('upgrade')
        .alias('update')
        .description('Upgrade an existing ./installer workspace to the latest CLI, SDK, and metadata')
        .option('-t, --template <type>', 'Override detected template name')
        .option('--reset-ui', 'Re-copy template frontend files under ./installer/src')
        .option('--dry-run', 'Preview upgrade changes without modifying files')
        .option('-y, --yes', 'Skip interactive confirmations')
        .action(upgrade_1.runUpgrade);
    program
        .command('clean')
        .description('Remove temporary staging, payload, and build artifacts in the workspace')
        .option('-a, --all', 'Also remove installer/src-tauri/target and installer/node_modules')
        .option('--dry-run', 'Show files that would be cleaned without deleting them')
        .action(clean_1.runClean);
    program
        .command('winget')
        .description('Generate WinGet package manifests for your built installer')
        .option('-o, --out-dir <path>', 'Output directory for WinGet YAML manifests', './winget')
        .action(winget_1.runWinget);
    program
        .command('check')
        .alias('doctor')
        .description('Verify local development prerequisites, tools, and project config sync')
        .action(check_1.runCheck);
    program
        .command('cert [action] [target]')
        .description('Inspect, generate, or verify Windows certificates and SFX Authenticode layouts (check | generate | verify)')
        .option('--out-dir <dir>', 'Output directory for generated dev certificate', './certs')
        .option('--subject <cn>', 'Subject Common Name for generated dev certificate', 'Tauri Custom Installer Dev')
        .option('--store <store>', 'Target Windows certificate store snippet (Root | TrustedPublisher | CA | My)', 'TrustedPublisher')
        .option('--scope <scope>', 'Certificate store scope snippet (currentUser | localMachine)', 'currentUser')
        .action(cert_1.runCert);
    return program;
}
if (require.main === module) {
    createProgram().parse(process.argv);
}
