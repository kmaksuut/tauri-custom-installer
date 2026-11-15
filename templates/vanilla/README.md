# Vanilla TypeScript Installer Template

Ultra-minimal, zero-framework Windows installer wizard built with plain **HTML**, **CSS**, **TypeScript**, and [`@tauri-custom-installer/client`](../../packages/client/README.md) for the smallest possible single-file SFX footprint.

## Quick Start

Initialize this template inside your Tauri v2 application:

```bash
npx @tauri-custom-installer/cli init --template vanilla
```

Start the Vite dev server and inspect the simulated wizard in your browser:

```bash
npm run dev
```

Append `?scenario=<name>` to test different states without building a Rust binary:

- `?scenario=success` — Standard clean install flow.
- `?scenario=app_running` — Simulates target executable active with running PIDs.
- `?scenario=already_installed_upgrade` — Existing installation detected; upgrade text shown.
- `?scenario=insufficient_space` — Tests disk space validation failure.
- `?scenario=uninstall` — Boots directly into the uninstallation container.

---

## Tech Stack

| Dependency | Version | Purpose |
| --- | --- | --- |
| `@tauri-custom-installer/client` | SDK | `InstallerApi` IPC client & browser mock driver |
| `typescript` | `^5.7.3` | Type-checked DOM controller (`src/main.ts`) |
| `vite` | `^6.1.0` | Ultra-compact single-bundle production output |

---

## Project Structure

```text
├── index.html                        # Semantic HTML wizard steps & frameless titlebar
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── main.ts                       # DOM controller, event bindings, and InstallerApi bridge
    ├── style.css                     # Modern dark card UI, progress bar & button styles
    └── installer.config.json         # Fallback configuration for local Vite preview
```

---

## Architecture & DOM Controller Guide

Without any heavy framework or virtual DOM runtime, the Vanilla template provides the fastest startup and the smallest compiled `ui.zip` inside your `-Setup.exe`. All behavior is coordinated by `src/main.ts` binding directly to semantic containers in `index.html`.

### 1. HTML DOM Elements & Step Containers

| Element ID | HTML Tag | Role / Behavior |
| --- | --- | --- |
| `window-title` | `<span>` | Displays application title (e.g. `My App Setup` or `My App Uninstaller`). |
| `btn-minimize` | `<button>` | Minimizes the installer window via `InstallerApi.minimizeInstaller()`. |
| `btn-close` | `<button>` | Exits setup cleanly via `InstallerApi.exitInstaller()`. |
| `step-welcome` | `<div>` | Container for the welcome, path selection, and options view. |
| `app-name` | `<h1>` | Displays the application name and version badge. |
| `input-path` | `<input>` | Target installation directory text field. |
| `btn-browse` | `<button>` | Opens native Win32 folder dialog via `InstallerApi.selectFolder`. |
| `path-status` | `<p>` | Displays available disk space or path validation error message. |
| `error-banner` | `<div>` | Red error notification banner displayed on unexpected failures. |
| `chk-desktop` | `<input type="checkbox">` | Toggle for Desktop shortcut creation. |
| `chk-startmenu`| `<input type="checkbox">` | Toggle for Start Menu shortcut creation. |
| `btn-install` | `<button>` | Triggers safety checks and starts installation. |
| `step-installing` | `<div>` | Extraction screen shown during decompression. |
| `progress-fill` | `<div>` | Animated progress bar width set to `prog.percent%`. |
| `progress-file` | `<p>` | Real-time text display of the file currently being extracted. |
| `step-completed` | `<div>` | Final success screen. |
| `btn-finish` | `<button>` | Launches installed application and exits setup. |
| `step-uninstall` | `<div>` | Uninstallation screen activated when `is_uninstall_mode` is true. |
| `btn-uninstall` | `<button>` | Confirms and executes uninstallation via `InstallerApi.startUninstallation`. |

---

### 2. State & Controller Flow (`src/main.ts`)

#### A. Initialization (`init()`)
1. Calls `InstallerApi.getSystemInfo(APP_NAME, APP_ID, requiredBytes)`.
2. Adopts system default path (`info.default_install_path`).
3. If `info.is_uninstall_mode` is true:
   - Hides `#step-welcome` (`hidden` class).
   - Shows `#step-uninstall`.
4. If `info.action === 'upgrade'`, changes the primary button text to `Upgrade to v<version>`.
5. Binds input and click listeners.

#### B. Live Path Validation (`validatePath(targetPath)`)
- Invokes `InstallerApi.validateInstallPath(targetPath, requiredBytes)`.
- Disables `#btn-install` if the directory is invalid or lacks sufficient free space.
- Updates `#path-status` with available disk space formatted in MB/GB (`formatBytes`).

#### C. Installation Pipeline (`#btn-install` click)
1. Checks whether the executable is already active:
   ```typescript
   const running = await InstallerApi.checkRunning(EXECUTABLE_NAME, installPath);
   if (running.is_running) {
     await InstallerApi.killRunning(running.process_ids, EXECUTABLE_NAME, installPath);
   }
   ```
2. Hides `#step-welcome`, reveals `#step-installing`.
3. Streams progress from `InstallerApi.startInstallation`:
   ```typescript
   (prog) => {
     progressFill.style.width = `${prog.percent}%`;
     progressFile.innerText = prog.current_file || 'Finalizing...';
   }
   ```
4. On success: hides `#step-installing`, reveals `#step-completed`.
5. On error: catches exception, restores `#step-welcome`, and displays the error in `#error-banner`.

#### D. Completion & Uninstallation
- **Finish**: `#btn-finish` calls `InstallerApi.launchInstalledApp` and exits.
- **Uninstall**: `#btn-uninstall` calls `InstallerApi.startUninstallation` to remove all files, shortcuts, and registry keys.

---

## Styling & Customization

- **Styles**: All styling is contained in `src/style.css` using modern CSS variables, flexbox, and dark glassmorphic cards.
- **No Build Bloat**: Compiles cleanly via `tsc && vite build`, creating a tiny `dist/` directory that compresses into a negligible `ui.zip`.
- **Packaging**: Run `npx tci build` to package this Vanilla TypeScript installer into your final Windows `-Setup.exe`.
