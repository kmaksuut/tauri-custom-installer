import React from 'react';
import { Trash2, AlertOctagon, CheckCircle2, Square, CheckSquare } from 'lucide-react';
import { useUninstall } from '@tauri-custom-installer/client/react';
import { TitleBar } from './TitleBar';
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
    startUninstall,
    exit,
  } = useUninstall({
    appName,
    appId,
    executableName,
    installDir,
  });

  return (
    <div className="relative w-[680px] h-[450px] bg-slate-950 border border-rose-500/30 rounded-xl overflow-hidden shadow-2xl flex flex-col font-sans select-none">
      <TitleBar
        appName={`${appName} Uninstaller`}
        onMinimize={() => {}}
        onExit={() => exit()}
      />

      <div className="relative z-10 flex-1 p-6 flex flex-col justify-between text-slate-100 max-w-md">
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
