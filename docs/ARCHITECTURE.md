# Architecture & Technical Deep Dive

`tauri-custom-installer` enables desktop developers to build modern, animated, branded installer wizards for **Tauri v2** using standard web technologies (**React, Svelte 5, Vue 3, Solid, Vanilla HTML/CSS/TS**) with full NSIS/MSI feature parity.

---

## 1. Appended Single-File SFX Layout (`TciFooter`)

Every setup executable produced by `tci build` uses a deterministic appended layout:

```text
┌───────────────────────────┬──────────────────┬────────────────────────┬───────────────────┬──────────────────────────┐
│  tci-runtime.exe          │  ui.zip          │  app_payload.tar.zst   │  manifest.json    │  TciFooter (136 bytes)   │
│  (Native Tauri v2 Stub)   │  (Compiled Web)  │  (Zstandard Solid Tar) │  (AppManifest)    │  Offsets + SHA-256 + Magic│
└───────────────────────────┴──────────────────┴────────────────────────┴───────────────────┴──────────────────────────┘
```

1. **Constant-Memory Streaming (`SectionReader`)**:
   At runtime, the installer opens its own executable (`std::env::current_exe()`), locates `TciFooter` (scanning backwards up to 128 KB if an Authenticode signature table is appended after the footer), verifies the 256-bit SHA-256 digest in 64 KB chunks, and streams `app_payload.tar.zst` directly into the Zstandard + Tar decoder without loading the archive into RAM.
2. **Stripped Uninstaller (`write_stripped_uninstaller`)**:
   When writing `<installDir>\uninstall.exe`, the runtime copies `[tci-runtime.exe][ui.zip][manifest.json][TciFooter (payload_size = 0)]`, omitting `app_payload.tar.zst`. This preserves the developer's custom uninstaller UI while keeping `uninstall.exe` at ~2.5 MB regardless of how large the application payload is.

---

## 2. Transactional Extraction, Differential Upgrades & Rollback

```
[Appended app_payload.tar.zst / .zip]
            │
            ├─► Verify SHA-256 digest (abort with CORRUPTED code on mismatch)
            ├─► Sanitize paths (block .., ADS ':', CON/NUL, symlinks)
            ├─► Back up existing files into .tci-backup during in-place upgrade
            ├─► Stream decompression & compute per-file SHA-256
            ├─► Throttle progress events to 30 Hz (with speed_bps & eta_seconds)
            │
            ▼
  [Write <installDir>\.tci\manifest.json]
  [Remove stale files from previous version's manifest]
```

If the user cancels installation or an I/O error occurs mid-extraction:
- Newly created files are deleted.
- Overwritten files are restored from `.tci-backup`.
- Pre-existing unrelated files in the target folder are never touched.

---

## 3. Native Win32 COM & Registry Integration (Zero PowerShell)

### 3.1 Shortcuts with `System.AppUserModel.ID` (`IShellLinkW` + `IPropertyStore`)
Shortcuts are created directly via Win32 COM vtables (`CLSID_ShellLink`, `IShellLinkW`, `IPersistFile`, `IPropertyStore`) in under 5 milliseconds without spawning PowerShell:
- Stamps `PKEY_AppUserModel_ID` (`{9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3}, 5`) with `manifest.app_id` on `.lnk` files so Windows Toast Notifications (`tauri-plugin-notification`) and taskbar grouping work identically to NSIS/MSI.

### 3.2 Native Folder Picker (`IFileOpenDialog`)
Folder selection uses `CLSID_FileOpenDialog` with `FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST`. When the user selects an existing non-empty folder, `normalize_selected_folder` automatically appends `\<AppName>` (matching NSIS and VS Code behavior).

### 3.3 Registry Integration
Writes under `HKCU` (`perUser`) or `HKLM` (`perMachine`):
- `Software\Microsoft\Windows\CurrentVersion\Uninstall\<AppId>`: `DisplayName`, `DisplayVersion`, `VersionMajor`, `VersionMinor`, `Publisher`, `DisplayIcon`, `InstallLocation`, `InstallDate` (`YYYYMMDD`), `UninstallString`, `QuietUninstallString`, `ModifyPath`, `EstimatedSize`, `TciInstallScope`, and saved shortcut/autostart preferences.
- `Software\Microsoft\Windows\CurrentVersion\App Paths\<ExeName>`: Enables launching via `Win+R`.
- `Software\Classes\.<ext>` & `Software\Classes\<scheme>`: Registers `bundle.fileAssociations` (followed by `SHChangeNotify(SHCNE_ASSOCCHANGED)`) and `deep-link` URL schemes.

---

## 4. Manifest-Based Uninstallation & Self-Cleanup

1. **Authoritative Path Resolution**: Reads `InstallLocation` from the Registry or `.tci\manifest.json` beside `uninstall.exe` (never trusting arbitrary paths from IPC).
2. **Process Closure**: Uses Win32 ToolHelp32 + `QueryFullProcessImageNameW` to locate running processes inside `InstallLocation`, sends `WM_CLOSE` to top-level windows first, and terminates any remaining processes.
3. **Manifest-Only File Deletion**: Deletes only the files listed in `.tci\manifest.json` (checking `FILE_ATTRIBUTE_REPARSE_POINT` to never follow symlinks or junctions) and removes empty subdirectories with `fs::remove_dir`.
4. **Optional User Data Purge**: When `purge_user_data` is enabled, removes `%APPDATA%\<AppId>` and `%LOCALAPPDATA%\<AppId>` (including WebView2 `EBWebView` cache).
5. **Registry Last**: Removes Registry entries only after file cleanup succeeds, then spawns a stripped worker in `%TEMP%` (registered with `MoveFileExW(..., MOVEFILE_DELAY_UNTIL_REBOOT)`) to remove `uninstall.exe` once the process exits.
