import { AlertCircle, CheckCircle, Trash2, X } from 'lucide-react';
import type { FC } from 'react';
import { useUninstall } from '@tauri-custom-installer/client/react';

interface UninstallViewProps {
  appName: string;
  appId: string;
  executableName: string;
  installDir: string;
}

export const UninstallView: FC<UninstallViewProps> = ({
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
    <div className="flex-1 flex flex-col justify-between p-6">
      {step === 'confirm' && (
        <>
          <div className="flex flex-col items-center text-center my-auto">
            <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4">
              <Trash2 size={32} />
            </div>

            <h2 className="text-xl font-bold text-white">Uninstall {appName}?</h2>
            <p className="text-xs text-slate-300 max-w-sm mt-2 leading-relaxed">
              This will remove {appName} files, shortcuts, and registry entries from your computer.
            </p>

            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 hover:text-white transition-colors mt-6">
              <input
                type="checkbox"
                checked={purgeUserData}
                onChange={(e) => setPurgeUserData(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-rose-500 focus:ring-0 accent-rose-500"
              />
              <span>Delete application settings and cache files</span>
            </label>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-800/80">
            <button
              onClick={exit}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>

            <button
              onClick={startUninstall}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-all shadow-lg shadow-rose-600/20"
            >
              Uninstall Application
            </button>
          </div>
        </>
      )}

      {step === 'running_warning' && (
        <div className="flex flex-col items-center text-center my-auto">
          <AlertCircle size={36} className="text-amber-400 mb-3" />
          <h2 className="text-lg font-bold text-white">{appName} is still running</h2>
          <p className="text-xs text-slate-300 mt-2">
            Please close {appName} to proceed with uninstallation.
          </p>
          <div className="flex gap-3 mt-6">
            <button
              onClick={exit}
              className="px-4 py-2 rounded-xl text-xs bg-slate-800 text-slate-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={terminateRunningAndUninstall}
              className="px-4 py-2 rounded-xl text-xs bg-rose-600 text-white font-semibold"
            >
              Close & Uninstall
            </button>
          </div>
        </div>
      )}

      {step === 'uninstalling' && (
        <div className="flex-1 flex flex-col justify-center px-8 py-6">
          <h2 className="text-base font-bold text-white mb-2">Uninstalling {appName}...</h2>
          <div className="w-full h-3 rounded-full bg-slate-800 border border-slate-700/60 p-0.5 overflow-hidden my-3">
            <div
              className="h-full rounded-full bg-rose-500 transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 font-mono">{progress.message}</p>
        </div>
      )}

      {step === 'completed' && (
        <div className="flex flex-col items-center text-center my-auto">
          <CheckCircle size={36} className="text-emerald-400 mb-3" />
          <h2 className="text-lg font-bold text-white">Uninstallation Complete</h2>
          <p className="text-xs text-slate-300 mt-2">
            {appName} was successfully removed from your system.
          </p>
          <button
            onClick={exit}
            className="mt-6 px-6 py-2 rounded-xl bg-slate-800 text-slate-200 hover:text-white text-xs font-semibold"
          >
            Close
          </button>
        </div>
      )}

      {step === 'error' && (
        <div className="flex flex-col items-center text-center my-auto">
          <X size={36} className="text-rose-400 mb-3" />
          <h2 className="text-lg font-bold text-white">Uninstallation Failed</h2>
          <p className="text-xs text-rose-300 mt-2">{errorMessage}</p>
          <button
            onClick={exit}
            className="mt-6 px-6 py-2 rounded-xl bg-slate-800 text-slate-200 hover:text-white text-xs"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};
