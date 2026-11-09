# Security Policy & Trust Boundary Model

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| < 0.2.0 | :x:                |

## Security Architecture & Trust Boundary

Because `tauri-custom-installer` renders a WebView2 frontend (`HTML/CSS/JS`) to drive native operating system installation actions, strict separation is enforced between **authoritative build-time metadata** and **untrusted frontend IPC input**:

1. **Authoritative Embedded Manifest (`AppManifest`)**:
   - Application metadata (`appName`, `appId`, `version`, `publisher`, `executableName`, `fileAssociations`, `urlSchemes`) is read from the signed/appended `TciFooter` manifest embedded in the setup binary—never trusted from frontend IPC arguments.
2. **Deny-Listed Installation Targets (`is_dangerous_install_path`)**:
   - The Rust core engine blocks installation or uninstallation targeting drive roots (`C:\`), `%WINDIR%`, `%ProgramFiles%` root, `%USERPROFILE%` root, Desktop, Documents, Downloads, `%APPDATA%` root, `%LOCALAPPDATA%` root, or relative paths containing `..`.
3. **Manifest-Scoped Uninstallation (`.tci\manifest.json`)**:
   - During installation, every extracted file and created directory is recorded with its SHA-256 digest in `<installDir>\.tci\manifest.json` (and backed up in `%LOCALAPPDATA%\tci\<appId>\manifest.json`).
   - During uninstallation, the uninstaller resolves `InstallLocation` from the Windows Registry or `.tci\manifest.json` (ignoring arbitrary paths over IPC), deletes **only** the files listed in the manifest, checks `FILE_ATTRIBUTE_REPARSE_POINT` to prevent symlink/junction traversal, and removes directories with `fs::remove_dir` (which only removes empty directories, preserving any unrelated user files).
4. **Scoped Process Management & Launching**:
   - `kill_running` and `launch_installed_app` only operate on processes and binaries verified via `QueryFullProcessImageNameW` to reside inside the target installation directory and match the authoritative `executableName`.
5. **Payload Integrity & Archive Hardening**:
   - The appended payload and UI archives are verified against their 256-bit SHA-256 digests (`TciFooter`) before extraction.
   - Archive extraction rejects `..` path traversal, absolute paths, NTFS Alternate Data Streams (`:`), reserved DOS device names (`CON`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`), and symlink/device tar entries.
6. **Zero PowerShell / Zero Shell Injection**:
   - Shortcuts (`.lnk` with `System.AppUserModel.ID`) and folder dialogs (`IFileOpenDialog`) use direct Win32 COM vtables without spawning PowerShell or `cmd.exe`.
   - `SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32)` is called at process startup to prevent DLL search-order hijacking from the `Downloads` directory.

## Reporting a Vulnerability

Please report security vulnerabilities privately via GitHub Security Advisories rather than public issues. Include steps to reproduce and affected versions. We aim to acknowledge reports within 48 hours.
