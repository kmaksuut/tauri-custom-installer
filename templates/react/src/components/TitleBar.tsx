import { Minus, X } from 'lucide-react';
import type { FC } from 'react';

interface TitleBarProps {
  title: string;
  onClose: () => void;
  onMinimize?: () => void;
}

export const TitleBar: FC<TitleBarProps> = ({ title, onClose, onMinimize }) => {
  return (
    <div
      data-tauri-drag-region
      className="h-10 w-full flex items-center justify-between px-4 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 select-none cursor-default"
    >
      <div className="flex items-center gap-2 text-xs font-medium text-slate-300 pointer-events-none">
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
        <span>{title}</span>
      </div>

      <div className="flex items-center gap-1">
        {onMinimize && (
          <button
            onClick={onMinimize}
            className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            title="Minimize"
          >
            <Minus size={14} />
          </button>
        )}
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-rose-300 hover:bg-rose-500/20 transition-colors"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
