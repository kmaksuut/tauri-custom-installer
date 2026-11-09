# Developer Integration Guide

This guide walks you through integrating **`tauri-custom-installer`** into an existing or new **Tauri v2** application.

---

## 1. Installation

In the root of your Tauri project, install `tauri-custom-installer` as a development dependency:

### Using Bun:
```bash
bun add -d tauri-custom-installer
```

### Using npm:
```bash
npm install -D tauri-custom-installer
```

### Using pnpm:
```bash
pnpm add -D tauri-custom-installer
```

---

## 2. Initialize the Installer Workspace

Run the `init` command to scaffold the installer UI and configuration:

```bash
# Interactive or default (React 19 + Tailwind CSS + Lucide)
npx tauri-custom-installer init

# Or specify a different UI template:
npx tauri-custom-installer init --template svelte
npx tauri-custom-installer init --template vue
npx tauri-custom-installer init --template vanilla
```

### What this does:
1. Detects your application name, version, publisher, and identifier from `src-tauri/tauri.conf.json`.
2. Creates a `tci.config.json` file at your project root as the single source of truth.
3. Creates an `installer/` directory containing your chosen frontend project (`react`, `svelte`, `vue`, or `vanilla`) wired to `@tauri-custom-installer/client`.
4. Adds build and development scripts to your root `package.json`:
   ```json
   {
     "scripts": {
       "installer:dev": "tauri-custom-installer dev",
       "installer:build": "tauri-custom-installer build"
     }
   }
   ```

---

## 3. Customize Your Installer UI

Start the installer in development mode:

```bash
# Instant browser preview with Vite HMR & 10-scenario simulator
bun run installer:dev

# Native Tauri window in sandboxed dry-run mode (%TEMP%\tci-sandbox + HKCU\Software\tci-sandbox)
bun run installer:dev --native
```

### Using the Framework Adapters:

#### React (`@tauri-custom-installer/client/react`)
```tsx
import { useInstaller } from '@tauri-custom-installer/client/react';

export function MyCustomInstaller() {
  const {
    step,                   // 'welcome' | 'license' | 'options' | 'running-warning' | 'installing' | 'completed' | 'error'
    setStep,
    installPath,            // Default: %LOCALAPPDATA%\<AppName> (or %ProgramFiles%\<AppName>)
    setInstallPath,
    installScope,           // 'perUser' | 'perMachine'
    setInstallScope,
    createDesktopShortcut,
    setCreateDesktopShortcut,
    createStartMenuShortcut,
    setCreateStartMenuShortcut,
    autoLaunchOnStartup,
    setAutoLaunchOnStartup,
    progress,               // { percent, current_file, stage, speed_bps, eta_seconds }
    validation,             // { is_valid, available_bytes, has_enough_space }
    selectFolder,           // Opens native Win32 IFileOpenDialog folder picker
    startInstall,           // Initiates installation
    cancelInstall,          // Cancels extraction & rolls back partial files
    launchApp,              // Spawns installed app on finish
    exit,                   // Closes installer window
  } = useInstaller();

  return (
    <div className="w-[680px] h-[450px] bg-slate-900 rounded-2xl ...">
      {/* Build your custom UI */}
    </div>
  );
}
```

#### Svelte 5 (`@tauri-custom-installer/client/svelte`), Vue 3 (`@tauri-custom-installer/client/vue`), Solid (`@tauri-custom-installer/client/solid`), and Vanilla (`@tauri-custom-installer/client`)
All adapters wrap the same framework-agnostic store (`createInstallerStore`) and expose the same state machine and actions.

---

## 4. Building the Production Setup Executable

To generate the standalone setup executable (`dist/<AppName>-Setup-<Version>-<Arch>.exe`):

```bash
bun run installer:build
# or: npm run installer:build
```

### The Automated Pipeline:
1. Compiles the main application binaries (`tauri build --no-bundle`).
2. Stages the main executable, runtime DLLs, `bundle.externalBin` sidecars, and `bundle.resources`, then compresses them into a deterministic `tar.zst` archive.
3. Builds the installer web UI (`ui.zip`) with Vite.
4. Appends `[ui.zip][payload.tar.zst][manifest.json][TciFooter (136B)]` with SHA-256 integrity digests to the runtime executable.
5. Signs the resulting setup executable if `signCommand` or `certificateThumbprint` is configured.

---

## 5. Payload-Stripped Uninstaller Included

When your application is installed:
1. A payload-stripped `uninstall.exe` (`payload_size = 0`) is written to the installation directory—preserving your custom web UI while adding zero duplicate payload overhead.
2. The uninstallation entry is registered in **Windows Settings $\rightarrow$ Installed Apps** (`HKCU` or `HKLM`).
3. On uninstall, only files recorded in `<installDir>\.tci\manifest.json` are removed (preserving unrelated user files), shortcuts/file associations/URL schemes are cleaned up, and self-deletion is scheduled via `MoveFileExW(..., MOVEFILE_DELAY_UNTIL_REBOOT)`.
