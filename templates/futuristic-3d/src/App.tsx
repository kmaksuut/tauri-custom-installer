import { useInstaller } from '@tauri-custom-installer/client/react';
import { TitleBar } from './components/TitleBar';
import { WelcomeStep } from './components/WelcomeStep';
import { OptionsStep } from './components/OptionsStep';
import { InstallingStep } from './components/InstallingStep';
import { RunningWarningStep } from './components/RunningWarningStep';
import { CompletedStep } from './components/CompletedStep';
import { UninstallView } from './components/UninstallView';
import { ThreeCanvas } from './components/ThreeCanvas';
import defaultConfig from './installer.config.json';

export function App() {
  const {
    step,
    setStep,
    action,
    manifest,
    isUninstallMode,
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
    errorMessage,
    progress,
    validation,
    startInstall,
    cancelInstall,
    terminateRunningAndInstall,
    launchApp,
    minimize,
    exit,
  } = useInstaller({
    appName: defaultConfig.appName,
    appId: defaultConfig.appId,
    appVersion: defaultConfig.appVersion,
    publisher: defaultConfig.publisher,
    executableName: defaultConfig.executableName,
    requiredBytes: defaultConfig.requiredBytes,
  });

  if (isUninstallMode) {
    return (
      <UninstallView
        appName={manifest?.appName || defaultConfig.appName}
        appId={manifest?.appId || defaultConfig.appId}
        executableName={manifest?.executableName || defaultConfig.executableName}
        installDir={installPath}
        onExit={exit}
      />
    );
  }

  return (
    <div className="relative w-[680px] h-[450px] bg-slate-950/95 border border-cyan-500/30 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col font-sans select-none">
      {/* 3D Interactive WebGL Scene */}
      <ThreeCanvas stage={progress.stage || step} percent={progress.percent} />

      {/* Cyberpunk Vignette & Scanline Overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-transparent pointer-events-none z-[1]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/10 via-transparent to-slate-950/40 pointer-events-none z-[1]" />

      {/* Top Drag Region & Controls */}
      <TitleBar appName={manifest?.appName || defaultConfig.appName} onMinimize={minimize} onExit={exit} />

      {/* Foreground Content Views */}
      <div className="relative z-10 flex-1 overflow-hidden">
        {step === 'welcome' && (
          <WelcomeStep
            appName={manifest?.appName || defaultConfig.appName}
            version={manifest?.version || defaultConfig.appVersion}
            publisher={manifest?.publisher || defaultConfig.publisher}
            onNext={() => setStep('options')}
            onFastInstall={() => startInstall()}
            action={action}
          />
        )}

        {step === 'options' && (
          <OptionsStep
            installPath={installPath}
            onPathChange={setInstallPath}
            onBrowse={browseInstallPath}
            validation={{
              isValid: validation?.is_valid ?? true,
              isWritable: validation?.is_writable ?? true,
              hasEnoughSpace: validation?.has_enough_space ?? true,
              availableBytes: validation?.available_bytes ?? 0,
              errorMessage: validation?.error_message ?? undefined,
            }}
            requiredBytes={manifest?.uncompressedSizeBytes || defaultConfig.requiredBytes}
            desktopShortcut={createDesktopShortcut}
            onToggleDesktopShortcut={() => setCreateDesktopShortcut(!createDesktopShortcut)}
            startMenuShortcut={createStartMenuShortcut}
            onToggleStartMenuShortcut={() => setCreateStartMenuShortcut(!createStartMenuShortcut)}
            autostart={autoLaunchOnStartup}
            onToggleAutostart={() => setAutoLaunchOnStartup(!autoLaunchOnStartup)}
            onBack={() => setStep('welcome')}
            onInstall={() => startInstall()}
          />
        )}

        {step === 'running_warning' && (
          <RunningWarningStep
            appName={manifest?.appName || defaultConfig.appName}
            onTerminateAndInstall={terminateRunningAndInstall}
            onBack={() => setStep('options')}
          />
        )}

        {step === 'installing' && (
          <InstallingStep
            appName={manifest?.appName || defaultConfig.appName}
            progress={progress}
            onCancel={cancelInstall}
          />
        )}

        {step === 'completed' && (
          <CompletedStep
            appName={manifest?.appName || defaultConfig.appName}
            launchAfterInstall={launchAfterInstall}
            onToggleLaunchAfterInstall={setLaunchAfterInstall}
            onFinish={exit}
            onLaunch={launchApp}
          />
        )}

        {(step === 'error' || step === 'cancelled') && (
          <div
            className="relative z-10 flex flex-col justify-between h-full p-6 text-slate-100 max-w-md pointer-events-auto"
            role="alert"
          >
            <div className="space-y-3 my-auto">
              <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded border border-rose-500/40 bg-rose-950/40 text-rose-400 text-[11px] font-mono tracking-wider">
                <span>{step === 'cancelled' ? 'PROTOCOL ABORTED' : 'DEPLOYMENT HALTED'}</span>
              </div>
              <h2 className="text-xl font-black uppercase text-white tracking-wide">
                {step === 'cancelled' ? 'INSTALLATION CANCELLED' : 'SYSTEM ERROR DETECTED'}
              </h2>
              <p className="text-xs text-rose-300 font-mono leading-relaxed break-words">
                {errorMessage || 'Installation was cancelled and rolled back safely.'}
              </p>
            </div>
            <div className="flex items-center space-x-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setStep('options')}
                className="flex-1 py-2 px-4 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all"
              >
                RETURN TO CONFIGURATION
              </button>
              <button
                onClick={() => exit()}
                className="py-2 px-4 rounded border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white font-mono text-xs uppercase transition-colors"
              >
                EXIT
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
