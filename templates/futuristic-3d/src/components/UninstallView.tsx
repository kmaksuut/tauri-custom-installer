import React from 'react';
import { Trash2, AlertOctagon, AlertTriangle, CheckCircle2, Square, CheckSquare, Power } from 'lucide-react';
import { InstallerApi } from '@tauri-custom-installer/client';
import { useUninstall } from '@tauri-custom-installer/client/react';
import { TitleBar } from './TitleBar';
import { ThreeCanvas } from './ThreeCanvas';
import { sound } from './SoundEffects';

interface UninstallViewProps {
  appName: string;
  appId: string;
  executableName: string;
  installDir: string;
  onExit?: () => void;
}

export const UninstallView: React.FC<UninstallViewProps> = ({
  appName,
  appId,
  executableName,
  installDir,
}) => {
  const {
    step,
    purgeUserData,
    setPurgeUserData,
    progress,
    errorMessage,
    startUninstall,
    terminateRunningAndUninstall,
    exit,
  } = useUninstall({
    appName,
    appId,
    executableName,
    installDir,
  });

  return (
    <div className="relative w-[680px] h-[450px] bg-slate-950/95 border border-rose-500/30 rounded-xl overflow-hidden shadow-2xl flex flex-col font-sans select-none">
      <ThreeCanvas stage={step === 'uninstalling' ? 'installing' : step} percent={progress.percent} />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/85 to-transparent pointer-events-none z-[1]" />

      <TitleBar
        appName={`${appName} Uninstaller`}
        onMinimize={() => void InstallerApi.minimizeInstaller()}
        onExit={() => void exit()}
      />

      <div className="relative z-10 flex-1 p-6 flex flex-col justify-between text-slate-100 max-w-md pointer-events-auto">
        {step === 'confirm' && (
          <>
            <div>
              <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded border border-rose-500/40 bg-rose-950/40 text-rose-400 text-[11px] font-mono tracking-wider mb-2">
                <AlertOctagon className="w-3.5 h-3.5" />
                <span>PURGE PROTOCOL INITIATED</span>
              </div>
              <h2 className="text-xl font-black uppercase text-white tracking-wide">
                DECOMMISSION {appName}
              </h2>
              <p className="text-xs text-slate-400 font-sans mt-1 leading-relaxed">
                This will remove all installed program files, shortcuts, and registry registrations recorded in the installation manifest.
              </p>
            </div>

            <div className="my-auto space-y-2 font-mono text-xs">
              <label
                onClick={() => {
                  sound.click();
                  setPurgeUserData(!purgeUserData);
                }}
                onMouseEnter={() => sound.hover()}
                className="flex items-center space-x-2.5 cursor-pointer text-slate-300 hover:text-white select-none py-1"
              >
                {purgeUserData ? (
                  <CheckSquare className="w-4 h-4 text-rose-400" />
                ) : (
                  <Square className="w-4 h-4 text-slate-600" />
                )}
                <span>PURGE USER DATA & EBWEBVIEW CACHE</span>
              </label>
            </div>

            <div className="flex items-center space-x-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => {
                  sound.click();
                  exit();
                }}
                onMouseEnter={() => sound.hover()}
                className="flex-1 py-2 px-3.5 rounded border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white font-mono text-xs transition-colors"
              >
                CANCEL
              </button>

              <button
                onClick={() => {
                  sound.warp();
                  startUninstall();
                }}
                onMouseEnter={() => sound.hover()}
                className="flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(225,29,72,0.4)]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>CONFIRM PURGE</span>
              </button>
            </div>
          </>
        )}

        {step === 'running_warning' && (
          <div className="my-auto space-y-4" role="alert">
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded border border-amber-500/40 bg-amber-950/40 text-amber-400 text-[11px] font-mono tracking-wider">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>ACTIVE PROCESS LOCK DETECTED</span>
            </div>
            <h3 className="text-lg font-black text-white uppercase tracking-wide">
              CLOSE {appName} TO CONTINUE
            </h3>
            <p className="text-xs text-slate-400 font-sans leading-relaxed">
              An active instance of {appName} is running. Terminate running processes before purging binaries.
            </p>
            <div className="flex items-center space-x-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => {
                  sound.click();
                  exit();
                }}
                className="py-2 px-4 rounded border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white font-mono text-xs uppercase"
              >
                CANCEL
              </button>
              <button
                onClick={() => {
                  sound.warp();
                  terminateRunningAndUninstall();
                }}
                className="flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider"
              >
                <Power className="w-3.5 h-3.5" />
                <span>FORCE CLOSE &amp; UNINSTALL</span>
              </button>
            </div>
          </div>
        )}

        {step === 'uninstalling' && (
          <div className="my-auto space-y-4">
            <h3 className="text-lg font-bold text-white uppercase tracking-wider font-mono">
              PURGING INSTALLED ARTIFACTS...
            </h3>
            <div className="w-full h-2 bg-slate-900 border border-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-rose-500 rounded-full transition-all duration-150"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <div className="font-mono text-xs text-slate-400 truncate">
              {progress.message || 'Cleaning registry entries...'}
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="my-auto space-y-4" role="alert">
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded border border-rose-500/40 bg-rose-950/40 text-rose-400 text-[11px] font-mono tracking-wider">
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>PURGE PROTOCOL FAILED</span>
            </div>
            <h3 className="text-xl font-black text-white uppercase tracking-wide">
              UNINSTALLATION ERROR
            </h3>
            <p className="text-xs text-rose-300 font-mono leading-relaxed break-words">
              {errorMessage || 'An unexpected error occurred during uninstallation.'}
            </p>
            <button
              onClick={() => {
                sound.click();
                exit();
              }}
              className="mt-4 px-6 py-2 rounded bg-slate-800 hover:bg-slate-700 text-white font-mono text-xs uppercase"
            >
              CLOSE
            </button>
          </div>
        )}

        {step === 'completed' && (
          <div className="my-auto space-y-4 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <h3 className="text-xl font-black text-white uppercase tracking-wide">
              PURGE PROTOCOL COMPLETE
            </h3>
            <p className="text-xs text-slate-400 font-sans">
              {appName} has been successfully removed from your operating system.
            </p>
            <button
              onClick={() => {
                sound.click();
                exit();
              }}
              className="mt-4 px-6 py-2 rounded bg-slate-800 hover:bg-slate-700 text-white font-mono text-xs uppercase"
            >
              EXIT
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
