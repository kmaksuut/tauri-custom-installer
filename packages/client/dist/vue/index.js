import { createInstallerStore } from '../store';
/**
 * Vue-compatible reactive installer store helper.
 */
export function createVueInstaller(config = {}) {
    const store = createInstallerStore(config);
    void store.init();
    return store;
}
export * from '../types';
export * from '../store';
//# sourceMappingURL=index.js.map