# Svelte 5 Installer Template

Lightweight, single-component Windows installer built with **Svelte 5 Runes** (`$state`), **TypeScript**, and [`@tauri-custom-installer/client`](../../packages/client/README.md).

## Quick Start

Scaffold the Svelte template into your Tauri v2 project:

```bash
npx @tauri-custom-installer/cli init --template svelte
```

Run the Vite development server with the built-in browser mock engine:

```bash
npm run dev
```

Preview specific scenarios by appending query parameters:

- `?scenario=success`
- `?scenario=app_running`
- `?scenario=already_installed_upgrade`
- `?scenario=insufficient_space`
- `?scenario=uninstall`

## Tech Stack

| Dependency | Version | Purpose |
| --- | --- | --- |
| `svelte` | `^5.0.0` | Fine-grained reactive UI powered by Svelte 5 `$state` runes |
| `@sveltejs/vite-plugin-svelte` | `^5.0.0` | Svelte Vite compiler integration |
| `@tauri-custom-installer/client` | SDK | `InstallerApi` IPC + browser mock bridge |
| `typescript` | `^5.7.3` | Strong typing for manifests, paths, and progress events |
| `vite` | `^6.1.0` | Ultra-compact `ui.zip` bundle output |

## Project Structure

```text
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── App.svelte                    # Complete install/uninstall wizard using Svelte 5 runes
    ├── main.ts                       # Mounts App into #app
    └── installer.config.json         # Fallback metadata for browser simulator preview
```

## Architecture & API Integration

`src/App.svelte` uses `InstallerApi` directly alongside reactive Svelte 5 `$state` variables (`step`, `installPath`, `validation`, `runningPids`, `progress`, `errorMessage`):

- **Initialization (`onMount`)**: Calls `InstallerApi.getSystemInfo(...)`, adopts the embedded `info.manifest` when running inside a packaged SFX executable, switches into `uninstall` view if `info.is_uninstall_mode` is true, and performs initial `InstallerApi.validateInstallPath` verification.
- **Pre-Install Safety Checks**: Validates user-edited target paths and runs `InstallerApi.checkRunning` to detect active executable PIDs, handing off to `running_warning` and `InstallerApi.killRunning(runningPids, ...)` when needed.
- **Window & Lifecycle Controls**: Integrates frameless dragging (`data-tauri-drag-region`) with `InstallerApi.minimizeWindow()`, `InstallerApi.exitApp()`, `InstallerApi.startInstall(...)`, `InstallerApi.cancelInstall()`, and `InstallerApi.startUninstall(...)`.

## Customization

- **Metadata**: Edit `tci.config.json` in your Tauri root for production SFX builds and `src/installer.config.json` for local Vite preview defaults.
- **Styling & Steps**: Extend `src/App.svelte` styles or extract Svelte subcomponents for custom EULA dialogs, component checkboxes, or brand graphics.
- **Production Bundle**: Svelte compiles away framework runtime overhead, keeping the appended `ui.zip` in your final `-Setup.exe` minimal.
