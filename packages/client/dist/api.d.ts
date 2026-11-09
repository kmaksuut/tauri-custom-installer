import type { InstallOptions, InstallProgress, PathValidation, RunningProcessInfo, StructuredError, SystemInfo, UninstallOptions, UninstallProgress } from './types';
export declare function parseStructuredError(err: unknown): StructuredError;
export declare class InstallerApi {
    static getSystemInfo(appName?: string, appId?: string, requiredBytes?: number): Promise<SystemInfo>;
    static validateInstallPath(path: string, requiredBytes?: number): Promise<PathValidation>;
    static selectFolder(initialPath?: string, appName?: string): Promise<string | null>;
    static checkRunning(executableName?: string, installDir?: string): Promise<RunningProcessInfo>;
    static killRunning(pids?: number[], executableName?: string, installDir?: string): Promise<void>;
    static startInstallation(options: InstallOptions, onProgress: (progress: InstallProgress) => void): Promise<void>;
    static cancelInstallation(): Promise<void>;
    static launchInstalledApp(executablePath?: string): Promise<void>;
    static openExternalUrl(url: string): Promise<void>;
    static startUninstallation(options: UninstallOptions, appName?: string, executableName?: string, onProgress?: (progress: UninstallProgress) => void): Promise<void>;
    static minimizeInstaller(): Promise<void>;
    static exitInstaller(): Promise<void>;
}
//# sourceMappingURL=api.d.ts.map