import type { RunningProcessInfo, StructuredError, UninstallProgress, UninstallStep } from '../types';
export interface UseUninstallConfig {
    appId?: string;
    appName?: string;
    executableName?: string;
    installDir?: string;
}
export declare function useUninstall(config?: UseUninstallConfig): {
    step: UninstallStep;
    setStep: import("react").Dispatch<import("react").SetStateAction<UninstallStep>>;
    purgeUserData: boolean;
    setPurgeUserData: import("react").Dispatch<import("react").SetStateAction<boolean>>;
    progress: UninstallProgress;
    runningProcesses: RunningProcessInfo;
    errorMessage: string | null;
    structuredError: StructuredError | null;
    startUninstall: () => Promise<void>;
    terminateRunningAndUninstall: () => Promise<void>;
    exit: () => Promise<void>;
};
//# sourceMappingURL=useUninstall.d.ts.map