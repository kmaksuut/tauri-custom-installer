# Svelte 5 Installer Template

Lightweight, reactive Windows installer wizard built with **Svelte 5 Runes** (`$state`), **TypeScript**, and [`@tauri-custom-installer/client`](../../packages/client/README.md).

## Quick Start

Scaffold the Svelte template into your Tauri v2 project:

```bash
npx @tauri-custom-installer/cli init --template svelte
```

Run the Vite development server with the built-in browser mock engine:

```bash
npm run dev
```

Preview specific edge-case scenarios by appending query parameters in your browser:

- `?scenario=success` — Standard clean installation flow.
- `?scenario=app_running` — Target executable is active; prompts process termination.
- `?scenario=already_installed_upgrade` — Existing app detected; demonstrates upgrade telemetry.
- `?scenario=insufficient_space` — Fails disk space check with live feedback.
- `?scenario=uninstall` — Boots directly into the uninstaller wizard.

---

## Tech Stack

| Dependency | Version | Purpose |
| --- | --- | --- |
| `svelte` | `^5.0.0` | Fine-grained reactive UI powered by Svelte 5 `$state` runes |
| `@sveltejs/vite-plugin-svelte` | `^5.0.0` | Svelte 5 Vite compiler integration |
| `@tauri-custom-installer/client` | SDK | `InstallerApi` IPC + browser mock simulator driver |
| `typescript` | `^5.7.3` | Strong typing for manifests, paths, and progress callbacks |
| `vite` | `^6.1.0` | Ultra-compact single-bundle `ui.zip` output |

---

## Project Structure

```text
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── App.svelte                    # Complete install, error & uninstall state machine
    ├── main.ts                       # Mounts App.svelte into #app
    └── installer.config.json         # Fallback metadata for browser simulator preview
```

---

## Component Architecture & Reactive State Machine (`App.svelte`)

The Svelte template implements a complete, self-contained installer wizard inside `src/App.svelte` using modern Svelte 5 runes (`$state`). This keeps runtime bundle size exceptionally small while delivering instant reactivity.

### 1. Reactive State Runes (`$state`)

| State Variable | Type | Description |
| --- | --- | --- |
| `step` | `'welcome' \| 'running_warning' \| 'installing' \| 'completed' \| 'error' \| 'uninstall'` | Active view in the installer flow. |
| `action` | `'install' \| 'upgrade' \| 'repair'` | Detected installation action from system info. |
| `installPath` | `string` | Selected destination directory on the user's filesystem. |
| `createDesktop` | `boolean` | Toggle for creating a Windows Desktop shortcut. |
| `createStartMenu`| `boolean` | Toggle for creating a Start Menu shortcut. |
| `autoLaunch` | `boolean` | Toggle for starting the application on Windows logon (`Run` key). |
| `launchAfter` | `boolean` | Whether to launch the installed executable when exiting setup. |
| `purgeUserData` | `boolean` | (Uninstall only) Whether to delete `%APPDATA%` and WebView2 cache. |
| `runningPids` | `number[]` | PIDs of currently running executable instances detected by `checkRunning`. |
| `validation` | `PathValidation \| null` | Result of `InstallerApi.validateInstallPath` (writability, space, deny-list). |
| `progress` | `InstallProgress` | Live extraction metrics (`stage`, `percent`, `current_file`, `bytes_extracted`). |
| `errorMessage` | `string` | Human-readable error message displayed on failure. |

---

### 2. Step Views & UI Sections Breakdown

#### A. TitleBar Section (Lines 173–194)
- **What it does**: Renders a borderless, draggable Windows title bar with application name and window controls.
- **Key Attributes**: Uses `data-tauri-drag-region` to allow the user to drag the frameless installer window across the screen.
- **Controls**:
  - `─` (Minimize): Calls `InstallerApi.minimizeInstaller()`.
  - `✕` (Close): Calls `InstallerApi.exitInstaller()`.

#### B. Welcome & Configuration Step (`step === 'welcome'`, Lines 197–254)
- **What it does**: Displays the application branding, version badge, publisher info, destination path picker, and shortcut options.
- **Path Selection**: User can edit the path manually or click `Browse...` (`handleBrowse`), which triggers the native Win32 `IFileOpenDialog` via `InstallerApi.selectFolder`.
- **Live Validation**: Every keystroke invokes `handlePathChange`, checking disk writability, required space, and dangerous system paths.
- **Action Button**: Shows `Install Now`, `Upgrade Now`, or `Repair` based on system detection. Disabled if path validation fails.

