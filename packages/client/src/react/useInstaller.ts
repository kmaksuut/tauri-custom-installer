import { useCallback, useEffect, useState } from 'react';
import { InstallerApi } from '../api';
import type {
  InstallerConfig,
  InstallerStep,
  InstallProgress,
  PathValidation,
  RunningProcessInfo,
  SystemInfo,
} from '../types';

export function useInstaller(config: InstallerConfig) {
  const {
    appName,
    appId,
    appVersion,
    publisher,
    executableName,
    requiredBytes = 50 * 1024 * 1024,
  } = config;

  const [step, setStep] = useState<InstallerStep>('welcome');
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [installPath, setInstallPath] = useState<string>('');
  const [createDesktopShortcut, setCreateDesktopShortcut] = useState<boolean>(true);
  const [createStartMenuShortcut, setCreateStartMenuShortcut] = useState<boolean>(true);
  const [autoLaunchOnStartup, setAutoLaunchOnStartup] = useState<boolean>(false);
  const [launchAfterInstall, setLaunchAfterInstall] = useState<boolean>(true);

  const [validation, setValidation] = useState<PathValidation | null>(null);
  const [progress, setProgress] = useState<InstallProgress>({
    stage: 'idle',
    current_file: '',
    files_completed: 0,
    total_files: 0,
    bytes_extracted: 0,
    total_bytes: 0,
    percent: 0,
  });

  const [runningProcesses, setRunningProcesses] = useState<RunningProcessInfo>({
    is_running: false,
    process_ids: [],
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUninstallMode, setIsUninstallMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('mode') === 'uninstall';
  });

  // Initialize system specs & default path
  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        const info = await InstallerApi.getSystemInfo(appName, appId, requiredBytes);
        if (isMounted) {
          setSystemInfo(info);
          setInstallPath(info.default_install_path);
          if (info.is_uninstall_mode) {
            setIsUninstallMode(true);
          }

          const val = await InstallerApi.validateInstallPath(
            info.default_install_path,
            requiredBytes
          );
          setValidation(val);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setErrorMessage(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    init();
    return () => {
      isMounted = false;
    };
  }, [appName, appId, requiredBytes]);

  // Handle path changes & re-validate
  const updateInstallPath = useCallback(
    async (path: string) => {
      setInstallPath(path);
      const val = await InstallerApi.validateInstallPath(path, requiredBytes);
      setValidation(val);
    },
    [requiredBytes]
  );

  // Open native folder picker dialog
  const browseInstallPath = useCallback(async () => {
    try {
      const selected = await InstallerApi.selectFolder(installPath);
      if (selected) {
        await updateInstallPath(selected);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }, [installPath, updateInstallPath]);

  // Actual installation routine
  const performInstallation = useCallback(async () => {
    setStep('installing');
    setErrorMessage(null);

    try {
      await InstallerApi.startInstallation(
        {
          app_name: appName,
          app_id: appId,
          app_version: appVersion,
          publisher,
          executable_name: executableName,
          install_dir: installPath,
          create_desktop_shortcut: createDesktopShortcut,
          create_start_menu_shortcut: createStartMenuShortcut,
          auto_launch_on_startup: autoLaunchOnStartup,
          launch_after_install: launchAfterInstall,
        },
        (prog) => {
          setProgress(prog);
        }
      );

      setStep('completed');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStep('error');
    }
  }, [
    appName,
    appId,
    appVersion,
    publisher,
    executableName,
    installPath,
    createDesktopShortcut,
    createStartMenuShortcut,
    autoLaunchOnStartup,
    launchAfterInstall,
  ]);

  // Check if running prior to installing
  const proceedToInstall = useCallback(async () => {
    try {
      const running = await InstallerApi.checkRunning(executableName);
      if (running.is_running) {
        setRunningProcesses(running);
        setStep('running_warning');
        return;
      }
      await performInstallation();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStep('error');
    }
  }, [executableName, performInstallation]);

  // Cancel active installation
  const cancelInstall = useCallback(async () => {
    await InstallerApi.cancelInstallation();
  }, []);

  // Terminate running processes with user consent and continue
  const terminateRunningAndInstall = useCallback(async () => {
    try {
      if (runningProcesses.process_ids.length > 0) {
        await InstallerApi.killRunning(runningProcesses.process_ids);
      }
      await performInstallation();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStep('error');
    }
  }, [runningProcesses, performInstallation]);

  // Launch installed application
  const launchApp = useCallback(async () => {
    const fullExePath = `${installPath}\\${executableName}`;
    await InstallerApi.launchInstalledApp(fullExePath);
    await InstallerApi.exitInstaller();
  }, [installPath, executableName]);

  const minimize = useCallback(async () => {
    await InstallerApi.minimizeInstaller();
  }, []);

  const exit = useCallback(async () => {
    await InstallerApi.exitInstaller();
  }, []);

  return {
    step,
    setStep,
    isLoading,
    isUninstallMode,
    systemInfo,
    installPath,
    setInstallPath: updateInstallPath,
    browseInstallPath,
    createDesktopShortcut,
    setCreateDesktopShortcut,
    createStartMenuShortcut,
    setCreateStartMenuShortcut,
    autoLaunchOnStartup,
    setAutoLaunchOnStartup,
    launchAfterInstall,
    setLaunchAfterInstall,
    validation,
    progress,
    runningProcesses,
    errorMessage,
    startInstall: proceedToInstall,
    cancelInstall,
    terminateRunningAndInstall,
    launchApp,
    minimize,
    exit,
  };
}
