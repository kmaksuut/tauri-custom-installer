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

Run the `init` command to scaffold the installer UI and backend:

```bash
# Interactive or default (React + Tailwind CSS)
npx tauri-custom-installer init

# Or specify a different UI template:
npx tauri-custom-installer init --template svelte
npx tauri-custom-installer init --template vue
npx tauri-custom-installer init --template vanilla
```

### What this does:
1. Detects your application name, version, and identifier from `src-tauri/tauri.conf.json`.
2. Creates an `installer/` directory containing:
   - A frontend project in your chosen framework (e.g. React 19 + Tailwind CSS + Lucide Icons).
   - A Tauri v2 backend in `installer/src-tauri/` wired to `tauri-custom-installer-core`.
   - Frameless, centered, borderless window configuration (680×450).
3. Adds build and development scripts to your root `package.json`:
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
bun run installer:dev
# or: npm run installer:dev
```

### Pure Frontend Developer Experience (DX):
- **Live HMR**: Edit `installer/src/App.tsx` or components with instant hot module replacement.
- **Mock Simulation Mode**: In development mode or in a web browser, the client SDK simulates realistic extraction speed, drive metrics, and progress events without modifying your real system files.
- **Zero Rust required**: Style with Tailwind, add custom onboarding videos, add licensing agreements, or adjust colors directly in TypeScript/CSS.

### Using the React Hook:
```tsx
import { useInstaller } from '@tauri-custom-installer/client';

export function MyCustomInstaller() {
  const {
    step,                 // 'welcome' | 'options' | 'installing' | 'completed' | 'error'
    setStep,
    installPath,          // User's selected folder (defaults to AppData/Local/Programs)
    setInstallPath,
    createDesktopShortcut,
    setCreateDesktopShortcut,
    createStartMenuShortcut,
    setCreateStartMenuShortcut,
    progress,             // { percent, current_file, stage }
    validation,           // { is_valid, available_bytes, has_enough_space }
    startInstall,         // Initiates installation
    launchApp,            // Spawns installed app on finish
    exit,                 // Closes installer window
  } = useInstaller({
    appName: 'My App',
    appId: 'com.example.myapp',
    appVersion: '1.0.0',
    publisher: 'My Company',
    executableName: 'my-app.exe',
  });

  return (
    <div className="w-[680px] h-[450px] bg-slate-900 rounded-2xl ...">
      {/* Build your UI */}
    </div>
  );
}
```

---

## 4. Building the Production Setup Executable

To generate the standalone setup executable (`<AppName>-Setup-v<Version>.exe`):

```bash
bun run installer:build
# or: npm run installer:build
```

### The Automated Pipeline:
1. Compiles the main application binaries (`cargo tauri build --no-bundle`).
2. Archives and compresses application payload files into `installer/src-tauri/payload/app_payload.zip`.
3. Builds the installer web UI with Vite.
4. Compiles the standalone installer executable with Tauri v2.
5. Emits the final setup file to `dist/<AppName>-Setup-v<Version>.exe`.

---

## 5. Clean Uninstaller Included

When your application is installed:
1. A dedicated `uninstall.exe` stub is placed in the installation folder.
2. The uninstallation entry is registered in **Windows Settings $\rightarrow$ Installed Apps**.
3. When clicked, it opens the uninstaller UI, prompts the user for confirmation, terminates running instances, deletes all installed files, purges shortcuts and registry keys, and performs self-deletion via a background temp worker.
