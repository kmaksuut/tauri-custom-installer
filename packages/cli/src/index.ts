#!/usr/bin/env node

import { Command } from 'commander';
import { runBuild } from './commands/build';
import { runCert } from './commands/cert';
import { runCheck } from './commands/check';
import { runClean } from './commands/clean';
import { runDev } from './commands/dev';
import { getCliPackageVersion, runInit } from './commands/init';
import { runUpgrade } from './commands/upgrade';
import { runWinget } from './commands/winget';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('tauri-custom-installer')
    .alias('tci')
    .description(
      'Build modern, web-based (React, Three.js 3D, Svelte, Vue, Solid, Vanilla) custom installers for Tauri v2'
    )
    .version(getCliPackageVersion());

  program
    .command('init')
    .description('Scaffold a custom installer UI workspace into ./installer')
    .option('-t, --template <type>', 'UI template: react, futuristic-3d, svelte, vue, vanilla')
    .option('-n, --name <appName>', 'Override application name')
    .option('-m, --mode <scope>', 'Default install scope: perUser, perMachine, both')
    .option('-y, --yes', 'Skip interactive prompts and use recommended defaults')
    .option('-f, --force', 'Overwrite existing installer directory')
    .action(runInit);

  program
    .command('dev')
    .description('Start installer UI dev server with safe mock API or TCI_DRY_RUN=1')
    .option('--tauri', 'Launch full Tauri native window with TCI_DRY_RUN=1 sandboxed registry')
    .action(runDev);

  program
    .command('build')
    .description('Build the standalone single-file SFX setup executable')
    .option('-r, --release', 'Build release artifacts (default)', true)
    .option('-d, --debug', 'Include debug symbols')
    .option('--skip-app-build', 'Skip building the main Tauri app before bundling')
    .option('--arch <architecture>', 'Target architecture: x64, arm64, x86', 'x64')
    .option('--sign', 'Sign generated installer using config certificate/command')
    .option('--dry-run', 'Show build steps without creating output artifacts')
    .action(runBuild);

  program
    .command('upgrade')
    .alias('update')
    .description('Upgrade an existing ./installer workspace to the latest CLI, SDK, and metadata')
    .option('-t, --template <type>', 'Override detected template name')
    .option('--reset-ui', 'Re-copy template frontend files under ./installer/src')
    .option('--dry-run', 'Preview upgrade changes without modifying files')
    .option('-y, --yes', 'Skip interactive confirmations')
    .action(runUpgrade);

  program
    .command('clean')
    .description('Remove temporary staging, payload, and build artifacts in the workspace')
    .option('-a, --all', 'Also remove installer/src-tauri/target and installer/node_modules')
    .option('--dry-run', 'Show files that would be cleaned without deleting them')
    .action(runClean);

  program
    .command('winget')
    .description('Generate WinGet package manifests for your built installer')
    .option('-o, --out-dir <path>', 'Output directory for WinGet YAML manifests', './winget')
    .action(runWinget);

  program
    .command('check')
    .alias('doctor')
    .description('Verify local development prerequisites, tools, and project config sync')
    .action(runCheck);

  program
    .command('cert [action] [target]')
    .description('Inspect, generate, or verify Windows certificates and SFX Authenticode layouts (check | generate | verify)')
    .option('--out-dir <dir>', 'Output directory for generated dev certificate', './certs')
    .option('--subject <cn>', 'Subject Common Name for generated dev certificate', 'Tauri Custom Installer Dev')
    .option('--store <store>', 'Target Windows certificate store snippet (Root | TrustedPublisher | CA | My)', 'TrustedPublisher')
    .option('--scope <scope>', 'Certificate store scope snippet (currentUser | localMachine)', 'currentUser')
    .action(runCert);

  return program;
}

if (require.main === module) {
  createProgram().parse(process.argv);
}
