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

- `?scenario=success` — Standard clean install flow.
- `?scenario=app_running` — Simulates target executable already running with active PIDs.
- `?scenario=already_installed_upgrade` — Existing installation detected (upgrade path).
- `?scenario=insufficient_space` — Fails disk-space validation check.
- `?scenario=uninstall` — Boots directly into `UninstallView`.

---

## Tech Stack

| Dependency | Version | Purpose |
| --- | --- | --- |
| `react` / `react-dom` | `^19.0.0` | UI component hierarchy and state bindings |
| `@tauri-custom-installer/client` | SDK | `useInstaller` & `useUninstall` React hooks + Tauri/Mock bridge |
| `tailwindcss` | `^3.4.17` | Glassmorphic dark utility styling |
| `lucide-react` | `^0.475.0` | Clean vector icons |
| `vite` | `^6.1.0` | High-speed bundler for single-file `ui.zip` generation |

---

## Project Structure

```text
├── index.html
├── package.json
├── tailwind.config.js
└── src/
    ├── App.tsx                       # Root step router & uninstall mode switch
    ├── main.tsx                      # React root mount point
    ├── index.css                     # Tailwind utility directives & custom scrollbars
    ├── installer.config.json         # Fallback metadata for browser dev mode
    └── components/
        ├── TitleBar.tsx              # Frameless window drag region & min/close buttons
        ├── WelcomeStep.tsx           # Hero view + Express Install / Customize options
        ├── OptionsStep.tsx           # Directory picker, live disk validation & shortcuts
        ├── RunningWarningStep.tsx    # Active process detector & PID force-termination
        ├── InstallingStep.tsx        # Real-time progress bar, extraction metrics & cancel
        ├── CompletedStep.tsx         # Success confirmation + launch application option
        └── UninstallView.tsx         # Standalone uninstaller wizard + user-data purge
```

---

## Component Reference & Props Guide

Each view in the React template is factored into a dedicated, clean component under `src/components/`.

### 1. `TitleBar.tsx`
- **Purpose**: Provides a native-feeling, borderless Windows title bar with window controls.
- **Props**:
  | Prop | Type | Description |
  | --- | --- | --- |
  | `title` | `string` | Title text displayed in the header bar. |
  | `onMinimize` | `() => void` | Invoked when the minimize button (`─`) is clicked. Calls `InstallerApi.minimize()`. |
  | `onClose` | `() => void` | Invoked when the close button (`✕`) is clicked. Calls `InstallerApi.exit()`. |
- **Key Feature**: Marked with `data-tauri-drag-region`, allowing users to click and drag the frameless window freely.

---

### 2. `WelcomeStep.tsx`
- **Purpose**: The first screen the user sees. Displays app branding, publisher name, version badge, and feature highlights.
- **Props**:
  | Prop | Type | Description |
  | --- | --- | --- |
  | `appName` | `string` | Display name of the application. |
  | `appVersion` | `string` | Application version string. |
  | `publisher` | `string` | Publisher organization or author. |
  | `onExpressInstall` | `() => void` | Starts installation immediately using recommended defaults. |
  | `onCustomInstall` | `() => void` | Advances wizard to the `OptionsStep` for path & shortcut customization. |

---

### 3. `OptionsStep.tsx`
- **Purpose**: Lets users choose the destination folder, inspect available disk space, and toggle desktop integrations.
- **Props**:
  | Prop | Type | Description |
  | --- | --- | --- |
  | `installPath` | `string` | Currently selected destination folder path. |
  | `setInstallPath` | `(path: string) => void` | Updates path state and triggers disk re-validation. |
  | `onBrowse` | `() => void` | Opens native Win32 `IFileOpenDialog` folder picker via `browseInstallPath()`. |
  | `createDesktopShortcut` | `boolean` | State of the Desktop shortcut checkbox. |
  | `setCreateDesktopShortcut`| `(val: boolean) => void` | Updates Desktop shortcut toggle. |
  | `createStartMenuShortcut` | `boolean` | State of the Start Menu shortcut checkbox. |
  | `setCreateStartMenuShortcut` | `(val: boolean) => void` | Updates Start Menu shortcut toggle. |
  | `autoLaunchOnStartup` | `boolean` | State of the Windows Startup (`Run` key) toggle. |
  | `setAutoLaunchOnStartup` | `(val: boolean) => void` | Updates startup autolaunch toggle. |
  | `validation` | `PathValidation \| null` | Disk space, writability, and system deny-list check results. |
  | `requiredBytes` | `number` | Required space for decompression in bytes. |
  | `onBack` | `() => void` | Navigates back to `WelcomeStep`. |
  | `onInstall` | `() => void` | Begins installation flow with validated options. |

