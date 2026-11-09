import { useCallback, useState } from 'react';
import { InstallerApi, parseStructuredError } from '../api';
import type {
  RunningProcessInfo,
  StructuredError,
  UninstallProgress,
  UninstallStep,
} from '../types';

export interface UseUninstallConfig {
  appId?: string;
  appName?: string;
  executableName?: string;
  installDir?: string;
}

export function useUninstall(config: UseUninstallConfig = {}) {
  const {
    appId = 'com.tauri.app',
    appName = 'Tauri Application',
    executableName = 'app.exe',
    installDir = '',
  } = config;

  const [step, setStep] = useState<UninstallStep>('confirm');
  const [purgeUserData, setPurgeUserData] = useState<boolean>(false);
  const [progress, setProgress] = useState<UninstallProgress>({
    stage: 'idle',
    percent: 0,
    message: '',
  });
  const [runningProcesses, setRunningProcesses] = useState<RunningProcessInfo>({
    is_running: false,
    process_ids: [],
    process_names: [],
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [structuredError, setStructuredError] = useState<StructuredError | null>(null);

  const performUninstall = useCallback(async () => {
    setStep('uninstalling');
    setErrorMessage(null);
    setStructuredError(null);

    try {
      await InstallerApi.startUninstallation(
        {
          app_id: appId,
          install_dir: installDir,
          purge_user_data: purgeUserData,
        },
        appName,
        executableName,
        (prog) => {
          setProgress(prog);
        }
      );
      setStep('completed');
    } catch (err: unknown) {
      const parsed = parseStructuredError(err);
      setErrorMessage(parsed.message);
      setStructuredError(parsed);
      setStep('error');
    }
  }, [appId, installDir, purgeUserData, appName, executableName]);

  const startUninstall = useCallback(async () => {
    try {
      const running = await InstallerApi.checkRunning(executableName, installDir);
      if (running.is_running) {
        setRunningProcesses(running);
        setStep('running_warning');
        return;
      }
      await performUninstall();
    } catch (err: unknown) {
      const parsed = parseStructuredError(err);
      setErrorMessage(parsed.message);
      setStructuredError(parsed);
      setStep('error');
    }
  }, [executableName, installDir, performUninstall]);

  const terminateRunningAndUninstall = useCallback(async () => {
    try {
      await InstallerApi.killRunning(
        runningProcesses.process_ids,
        executableName,
        installDir
      );
      await performUninstall();
    } catch (err: unknown) {
      const parsed = parseStructuredError(err);
      setErrorMessage(parsed.message);
      setStructuredError(parsed);
      setStep('error');
    }
  }, [runningProcesses, executableName, installDir, performUninstall]);

  const exit = useCallback(async () => {
    await InstallerApi.exitInstaller();
  }, []);

  return {
    step,
    setStep,
    purgeUserData,
    setPurgeUserData,
    progress,
    runningProcesses,
    errorMessage,
    structuredError,
    startUninstall,
    terminateRunningAndUninstall,
    exit,
  };
}
