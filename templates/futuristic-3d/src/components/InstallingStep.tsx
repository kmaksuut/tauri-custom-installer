import React from 'react';
import { Loader2, Gauge, Clock, FileCode, AlertOctagon } from 'lucide-react';
import { sound } from './SoundEffects';

interface ProgressState {
  stage: string;
  current_file: string;
  percent: number;
  speed_bps?: number;
  eta_seconds?: number;
}

interface InstallingStepProps {
  appName?: string;
  progress: ProgressState;
  onCancel: () => void;
}

export const InstallingStep: React.FC<InstallingStepProps> = ({
  progress,
  onCancel,
}) => {
  const speedMBs = progress.speed_bps
    ? (progress.speed_bps / (1024 * 1024)).toFixed(1)
    : '0.0';

  const etaStr = progress.eta_seconds
    ? `${Math.ceil(progress.eta_seconds)}s remaining`
    : 'Calculating...';

  return (
    <div className="relative z-10 flex flex-col justify-between h-full p-6 text-slate-100 max-w-sm pointer-events-auto">
      {/* Title */}
      <div>
        <div className="inline-flex items-center space-x-2 px-2 py-0.5 rounded border border-cyan-500/30 bg-cyan-950/40 text-cyan-400 text-[10px] font-mono tracking-wider mb-2">
          <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
          <span>QUANTUM STREAM: ENGAGED</span>
        </div>
        <h2 className="text-xl font-black uppercase text-white tracking-wide">
          DEPLOYING PAYLOAD
        </h2>
        <p className="text-xs text-slate-400 font-mono mt-0.5">
          STREAMING DATA SECTORS TO DISK
        </p>
      </div>

      {/* Main Progress Bar & Metrics */}
      <div className="space-y-4 my-auto">
        <div className="space-y-2">
          <div className="flex justify-between items-baseline font-mono">
            <span className="text-3xl font-black text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">
              {Math.floor(progress.percent)}%
            </span>
            <span className="text-xs text-slate-400 uppercase tracking-wider">
              {progress.stage.replace('_', ' ')}
            </span>
          </div>

          {/* Futuristic Glowing Progress Bar */}
          <div className="relative w-full h-2.5 bg-slate-900 border border-slate-800 rounded-full overflow-hidden p-0.5">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 via-sky-400 to-fuchsia-500 rounded-full transition-all duration-150 shadow-[0_0_12px_#06b6d4]"
              style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
            />
          </div>
        </div>

        {/* Real-Time Telemetry Cards */}
        <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
          <div className="p-2.5 rounded border border-slate-800/80 bg-slate-950/70">
            <div className="flex items-center space-x-1 text-slate-400 mb-1 text-[10px]">
              <Gauge className="w-3 h-3 text-cyan-400" />
              <span>TRANSFER RATE</span>
            </div>
            <div className="text-white font-semibold">{speedMBs} MB/s</div>
          </div>

          <div className="p-2.5 rounded border border-slate-800/80 bg-slate-950/70">
            <div className="flex items-center space-x-1 text-slate-400 mb-1 text-[10px]">
              <Clock className="w-3 h-3 text-cyan-400" />
              <span>ESTIMATED TIME</span>
            </div>
            <div className="text-white font-semibold">{etaStr}</div>
          </div>
        </div>

        {/* Current File Display */}
        <div className="p-2 rounded border border-slate-800/60 bg-slate-950/50 font-mono text-[10px] text-slate-400 truncate flex items-center space-x-1.5">
          <FileCode className="w-3 h-3 text-cyan-500 flex-shrink-0" />
          <span className="truncate">{progress.current_file || 'Verifying sector hashes...'}</span>
        </div>
      </div>

      {/* Abort button */}
      <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
        <span className="text-[10px] text-slate-500 font-mono">
          DRAG CORE WITH MOUSE TO ORBIT
        </span>
        <button
          onClick={() => {
            sound.click();
            onCancel();
          }}
          onMouseEnter={() => sound.hover()}
          className="flex items-center space-x-1.5 text-xs font-mono text-slate-400 hover:text-rose-400 py-1.5 px-3 rounded border border-slate-800 hover:border-rose-900/50 hover:bg-rose-950/20 transition-colors"
        >
          <AlertOctagon className="w-3 h-3" />
          <span>ABORT</span>
        </button>
      </div>
    </div>
  );
};
