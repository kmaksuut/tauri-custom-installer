import { ArrowLeft, ArrowRight, Folder, FolderOpen, HardDrive, Info } from 'lucide-react';
import type { FC } from 'react';
import type { PathValidation } from '@tauri-custom-installer/client';

interface OptionsStepProps {
  installPath: string;
  setInstallPath: (path: string) => void;
  onBrowse: () => void;
  createDesktopShortcut: boolean;
  setCreateDesktopShortcut: (val: boolean) => void;
  createStartMenuShortcut: boolean;
  setCreateStartMenuShortcut: (val: boolean) => void;
  autoLaunchOnStartup: boolean;
  setAutoLaunchOnStartup: (val: boolean) => void;
  validation: PathValidation | null;
  requiredBytes: number;
  onBack: () => void;
  onInstall: () => void;
}

export const OptionsStep: FC<OptionsStepProps> = ({
  installPath,
  setInstallPath,
  onBrowse,
  createDesktopShortcut,
  setCreateDesktopShortcut,
  createStartMenuShortcut,
  setCreateStartMenuShortcut,
  autoLaunchOnStartup,
  setAutoLaunchOnStartup,
  validation,
  requiredBytes,
  onBack,
  onInstall,
}) => {
  const availableMb = validation?.available_bytes
    ? Math.floor(validation.available_bytes / (1024 * 1024))
    : 0;
  const requiredMb = Math.max(1, Math.ceil(requiredBytes / (1024 * 1024)));

  return (
    <div className="flex-1 flex flex-col justify-between p-6">
      <div>
        <h2 className="text-lg font-bold text-white">Installation Preferences</h2>
        <p className="text-xs text-slate-400 mt-1">
          Select destination folder and desktop integration options.
        </p>

        {/* Path selection */}
        <div className="mt-4">
          <label className="text-xs font-semibold text-slate-300 block mb-1.5">
            Destination Folder
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-slate-200 focus-within:border-emerald-500 transition-colors">
              <Folder size={15} className="text-slate-400 mr-2 shrink-0" />
              <input
                type="text"
                value={installPath}
                onChange={(e) => setInstallPath(e.target.value)}
                className="w-full bg-transparent outline-none font-mono text-[11px]"
              />
            </div>
            <button
              type="button"
              onClick={onBrowse}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 hover:text-white transition-colors flex items-center gap-1.5 shrink-0"
            >
              <FolderOpen size={14} className="text-emerald-400" />
              <span>Browse...</span>
            </button>
          </div>

          {/* Disk space check indicator */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 px-1">
            <span className="flex items-center gap-1.5">
              <HardDrive size={13} className="text-slate-400" />
              <span>Available: {availableMb > 1024 ? `${(availableMb / 1024).toFixed(1)} GB` : `${availableMb} MB`}</span>
            </span>
            <span>Required: {requiredMb} MB</span>
          </div>

          {validation && !validation.is_valid && (
            <div className="mt-2 text-xs text-rose-400 flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg">
              <Info size={14} className="shrink-0" />
              <span>{validation.error_message || 'Selected path is invalid or unwritable.'}</span>
            </div>
          )}
        </div>

        {/* Checkbox Options */}
        <div className="mt-5 space-y-2.5">
          <label className="text-xs font-semibold text-slate-300 block mb-1">
            Shortcuts & System Options
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-300 hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={createDesktopShortcut}
              onChange={(e) => setCreateDesktopShortcut(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-emerald-500"
            />
            <span>Create Desktop shortcut</span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-300 hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={createStartMenuShortcut}
              onChange={(e) => setCreateStartMenuShortcut(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-emerald-500"
            />
            <span>Create Start Menu shortcut</span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-300 hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={autoLaunchOnStartup}
              onChange={(e) => setAutoLaunchOnStartup(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-emerald-500"
            />
            <span>Start application when Windows boots</span>
          </label>
        </div>
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-800/80">
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-1.5"
        >
          <ArrowLeft size={14} />
          <span>Back</span>
        </button>

        <button
          onClick={onInstall}
          disabled={Boolean(validation && !validation.is_valid)}
          className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:pointer-events-none text-slate-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 flex items-center gap-2 group"
        >
          <span>Install Now</span>
          <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
};
