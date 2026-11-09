#!/usr/bin/env node

import { Command } from 'commander';
import { runBuild } from './commands/build';
import { runCheck } from './commands/check';
import { runDev } from './commands/dev';
import { runInit } from './commands/init';
import { runWinget } from './commands/winget';

export { defineConfig, detectAppConfig, detectPackageManager } from './utils/config';
export type { AppConfig, PackageManager, TciFileAssociation, TciUserConfig } from './utils/config';
export { buildSfxExecutable } from './utils/sfx';

export function createCliProgram(): Command {
  const program = new Command();

  program
    .name('tauri-custom-installer')
    .alias('tci')
    .description(
      'Build modern, web-based (React, Svelte, Vue, Solid, Vanilla) custom installers for Tauri v2'
    )
    .version('0.2.0');

  program
    .command('init')
    .description('Initialize custom installer directory in your Tauri v2 project')
    .option('-t, --template <template>', 'UI template to use: react, svelte, vue, vanilla')
    .option('-n, --name <name>', 'Name of the application')
    .option('-m, --mode <mode>', 'Default install scope: perUser, perMachine, both')
    .option('-y, --yes', 'Skip interactive prompts and use defaults')
    .option('-f, --force', 'Overwrite existing installer directory')
    .action(runInit);

  program
    .command('dev')
    .description('Launch the custom installer UI development server with live preview & HMR')
    .option('--native', 'Run native Tauri window in sandboxed dry-run mode')
    .action(runDev);

  program
    .command('build')
    .description('Package main app, compress payload, and build standalone custom setup executable')
    .option('--no-release', 'Build in debug mode')
    .option('--debug', 'Build in debug mode')
    .option('--skip-app-build', 'Skip compiling the main app and package existing binaries')
    .option('--arch <arch>', 'Target architecture: x64, arm64, x86')
    .option('--no-sign', 'Skip code signing even if configured')
    .option('--dry-run', 'Print the staged payload file list and sizes without building')
    .action(runBuild);

  program
    .command('winget')
    .description('Generate a WinGet package manifest with silent installer switches and SHA-256')
    .option('--url <url>', 'Download URL for the Setup.exe release asset')
    .option('-o, --out <file>', 'Output YAML file path')
    .action(runWinget);

  program
    .command('check')
    .description('Verify local development prerequisites and tools')
    .action(runCheck);

  return program;
}

if (require.main === module) {
  createCliProgram().parse(process.argv);
}
