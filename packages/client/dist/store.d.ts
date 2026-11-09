import { type InstallerTranslations } from './i18n';
import type { AppManifest, InstallAction, InstallerConfig, InstallerStep, InstallProgress, PathValidation, RunningProcessInfo, SimulationScenario, StructuredError, SystemInfo, UninstallProgress, UninstallStep } from './types';
export interface InstallerStoreState {
    step: InstallerStep;
    uninstallStep: UninstallStep;
    isLoading: boolean;
    isUninstallMode: boolean;
    action: InstallAction;
    manifest: AppManifest;
    systemInfo: SystemInfo | null;
    installPath: string;
    installScope: 'perUser' | 'perMachine';
    createDesktopShortcut: boolean;
    createStartMenuShortcut: boolean;
    autoLaunchOnStartup: boolean;
    launchAfterInstall: boolean;
    addToPath: boolean;
    purgeUserData: boolean;
    licenseAccepted: boolean;
    validation: PathValidation | null;
    progress: InstallProgress;
    uninstallProgress: UninstallProgress;
    runningProcesses: RunningProcessInfo;
    errorMessage: string | null;
    structuredError: StructuredError | null;
    locale: string;
    isRtl: boolean;
    t: InstallerTranslations;
}
export interface InstallerStore {
    getState(): InstallerStoreState;
    subscribe(listener: (state: InstallerStoreState) => void): () => void;
    init(): Promise<void>;
    setStep(step: InstallerStep): void;
    setUninstallStep(step: UninstallStep): void;
    setInstallPath(path: string): Promise<void>;
    browseInstallPath(): Promise<void>;
    setInstallScope(scope: 'perUser' | 'perMachine'): Promise<void>;
    setCreateDesktopShortcut(val: boolean): void;
    setCreateStartMenuShortcut(val: boolean): void;
    setAutoLaunchOnStartup(val: boolean): void;
    setLaunchAfterInstall(val: boolean): void;
    setAddToPath(val: boolean): void;
    setPurgeUserData(val: boolean): void;
    setLicenseAccepted(val: boolean): void;
    setScenario(scenario: SimulationScenario): Promise<void>;
    startInstall(): Promise<void>;
    cancelInstall(): Promise<void>;
    terminateRunningAndInstall(): Promise<void>;
    startUninstall(): Promise<void>;
    terminateRunningAndUninstall(): Promise<void>;
    launchApp(): Promise<void>;
    openUrl(url: string): Promise<void>;
    minimize(): Promise<void>;
    exit(): Promise<void>;
}
export declare function createInstallerStore(config?: InstallerConfig): InstallerStore;
//# sourceMappingURL=store.d.ts.map