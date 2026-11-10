import React from 'react';
import { Minus, X, Volume2, VolumeX } from 'lucide-react';
import { sound } from './SoundEffects';

interface TitleBarProps {
  appName: string;
  onMinimize: () => void;
  onExit: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ appName, onMinimize, onExit }) => {
  const [isMuted, setIsMuted] = React.useState(!sound.isEnabled());

  const handleToggleSound = () => {
    const enabled = sound.toggle();
    setIsMuted(!enabled);
  };

  return (
    <div
      data-tauri-drag-region
      className="relative z-50 flex items-center justify-between px-4 h-10 border-b border-cyan-500/20 bg-slate-950/80 backdrop-blur-md select-none"
    >
      {/* Left: Futuristic Telemetry & Title */}
      <div className="flex items-center space-x-2.5 pointer-events-none">
        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]" />
        <span className="font-mono text-xs tracking-widest text-cyan-400 uppercase font-bold">
          {appName || 'SYSTEM SETUP'}
        </span>
        <span className="text-slate-600 font-mono text-[10px]">:: PROTOCOL v2.0</span>
      </div>

      {/* Right: Controls & Sound Toggle */}
      <div className="flex items-center space-x-1">
        <button
          onClick={handleToggleSound}
          onMouseEnter={() => sound.hover()}
          className="p-1.5 rounded text-cyan-400 hover:text-white hover:bg-cyan-500/10 transition-colors"
          title={isMuted ? 'Enable Audio SFX' : 'Mute Audio SFX'}
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={() => {
            sound.click();
            onMinimize();
          }}
          onMouseEnter={() => sound.hover()}
          className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Minimize Window"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => {
            sound.click();
            onExit();
          }}
          onMouseEnter={() => sound.hover()}
          className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          title="Abort Protocol"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
