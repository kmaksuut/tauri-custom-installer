# Futuristic 3D Installer Template (Three.js + WebGL)

Interactive, sci-fi / gaming-inspired Windows installer featuring a real-time **Three.js WebGL holographic core scene**, procedural **Web Audio synthesizer**, and full [`@tauri-custom-installer/client`](../../packages/client/README.md) parity.

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

Simulate installer states in browser dev mode using query parameters:

- `?scenario=success` — Watch the 3D core spin up through extraction stages.
- `?scenario=app_running` — Triggers the active-process termination warning.
- `?scenario=already_installed_upgrade` — Displays upgrade telemetry.
- `?scenario=insufficient_space` — Exercises disk-space error handling.
- `?scenario=uninstall` — Launches the decommissioning / uninstall HUD.

---

## Tech Stack

| Dependency | Version | Purpose |
| --- | --- | --- |
| `three` + `@types/three` | `^0.174.0` | Real-time 3D WebGL core & warp particle starfield |
| `react` / `react-dom` | `^19.0.0` | Wizard state & HUD layout |
| `@tauri-custom-installer/client` | SDK | `useInstaller` & `useUninstall` hooks |
| `tailwindcss` | `^3.4.17` | Cyberpunk glass HUD & vignette/scanline styling |
| `lucide-react` | `^0.475.0` | HUD icons & audio mute indicator |
| `vite` | `^6.1.0` | Bundler packaging HTML/GLSL/JS into single-file `ui.zip` |

---

## Project Structure

```text
├── index.html
├── package.json
├── tailwind.config.js
└── src/
    ├── App.tsx                       # Window frame, 3D canvas background & HUD step router
    ├── main.tsx                      # Mount point
    ├── index.css                     # Tailwind directives & glow animations
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

---

## Component Reference & Audio Guide

### 1. `ThreeCanvas.tsx` (Interactive WebGL Hologram)
- **Purpose**: Renders the 3D real-time visual backdrop beneath the interactive HUD.
- **Props**:
  | Prop | Type | Description |
  | --- | --- | --- |
  | `stage` | `string` | Current installer stage (`welcome`, `options`, `installing`, `completed`, `uninstall`). Alters core rotation speed and color pulsing. |
  | `percent` | `number` | Extraction percentage ($0$ to $100$). Drives warp speed and particle acceleration. |
- **Visual Elements**:
  - **Holographic Core (`IcosahedronGeometry`)**: Wireframe cyan core with an inner glowing orb.
  - **Triple Gimbal Rings (`TorusGeometry`)**: Multi-axis rotating neon magenta, cyan, and amber orbit rings.
  - **Warp Starfield (`Points` with 600 particles)**: 3D particle tunnel accelerating towards the screen as installation progresses.
  - **Interactive Drag Orbit**: Users can click and drag with their mouse to rotate the core in real-time.
- **Graceful WebGL Context Fallback**:
  - Automatically wraps `new THREE.WebGLRenderer(...)` inside a `try/catch` boundary.
  - If WebGL hardware acceleration is unavailable (e.g. headless VMs, legacy Windows machines), it fails gracefully without crashing, falling back to a clean cyberpunk CSS gradient background.

---

### 2. `SoundEffects.ts` (Procedural Web Audio Synthesizer)
- **Purpose**: Generates crisp, futuristic sound effects dynamically using the browser's native `AudioContext` API—**zero external `.mp3` or `.wav` files required**.
- **Available Methods**:
  | Method | Behavior | Audio Synthesis Details |
  | --- | --- | --- |
  | `sound.hover()` | Played when hovering interactive buttons. | Sine oscillator ramping from $880\text{ Hz}$ to $1320\text{ Hz}$ over $40\text{ ms}$. |
  | `sound.click()` | Played when clicking buttons or toggles. | Triangle oscillator ramping from $520\text{ Hz}$ to $1760\text{ Hz}$ over $80\text{ ms}$. |
  | `sound.complete()` | Played upon reaching the `completed` step. | Dual oscillator harmonic chime ($659\text{ Hz}$ and $1318\text{ Hz}$) resolving upward. |
  | `sound.toggle()` | Toggles sound effects ON / OFF. | Mutes or enables audio immediately. |
  | `sound.isEnabled()` | Returns audio state. | `boolean` indicating if sound is active. |

---

### 3. `TitleBar.tsx` (Sci-Fi Frameless Title Bar)
- **Props**: `appName: string`, `onMinimize: () => void`, `onExit: () => void`.
- **Features**:
  - Draggable region via `data-tauri-drag-region`.
  - Audio mute/unmute toggle button with speaker icon.
  - Real-time status indicator LED (pulsing cyan glow).
  - Minimize (`─`) and Close (`✕`) buttons.

---

### 4. `WelcomeStep.tsx` (Deployment Briefing)
- **Props**: `appName`, `version`, `publisher`, `onNext`, `onFastInstall`, `action`.
- **Features**:
  - Tactical briefing HUD card with telemetry details.
  - "Quick Deploy" button (installs immediately with recommended defaults).
  - "Custom Configuration" button (leads to `OptionsStep`).

---

### 5. `OptionsStep.tsx` (Target Drive & Integrations)
- **Props**: `installPath`, `onPathChange`, `onBrowse`, `validation`, `requiredBytes`, `createDesktopShortcut`, `setCreateDesktopShortcut`, `createStartMenuShortcut`, `setCreateStartMenuShortcut`, `autoLaunchOnStartup`, `setAutoLaunchOnStartup`, `onBack`, `onInstall`.
- **Features**:
  - Sci-fi path input with browse button (`InstallerApi.selectFolder`).
  - Available storage telemetry bar with gigabyte breakdown.
  - Toggles for Desktop icon, Start Menu folder, and system autostart.

---

### 6. `RunningWarningStep.tsx` (Collision Intercept)
- **Props**: `appName`, `onTerminateAndContinue`, `onCancel`.
- **Features**: Amber warning alert displayed when `checkRunning` detects active instances of the target application. Offers one-click PID termination to prevent file sharing errors.

---

### 7. `InstallingStep.tsx` (Telemetry Decompression Monitor)
- **Props**: `appName`, `progress`, `onCancel`.
- **Features**:
  - Real-time progress bar with cyan-to-violet energy glow.
  - Streaming file readout (`progress.current_file`).
  - Speed & percent telemetry.
  - "Abort Deployment" button triggering transactional rollback.

---

### 8. `CompletedStep.tsx` (Mission Confirmation)
- **Props**: `appName`, `launchAfterInstall`, `setLaunchAfterInstall`, `onFinish`.
- **Features**: Triggers the `sound.complete()` synthesizer chime, displays completion metrics, and offers auto-launch on setup exit.

---

### 9. `UninstallView.tsx` (System Decommission HUD)
- **Props**: `appName`, `appId`, `executableName`, `installDir`, `onExit`.
- **Features**: Provides a decommissioning interface with an option to purge all user data, configuration files, and WebView2 cache directories before self-cleaning.

---

## Customization & Security Notes

- **Particle & Canvas Tuning**: Adjust particle count, speed, and ring geometries inside `src/components/ThreeCanvas.tsx`.
- **Audio Frequencies**: Modify sound frequencies and envelopes in `src/components/SoundEffects.ts`.
- **Single-File SFX Packaging**: Run `npx tci build` to package this 3D interface into an obfuscated, SHA-256 CTR armored, single-file `-Setup.exe`.
