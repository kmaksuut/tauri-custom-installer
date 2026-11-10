import React from 'react';
import { Cpu, Terminal, ArrowRight, Activity, ShieldCheck } from 'lucide-react';
import { sound } from './SoundEffects';

interface WelcomeStepProps {
  appName: string;
  version: string;
  publisher: string;
  onNext: () => void;
  onFastInstall: () => void;
  action: string;
}

export const WelcomeStep: React.FC<WelcomeStepProps> = ({
  appName,
  version,
  publisher,
  onNext,
  onFastInstall,
  action,
}) => {
  return (
    <div className="relative z-10 flex flex-col justify-between h-full p-6 text-slate-100 max-w-sm pointer-events-auto">
      {/* Top Header & Cyber Brackets */}
      <div className="space-y-3">
        <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded border border-cyan-500/30 bg-cyan-950/40 text-cyan-400 text-[11px] font-mono tracking-wider">
          <Activity className="w-3.5 h-3.5 animate-pulse" />
          <span>CYBERNETIC DEPLOYMENT MATRIX</span>
        </div>

        <div>
          <h1 className="text-2xl font-black tracking-tight text-white uppercase drop-shadow-[0_0_12px_rgba(34,211,238,0.4)]">
            {appName}
          </h1>
          <p className="text-xs text-cyan-400/80 font-mono mt-0.5">
            RELEASE BUILD :: v{version}
          </p>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed font-sans">
          Welcome to the high-performance installer. Prepare local storage matrix and calibrate runtime environment.
        </p>
      </div>

      {/* Sci-Fi System Readout Cards */}
      <div className="grid grid-cols-2 gap-2 my-2 font-mono text-[11px]">
        <div className="p-2.5 rounded border border-slate-800 bg-slate-950/70 backdrop-blur-sm">
          <div className="flex items-center space-x-1.5 text-slate-400 mb-1">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px]">SUBSYSTEM</span>
          </div>
          <span className="text-white font-semibold">Tauri v2 Native</span>
        </div>

        <div className="p-2.5 rounded border border-slate-800 bg-slate-950/70 backdrop-blur-sm">
          <div className="flex items-center space-x-1.5 text-slate-400 mb-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px]">INTEGRITY</span>
          </div>
          <span className="text-emerald-400 font-semibold">SHA-256 Verified</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2 pt-2">
        <button
          onClick={() => {
            sound.warp();
            onFastInstall();
          }}
          onMouseEnter={() => sound.hover()}
          className="group relative w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all duration-200 shadow-[0_0_20px_rgba(6,182,212,0.4)] active:scale-[0.99]"
        >
          <span>{action === 'upgrade' ? 'UPGRADE SYSTEM' : 'FAST DEPLOY'}</span>
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
        </button>

        <button
          onClick={() => {
            sound.click();
            onNext();
          }}
          onMouseEnter={() => sound.hover()}
          className="w-full flex items-center justify-center space-x-1.5 py-2 px-3 rounded border border-slate-800 hover:border-cyan-500/40 bg-slate-900/60 hover:bg-cyan-950/20 text-slate-400 hover:text-cyan-300 font-mono text-[11px] transition-all"
        >
          <Terminal className="w-3 h-3" />
          <span>CUSTOM CONFIGURATION</span>
        </button>
      </div>

      {/* Publisher telemetry footer */}
      <div className="pt-2 border-t border-slate-800/80 flex justify-between items-center text-[10px] text-slate-500 font-mono">
        <span>AUTHOR :: {publisher || 'DEVELOPER'}</span>
        <span className="text-cyan-500/60">3D CORE: ONLINE</span>
      </div>
    </div>
  );
};
