import { createInstallerStore } from '../store';
/**
 * SolidJS-compatible reactive installer store helper.
 */
export function createSolidInstaller(config = {}) {
    const store = createInstallerStore(config);
    void store.init();
    return store;
}
export * from '../types';
export * from '../store';
//# sourceMappingURL=index.js.map