---

### 4. `RunningWarningStep.tsx`
- **Purpose**: Safety checkpoint when `InstallerApi.checkRunning` detects that the application is already running.
- **Props**:
  | Prop | Type | Description |
  | --- | --- | --- |
  | `appName` | `string` | Display name of the blocked application. |
  | `onTerminateAndContinue` | `() => void` | Closes active application instances using verified PIDs and resumes installation. |
  | `onCancel` | `() => void` | Cancels setup and closes the installer. |

---

### 5. `InstallingStep.tsx`
- **Purpose**: Live extraction progress screen with real-time feedback.
- **Props**:
  | Prop | Type | Description |
  | --- | --- | --- |
  | `appName` | `string` | Display name of the application. |
  | `progress` | `InstallProgress` | Progress object containing `stage`, `percent`, `current_file`, and byte counters. |
  | `onCancel` | `(() => void) \| undefined` | Optional callback to cancel installation and trigger transactional rollback. |
- **Stages Tracked**: Displays friendly labels for `'extracting'`, `'creating_shortcuts'`, `'registering'`, and `'completed'`.

---

### 6. `CompletedStep.tsx`
- **Purpose**: Congratulates the user on successful installation and provides post-setup actions.
- **Props**:
  | Prop | Type | Description |
  | --- | --- | --- |
  | `appName` | `string` | Display name of the application. |
  | `launchAfterInstall` | `boolean` | Whether to start the app when the user clicks Finish. |
  | `setLaunchAfterInstall` | `(val: boolean) => void` | Toggles the launch-after-install checkbox. |
  | `onFinish` | `() => void` | Launches executable (if checked) and terminates the installer process cleanly. |

---

### 7. `UninstallView.tsx`
- **Purpose**: Dedicated uninstaller interface loaded when the executable is launched in uninstall mode (`isUninstallMode: true`).
- **Props**:
  | Prop | Type | Description |
  | --- | --- | --- |
  | `appName` | `string` | Display name of the application. |
  | `appId` | `string` | Unique application identifier (bundle ID). |
  | `executableName` | `string` | Main binary name (e.g. `my-app.exe`). |
  | `installDir` | `string` | Directory where application is installed. |
- **Features**: Includes an optional checkbox (`purgeUserData`) to wipe `%APPDATA%`, `%LOCALAPPDATA%`, and WebView2 cache directories during uninstallation.

---

## State Machine Hook (`useInstaller`)

In `src/App.tsx`, the entire state machine is driven by `useInstaller`:

```tsx
const {
  step,                        // 'welcome' | 'options' | 'running_warning' | 'installing' | 'completed' | 'error'
  setStep,                     // Manually switch steps
  isUninstallMode,             // True if launched from Windows Apps & Features
  manifest,                    // Authoritative AppManifest verified by Rust core
  installPath,                 // User-selected installation path
  setInstallPath,              // Set install path and re-validate
  browseInstallPath,           // Open native Win32 folder dialog
  createDesktopShortcut,       // Boolean
  setCreateDesktopShortcut,
  createStartMenuShortcut,     // Boolean
  setCreateStartMenuShortcut,
  autoLaunchOnStartup,         // Boolean
  setAutoLaunchOnStartup,
  launchAfterInstall,          // Boolean
  setLaunchAfterInstall,
  validation,                  // PathValidation (isValid, availableBytes, errorMessage)
  progress,                    // InstallProgress (percent, stage, current_file)
  errorMessage,                // Error string if step === 'error'
  startInstall,                // Starts the installation pipeline
  cancelInstall,               // Cancels and rolls back files
  terminateRunningAndInstall,  // Kills running PIDs and installs
  launchApp,                   // Launches installed executable
  minimize,                    // Minimizes the window
  exit,                        // Closes the window
} = useInstaller({ ...defaultConfig });
```

---

## Customization

- **Tailwind Styling**: Modify `tailwind.config.js` or `src/index.css` to change color palettes, border radii, or typography.
- **Custom Components**: Add your own EULA / License acceptance step, component selection checkboxes, or custom branding banners between `WelcomeStep` and `OptionsStep`.
- **Packaging**: Run `npx tci build` to bundle this React UI into a single-file, obfuscated, and armored Windows `-Setup.exe`.
