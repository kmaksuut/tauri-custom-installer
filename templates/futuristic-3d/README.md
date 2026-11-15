# Futuristic 3D Installer Template (Three.js + WebGL)

Interactive sci-fi / gaming-inspired Windows installer featuring a real-time **Three.js WebGL core scene**, procedural **Web Audio synthesizer**, and full [`@tauri-custom-installer/client`](../../packages/client/README.md) parity.

## Quick Start

Initialize this template using its primary name or any supported alias (`3d`, `gaming`, `gaming-3d`, `three`, `threejs`, `futuristic`):

```bash
npx @tauri-custom-installer/cli init --template futuristic-3d
# or using a convenient alias:
npx @tauri-custom-installer/cli init --template 3d
```

Launch the interactive 3D preview in your browser:

```bash
npm run dev
```

Simulate installer states in browser dev mode:

- `?scenario=success` — Watch the 3D core spin up through extraction stages
- `?scenario=app_running` — Triggers the active-process termination prompt
- `?scenario=already_installed_upgrade` — Displays upgrade telemetry
- `?scenario=insufficient_space` — Exercises disk-space error handling
- `?scenario=uninstall` — Launches the uninstall mode UI

## Features

- **Interactive Three.js WebGL Scene (`ThreeCanvas.tsx`)**: Renders an animated 3D wireframe core, orbital rings, and starfield warp particles that react dynamically to mouse drag gestures and installer progress (`stage` and `percent`).
- **Graceful WebGL Fallback**: Automatically wraps `THREE.WebGLRenderer` creation in a `try/catch` boundary and renders an atmospheric CSS gradient backdrop if hardware/software WebGL is unavailable on older VMs or headless Windows setups.
- **Procedural Web Audio Effects (`SoundEffects.ts`)**: Generates crisp sci-fi hover, click, and completion chimes purely via the browser `AudioContext` API—zero external `.mp3`/`.wav` assets or extra bundle bloat, complete with a mute toggle in the custom `TitleBar`.
- **Custom Protocol & CSP Safe**: Designed to run seamlessly inside Tauri's `tci://` custom protocol without requiring remote CDN scripts, external fonts, or unsafe inline scripts.

## Tech Stack

| Dependency | Version | Purpose |
| --- | --- | --- |
| `three` + `@types/three` | `^0.174.0` | Real-time 3D WebGL core & warp particle starfield |
| `react` / `react-dom` | `^19.0.0` | Wizard state & HUD layout |
| `@tauri-custom-installer/client` | SDK | `useInstaller` & `useUninstall` hooks |
| `tailwindcss` | `^3.4.17` | Cyberpunk glass HUD & vignette/scanline styling |
| `lucide-react` | `^0.475.0` | HUD icons & audio mute indicator |

## Project Structure

```text
├── index.html
├── package.json
├── tailwind.config.js
└── src/
    ├── App.tsx                       # Window frame, 3D canvas background & HUD step router
    ├── main.tsx
    ├── index.css
    ├── installer.config.json         # Browser-dev fallback metadata
    └── components/
        ├── ThreeCanvas.tsx           # Interactive Three.js WebGL core + context-loss fallback
        ├── SoundEffects.ts           # Procedural Web Audio API synthesizer + mute toggle
        ├── TitleBar.tsx              # Draggable sci-fi header bar + sound/window controls
        ├── WelcomeStep.tsx           # Initial deployment briefing & quick/custom actions
        ├── OptionsStep.tsx           # Path validator, drive space bar & shortcut options
        ├── RunningWarningStep.tsx    # Running-process detector & forced termination flow
        ├── InstallingStep.tsx        # High-contrast progress telemetry & cancel control
        ├── CompletedStep.tsx         # Deployment complete confirmation & app launch
        └── UninstallView.tsx         # Full uninstallation & cleanup HUD
```

## Customization & Security Notes

- **Performance Tuning**: Adjust particle counts or rotation speeds inside `src/components/ThreeCanvas.tsx`. Keep canvas `pointer-events` layered carefully beneath `z-10` interactive HUD controls.
- **Audio Preferences**: Replace or mute synthesizer frequencies in `src/components/SoundEffects.ts`.
- **Single-File Armor**: When built via `tci build`, all compiled Three.js chunks and HUD assets are packed into `ui.zip` and protected by optional JS obfuscation + V2 SHA-256 CTR SFX armoring (`tci.config.json` `obfuscate: true`).
