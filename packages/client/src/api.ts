import { Channel, invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment, MockInstallerDriver } from './mock';
import type {
  InstallOptions,
  InstallProgress,
  PathValidation,
  RunningProcessInfo,
  StructuredError,
  SystemInfo,
  UninstallOptions,
  UninstallProgress,
} from './types';

export function parseStructuredError(err: unknown): StructuredError {
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
  static async getSystemInfo(
    appName?: string,
    appId?: string,
    requiredBytes?: number
  ): Promise<SystemInfo> {
    if (!isTauriEnvironment()) {
      return MockInstallerDriver.getSystemInfo(appName, appId, requiredBytes);
    }
    return invoke<SystemInfo>('get_system_info', {
      appName: appName ?? null,
      appId: appId ?? null,
      requiredBytes: requiredBytes ?? null,
    });
  }

  static async validateInstallPath(
    path: string,
    requiredBytes?: number
  ): Promise<PathValidation> {
    if (!isTauriEnvironment()) {
      return MockInstallerDriver.validateInstallPath(path, requiredBytes ?? 50 * 1024 * 1024);
    }
    return invoke<PathValidation>('validate_install_path', {
      path,
      requiredBytes: requiredBytes ?? null,
    });
  }

  static async selectFolder(initialPath?: string, appName?: string): Promise<string | null> {
    if (!isTauriEnvironment()) {
      return MockInstallerDriver.selectFolder(initialPath, appName);
    }
    return invoke<string | null>('select_folder', {
      initialPath: initialPath ?? null,
      appName: appName ?? null,
    });
  }

  static async checkRunning(
    executableName?: string,
    installDir?: string
  ): Promise<RunningProcessInfo> {
    if (!isTauriEnvironment()) {
      return MockInstallerDriver.checkRunning(executableName ?? 'app.exe');
    }
    return invoke<RunningProcessInfo>('check_running', {
      executableName: executableName ?? null,
      installDir: installDir ?? null,
    });
  }

  static async killRunning(
    pids?: number[],
    executableName?: string,
    installDir?: string
  ): Promise<void> {
    if (!isTauriEnvironment()) {
      return;
    }
    return invoke<void>('kill_running', {
      pids: pids ?? null,
      executableName: executableName ?? null,
      installDir: installDir ?? null,
    });
  }

  static async startInstallation(
    options: InstallOptions,
    onProgress: (progress: InstallProgress) => void
  ): Promise<void> {
    if (!isTauriEnvironment()) {
      return MockInstallerDriver.simulateInstallation(options, onProgress);
    }

    const channel = new Channel<InstallProgress>();
    channel.onmessage = (progress) => {
      onProgress(progress);
    };

    return invoke<void>('start_installation', {
      options,
      onProgress: channel,
    });
  }

  static async cancelInstallation(): Promise<void> {
    if (!isTauriEnvironment()) {
      MockInstallerDriver.cancelInstallation();
      return;
    }
    return invoke<void>('cancel_installation');
  }

  static async launchInstalledApp(executablePath?: string): Promise<void> {
    if (!isTauriEnvironment()) {
      console.log(`[Mock] Launching installed app${executablePath ? ` at: ${executablePath}` : ''}`);
      return;
    }
    return invoke<void>('launch_installed_app', {
      executablePath: executablePath ?? null,
    });
  }

  static async openExternalUrl(url: string): Promise<void> {
    if (!isTauriEnvironment()) {
      if (typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    return invoke<void>('open_external_url', { url });
  }

  static async startUninstallation(
    options: UninstallOptions,
    appName?: string,
    executableName?: string,
    onProgress?: (progress: UninstallProgress) => void
  ): Promise<void> {
    if (!isTauriEnvironment()) {
      return MockInstallerDriver.simulateUninstallation(
        options,
        appName ?? 'Application',
        onProgress ?? (() => {})
      );
    }

    const channel = new Channel<UninstallProgress>();
    channel.onmessage = (progress) => {
      if (onProgress) onProgress(progress);
    };

    return invoke<void>('start_uninstallation', {
      options,
      appName: appName ?? null,
      executableName: executableName ?? null,
      onProgress: channel,
    });
  }

  static async minimizeInstaller(): Promise<void> {
    if (!isTauriEnvironment()) {
      return;
    }
    return invoke<void>('minimize_installer');
  }

  static async exitInstaller(): Promise<void> {
    if (!isTauriEnvironment()) {
      return;
    }
    return invoke<void>('exit_installer');
  }
}