#### C. Running Process Warning (`step === 'running_warning'`, Lines 255–265)
- **What it does**: Prevents extraction collisions (error 32 sharing violations) if the target application is currently open.
- **User Actions**:
  - `Back`: Returns to the welcome view.
  - `Close App & Continue` (`closeRunningAndInstall`): Calls `InstallerApi.killRunning(runningPids, ...)`, closes all locked processes, and proceeds directly with installation.

#### D. Extraction Progress (`step === 'installing'`, Lines 266–276)
- **What it does**: Displays an animated progress bar and live telemetry while `tauri-custom-installer-core` decompresses files.
- **Live Metrics**: Shows percentage (`progress.percent`) and currently extracted archive entry (`progress.current_file`).
- **Cancellation**: Clicking `Cancel` (`handleCancel`) triggers transactional rollback, removing partially extracted files and restoring the system state cleanly.

#### E. Completion View (`step === 'completed'`, Lines 277–286)
- **What it does**: Displays installation success confirmation.
- **Finish Action (`handleFinish`)**: If `launchAfter` is checked, launches the freshly installed `.exe` via `InstallerApi.launchInstalledApp` and exits the setup window.

#### F. Error Recovery (`step === 'error'`, Lines 287–292)
- **What it does**: Displays structured error messages (e.g. disk full, permission denied, invalid certificate thumbprint). Provides a `Back to Setup` button to allow user recovery.

#### G. Standalone Uninstaller View (`step === 'uninstall'`, Lines 293–303)
- **What it does**: Automatically activated when launched from Windows **Settings > Apps > Installed apps** (`is_uninstall_mode: true`).
- **User Options**: Provides an optional `Delete application settings and WebView2 cache` checkbox (`purgeUserData`).
- **Execution**: Calling `handleUninstall` removes files, shortcuts, and registry entries, followed by delayed self-deletion of `uninstall.exe`.

---

### 3. Controller Methods & Functions Guide

```typescript
// 1. Path change & validation
async function handlePathChange(newPath: string): Promise<void>
// Validates destination path with InstallerApi.validateInstallPath and updates the UI.

// 2. Folder picker dialog
async function handleBrowse(): Promise<void>
// Opens the native Windows folder selection dialog via InstallerApi.selectFolder.

// 3. Pre-install safety pipeline
async function startInstallFlow(): Promise<void>
// Validates path, runs InstallerApi.checkRunning to detect active PIDs, and delegates to performInstall.

// 4. Force-kill and install
async function closeRunningAndInstall(): Promise<void>
// Terminates blocking processes via InstallerApi.killRunning and begins installation.

// 5. Streaming installation execution
async function performInstall(): Promise<void>
// Calls InstallerApi.startInstallation, streaming real-time progress events into `progress`.

// 6. Transactional cancel
async function handleCancel(): Promise<void>
// Aborts extraction and triggers transactional file rollback in Rust core.

// 7. Uninstaller execution
async function handleUninstall(): Promise<void>
// Kills any running instances and executes InstallerApi.startUninstallation.
```

---

### 4. How to Modularize / Split into Subcomponents

If your design requires multi-file component separation, you can extract the views into separate Svelte components cleanly:

```text
src/
├── App.svelte
└── components/
    ├── TitleBar.svelte
    ├── WelcomeStep.svelte
    ├── OptionsStep.svelte
    ├── InstallingStep.svelte
    ├── CompletedStep.svelte
    ├── RunningWarningStep.svelte
    └── UninstallView.svelte
```

Example subcomponent usage in `App.svelte`:
```svelte
<script lang="ts">
  import TitleBar from './components/TitleBar.svelte';
  import WelcomeStep from './components/WelcomeStep.svelte';
  // Pass state runes directly as props or two-way bindings ($bindable)
</script>

<TitleBar {appName} {step} />
{#if step === 'welcome'}
  <WelcomeStep bind:installPath {validation} onInstall={startInstallFlow} />
{/if}
```

---

## Customization & Branding

- **Colors & Typography**: Edit the `<style>` block in `src/App.svelte`. All CSS uses standard modern CSS variables and flexbox layouts.
- **Production Metadata**: Configure `tci.config.json` in your Tauri project root for production SFX builds. Preview defaults in `src/installer.config.json` apply during browser dev mode.
- **Release Packaging**: Run `npx tci build` to produce a single-file, armored `-Setup.exe` with your customized Svelte wizard.
