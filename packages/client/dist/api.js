import { Channel, invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment, MockInstallerDriver } from './mock';
export function parseStructuredError(err) {
    const raw = err instanceof Error ? err.message : String(err ?? 'Unknown error');
    const match = raw.match(/^([A-Z0-9_]+):\s*(.*)$/);
    if (match) {
        return {
            code: match[1],
            message: match[2] || raw,
            details: raw,
        };
    }
    return {
        code: 'INTERNAL_ERROR',
        message: raw,
        details: null,
    };
}
export class InstallerApi {
    static async getSystemInfo(appName, appId, requiredBytes) {
        if (!isTauriEnvironment()) {
            return MockInstallerDriver.getSystemInfo(appName, appId, requiredBytes);
        }
        return invoke('get_system_info', {
            appName: appName ?? null,
            appId: appId ?? null,
            requiredBytes: requiredBytes ?? null,
        });
    }
    static async validateInstallPath(path, requiredBytes) {
        if (!isTauriEnvironment()) {
            return MockInstallerDriver.validateInstallPath(path, requiredBytes ?? 50 * 1024 * 1024);
        }
        return invoke('validate_install_path', {
            path,
            requiredBytes: requiredBytes ?? null,
        });
    }
    static async selectFolder(initialPath, appName) {
        if (!isTauriEnvironment()) {
            return MockInstallerDriver.selectFolder(initialPath, appName);
        }
        return invoke('select_folder', {
            initialPath: initialPath ?? null,
            appName: appName ?? null,
        });
    }
    static async checkRunning(executableName, installDir) {
        if (!isTauriEnvironment()) {
            return MockInstallerDriver.checkRunning(executableName ?? 'app.exe');
        }
        return invoke('check_running', {
            executableName: executableName ?? null,
            installDir: installDir ?? null,
        });
    }
    static async killRunning(pids, executableName, installDir) {
        if (!isTauriEnvironment()) {
            return;
        }
        return invoke('kill_running', {
            pids: pids ?? null,
            executableName: executableName ?? null,
            installDir: installDir ?? null,
        });
    }
    static async startInstallation(options, onProgress) {
        if (!isTauriEnvironment()) {
            return MockInstallerDriver.simulateInstallation(options, onProgress);
        }
        const channel = new Channel();
        channel.onmessage = (progress) => {
            onProgress(progress);
        };
        return invoke('start_installation', {
            options,
            onProgress: channel,
        });
    }
    static async cancelInstallation() {
        if (!isTauriEnvironment()) {
            MockInstallerDriver.cancelInstallation();
            return;
        }
        return invoke('cancel_installation');
    }
    static async launchInstalledApp(executablePath) {
        if (!isTauriEnvironment()) {
            console.log(`[Mock] Launching installed app${executablePath ? ` at: ${executablePath}` : ''}`);
            return;
        }
        return invoke('launch_installed_app', {
            executablePath: executablePath ?? null,
        });
    }
    static async openExternalUrl(url) {
        if (!isTauriEnvironment()) {
            if (typeof window !== 'undefined') {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
            return;
        }
        return invoke('open_external_url', { url });
    }
    static async startUninstallation(options, appName, executableName, onProgress) {
        if (!isTauriEnvironment()) {
            return MockInstallerDriver.simulateUninstallation(options, appName ?? 'Application', onProgress ?? (() => { }));
        }
        const channel = new Channel();
        channel.onmessage = (progress) => {
            if (onProgress)
                onProgress(progress);
        };
        return invoke('start_uninstallation', {
            options,
            appName: appName ?? null,
            executableName: executableName ?? null,
            onProgress: channel,
        });
    }
    static async minimizeInstaller() {
        if (!isTauriEnvironment()) {
            return;
        }
        return invoke('minimize_installer');
    }
    static async exitInstaller() {
        if (!isTauriEnvironment()) {
            return;
        }
        return invoke('exit_installer');
    }
}
//# sourceMappingURL=api.js.map