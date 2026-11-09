import { useInstaller } from '@tauri-custom-installer/client/react';
import { CompletedStep } from './components/CompletedStep';
import { InstallingStep } from './components/InstallingStep';
import { OptionsStep } from './components/OptionsStep';
import { RunningWarningStep } from './components/RunningWarningStep';
import { TitleBar } from './components/TitleBar';
import { UninstallView } from './components/UninstallView';
import { WelcomeStep } from './components/WelcomeStep';
import installerConfig from './installer.config.json';

const APP_NAME = installerConfig.appName;
const APP_ID = installerConfig.appId;
const APP_VERSION = installerConfig.appVersion;
const PUBLISHER = installerConfig.publisher;
const EXECUTABLE_NAME = installerConfig.executableName;
const REQUIRED_BYTES = installerConfig.requiredBytes;

export function App() {
  const {
    step,
    setStep,
    isUninstallMode,
    manifest,
    installPath,
    setInstallPath,
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
    errorMessage,
    startInstall,
    cancelInstall,
    terminateRunningAndInstall,
    launchApp,
    minimize,
    exit,
  } = useInstaller({
    appName: APP_NAME,
    appId: APP_ID,
    appVersion: APP_VERSION,
    publisher: PUBLISHER,
    executableName: EXECUTABLE_NAME,
    requiredBytes: REQUIRED_BYTES,
  });

  const resolvedName = manifest?.appName || APP_NAME;
  const resolvedVersion = manifest?.version || APP_VERSION;
  const resolvedPublisher = manifest?.publisher || PUBLISHER;

  return (
    <div className="w-screen h-screen max-w-[680px] max-h-[450px] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden relative font-sans text-slate-100">
      {/* Decorative gradient glow */}
      <div className="absolute -top-24 -left-24 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Borderless Title Bar */}
      <TitleBar
        title={isUninstallMode ? `${resolvedName} Uninstaller` : `${resolvedName} Setup`}
        onMinimize={minimize}
        onClose={exit}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative z-10" role="main">
        {isUninstallMode ? (
          <UninstallView
            appName={resolvedName}
            appId={manifest?.appId || APP_ID}
            executableName={manifest?.executableName || EXECUTABLE_NAME}
            installDir={installPath}
          />
        ) : (
          <>
            {step === 'welcome' && (
              <WelcomeStep
                appName={resolvedName}
                appVersion={resolvedVersion}
                publisher={resolvedPublisher}
                onExpressInstall={startInstall}
                onCustomInstall={() => setStep('options')}
              />
            )}

            {step === 'options' && (
              <OptionsStep
                installPath={installPath}
                setInstallPath={setInstallPath}
                onBrowse={browseInstallPath}
                createDesktopShortcut={createDesktopShortcut}
                setCreateDesktopShortcut={setCreateDesktopShortcut}
                createStartMenuShortcut={createStartMenuShortcut}
                setCreateStartMenuShortcut={setCreateStartMenuShortcut}
                autoLaunchOnStartup={autoLaunchOnStartup}
                setAutoLaunchOnStartup={setAutoLaunchOnStartup}
                validation={validation}
                requiredBytes={manifest?.uncompressedSizeBytes || REQUIRED_BYTES}
                onBack={() => setStep('welcome')}
                onInstall={startInstall}
              />
            )}

            {step === 'running_warning' && (
              <RunningWarningStep
                appName={resolvedName}
                onTerminateAndContinue={terminateRunningAndInstall}
                onCancel={exit}
              />
            )}

            {step === 'installing' && (
              <InstallingStep
                appName={resolvedName}
                progress={progress}
                onCancel={cancelInstall}
              />
            )}

            {step === 'completed' && (
              <CompletedStep
                appName={resolvedName}
                launchAfterInstall={launchAfterInstall}
                setLaunchAfterInstall={setLaunchAfterInstall}
                onFinish={launchAfterInstall ? launchApp : exit}
              />
            )}

            {(step === 'error' || step === 'cancelled') && (
              <div
                className="flex-1 flex flex-col items-center justify-center p-6 text-center"
                role="alert"
              >
                <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
                  <span className="text-xl font-bold">!</span>
                </div>
                <h2 className="text-lg font-bold text-white">
                  {step === 'cancelled' ? 'Installation Cancelled' : 'Installation Stopped'}
                </h2>
                <p className="text-xs text-rose-300 max-w-md mt-2">{errorMessage}</p>
                <button
                  onClick={() => setStep('welcome')}
                  className="mt-6 px-5 py-2 rounded-xl bg-slate-800 text-slate-200 hover:text-white text-xs font-semibold"
                >
                  Return to Setup
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
