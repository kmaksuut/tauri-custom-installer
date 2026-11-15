# Vue 3 Installer Template

Modern Windows installer wizard built with **Vue 3 Composition API** (`<script setup lang="ts">`), **TypeScript**, and [`@tauri-custom-installer/client`](../../packages/client/README.md).

## Quick Start

### 1. Initialize Template

Initialize this template inside your Tauri v2 repository:

```bash
# Using Bun:
bunx @tauri-custom-installer/cli init --template vue

# Or using npx:
npx @tauri-custom-installer/cli init --template vue
```

### 2. Install & Start Development Server

Start the Vite hot-reload server with browser simulation:

```bash
# Using Bun:
cd installer && bun install
bun run dev

# Or using npm:
cd installer && npm install
npm run dev
```

### 3. Build Production Installer

```bash
# Using Bun:
bunx tci build

# Or using npx:
npx tci build
```

Pass simulation query strings in the browser to verify every UI state:

- `?scenario=success` — Clean installation sequence.
- `?scenario=app_running` — Active executable collision simulation.
- `?scenario=already_installed_upgrade` — Existing installation detected.
- `?scenario=insufficient_space` — Disk validation failure state.
- `?scenario=uninstall` — Dedicated uninstaller interface preview.

---

## Tech Stack

| Dependency | Version | Purpose |
| --- | --- | --- |
| `vue` | `^3.5.0` | Vue 3 `<script setup>` Composition API reactive state engine |
| `@vitejs/plugin-vue` | `^5.2.0` | Single-File Component (`.vue`) Vite compiler integration |
| `@tauri-custom-installer/client` | SDK | `InstallerApi`, TypeScript models & mock simulator |
| `typescript` | `^5.7.3` | Strict typing for manifest, progress, and validation data |
| `vite` | `^6.1.0` | High-speed bundler producing single-file `ui.zip` assets |

---

## Project Structure

```text
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── App.vue                       # Complete wizard with <script setup>, template & styles
    ├── main.ts                       # Creates and mounts the Vue application instance
    ├── env.d.ts                      # Module declarations for Vue SFCs
    └── installer.config.json         # Browser-dev fallback metadata
```

---

## Component Architecture & Reactive State Machine (`App.vue`)

The Vue template encapsulates the entire setup lifecycle inside a clean Single-File Component (`src/App.vue`), keeping runtime overhead minimal and avoiding unnecessary virtual DOM complexity.

### 1. Reactive State Refs (`ref`)

| State Ref | Type | Description |
| --- | --- | --- |
| `step` | `'welcome' \| 'running_warning' \| 'installing' \| 'completed' \| 'error' \| 'uninstall'` | Current step in the installation flow. |
| `action` | `'install' \| 'upgrade' \| 'repair'` | Detected system installation mode. |
| `installPath` | `string` | Selected target directory. |
| `createDesktop` | `boolean` | Desktop shortcut checkbox toggle. |
| `createStartMenu` | `boolean` | Start Menu shortcut checkbox toggle. |
| `autoLaunch` | `boolean` | Start application with Windows (`Run` key). |
| `launchAfter` | `boolean` | Launch the app after setup exits. |
| `purgeUserData` | `boolean` | Wipe `%APPDATA%` and WebView2 cache on uninstallation. |
| `runningPids` | `number[]` | PIDs of conflicting application processes. |
| `validation` | `PathValidation \| null` | Disk writability, free space, and deny-list check results. |
| `progress` | `InstallProgress` | Real-time extraction progress object (`percent`, `current_file`, etc.). |
| `errorMessage` | `string` | Error description displayed in case of failure. |

---

### 2. Template Views & UI Sections Breakdown

#### A. TitleBar Section
- **What it does**: Native frameless title bar with application name, status dot, and window controls.
- **Window Dragging**: Includes `data-tauri-drag-region` for native window drag movement.
- **Controls**:
  - `─` (Minimize): Invokes `InstallerApi.minimizeInstaller()`.
  - `✕` (Close): Invokes `InstallerApi.exitInstaller()`.

