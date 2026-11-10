import React from 'react';
import {
  FolderOpen,
  HardDrive,
  CheckSquare,
  Square,
  AlertTriangle,
  ArrowLeft,
  Zap,
} from 'lucide-react';
import { sound } from './SoundEffects';

interface ValidationState {
  isValid: boolean;
  isWritable: boolean;
  hasEnoughSpace: boolean;
  availableBytes: number;
  errorMessage?: string;
}

interface OptionsStepProps {
  installPath: string;
  onPathChange: (newPath: string) => void;
  onBrowse: () => void;
  validation: ValidationState;
  requiredBytes: number;
  desktopShortcut: boolean;
  onToggleDesktopShortcut: () => void;
  startMenuShortcut: boolean;
  onToggleStartMenuShortcut: () => void;
  autostart: boolean;
  onToggleAutostart: () => void;
  onBack: () => void;
  onInstall: () => void;
}

export const OptionsStep: React.FC<OptionsStepProps> = ({
  installPath,
  onPathChange,
  onBrowse,
  validation,
  requiredBytes,
  desktopShortcut,
  onToggleDesktopShortcut,
  startMenuShortcut,
  onToggleStartMenuShortcut,
  autostart,
  onToggleAutostart,
  onBack,
  onInstall,
}) => {
  const reqMB = (requiredBytes / (1024 * 1024)).toFixed(1);
  const availGB = (validation.availableBytes / (1024 * 1024 * 1024)).toFixed(1);

  return (
    <div className="relative z-10 flex flex-col justify-between h-full p-6 text-slate-100 max-w-md pointer-events-auto">
      {/* Title */}
      <div>
        <h2 className="text-xl font-black uppercase text-white tracking-wide flex items-center space-x-2">
          <Zap className="w-4 h-4 text-cyan-400" />
          <span>DEPLOYMENT PARAMETERS</span>
        </h2>
        <p className="text-xs text-slate-400 font-mono mt-0.5">
          CONFIGURE LOCAL SECTOR ALLOCATION
        </p>
      </div>

      <div className="space-y-3.5 my-auto">
        {/* Destination Path Selector */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono text-cyan-400 uppercase tracking-wider flex items-center justify-between">
            <span>TARGET DIRECTORY PATH</span>
            <span className="text-slate-500 text-[10px]">LOCAL DRIVE</span>
          </label>
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={installPath}
                onChange={(e) => onPathChange(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 focus:border-cyan-500 rounded px-3 py-1.5 text-xs text-white font-mono outline-none transition-colors"
                spellCheck={false}
              />
            </div>
            <button
              onClick={() => {
                sound.click();
                onBrowse();
              }}
              onMouseEnter={() => sound.hover()}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded border border-slate-800 bg-slate-900/80 hover:bg-cyan-950/40 text-slate-300 hover:text-cyan-300 text-xs font-mono transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>BROWSE</span>
            </button>
          </div>

          {!validation.isValid && validation.errorMessage && (
            <div className="flex items-center space-x-1.5 text-rose-400 text-[11px] font-mono">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{validation.errorMessage}</span>
            </div>
          )}
        </div>

        {/* Telemetry Storage Gauge */}
        <div className="p-2.5 rounded border border-slate-800/80 bg-slate-950/60 font-mono text-[11px] space-y-1.5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center space-x-1.5">
              <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
              <span>STORAGE MATRIX:</span>
            </span>
            <span className="text-white font-semibold">{reqMB} MB REQUIRED</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-cyan-400 rounded-full w-1/4 shadow-[0_0_8px_#22d3ee]" />
          </div>
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>DRIVE FREE: {availGB} GB</span>
            <span className={validation.hasEnoughSpace ? 'text-emerald-400' : 'text-rose-400'}>
              {validation.hasEnoughSpace ? 'CAPACITY SUFFICIENT' : 'INSUFFICIENT SPACE'}
            </span>
          </div>
        </div>

        {/* Shortcuts & Autostart Toggles */}
        <div className="space-y-1.5 font-mono text-xs">
          <label
            onClick={() => {
              sound.click();
              onToggleDesktopShortcut();
            }}
            onMouseEnter={() => sound.hover()}
            className="flex items-center space-x-2.5 cursor-pointer text-slate-300 hover:text-white select-none py-1"
          >
            {desktopShortcut ? (
              <CheckSquare className="w-4 h-4 text-cyan-400" />
            ) : (
              <Square className="w-4 h-4 text-slate-600" />
            )}
            <span>DEPLOY DESKTOP SHORTCUT</span>
          </label>

          <label
            onClick={() => {
              sound.click();
              onToggleStartMenuShortcut();
            }}
            onMouseEnter={() => sound.hover()}
            className="flex items-center space-x-2.5 cursor-pointer text-slate-300 hover:text-white select-none py-1"
          >
            {startMenuShortcut ? (
              <CheckSquare className="w-4 h-4 text-cyan-400" />
            ) : (
              <Square className="w-4 h-4 text-slate-600" />
            )}
            <span>LINK IN START MENU APPS</span>
          </label>

          <label
            onClick={() => {
              sound.click();
              onToggleAutostart();
            }}
            onMouseEnter={() => sound.hover()}
            className="flex items-center space-x-2.5 cursor-pointer text-slate-300 hover:text-white select-none py-1"
          >
            {autostart ? (
              <CheckSquare className="w-4 h-4 text-cyan-400" />
            ) : (
              <Square className="w-4 h-4 text-slate-600" />
            )}
            <span>AUTO-INITIALIZE ON WINDOWS BOOT</span>
          </label>
        </div>
      </div>

      {/* Buttons */}
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
            onInstall();
          }}
          onMouseEnter={() => sound.hover()}
          disabled={!validation.isValid}
          className="flex-1 py-2 px-4 rounded bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)] active:scale-[0.99]"
        >
          INITIATE EXTRACTION
        </button>
      </div>
    </div>
  );
};
