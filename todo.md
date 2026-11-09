# TODO — `tauri-custom-installer` Audit & Roadmap

> **Status:** Implemented (v0.2.0). All P0 Security, P0/P1 Runtime & NSIS Parity, P0/P1 Distribution, Client SDK, and Template items have been implemented and verified.
> **Goal:** A developer runs `bun add -d tauri-custom-installer` (or `npm i -D`), writes **only UI code**
> (React / Svelte / Vue / Solid / Ember / Vanilla / anything that emits static HTML),
> and gets a signed, single-file Windows setup executable that is **at least on par with Tauri's NSIS/MSI
> bundles in every dimension, and better in several.**
>
> Priority legend: **P0** = broken / security / blocks publishing · **P1** = NSIS/MSI parity · **P2** = "better than NSIS" · **P3** = nice to have.

---

## Table of Contents

1. [Target Developer Experience (the spec everything else serves)](#1-target-developer-experience)
2. [Target Architecture (prebuilt runtime + appended payload)](#2-target-architecture)
3. [P0 — Security Vulnerabilities](#3-p0--security-vulnerabilities)
4. [P0 — Broken / Incorrect Behaviour](#4-p0--broken--incorrect-behaviour)
5. [P0 — Distribution (npm / bun / GitHub) is not actually usable yet](#5-p0--distribution-npm--bun--github)
6. [P1 — NSIS / MSI Feature Parity Matrix](#6-p1--nsis--msi-feature-parity)
7. [P1 — Build Pipeline (`tci build`) Correctness](#7-p1--build-pipeline-tci-build)
8. [P1 — Size & Performance Optimization](#8-p1--size--performance-optimization)
9. [P1 — Client SDK (`@tauri-custom-installer/client`)](#9-p1--client-sdk)
10. [P1 — Templates](#10-p1--templates)
11. [P2 — Features That Make It Better Than NSIS](#11-p2--better-than-nsis)
12. [P2 — Testing & CI](#12-p2--testing--ci)
13. [P2 — Documentation](#13-p2--documentation)
14. [Things to REMOVE](#14-things-to-remove)
15. [Suggested Milestones](#15-suggested-milestones)

---

## 1. Target Developer Experience

This is the north star. Every item below exists to make this flow work exactly as written.

### 1.1 Install

```bash
# bun
bun add -d tauri-custom-installer

# npm
npm install -D tauri-custom-installer

# pnpm / yarn
pnpm add -D tauri-custom-installer
yarn add -D tauri-custom-installer
```

- [x] **One package only.** The user installs `tauri-custom-installer`. It brings the CLI and vendors the client SDK
      (`@tauri-custom-installer/client`, `/react`, `/svelte`, `/vue`, `/solid`).
- [x] **No Rust toolchain needed to build the installer** when prebuilt `tci-runtime.exe` is present (see §2).
- [x] Also support zero-install usage: `bunx tauri-custom-installer init` / `npx tauri-custom-installer init`.

### 1.2 Initialize

```bash
bunx tci init
# or
npx tci init
```

- [x] `init` is **idempotent** and never overwrites user files without `--force`.
- [x] Detect package manager from `npm_config_user_agent` / lockfiles and use it for every generated script and message.
- [x] Detect the existing Tauri project (`src-tauri/tauri.conf.json`) and sync metadata automatically.
- [x] Add `.tci/` and `.payload_staging/` (build cache) to `.gitignore` automatically.

### 1.3 Configure (`tci.config.json` / `package.json#installer`)

- [x] Support `tci.config.json` and an `"installer"` key inside `package.json`, plus `defineConfig()` helper.
- [x] Expose the resolved config to the UI at runtime (`getConfig()` / `getSystemInfo().manifest`), so UI code never hardcodes app name/version/exe again.

### 1.4 Develop UI

```bash
bun run installer:dev        # browser + simulation engine, Vite HMR
bun run installer:dev --native   # real installer window, DRY-RUN (installs into a temp sandbox, no production registry writes)
```

- [x] `--native` dry-run mode: runs the real runtime with `TCI_DRY_RUN=1`, redirects install dir to `%TEMP%\tci-sandbox\…`, and writes registry
      keys under `HKCU\Software\tci-sandbox\…`, so developers can test real progress on real files without touching the system.
- [x] Simulation scenarios selectable in the mock engine (`setMockScenario()`): `success`, `slow_disk`, `insufficient_space`, `app_running`,
      `permission_denied`, `already_installed_upgrade`, `repair`, `downgrade`, `corrupted_payload`, `uninstall`.

### 1.5 Build

```bash
bun run installer:build
# → dist/MyApp-Setup-1.2.3-x64.exe   (signed if signing is configured)
```

- [x] One command: compiles user app (unless `--skip-app-build`), packs `tar.zst` payload, builds UI (`ui.zip`), appends `TciFooter` to runtime stub.
- [x] `--skip-app-build`, `--arch arm64`, `--debug` / `--no-release`, `--no-sign`, `--dry-run` flags.
- [x] Print a final summary table: payload size, compressed size, ratio, UI bundle size, setup size, sign status, SHA-256.

### 1.6 Ship

- [x] Works with `tauri-plugin-updater` out of the box (`/S`, `/P`, `/UPDATE`, `/R`).
- [x] Emits `latest.json` artifacts compatible with the Tauri updater when `bundle.createUpdaterArtifacts` is enabled.
- [x] Silent / passive / enterprise flags documented and tested (see §6.6).

---

## 2. Target Architecture

```text
MyApp-Setup.exe = [ tci-runtime-x64.exe ][ ui.zip ][ payload.tar.zst ][ manifest.json ][ footer(magic, offsets, sha256) ]
```

- [x] **P0** Created `packages/runtime` crate (`tci-runtime`): a Tauri v2 app that opens its own exe, reads the 136-byte `TciFooter`, serves `ui.zip` through the
      custom URI scheme protocol (`tci://`), and streams `payload.tar.zst` from disk with `SectionReader` (`Read + Seek`, constant O(1) memory).
- [x] **P0** Offline/custom runtime override supported via `TCI_RUNTIME_PATH=…` or `vendor/runtime/tci-runtime.exe`.
- [x] **P0** `tci build` assembles `[runtime.exe][ui.zip][payload.tar.zst][manifest.json][TciFooter]` via `buildSfxExecutable()`.
- [x] Declarative hooks model (`hooks: { preInstall, postInstall, preUninstall }`) defined in `AppManifest`.
- [x] Stripped **uninstaller binary** (`write_stripped_uninstaller`): copies `[runtime.exe][ui.zip][manifest.json][footer(payload_size=0)]` so `uninstall.exe` preserves the custom UI with zero payload duplication.

---

## 3. P0 — Security Vulnerabilities

- [x] **Arbitrary directory deletion fixed.** `start_uninstallation` no longer trusts `install_dir` from IPC; the uninstaller resolves the authoritative path from the Windows Registry / `.tci\manifest.json`.
- [x] **Manifest-driven file removal.** Installation writes `<installDir>\.tci\manifest.json` listing every installed file with SHA-256 and size; uninstallation deletes only manifest-recorded files and preserves unrelated user files.
- [x] **Deny-list dangerous install targets**: drive roots (`C:\`), `%WINDIR%`, `%ProgramFiles%` root, `%USERPROFILE%` root, Desktop, Documents,
      Downloads, `%APPDATA%` root, `%LOCALAPPDATA%` root, `%TEMP%` root, and `..` traversal blocked in Rust (`is_dangerous_install_path`).
- [x] **Auto-append product folder:** `normalize_selected_folder` automatically appends `\<ProductName>` when the user selects a non-empty folder.
- [x] **Arbitrary process execution fixed.** `launch_installed_app` launches the authoritative executable from the embedded manifest/state (`LAST_INSTALLED_EXE`), never arbitrary paths.
- [x] **Arbitrary process killing fixed.** `kill_running` scopes termination strictly to processes whose full image path (`QueryFullProcessImageNameW`) resides inside the target installation directory, sending graceful `WM_CLOSE` before `TerminateProcess`.
- [x] **Trust boundary for metadata.** Authoritative `AppManifest` comes from the embedded SFX footer.
- [x] **Strict CSP** configured in runtime and templates (`default-src 'self' tci: http://tci.localhost; ...`), plus allow-listed `open_external_url` (`https://` only).
- [x] **Payload integrity:** Streaming SHA-256 of the payload and UI archive stored in `TciFooter` and verified before extraction (`verify_section_sha256`).
- [x] **Zip-slip / path traversal:** `sanitize_archive_entry_path` rejects absolute paths, `..`, ADS (`file:stream`), reserved DOS names (`CON`, `NUL`, `COM1`, `LPT1`), and symlinks/hardlinks.
- [x] **Symlink/junction attacks during uninstall:** checks `FILE_ATTRIBUTE_REPARSE_POINT` before deleting.
- [x] **Randomly named temp worker:** uninstaller spawns `<app_id>-uninstall-<pid>-<random>.exe`.
- [x] **PowerShell command construction removed** in `shortcuts.rs` — replaced with direct Win32 COM `IShellLinkW`, `IPersistFile`, `IPropertyStore`, and `IFileOpenDialog`.
- [x] **DLL preloading protection:** calls `SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32)` on startup.
- [x] **Security policy:** added [SECURITY.md](./SECURITY.md).

---

## 4. P0 — Broken / Incorrect Behaviour

### 4.1 WebView2 dependency
- [x] Runtime checks WebView2 installation via registry (`check_webview2_installed` in `SystemInfo.webview2_installed`), and `/S` silent mode executes purely in Rust without initializing WebView2.

### 4.2 Silent / CLI mode
- [x] `check_worker_or_silent_mode()` is wired directly inside `tauri_custom_installer_core::register()` so every binary handles `/S`, `/P`, `/UPDATE`, `/D=`, and `--uninstall` before launching WebView2.
- [x] Uses authoritative `AppManifest` metadata instead of hardcoded defaults.
- [x] Respects `/NS`, `/NODESKTOP`, `/R`, `/ALLOWDOWNGRADE`, `/LOG=`, `/LANG=`.
- [x] Returns standardized exit codes (`0, 1, 2, 3, 4, 5, 6, 3010`) and writes structured logs.

### 4.3 Uninstaller payload & cleanup
- [x] `write_stripped_uninstaller` strips 100% of the application payload from `uninstall.exe`.
- [x] Self-deletion uses `MoveFileExW(path, NULL, MOVEFILE_DELAY_UNTIL_REBOOT)` instead of `cmd /c ping`.
- [x] Uninstaller removes Start Menu folder, Desktop shortcut, `App Paths` key, file associations, URL protocol handlers, autostart `Run` value, PATH entry, and `.tci\manifest.json`.
- [x] `purge_user_data` implemented (`%APPDATA%\<id>` and `%LOCALAPPDATA%\<id>`).
- [x] Registry entry is removed **last** after file and shortcut cleanup succeeds.

### 4.4 Remove PowerShell usage
- [x] Shortcuts created via Win32 COM `IShellLinkW` + `IPersistFile` + `IPropertyStore` (`PKEY_AppUserModel_ID`).
- [x] Folder picker uses Win32 COM `IFileOpenDialog` (`FOS_PICKFOLDERS`).

### 4.5 Upgrade / repair / downgrade
- [x] Semantic version comparison (`determine_install_action`) classifies `'install' | 'upgrade' | 'repair' | 'downgrade'`.
- [x] Upgrades clean up stale files from the previous `.tci\manifest.json` (`cleanup_stale_upgrade_files`).
- [x] Exposes `existing_version`, `existing_install_dir`, and `install_action` to the UI.

### 4.6 Rollback & locked files
- [x] Transactional backup (`.tci-backup`) during extraction with automatic rollback if extraction fails or is cancelled.

### 4.7 Process detection
- [x] Replaced `sysinfo` with Win32 `CreateToolhelp32Snapshot` + `QueryFullProcessImageNameW` scoped to `install_dir`.

### 4.8 Disk space
- [x] Replaced `sysinfo::Disks` with Win32 `GetDiskFreeSpaceExW` on nearest existing ancestor, failing closed (`0` bytes on error).

### 4.9 Window / capabilities
- [x] Added explicit window permissions (`core:window:allow-minimize`, `core:window:allow-close`, `core:window:allow-start-dragging`) in all `capabilities/default.json`.
- [x] Single-instance mutex (`Local\tci-setup-<app_id>`) prevents concurrent installer instances.

### 4.10 Misc bugs
- [x] `exec.ts` uses `spawn` without `shell: true` on non-cmd binaries and safely quotes cmd shims on Windows.
- [x] `--no-release` / `--debug` flags wired in `build.ts`.
- [x] Default per-user install path matches Tauri NSIS (`%LOCALAPPDATA%\<AppName>`).

---

## 5. P0 — Distribution (npm / bun / GitHub)

- [x] `packages/cli/scripts/bundle-assets.cjs` copies `templates/` and `vendor/{client,core,runtime}` into `packages/cli` during `build` and `prepack`.
- [x] Replaced `"workspace:*"` in all templates with standard relative/semver dependencies so both `npm` and `bun` work out of the box.
- [x] Removed `export * from './react'` from `@tauri-custom-installer/client` root entry so Svelte/Vue/Solid/Vanilla bundles never require React.
- [x] Added subpath exports (`@tauri-custom-installer/client/react`, `/svelte`, `/vue`, `/solid`).

---

## 6. P1 — NSIS / MSI Feature Parity

- [x] **6.1 Install modes:** `perUser` (`HKCU`) and `perMachine` (`HKLM`) support.
- [x] **6.3 & 6.4 Shortcuts & AUMID:** Native COM shortcuts with `System.AppUserModel.ID` stamped for Windows Toast Notifications.
- [x] **6.5 File associations:** Registers `bundle.fileAssociations` and notifies Explorer via `SHChangeNotify(SHCNE_ASSOCCHANGED)`.
- [x] **6.6 CLI switches & exit codes:** Full NSIS-compatible switch parser (`/S`, `/P`, `/UPDATE`, `/R`, `/NS`, `/NODESKTOP`, `/ALLOWDOWNGRADE`, `/LOG=`, `/LANG=`, `/D=`) and standard exit codes.
- [x] **6.7 Localization:** OS UI language detection (`GetUserDefaultUILanguage`) + 11 built-in locales (`en`, `tr`, `de`, `fr`, `es`, `pt-BR`, `ru`, `zh-CN`, `ja`, `ko`, `ar` RTL).
- [x] **6.9 Code signing:** Post-SFX Authenticode signing via `signCommand` or `signtool` + backwards footer scan up to 128 KB.
- [x] **6.10 Updater compatibility:** Handles `/P`, `/S`, `/UPDATE`, `/R` and emits `latest.json` when `createUpdaterArtifacts` is enabled.
- [x] **6.12 Deep links:** Registers `url_schemes` (`URL Protocol` + `shell\open\command`).
- [x] **6.13 License page:** Embeds `licenseText` in manifest and renders interactive EULA step when configured.
- [x] **6.15 Extra registry values:** Writes `InstallDate`, `VersionMajor`, `VersionMinor`, `App Paths\<exe>`, and optional `PATH` environment variable + `WM_SETTINGCHANGE`.

---

## 7. P1 — Build Pipeline (`tci build`)

- [x] Runs `tauri build --no-bundle` via local `@tauri-apps/cli` or `cargo tauri`, or runs `beforeBuildCommand` before `cargo build`.
- [x] Accurate payload staging (`stageApplicationPayload`): stages main binary, runtime DLLs, `bundle.externalBin` (stripping target triple), and `bundle.resources`.
- [x] Target directory resolved via `cargo metadata --format-version 1 --no-deps`.
- [x] Set `bundle.active: false` in all installer `tauri.conf.json` files.
- [x] Added `tci build --dry-run` to inspect staged files and sizes.

---

## 8. P1 — Size & Performance Optimization

- [x] **Compression:** `tar.zst` (Zstandard + USTAR tar) payload archive creation and streaming extraction.
- [x] **Constant-memory streaming:** `SectionReader` (`Read + Seek`) streams directly from the executable on disk without loading the payload into RAM.
- [x] **Throttled progress:** ~30 Hz progress events with `speed_bps` and `eta_seconds`.
- [x] **Release profile:** `opt-level = "s"`, `lto = true`, `codegen-units = 1`, `panic = "abort"`, `strip = true`, removed `sysinfo` and `thiserror`.

---

## 9. P1 — Client SDK

- [x] Framework-agnostic observable store (`createInstallerStore` in `packages/client/src/store.ts`).
- [x] Dedicated subpath adapters for `/react`, `/svelte`, `/vue`, and `/solid`.
- [x] Built-in 11-locale i18n dictionary (`packages/client/src/i18n.ts`).
- [x] Scenario-based mock simulator (`setMockScenario`, no `window.prompt`).

---

## 10. P1 — Templates

- [x] Fixed `templates/svelte` (`@sveltejs/vite-plugin-svelte@^5.0.0`, `tsconfig.json`, full feature parity in `App.svelte`).
- [x] Fixed `templates/vue` (`tsconfig.json`, `src/env.d.ts`, full feature parity in `App.vue`).
- [x] Updated `templates/react` and `templates/vanilla` to use the new Client SDK and capabilities.
- [x] Verified `bun run build` succeeds across all 4 templates (`react`, `svelte`, `vue`, `vanilla`).

---

## 11. P2 — Better Than NSIS

- [x] `tci winget` command generates a ready-to-publish WinGet manifest (`winget-manifest.yaml`) with SHA-256 and silent switches (`/S`, `/P`, `/D=`).
- [x] Live UI development with HMR + 10-scenario simulator + native dry-run sandbox (`--native`).

---

## 12. P2 — Testing & CI

- [x] 10 Rust integration/security tests in `packages/core/tests/installer_tests.rs` covering `TciFooter` + Authenticode padding, SHA-256 verification, `tar.zst` & `.zip` extraction, path traversal/ADS/reserved-name blocking, dangerous path deny-list, folder normalization, COM `.lnk` creation with AUMID, registry lifecycle, stale file cleanup on upgrade, and NSIS CLI switch parsing.
- [x] Client SDK test suite (`packages/client/src/__tests__/client.test.ts`) covering store lifecycle, scenario simulator, i18n locales, and React adapter exports.
- [x] Updated `.github/workflows/ci.yml` to build and test Rust core, Client SDK, CLI, all 4 templates, and end-to-end `sample-tauri-app` setup packaging.

---

## 13. P2 — Documentation

- [x] Replaced all local `file:///c:/Users/...` links in `README.md` with portable relative repository links.
- [x] Updated `README.md`, `docs/ARCHITECTURE.md`, and `SECURITY.md` with complete, accurate documentation in English.

---

## 14. Things to REMOVE

- [x] Removed all PowerShell invocations (`shortcuts.rs`, `select_folder`).
- [x] Removed `cmd /c ping … & del` self-delete trick.
- [x] Removed `sysinfo` and `thiserror` dependencies from `packages/core`.
- [x] Removed `window.prompt` from the mock folder picker.
- [x] Removed `export * from './react'` from the Client SDK root entrypoint.
