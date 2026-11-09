import { Channel, invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment, MockInstallerDriver } from './mock';
import type {
  InstallOptions,
  InstallProgress,
  PathValidation,
  RunningProcessInfo,
  SystemInfo,
  UninstallOptions,
  UninstallProgress,
} from './types';

export class InstallerApi {
  static async getSystemInfo(
    appName: string,
    appId: string,
    requiredBytes = 50 * 1024 * 1024
  ): Promise<SystemInfo> {
    if (!isTauriEnvironment()) {
      return MockInstallerDriver.getSystemInfo(appName, appId, requiredBytes);
    }
    return invoke<SystemInfo>('get_system_info', {
      appName,
      appId,
      requiredBytes,
    });
  }

  static async validateInstallPath(
    path: string,
    requiredBytes = 50 * 1024 * 1024
  ): Promise<PathValidation> {
    if (!isTauriEnvironment()) {
      return MockInstallerDriver.validateInstallPath(path, requiredBytes);
    }
    return invoke<PathValidation>('validate_install_path', {
      path,
      requiredBytes,
    });
  }

  static async selectFolder(initialPath?: string): Promise<string | null> {
    if (!isTauriEnvironment()) {
      return MockInstallerDriver.selectFolder(initialPath);
    }
    return invoke<string | null>('select_folder', {
      initialPath: initialPath ?? null,
    });
  }

  static async checkRunning(executableName: string): Promise<RunningProcessInfo> {
    if (!isTauriEnvironment()) {
      return MockInstallerDriver.checkRunning(executableName);
    }
    return invoke<RunningProcessInfo>('check_running', {
      executableName,
    });
  }

  static async killRunning(pids: number[]): Promise<void> {
    if (!isTauriEnvironment()) {
      return;
    }
    return invoke<void>('kill_running', { pids });
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

  static async launchInstalledApp(executablePath: string): Promise<void> {
    if (!isTauriEnvironment()) {
      console.log(`[Mock] Launching installed app at: ${executablePath}`);
      return;
    }
    return invoke<void>('launch_installed_app', { executablePath });
  }

  static async startUninstallation(
    options: UninstallOptions,
    appName: string,
    executableName: string,
    onProgress: (progress: UninstallProgress) => void
  ): Promise<void> {
    if (!isTauriEnvironment()) {
      return MockInstallerDriver.simulateUninstallation(options, appName, onProgress);
    }

    const channel = new Channel<UninstallProgress>();
    channel.onmessage = (progress) => {
      onProgress(progress);
    };

    return invoke<void>('start_uninstallation', {
      options,
      appName,
      executableName,
      onProgress: channel,
    });
  }

  static async minimizeInstaller(): Promise<void> {
    if (!isTauriEnvironment()) {
      console.log('[Mock] Minimizing installer window');
      return;
    }
    return invoke<void>('minimize_installer');
  }

  static async exitInstaller(): Promise<void> {
    if (!isTauriEnvironment()) {
      console.log('[Mock] Exiting installer window');
      return;
    }
    return invoke<void>('exit_installer');
  }
}
