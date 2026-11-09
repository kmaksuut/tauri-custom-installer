#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSfxExecutable = exports.detectPackageManager = exports.detectAppConfig = exports.defineConfig = void 0;
exports.createCliProgram = createCliProgram;
const commander_1 = require("commander");
const build_1 = require("./commands/build");
const check_1 = require("./commands/check");
const dev_1 = require("./commands/dev");
const init_1 = require("./commands/init");
const winget_1 = require("./commands/winget");
var config_1 = require("./utils/config");
Object.defineProperty(exports, "defineConfig", { enumerable: true, get: function () { return config_1.defineConfig; } });
Object.defineProperty(exports, "detectAppConfig", { enumerable: true, get: function () { return config_1.detectAppConfig; } });
Object.defineProperty(exports, "detectPackageManager", { enumerable: true, get: function () { return config_1.detectPackageManager; } });
var sfx_1 = require("./utils/sfx");
Object.defineProperty(exports, "buildSfxExecutable", { enumerable: true, get: function () { return sfx_1.buildSfxExecutable; } });
function createCliProgram() {
    const program = new commander_1.Command();
    program
        .name('tauri-custom-installer')
        .alias('tci')
        .description('Build modern, web-based (React, Svelte, Vue, Solid, Vanilla) custom installers for Tauri v2')
        .version('0.2.0');
    program
        .command('init')
        .description('Initialize custom installer directory in your Tauri v2 project')
        .option('-t, --template <template>', 'UI template to use: react, svelte, vue, vanilla')
        .option('-n, --name <name>', 'Name of the application')
        .option('-m, --mode <mode>', 'Default install scope: perUser, perMachine, both')
        .option('-y, --yes', 'Skip interactive prompts and use defaults')
        .option('-f, --force', 'Overwrite existing installer directory')
        .action(init_1.runInit);
    program
        .command('dev')
        .description('Launch the custom installer UI development server with live preview & HMR')
        .option('--native', 'Run native Tauri window in sandboxed dry-run mode')
        .action(dev_1.runDev);
    program
        .command('build')
        .description('Package main app, compress payload, and build standalone custom setup executable')
        .option('--no-release', 'Build in debug mode')
        .option('--debug', 'Build in debug mode')
        .option('--skip-app-build', 'Skip compiling the main app and package existing binaries')
        .option('--arch <arch>', 'Target architecture: x64, arm64, x86')
        .option('--no-sign', 'Skip code signing even if configured')
        .option('--dry-run', 'Print the staged payload file list and sizes without building')
        .action(build_1.runBuild);
    program
        .command('winget')
        .description('Generate a WinGet package manifest with silent installer switches and SHA-256')
        .option('--url <url>', 'Download URL for the Setup.exe release asset')
        .option('-o, --out <file>', 'Output YAML file path')
        .action(winget_1.runWinget);
    program
        .command('check')
        .description('Verify local development prerequisites and tools')
        .action(check_1.runCheck);
    return program;
}
if (require.main === module) {
    createCliProgram().parse(process.argv);
}
