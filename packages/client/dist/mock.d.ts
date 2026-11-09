import type { InstallOptions, InstallProgress, PathValidation, RunningProcessInfo, SimulationScenario, SystemInfo, UninstallOptions, UninstallProgress } from './types';
export declare function isTauriEnvironment(): boolean;
export declare class MockInstallerDriver {
    private static cancelRequested;
    private static currentScenario;
    private static folderChoiceIndex;
    private static stepDelayMs;
    static setScenario(scenario: SimulationScenario): void;
    static getScenario(): SimulationScenario;
    static setStepDelay(ms: number): void;
    static getSystemInfo(appName?: string, appId?: string, requiredBytes?: number): SystemInfo;
    static validateInstallPath(path: string, requiredBytes: number): PathValidation;
    static selectFolder(initialPath?: string, appName?: string): Promise<string | null>;
    static checkRunning(_executableName: string): RunningProcessInfo;
    static cancelInstallation(): void;
    static simulateInstallation(_options: InstallOptions, onProgress: (prog: InstallProgress) => void): Promise<void>;
    static simulateUninstallation(options: UninstallOptions, appName: string, onProgress: (prog: UninstallProgress) => void): Promise<void>;
}
//# sourceMappingURL=mock.d.ts.map