import { useState } from 'react';
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
    setCreateDesktopShortcut,
    setCreateStartMenuShortcut,
    setAutoLaunchOnStartup,
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

  const [installOptions, setInstallOptions] = useState({
    desktopShortcut: true,
    startMenuShortcut: true,
    autostart: false,
  });

  if (isUninstallMode) {
    return (
      <UninstallView
        appName={manifest?.appName || defaultConfig.appName}
        appId={manifest?.appId || defaultConfig.appId}
        executableName={manifest?.executableName || defaultConfig.executableName}
        installDir={installPath || defaultConfig.appName}
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
            requiredBytes={defaultConfig.requiredBytes}
            desktopShortcut={installOptions.desktopShortcut}
            onToggleDesktopShortcut={() => {
              const val = !installOptions.desktopShortcut;
              setInstallOptions({ ...installOptions, desktopShortcut: val });
              setCreateDesktopShortcut(val);
            }}
            startMenuShortcut={installOptions.startMenuShortcut}
            onToggleStartMenuShortcut={() => {
              const val = !installOptions.startMenuShortcut;
              setInstallOptions({ ...installOptions, startMenuShortcut: val });
              setCreateStartMenuShortcut(val);
            }}
            autostart={installOptions.autostart}
            onToggleAutostart={() => {
              const val = !installOptions.autostart;
              setInstallOptions({ ...installOptions, autostart: val });
              setAutoLaunchOnStartup(val);
            }}
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
            onFinish={exit}
            onLaunch={launchApp}
          />
        )}
      </div>
    </div>
  );
}

export default App;
