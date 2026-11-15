# @tauri-custom-installer/client

Framework-agnostic TypeScript SDK, state store, localization engine, and framework adapters (**React**, **Svelte**, **Vue**, **Solid**) for building custom **Tauri v2** Windows installers.

## Installation

```bash
npm install @tauri-custom-installer/client
```

## Entry Points

| Import Path | Contents |
| --- | --- |
| `@tauri-custom-installer/client` | `InstallerApi`, `createInstallerStore`, `parseStructuredError`, `MockInstallerDriver`, `isTauriEnvironment`, `getTranslations`, `isRtlLocale`, `resolveLocale`, types |
| `@tauri-custom-installer/client/react` | `useInstaller`, `useUninstall` hooks, types, and i18n helpers |
| `@tauri-custom-installer/client/svelte` | Svelte adapter exports |
| `@tauri-custom-installer/client/vue` | Vue 3 composable adapter exports |
| `@tauri-custom-installer/client/solid` | SolidJS adapter exports |

## Quick Usage

### 1. Imperative API (`InstallerApi`)

Works identically inside **Tauri v2** (via `invoke` + `Channel` streaming) and **standard browsers** (via the built-in mock driver):

```ts
import { InstallerApi, parseStructuredError } from '@tauri-custom-installer/client';

const info = await InstallerApi.getSystemInfo('My App', 'com.example.app');
const check = await InstallerApi.validateInstallPath(info.default_install_path, 64 * 1024 * 1024);

if (!check.is_valid) {
  console.error(check.error_message);
}

const running = await InstallerApi.checkRunning('my-app.exe', info.default_install_path);
if (running.is_running) {
  await InstallerApi.killRunning(running.pids, 'my-app.exe', info.default_install_path);
}

try {
  await InstallerApi.startInstall(
    {
      install_dir: info.default_install_path,
      create_desktop_shortcut: true,
      create_start_menu_shortcut: true,
      launch_after_install: true,
    },
    (progress) => {
      console.log(`${progress.stage}: ${progress.percent}% — ${progress.current_file}`);
    }
  );
} catch (err) {
  const structured = parseStructuredError(err);
  console.error(`[${structured.code}] ${structured.message}`);
}
```

### 2. Framework-Agnostic Store (`createInstallerStore`)

Provides a complete reactive state machine covering install, upgrade, running-process recovery, uninstall, RTL/i18n, and license/path validation—usable from Vue, Svelte, Vanilla JS, or custom renderers.

```ts
import { createInstallerStore } from '@tauri-custom-installer/client';

const store = createInstallerStore({
  appName: 'My App',
  appId: 'com.example.app',
  appVersion: '1.0.0',
  executableName: 'my-app.exe',
});

const unsubscribe = store.subscribe((state) => {
  console.log(state.step, state.progress.percent, state.errorMessage);
});

await store.init();
```

### 3. React Hooks (`@tauri-custom-installer/client/react`)

```tsx
import { useInstaller, useUninstall } from '@tauri-custom-installer/client/react';
```

See [`templates/react`](../../templates/react/README.md) and [`templates/futuristic-3d`](../../templates/futuristic-3d/README.md) for complete UI implementations.

## Browser Dev Simulator Scenarios

When running outside a Tauri WebView (`vite dev`), `MockInstallerDriver` simulates Windows installer states automatically via `?scenario=` URL query parameters (or `store.setScenario(...)`):

- `success` — Clean install sequence
- `app_running` — Returns active PIDs from `checkRunning`
- `already_installed_upgrade` — Sets `action = 'upgrade'` with pre-existing version metadata
- `insufficient_space` — Fails disk space validation cleanly
- `uninstall` — Sets `is_uninstall_mode = true` to preview uninstall views

## Security Trust Model

In packaged SFX builds, calling `InstallerApi.getSystemInfo(...)` returns `info.manifest` read directly from Rust core's verified `AppManifest` embedded inside the executable trailer. Production security decisions (installation paths allow-listing, hooks, certificates, registry entries) are enforced strictly by Rust (`packages/core`) and cannot be overridden by modified frontend JS payloads.
