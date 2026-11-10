import React from 'react';
import { AlertTriangle, Power, ArrowLeft } from 'lucide-react';
import { sound } from './SoundEffects';

interface RunningWarningStepProps {
  appName: string;
  onTerminateAndInstall: () => void;
  onBack: () => void;
}

export const RunningWarningStep: React.FC<RunningWarningStepProps> = ({
  appName,
  onTerminateAndInstall,
  onBack,
}) => {
  return (
    <div className="relative z-10 flex flex-col justify-between h-full p-6 text-slate-100 max-w-sm pointer-events-auto">
      <div>
        <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded border border-amber-500/40 bg-amber-950/40 text-amber-400 text-[11px] font-mono tracking-wider mb-2">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>PROCESS LOCK DETECTED</span>
        </div>
        <h2 className="text-xl font-black uppercase text-white tracking-wide">
          ACTIVE PROCESS DETECTED
        </h2>
        <p className="text-xs text-slate-400 font-sans mt-1 leading-relaxed">
          An existing instance of <strong className="text-white">{appName}</strong> is running in memory. The process must be closed to update binaries.
        </p>
      </div>

      <div className="my-auto p-3 rounded border border-amber-500/20 bg-amber-950/20 font-mono text-xs text-amber-300">
        Close the application window manually, or trigger automated graceful termination protocol below.
      </div>

      <div className="flex items-center space-x-2 pt-2 border-t border-slate-800">
        <button
          onClick={() => {
            sound.click();
            onBack();
          }}
          onMouseEnter={() => sound.hover()}
          className="flex items-center space-x-1.5 py-2 px-3.5 rounded border border-slate-800 hover:border-slate-700 bg-slate-900/60 text-slate-400 hover:text-white font-mono text-xs transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>BACK</span>
        </button>

        <button
          onClick={() => {
            sound.warp();
            onTerminateAndInstall();
          }}
          onMouseEnter={() => sound.hover()}
          className="flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(245,158,11,0.4)]"
        >
          <Power className="w-3.5 h-3.5" />
          <span>TERMINATE & PROCEED</span>
        </button>
      </div>
    </div>
  );
};
