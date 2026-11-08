import type {
  InstallOptions,
  InstallProgress,
  PathValidation,
  RunningProcessInfo,
  SystemInfo,
  UninstallOptions,
  UninstallProgress,
} from './types';

const DUMMY_FILES = [
  'app/resources.pak',
  'app/main.exe',
  'app/v8_context_snapshot.bin',
  'app/icudtl.dat',
  'app/ffmpeg.dll',
  'app/d3dcompiler_47.dll',
  'app/locales/en-US.pak',
  'app/locales/es.pak',
  'app/locales/de.pak',
  'app/locales/tr.pak',
  'app/assets/icons/app.ico',
  'app/assets/splash.png',
  'app/modules/sqlite3.node',
  'app/webview2_loader.dll',
  'app/uninstall.exe',
];

export function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ||
    (window as unknown as { __TAURI__?: unknown }).__TAURI__
  );
}

export class MockInstallerDriver {
  static getSystemInfo(appName: string, _appId: string, _requiredBytes: number): SystemInfo {
    return {
      default_install_path: `C:\\Users\\Developer\\AppData\\Local\\Programs\\${appName}`,
      program_files_path: `C:\\Program Files\\${appName}`,
      desktop_path: 'C:\\Users\\Developer\\Desktop',
      start_menu_path: 'C:\\Users\\Developer\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs',
      available_space_bytes: 184 * 1024 * 1024 * 1024, // 184 GB
      is_elevated: false,
      is_already_installed: false,
      existing_version: null,
      existing_install_path: null,
    };
  }

  static validateInstallPath(_path: string, requiredBytes: number): PathValidation {
    const available = 184 * 1024 * 1024 * 1024;
    return {
      is_valid: true,
      is_writable: true,
      has_enough_space: available >= requiredBytes,
      available_bytes: available,
      error_message: null,
    };
  }

  static checkRunning(_executableName: string): RunningProcessInfo {
    return {
      is_running: false,
      process_ids: [],
    };
  }

  static async simulateInstallation(
    _options: InstallOptions,
    onProgress: (prog: InstallProgress) => void
  ): Promise<void> {
    const totalFiles = DUMMY_FILES.length;
    const totalBytes = 128 * 1024 * 1024; // 128 MB

    for (let i = 0; i < totalFiles; i++) {
      const file = DUMMY_FILES[i];
      const progressPercent = ((i + 1) / totalFiles) * 95;
      const bytesExtracted = Math.floor((progressPercent / 100) * totalBytes);

      onProgress({
        stage: 'extracting',
        current_file: file,
        files_completed: i + 1,
        total_files: totalFiles,
        bytes_extracted: bytesExtracted,
        total_bytes: totalBytes,
        percent: Math.round(progressPercent),
      });

      // Realistic file extraction delay
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // Creating shortcuts & registry
    onProgress({
      stage: 'creating_shortcuts',
      current_file: 'shortcuts',
      files_completed: totalFiles,
      total_files: totalFiles,
      bytes_extracted: totalBytes,
      total_bytes: totalBytes,
      percent: 98,
    });
    await new Promise((resolve) => setTimeout(resolve, 350));

    onProgress({
      stage: 'finished',
      current_file: '',
      files_completed: totalFiles,
      total_files: totalFiles,
      bytes_extracted: totalBytes,
      total_bytes: totalBytes,
      percent: 100,
    });
  }

  static async simulateUninstallation(
    _options: UninstallOptions,
    appName: string,
    onProgress: (prog: UninstallProgress) => void
  ): Promise<void> {
    const stages = [
      { stage: 'closing_process', percent: 20, message: `Checking for running instances of ${appName}...` },
      { stage: 'removing_shortcuts', percent: 45, message: 'Removing shortcuts from Desktop & Start Menu...' },
      { stage: 'removing_registry', percent: 70, message: 'Removing Windows Registry entries...' },
      { stage: 'deleting_files', percent: 90, message: 'Removing application files...' },
      { stage: 'finished', percent: 100, message: `${appName} successfully uninstalled.` },
    ];

    for (const s of stages) {
      onProgress(s);
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
}
