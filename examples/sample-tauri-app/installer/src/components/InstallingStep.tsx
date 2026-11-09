import { Loader2, XCircle } from 'lucide-react';
import type { FC } from 'react';
import type { InstallProgress } from '@tauri-custom-installer/client';

interface InstallingStepProps {
  appName: string;
  progress: InstallProgress;
  onCancel?: () => void;
}

export const InstallingStep: FC<InstallingStepProps> = ({ appName, progress, onCancel }) => {
  const percent = Math.min(100, Math.max(0, Math.round(progress.percent || 0)));

  return (
    <div className="flex-1 flex flex-col justify-between p-6">
      <div className="my-auto px-2">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1.5">
            <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
            <h2 className="text-base font-bold text-white">Installing {appName}...</h2>
          </div>
          <p className="text-xs text-slate-400">
            Please wait while files and shortcuts are registered on your system.
          </p>
        </div>

        {/* Progress Bar Container */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-slate-300">
              {progress.stage === 'extracting'
                ? 'Extracting components...'
                : progress.stage === 'creating_shortcuts'
                ? 'Creating system shortcuts...'
                : progress.stage === 'registering'
                ? 'Registering in Windows Settings...'
                : 'Finalizing installation...'}
            </span>
            <span className="text-emerald-400 font-mono font-semibold">{percent}%</span>
          </div>

          <div className="w-full h-3 rounded-full bg-slate-800 border border-slate-700/60 p-0.5 overflow-hidden relative">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 shadow-md shadow-emerald-500/50"
              style={{ width: `${percent}%` }}
            />
          </div>

          {/* Real-time file indicator */}
          <p className="text-[11px] text-slate-500 font-mono truncate px-1 mt-1">
            {progress.current_file ? `${progress.current_file}` : 'Preparing archive...'}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end pt-4 border-t border-slate-800/80">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors flex items-center gap-1.5"
          >
            <XCircle size={14} />
            <span>Cancel</span>
          </button>
        )}
      </div>
    </div>
  );
};
