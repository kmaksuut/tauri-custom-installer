import { useMemo } from 'react';
import { useInstaller } from '@tauri-custom-installer/client';
import { CompletedStep } from './components/CompletedStep';
import { InstallingStep } from './components/InstallingStep';
import { OptionsStep } from './components/OptionsStep';
import { RunningWarningStep } from './components/RunningWarningStep';
import { TitleBar } from './components/TitleBar';
import { UninstallView } from './components/UninstallView';
import { WelcomeStep } from './components/WelcomeStep';

// Configuration can be customized or read from environment
const APP_NAME = 'My Awesome App';
const APP_ID = 'com.example.myawesomeapp';
const APP_VERSION = '1.0.0';
const PUBLISHER = 'Antigravity Studio';
const EXECUTABLE_NAME = 'my-awesome-app.exe';
const REQUIRED_BYTES = 75 * 1024 * 1024; // 75 MB

export function App() {
  const isUninstallMode = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('mode') === 'uninstall';
  }, []);

  const {
    step,
    setStep,
    installPath,
    setInstallPath,
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
    errorMessage,
    startInstall,
    terminateRunningAndInstall,
    launchApp,
    exit,
  } = useInstaller({
    appName: APP_NAME,
    appId: APP_ID,
    appVersion: APP_VERSION,
    publisher: PUBLISHER,
    executableName: EXECUTABLE_NAME,
    requiredBytes: REQUIRED_BYTES,
  });

  return (
    <div className="w-[680px] h-[450px] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden relative font-sans text-slate-100">
      {/* Decorative gradient glow */}
      <div className="absolute -top-24 -left-24 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Borderless Title Bar */}
      <TitleBar
        title={isUninstallMode ? `${APP_NAME} Uninstaller` : `${APP_NAME} Setup`}
        onClose={exit}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative z-10">
        {isUninstallMode ? (
          <UninstallView
            appName={APP_NAME}
            appId={APP_ID}
            executableName={EXECUTABLE_NAME}
            installDir={installPath}
          />
        ) : (
          <>
            {step === 'welcome' && (
              <WelcomeStep
                appName={APP_NAME}
                appVersion={APP_VERSION}
                publisher={PUBLISHER}
                onExpressInstall={startInstall}
                onCustomInstall={() => setStep('options')}
              />
            )}

            {step === 'options' && (
              <OptionsStep
                installPath={installPath}
                setInstallPath={setInstallPath}
                createDesktopShortcut={createDesktopShortcut}
                setCreateDesktopShortcut={setCreateDesktopShortcut}
                createStartMenuShortcut={createStartMenuShortcut}
                setCreateStartMenuShortcut={setCreateStartMenuShortcut}
                autoLaunchOnStartup={autoLaunchOnStartup}
                setAutoLaunchOnStartup={setAutoLaunchOnStartup}
                validation={validation}
                requiredBytes={REQUIRED_BYTES}
                onBack={() => setStep('welcome')}
                onInstall={startInstall}
              />
            )}

            {step === 'running_warning' && (
              <RunningWarningStep
                appName={APP_NAME}
                onTerminateAndContinue={terminateRunningAndInstall}
                onCancel={exit}
              />
            )}

            {step === 'installing' && (
              <InstallingStep appName={APP_NAME} progress={progress} />
            )}

            {step === 'completed' && (
              <CompletedStep
                appName={APP_NAME}
                launchAfterInstall={launchAfterInstall}
                setLaunchAfterInstall={setLaunchAfterInstall}
                onFinish={launchAfterInstall ? launchApp : exit}
              />
            )}

            {step === 'error' && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
                  <span className="text-xl font-bold">!</span>
                </div>
                <h2 className="text-lg font-bold text-white">Installation Error</h2>
                <p className="text-xs text-rose-300 max-w-md mt-2">{errorMessage}</p>
                <button
                  onClick={() => setStep('welcome')}
                  className="mt-6 px-5 py-2 rounded-xl bg-slate-800 text-slate-200 hover:text-white text-xs font-semibold"
                >
                  Try Again
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
export default App;
