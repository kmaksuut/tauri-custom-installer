# Windows Registry & Integration Specification

`tauri-custom-installer` adheres to Microsoft's guidelines for desktop application registration under Windows 10 and Windows 11, with full parity with Tauri's NSIS bundler.

---

## 1. Add/Remove Programs (Installed Apps)

Depending on the selected `installScope` (`perUser` vs `perMachine`), every installation registers an uninstall subkey under:
- **Per-User (`perUser`, default, no UAC prompt)**:
  `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\<AppId>`
- **Per-Machine (`perMachine`, Administrator)**:
  `HKEY_LOCAL_MACHINE\Software\Microsoft\Windows\CurrentVersion\Uninstall\<AppId>`
- **Sandbox Dry-Run (`TCI_DRY_RUN=1`)**:
  `HKEY_CURRENT_USER\Software\tci-sandbox\Uninstall\<AppId>`

### Values Written:

```reg
Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\com.example.myapp]
"DisplayName"="My Awesome App"
"DisplayVersion"="1.0.0"
"Publisher"="Example Corp"
"DisplayIcon"="C:\\Users\\<User>\\AppData\\Local\\My Awesome App\\my-app.exe,0"
"InstallLocation"="C:\\Users\\<User>\\AppData\\Local\\My Awesome App"
"InstallDate"="20261110"
"UninstallString"="\"C:\\Users\\<User>\\AppData\\Local\\My Awesome App\\uninstall.exe\" --uninstall"
"QuietUninstallString"="\"C:\\Users\\<User>\\AppData\\Local\\My Awesome App\\uninstall.exe\" --uninstall /S"
"EstimatedSize"=dword:00012c00
"VersionMajor"=dword:00000001
"VersionMinor"=dword:00000000
"NoModify"=dword:00000001
"NoRepair"=dword:00000000
"TciScope"="perUser"
"TciDesktopShortcut"=dword:00000001
"TciStartMenuShortcut"=dword:00000001
"TciAutostart"=dword:00000000
```

---

## 2. `App Paths`, File Associations & Deep Links

- **`App Paths`**:
  Registered under `Software\Microsoft\Windows\CurrentVersion\App Paths\<executableName>` so users can launch the application from `Win + R`.
- **File Associations (`bundle.fileAssociations`)**:
  Registered under `Software\Classes\.<ext>` and `Software\Classes\<AppId>.<ext>`, followed by `SHChangeNotify(SHCNE_ASSOCCHANGED)` to refresh Explorer icons immediately.
- **Custom URL Schemes (`urlSchemes`)**:
  Registered under `Software\Classes\<scheme>` with the `URL Protocol` marker and `shell\open\command` pointing to `"<exe>" "%1"`.

---

## 3. Startup Registration (`Run` Key)

When the user selects **Start with Windows**, the executable path is registered in:
```
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run
```
During uninstallation, this entry is automatically deleted.

---

## 4. Shell Shortcuts (`.lnk`) & Toast Notification AUMID

Shortcuts are created using direct Win32 COM (`IShellLinkW` + `IPersistFile` + `IPropertyStore`):
- **Desktop**: `%USERPROFILE%\Desktop\<AppName>.lnk`
- **Start Menu Programs**: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\<StartMenuFolder>\<AppName>.lnk`
- **`System.AppUserModel.ID` (`PKEY_AppUserModel_ID`)**: Stamped with `<AppId>` so Windows 10/11 Toast Notifications (`tauri-plugin-notification`) and taskbar grouping work out of the box.
