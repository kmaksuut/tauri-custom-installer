import { ArrowRight, CheckCircle2, ChevronRight, ShieldCheck, Sparkles } from 'lucide-react';
import type { FC } from 'react';

interface WelcomeStepProps {
  appName: string;
  appVersion: string;
  publisher: string;
  onExpressInstall: () => void;
  onCustomInstall: () => void;
}

export const WelcomeStep: FC<WelcomeStepProps> = ({
  appName,
  appVersion,
  publisher,
  onExpressInstall,
  onCustomInstall,
}) => {
  return (
    <div className="flex-1 flex flex-col justify-between p-6">
      <div className="flex items-start gap-5">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-xl shadow-emerald-500/10 shrink-0">
          <div className="w-full h-full rounded-[14px] bg-slate-900 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-emerald-400" />
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">{appName}</h1>
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              v{appVersion}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Published by {publisher}</p>
          <p className="text-sm text-slate-300 mt-3 leading-relaxed">
            Welcome to the setup wizard. Install the application with modern performance, security, and full user transparency.
          </p>
        </div>
      </div>

      {/* Feature highlights */}
      <div className="grid grid-cols-2 gap-3 my-4">
        <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="text-xs">
            <p className="font-semibold text-slate-200">Safe Installation</p>
            <p className="text-slate-400">Isolated per-user directory</p>
          </div>
        </div>
        <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0" />
          <div className="text-xs">
            <p className="font-semibold text-slate-200">Clean Uninstaller</p>
            <p className="text-slate-400">Zero residual junk files</p>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-800/80">
        <button
          onClick={onCustomInstall}
          className="text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1 group py-2"
        >
          <span>Advanced options</span>
          <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
        </button>

        <button
          onClick={onExpressInstall}
          className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 flex items-center gap-2 group"
        >
          <span>Install Now</span>
          <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
};
