import { Check, Sparkles } from 'lucide-react';
import type { FC } from 'react';

interface CompletedStepProps {
  appName: string;
  launchAfterInstall: boolean;
  setLaunchAfterInstall: (val: boolean) => void;
  onFinish: () => void;
}

export const CompletedStep: FC<CompletedStepProps> = ({
  appName,
  launchAfterInstall,
  setLaunchAfterInstall,
  onFinish,
}) => {
  return (
    <div className="flex-1 flex flex-col justify-between p-6">
      <div className="flex flex-col items-center text-center my-auto">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 shadow-xl shadow-emerald-500/10">
          <Check size={32} />
        </div>

        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 mb-1">
          <Sparkles size={14} />
          <span>Setup Completed</span>
        </div>

        <h2 className="text-xl font-bold text-white">{appName} is ready to use!</h2>
        <p className="text-xs text-slate-300 max-w-sm mt-2 leading-relaxed">
          The application has been successfully installed and registered on your computer.
        </p>

        <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-300 hover:text-white transition-colors mt-6 p-2 rounded-lg bg-slate-800/40 border border-slate-700/50">
          <input
            type="checkbox"
            checked={launchAfterInstall}
            onChange={(e) => setLaunchAfterInstall(e.target.checked)}
            className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-emerald-500"
          />
          <span>Launch {appName} now</span>
        </label>
      </div>

      <div className="flex items-center justify-end pt-4 border-t border-slate-800/80">
        <button
          onClick={onFinish}
          className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30"
        >
          Finish
        </button>
      </div>
    </div>
  );
};
