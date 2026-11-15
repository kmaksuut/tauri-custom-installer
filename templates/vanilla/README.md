# Vanilla TypeScript Installer Template

Ultra-minimal, zero-framework Windows installer built with plain **HTML**, **CSS**, **TypeScript**, and [`@tauri-custom-installer/client`](../../packages/client/README.md) for the smallest possible single-file SFX footprint.

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

- `?scenario=success`
- `?scenario=app_running`
- `?scenario=already_installed_upgrade`
- `?scenario=insufficient_space`
- `?scenario=uninstall`

## Tech Stack

| Dependency | Version | Purpose |
| --- | --- | --- |
| `@tauri-custom-installer/client` | SDK | `InstallerApi` IPC client & browser mock driver |
| `typescript` | `^5.7.3` | Type-checked DOM controller (`src/main.ts`) |
| `vite` | `^6.1.0` | Minimal single-bundle production output |

## Project Structure

```text
├── index.html                        # Semantic HTML wizard steps & frameless titlebar
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── main.ts                       # DOM bindings, path validation, PID checks & InstallerApi calls
    ├── style.css                     # Clean dark card UI, progress bar & button styles
    └── installer.config.json         # Fallback configuration for local Vite preview
```

## Architecture & DOM Flow

With no virtual DOM or frontend framework dependency, `src/main.ts` binds directly to the step containers defined in `index.html`:

- **`#step-welcome`**: Populates app title/description, lets users browse or edit the install path with live `InstallerApi.validateInstallPath` feedback, and toggles Desktop / Start Menu shortcuts.
- **Running Process Guard**: Before starting installation, `startInstall` checks `InstallerApi.checkRunning(executableName, installPath)` and terminates running PIDs if confirmed so file extraction will not hit sharing violations.
- **`#step-installing`**: Updates `#progress-fill` width and `#progress-file` telemetry from `InstallerApi.startInstall` callbacks.
- **`#step-completed` & `#step-uninstall`**: Supports launching the installed executable on completion (`InstallerApi.launchApp`) or removing files, shortcuts, and registry entries (`InstallerApi.startUninstall`).

## Why Choose Vanilla?

- Zero framework runtime overhead — yields the smallest compiled `ui.zip` size inside your `-Setup.exe`.
- Fast Vite builds and zero third-party UI library churn.
- Ideal starting point when embedding custom SVG animations, Web Components, or lightweight corporate installers.
