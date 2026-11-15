# React Installer Template

Clean, responsive Windows installer wizard built with **React 19**, **Tailwind CSS**, **Lucide Icons**, and [`@tauri-custom-installer/client`](../../packages/client/README.md).

## Quick Start

Scaffold this template directly inside your Tauri v2 project (React is the default template):

```bash
npx @tauri-custom-installer/cli init
# or explicitly:
npx @tauri-custom-installer/cli init --template react
```

Start the hot-reloading UI development server with the built-in browser simulator:

```bash
npm run dev
```

Simulate edge-case installer flows in the browser using URL query parameters:

- `?scenario=success` — Standard clean install flow
- `?scenario=app_running` — Simulates target executable already running with active PIDs
- `?scenario=already_installed_upgrade` — Existing installation detected (upgrade path)
- `?scenario=insufficient_space` — Fails disk-space validation check
- `?scenario=uninstall` — Boots directly into `UninstallView`

## Tech Stack

| Dependency | Version | Purpose |
| --- | --- | --- |
| `react` / `react-dom` | `^19.0.0` | Component rendering |
| `@tauri-custom-installer/client` | SDK | `useInstaller` & `useUninstall` React hooks + Tauri/Mock bridge |
| `tailwindcss` | `^3.4.17` | Glassmorphic dark utility styling |
| `lucide-react` | `^0.475.0` | Vector UI icons |
| `vite` | `^6.1.0` | Fast bundling for single-file `ui.zip` |

## Project Structure

```text
├── index.html
├── package.json
├── tailwind.config.js
└── src/
    ├── App.tsx                       # Step router & uninstall mode switch
    ├── main.tsx
    ├── index.css                     # Tailwind directives & custom scrollbars
    ├── installer.config.json         # Fallback metadata for browser dev mode
    └── components/
        ├── TitleBar.tsx              # Frameless window drag region & min/close controls
        ├── WelcomeStep.tsx           # Hero view + Express Install / Customize actions
        ├── OptionsStep.tsx           # Path picker, live disk validation & shortcut toggles
        ├── RunningWarningStep.tsx    # Detects & terminates blocking app PIDs
        ├── InstallingStep.tsx        # Real-time Channel<InstallProgress> progress & cancel
        ├── CompletedStep.tsx         # Completion summary + launch-on-exit option
        └── UninstallView.tsx         # Dedicated uninstaller wizard + user-data purge option
```

## Architecture & State Flow

`App.tsx` connects directly to the `useInstaller` hook from `@tauri-custom-installer/client/react`. When compiled inside the Single-File SFX binary, `packages/core` embeds an authoritative `AppManifest` into the executable trailer and overrides `installer.config.json` automatically so untrusted IPC payloads cannot spoof publisher or registry metadata.

1. **`welcome`**: Displays app name, version, publisher, and detected action (`install`, `upgrade`, `repair`).
2. **`options`**: Validates target paths via `InstallerApi.validateInstallPath` (checks disk space, writability, and system deny-lists) and provides Desktop shortcut, Start Menu shortcut, and auto-launch options.
3. **`running_warning`**: Triggered automatically if `InstallerApi.checkRunning` detects active instances of the target executable. Offers one-click termination (`terminateRunningAndInstall`) using verified PIDs.
4. **`installing`**: Streams live extraction progress (`stage`, `current_file`, `percent`) with transactional rollback support on failure or cancellation.
5. **`completed`**: Allows launching the freshly installed application and closing the setup window cleanly.
6. **Uninstall Mode (`isUninstallMode`)**: Automatically swaps to `UninstallView`, preserving user-data purge options and delayed self-deletion (`uninstall.exe`).

## Customization

- **Metadata & Behavior**: Configure `tci.config.json` in your Tauri project root for production builds, and mirror preview defaults in `src/installer.config.json` for browser `vite` development.
- **Branding & Colors**: Edit `tailwind.config.js` and `src/components/*` to apply custom logos, typography, EULA panels, or multi-step branding.
- **Release Builds**: Run `tci build` from your Tauri project root. Release mode minifies UI assets into `dist/`, applies JS string obfuscation unless disabled, and packages everything into a V2 armored Single-File SFX executable.
