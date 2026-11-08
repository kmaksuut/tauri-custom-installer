#!/usr/bin/env node

import { Command } from 'commander';
import { runBuild } from './commands/build';
import { runCheck } from './commands/check';
import { runDev } from './commands/dev';
import { runInit } from './commands/init';

const program = new Command();

program
  .name('tauri-custom-installer')
  .alias('tci')
  .description('Build modern, web-based (React, Svelte, Vue) custom installers for Tauri v2')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize custom installer directory in your Tauri v2 project')
  .option('-t, --template <template>', 'UI template to use: react, svelte, vue, vanilla', 'react')
  .option('-n, --name <name>', 'Name of the application')
  .option('-f, --force', 'Overwrite existing installer directory')
  .action(runInit);

program
  .command('dev')
  .description('Launch the custom installer UI development server with live preview & HMR')
  .action(runDev);

program
  .command('build')
  .description('Package main app, embed payload, and build standalone custom setup executable')
  .option('--no-release', 'Build in debug mode')
  .option('--skip-app-build', 'Skip compiling the main app and package existing binaries')
  .action(runBuild);

program
  .command('check')
  .description('Verify local development prerequisites and tools')
  .action(runCheck);

program.parse(process.argv);
