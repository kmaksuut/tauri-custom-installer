import { type InstallerStore } from '../store';
import type { InstallerConfig } from '../types';
/**
 * Svelte-compatible readable store + actions for Tauri Custom Installer.
 * Works directly with Svelte's `$installer` auto-subscription syntax or Svelte 5 runes.
 */
export declare function createSvelteInstaller(config?: InstallerConfig): InstallerStore;
export * from '../types';
export * from '../store';
//# sourceMappingURL=index.d.ts.map