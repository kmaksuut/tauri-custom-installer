# Vue 3 Installer Template

Modern Windows installer template powered by **Vue 3 Composition API** (`<script setup lang="ts">`), **TypeScript**, and [`@tauri-custom-installer/client`](../../packages/client/README.md).

## Quick Start

Initialize this template inside your Tauri v2 repository:

```bash
npx @tauri-custom-installer/cli init --template vue
```

Start the Vite hot-reload server with browser simulation:

```bash
npm run dev
```

Pass simulation query strings in the browser to verify every UI state:

- `?scenario=success`
- `?scenario=app_running`
- `?scenario=already_installed_upgrade`
- `?scenario=insufficient_space`
- `?scenario=uninstall`

## Tech Stack

| Dependency | Version | Purpose |
| --- | --- | --- |
| `vue` | `^3.5.0` | Vue 3 `<script setup>` reactive state and templates |
| `@vitejs/plugin-vue` | `^5.2.0` | Single-File Component (`.vue`) Vite integration |
| `@tauri-custom-installer/client` | SDK | `InstallerApi`, TypeScript models & mock simulator |
| `typescript` | `^5.7.3` | Strict typing for manifest & progress callbacks |
| `vite` | `^6.1.0` | Fast Vite bundling for `ui.zip` packaging |

## Project Structure

```text
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── App.vue                       # Composition API wizard covering install, recovery & uninstall
    ├── main.ts                       # Creates & mounts the Vue app
    ├── env.d.ts                      # Vite & Vue SFC module declarations
    └── installer.config.json         # Browser-dev fallback installer metadata
```

## Architecture & State Flow

`src/App.vue` manages the complete setup lifecycle using Vue `ref` and `onMounted`:

- **Bootstrap**: Fetches system environment info and authoritative manifest overrides via `InstallerApi.getSystemInfo`, routes to `uninstall` mode automatically when launched from Windows Apps & Features (`is_uninstall_mode`), and validates the default target path.
- **Wizard Steps**: Supports `'welcome' | 'running_warning' | 'installing' | 'completed' | 'error' | 'uninstall'`.
- **Safe Path & Process Handling**: Validates custom paths through `InstallerApi.validateInstallPath` before proceeding, provides a native folder browser (`InstallerApi.selectFolder`), and checks for locked binaries (`InstallerApi.checkRunning` + `InstallerApi.killRunning`) prior to extraction.
- **Uninstaller Parity**: Allows toggling `purgeUserData` (`%APPDATA%` / `%LOCALAPPDATA%` cleanup) before invoking `InstallerApi.startUninstall`.

## Customization

- **Branding & Layout**: Modify the `<template>` and `<style>` blocks inside `src/App.vue` or split sections into additional `.vue` components.
- **Configuration**: Configure production fields (`appName`, `appId`, `hooks`, `certificates`, `obfuscate`, `sign`) in your project's `tci.config.json`, while keeping `src/installer.config.json` synchronized for local UI development.
