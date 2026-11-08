import { Loader2 } from 'lucide-react';
import type { FC } from 'react';
import type { InstallProgress } from '@tauri-custom-installer/client';

interface InstallingStepProps {
  appName: string;
  progress: InstallProgress;
}

export const InstallingStep: FC<InstallingStepProps> = ({ appName, progress }) => {
  const percent = Math.min(100, Math.max(0, Math.round(progress.percent || 0)));

  return (
    <div className="flex-1 flex flex-col justify-center px-8 py-6">
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
  );
};
