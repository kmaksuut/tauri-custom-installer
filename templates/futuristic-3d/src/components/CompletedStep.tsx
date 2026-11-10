import React, { useEffect, useState } from 'react';
import { Rocket, CheckCircle2, ShieldCheck, CheckSquare, Square } from 'lucide-react';
import { sound } from './SoundEffects';

interface CompletedStepProps {
  appName: string;
  onFinish: () => void;
  onLaunch: () => void;
}

export const CompletedStep: React.FC<CompletedStepProps> = ({
  appName,
  onFinish,
  onLaunch,
}) => {
  const [autoLaunch, setAutoLaunch] = useState(true);

  useEffect(() => {
    sound.success();
  }, []);

  const handleComplete = () => {
    sound.warp();
    if (autoLaunch) {
      onLaunch();
    }
    onFinish();
  };

  return (
    <div className="relative z-10 flex flex-col justify-between h-full p-6 text-slate-100 max-w-sm pointer-events-auto">
      {/* Title */}
      <div className="space-y-2">
        <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded border border-emerald-500/40 bg-emerald-950/40 text-emerald-400 text-[11px] font-mono tracking-wider">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>SYSTEM READY :: 100% OPERATIONAL</span>
        </div>

        <h2 className="text-2xl font-black uppercase text-white tracking-tight drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]">
          DEPLOYMENT SUCCESSFUL
        </h2>
        <p className="text-xs text-slate-400 font-sans">
          All binaries, runtime modules, and security associations have been registered.
        </p>
      </div>

      {/* Status Details */}
      <div className="my-auto space-y-3 font-mono text-xs">
        <div className="p-3 rounded border border-slate-800 bg-slate-950/70 space-y-2">
          <div className="flex items-center space-x-2 text-emerald-400 text-[11px]">
            <ShieldCheck className="w-4 h-4" />
            <span className="font-semibold">MANIFEST AUTHENTICATED</span>
          </div>
          <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
            Desktop shortcuts, start menu entries, and uninstaller stubs generated with native Win32 COM.
          </p>
        </div>

        <label
          onClick={() => {
            sound.click();
            setAutoLaunch(!autoLaunch);
          }}
          onMouseEnter={() => sound.hover()}
          className="flex items-center space-x-2.5 cursor-pointer text-slate-300 hover:text-white select-none py-1"
        >
          {autoLaunch ? (
            <CheckSquare className="w-4 h-4 text-emerald-400" />
          ) : (
            <Square className="w-4 h-4 text-slate-600" />
          )}
          <span>EXECUTE {appName.toUpperCase()} NOW</span>
        </label>
      </div>

      {/* Button */}
      <div className="pt-2 border-t border-slate-800">
        <button
          onClick={handleComplete}
          onMouseEnter={() => sound.hover()}
          className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(16,185,129,0.4)] active:scale-[0.99]"
        >
          <Rocket className="w-4 h-4" />
          <span>INITIALIZE APPLICATION & EXIT</span>
        </button>
      </div>
    </div>
  );
};
