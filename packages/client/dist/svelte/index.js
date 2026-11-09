import { createInstallerStore } from '../store';
/**
 * Svelte-compatible readable store + actions for Tauri Custom Installer.
 * Works directly with Svelte's `$installer` auto-subscription syntax or Svelte 5 runes.
 */
export function createSvelteInstaller(config = {}) {
    const store = createInstallerStore(config);
    void store.init();
    return store;
}
export * from '../types';
export * from '../store';
//# sourceMappingURL=index.js.map