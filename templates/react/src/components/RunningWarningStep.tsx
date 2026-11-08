import { AlertTriangle, RefreshCw, XCircle } from 'lucide-react';
import type { FC } from 'react';

interface RunningWarningStepProps {
  appName: string;
  onTerminateAndContinue: () => void;
  onCancel: () => void;
}

export const RunningWarningStep: FC<RunningWarningStepProps> = ({
  appName,
  onTerminateAndContinue,
  onCancel,
}) => {
  return (
    <div className="flex-1 flex flex-col justify-between p-6">
      <div className="flex flex-col items-center text-center my-auto">
        <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4">
          <AlertTriangle size={28} />
        </div>

        <h2 className="text-lg font-bold text-white">{appName} is currently running</h2>
        <p className="text-xs text-slate-300 max-w-sm mt-2 leading-relaxed">
          To update or install application files without corruption, the active instance of {appName} needs to be closed.
        </p>

        <p className="text-[11px] text-slate-400 mt-3">
          Click below to close {appName} safely and continue the installation.
        </p>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-slate-800/80">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-1.5"
        >
          <XCircle size={14} />
          <span>Cancel Setup</span>
        </button>

        <button
          onClick={onTerminateAndContinue}
          className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2"
        >
          <RefreshCw size={14} />
          <span>Close {appName} & Continue</span>
        </button>
      </div>
    </div>
  );
};