#### B. Welcome & Preferences View (`v-if="step === 'welcome'"`)
- **Branding**: Displays application name, version badge, and publisher information.
- **Path Selection**: Supports direct text editing or clicking `Browse...` (`handleBrowse`) to trigger the native Win32 `IFileOpenDialog` via `InstallerApi.selectFolder`.
- **Live Validation**: Every input change runs `handlePathChange`, checking disk space and blocking system paths (`C:\Windows`, `C:\Program Files` roots without subfolder, etc.).
- **Options**: Checkboxes for Desktop shortcut, Start Menu shortcut, and autostart on Windows logon.
- **Action Button**: Triggers `startInstallFlow()` if validation succeeds.

#### C. Running Warning View (`v-else-if="step === 'running_warning'"`)
- **Collision Intercept**: Shown when `InstallerApi.checkRunning` detects that the application executable is currently in use.
- **One-Click Fix**: Clicking `Close App & Continue` calls `closeRunningAndInstall()`, which invokes `InstallerApi.killRunning(runningPids, ...)` and continues extraction smoothly.

#### D. Extraction View (`v-else-if="step === 'installing'"`)
- **Progress Telemetry**: Displays percentage bar (`progress.percent`) and the file currently being extracted (`progress.current_file`).
- **Cancel Button**: Invokes `handleCancel()`, signaling Rust core to abort decompression and cleanly rollback created files.

#### E. Completed View (`v-else-if="step === 'completed'"`)
- **Success State**: Confirms successful deployment.
- **Finish Button**: Invokes `handleFinish()`, which optionally starts the app (`InstallerApi.launchInstalledApp`) and terminates setup.

#### F. Error Recovery View (`v-else-if="step === 'error'"`)
- **Error Display**: Shows structured error messages (disk full, permission issues).
- **Back Button**: Allows returning to the `welcome` view to adjust paths or retry.

#### G. Standalone Uninstaller View (`v-else-if="step === 'uninstall'"`)
- **Automatic Detection**: Activated when launched from Windows Apps & Features (`is_uninstall_mode: true`).
- **Purge Option**: Checkbox to remove all user configuration and cache files.
- **Execution**: Calling `handleUninstall()` deletes all installed assets, shortcuts, and registry entries.

---

### 3. Controller Methods Reference

```typescript
// 1. Live path validation
async function handlePathChange(newPath: string): Promise<void>
// Validates path using InstallerApi.validateInstallPath and updates validation ref.

// 2. Win32 folder browser
async function handleBrowse(): Promise<void>
// Opens native Windows folder dialog via InstallerApi.selectFolder.

// 3. Pre-install safety check
async function startInstallFlow(): Promise<void>
// Re-validates path, checks running processes via InstallerApi.checkRunning, and proceeds.

// 4. Terminate & continue
async function closeRunningAndInstall(): Promise<void>
// Terminates active PIDs via InstallerApi.killRunning and starts installation.

// 5. Streaming installation
async function performInstall(): Promise<void>
// Invokes InstallerApi.startInstallation with progress streaming.

// 6. Transactional cancel
async function handleCancel(): Promise<void>
// Aborts extraction and triggers transactional file rollback.

// 7. Uninstaller execution
async function handleUninstall(): Promise<void>
// Kills any running instances and invokes InstallerApi.startUninstallation.
```

---

### 4. How to Break `App.vue` into Subcomponents

If you prefer multi-file Vue architecture, you can extract components into `src/components/`:

```text
src/
├── App.vue
└── components/
    ├── TitleBar.vue
    ├── WelcomeStep.vue
    ├── InstallingStep.vue
    ├── CompletedStep.vue
    ├── RunningWarningStep.vue
    └── UninstallView.vue
```

Example subcomponent usage:
```vue
<script setup lang="ts">
import TitleBar from './components/TitleBar.vue';
import WelcomeStep from './components/WelcomeStep.vue';
</script>

<template>
  <div class="window">
    <TitleBar :app-name="appName" :step="step" />
    <WelcomeStep v-if="step === 'welcome'" :install-path="installPath" @install="startInstallFlow" />
  </div>
</template>
```

---

## Customization

- **Styling**: Customize the scoped `<style>` block in `src/App.vue`.
- **Production Config**: Configure `tci.config.json` in your project root for production SFX builds.
- **Build**: Run `npx tci build` to generate your standalone `-Setup.exe`.
