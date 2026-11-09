import { useCallback, useState } from 'react';
import { InstallerApi, parseStructuredError } from '../api';
export function useUninstall(config = {}) {
    const { appId = 'com.tauri.app', appName = 'Tauri Application', executableName = 'app.exe', installDir = '', } = config;
    const [step, setStep] = useState('confirm');
    const [purgeUserData, setPurgeUserData] = useState(false);
    const [progress, setProgress] = useState({
        stage: 'idle',
        percent: 0,
        message: '',
    });
    const [runningProcesses, setRunningProcesses] = useState({
        is_running: false,
        process_ids: [],
        process_names: [],
    });
    const [errorMessage, setErrorMessage] = useState(null);
    const [structuredError, setStructuredError] = useState(null);
    const performUninstall = useCallback(async () => {
        setStep('uninstalling');
        setErrorMessage(null);
        setStructuredError(null);
        try {
            await InstallerApi.startUninstallation({
                app_id: appId,
                install_dir: installDir,
                purge_user_data: purgeUserData,
            }, appName, executableName, (prog) => {
                setProgress(prog);
            });
            setStep('completed');
        }
        catch (err) {
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
        }
        catch (err) {
            const parsed = parseStructuredError(err);
            setErrorMessage(parsed.message);
            setStructuredError(parsed);
            setStep('error');
        }
    }, [executableName, installDir, performUninstall]);
    const terminateRunningAndUninstall = useCallback(async () => {
        try {
            await InstallerApi.killRunning(runningProcesses.process_ids, executableName, installDir);
            await performUninstall();
        }
        catch (err) {
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
//# sourceMappingURL=useUninstall.js.map