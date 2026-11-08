import { useCallback, useState } from 'react';
import { InstallerApi } from '../api';
import type {
  RunningProcessInfo,
  UninstallProgress,
  UninstallStep,
} from '../types';

export interface UseUninstallConfig {
  appId: string;
  appName: string;
  executableName: string;
  installDir: string;
}

export function useUninstall(config: UseUninstallConfig) {
  const { appId, appName, executableName, installDir } = config;

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
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const startUninstall = useCallback(async () => {
    try {
      const running = await InstallerApi.checkRunning(executableName);
      if (running.is_running) {
        setRunningProcesses(running);
        setStep('running_warning');
        return;
      }
      await performUninstall();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStep('error');
    }
  }, [executableName, installDir]);

  const performUninstall = useCallback(async () => {
    setStep('uninstalling');
    setErrorMessage(null);

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
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStep('error');
    }
  }, [appId, installDir, purgeUserData, appName, executableName]);

  const terminateRunningAndUninstall = useCallback(async () => {
    try {
      if (runningProcesses.process_ids.length > 0) {
        await InstallerApi.killRunning(runningProcesses.process_ids);
      }
      await performUninstall();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStep('error');
    }
  }, [runningProcesses, performUninstall]);

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
    startUninstall,
    terminateRunningAndUninstall,
    exit,
  };
}
