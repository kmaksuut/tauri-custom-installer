---
name: tci-template-author
description: Guides creation and maintenance of Tauri Custom Installer UI templates using @tauri-custom-installer/client, WebGL/tci:// CSP compatibility, CLI registration, and template parity checks. Use when adding a new framework template or updating an existing template UI.
---

# Authoring TCI UI Templates

Each directory under `templates/<name>` is a standalone Vite + TypeScript frontend paired with a lightweight Tauri v2 shell (`src-tauri/`) compiled against `tauri-custom-installer-core`.

## Required Files

```text
templates/<name>/
├── index.html
├── package.json
├── src/
│   ├── installer.config.json   # Default UI config overwritten during `tci init` / `tci build`
│   └── ...                     # Framework UI entry (App.tsx, App.svelte, App.vue, main.ts, etc.)
└── src-tauri/
    ├── Cargo.toml              # Depends on `tauri-custom-installer-core` at `../../../packages/core`
    ├── build.rs                # Creates placeholder dist/index.html & payload/app_payload.zip for workspace checks
    ├── capabilities/default.json
    ├── icons/
    ├── src/main.rs             # Calls `tauri::Builder::default().plugin(tauri_custom_installer_core::register)` or `.setup` / register()
    └── tauri.conf.json
```

## Mandatory UI & SDK Contract

Use `InstallerApi` (or `createInstallerStore` / framework hooks) from `@tauri-custom-installer/client`:
1. **System initialization**: Call `InstallerApi.getSystemInfo(appName, appId, requiredBytes)` on mount to obtain `default_install_path`, `is_uninstall_mode`, `existing_version`, and free disk space.
2. **Path selection & validation**: Pass `appName` to `InstallerApi.selectFolder(currentPath, appName)` so non-empty folders auto-append the application folder cleanly, and call `InstallerApi.validateInstallPath(installDir, requiredBytes)` on mount and path edits before allowing installation.
3. **Running process guard**: Before starting installation, call `InstallerApi.checkRunning(executableName, installDir)` and prompt/call `InstallerApi.killRunning(pids, executableName, installDir)` if active.
4. **Error handling & Uninstall mode**: Wrap `InstallerApi.startInstallation(...)` and `InstallerApi.startUninstallation(...)` in `try/catch` and render actionable errors in the UI instead of hanging in a spinner state.

## `tci://` Protocol & Media/3D Templates

When a Single-File SFX executable runs in production, UI assets are served from an appended `ui.zip` via the custom `tci://` URI scheme (`packages/core/src/lib.rs`).
- Supported MIME types include `.html`, `.js`, `.mjs`, `.css`, `.json`, `.wasm`, `.glb`, `.gltf`, `.svg`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.ico`, `.woff`, `.woff2`, `.ttf`, `.otf`, `.mp3`, `.wav`, and `.ogg`.
- Relative URLs from bundled Vite assets (`assets/...`) work directly under `tci://`. Keep `base: './'` or default relative Vite asset paths.
- WebGL, Three.js shaders, Wasm (`'wasm-unsafe-eval'`), `blob:` workers, and Web Audio synthesis are permitted under the built-in CSP.

## Registering a New Template

1. Add the template folder under `templates/<name>` and ensure its `package.json` and `src-tauri/Cargo.toml` match root `package.json` version and repository URL (or run `npm run orchestrate:sync`).
2. Register `<name>` in `AVAILABLE_TEMPLATES` inside `packages/cli/src/commands/init.ts` (and optional prompt label in `runInit`).
3. Add a build step for `templates/<name>` in `.github/workflows/ci.yml`.
4. Run `npm run orchestrate` to confirm template parity, CI hygiene, and `npm pack --dry-run` compliance.
