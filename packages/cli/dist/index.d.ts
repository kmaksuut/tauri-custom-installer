#!/usr/bin/env node
import { Command } from 'commander';
export { defineConfig, detectAppConfig, detectPackageManager } from './utils/config';
export type { AppConfig, PackageManager, TciFileAssociation, TciUserConfig } from './utils/config';
export { buildSfxExecutable } from './utils/sfx';
export declare function createCliProgram(): Command;
