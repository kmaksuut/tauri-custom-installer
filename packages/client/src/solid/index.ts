import { createInstallerStore, type InstallerStore } from '../store';
import type { InstallerConfig } from '../types';

/**
 * SolidJS-compatible reactive installer store helper.
 */
export function createSolidInstaller(config: InstallerConfig = {}): InstallerStore {
  const store = createInstallerStore(config);
  void store.init();
  return store;
}

export * from '../types';
export * from '../store';
