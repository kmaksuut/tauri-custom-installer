import { useEffect, useRef, useState } from 'react';
import { createInstallerStore, type InstallerStore } from '../store';
import type { InstallerConfig } from '../types';

export function useInstaller(config: InstallerConfig = {}) {
  const storeRef = useRef<InstallerStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createInstallerStore(config);
  }
  const store = storeRef.current;

  const [state, setState] = useState(() => store.getState());

  useEffect(() => {
    const unsubscribe = store.subscribe((nextState) => {
      setState(nextState);
    });
    void store.init();
    return unsubscribe;
  }, [store]);

  return {
    ...state,
    setStep: store.setStep,
    setUninstallStep: store.setUninstallStep,
    setInstallPath: store.setInstallPath,
    browseInstallPath: store.browseInstallPath,
    setInstallScope: store.setInstallScope,
    setCreateDesktopShortcut: store.setCreateDesktopShortcut,
    setCreateStartMenuShortcut: store.setCreateStartMenuShortcut,
    setAutoLaunchOnStartup: store.setAutoLaunchOnStartup,
    setLaunchAfterInstall: store.setLaunchAfterInstall,
    setAddToPath: store.setAddToPath,
    setPurgeUserData: store.setPurgeUserData,
    setLicenseAccepted: store.setLicenseAccepted,
    setScenario: store.setScenario,
    startInstall: store.startInstall,
    cancelInstall: store.cancelInstall,
    terminateRunningAndInstall: store.terminateRunningAndInstall,
    startUninstall: store.startUninstall,
    terminateRunningAndUninstall: store.terminateRunningAndUninstall,
    launchApp: store.launchApp,
    openUrl: store.openUrl,
    minimize: store.minimize,
    exit: store.exit,
  };
}
