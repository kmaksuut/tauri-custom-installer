# Windows Registry & Integration Specification

`tauri-custom-installer` adheres to Microsoft's guidelines for desktop application registration under Windows 10 and Windows 11.

---

## 1. Add/Remove Programs (Installed Apps)

Every installation registers a subkey under:
```
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\<AppId>
```

### Values Written:

```reg
Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\com.example.myapp]
"DisplayName"="My Awesome App"
"DisplayVersion"="1.0.0"
"Publisher"="Antigravity Studio"
"DisplayIcon"="C:\\Users\\<User>\\AppData\\Local\\Programs\\My Awesome App\\my-app.exe,0"
"InstallLocation"="C:\\Users\\<User>\\AppData\\Local\\Programs\\My Awesome App"
"UninstallString"="\"C:\\Users\\<User>\\AppData\\Local\\Programs\\My Awesome App\\uninstall.exe\""
"QuietUninstallString"="\"C:\\Users\\<User>\\AppData\\Local\\Programs\\My Awesome App\\uninstall.exe\" /S"
"EstimatedSize"=dword:00012c00
"NoModify"=dword:00000001
"NoRepair"=dword:00000001
```

### Key Highlights:
- **No UAC Required**: By targeting `HKEY_CURRENT_USER`, the installer runs without administrative escalation (matching the modern user installer pattern of Discord, VS Code User Installer, and Spotify).
- **EstimatedSize**: Encodes uncompressed payload footprint in KB for accurate reporting in the Windows Settings app.
- **QuietUninstallString**: Enables enterprise IT administrators or automated package managers (winget, chocolatey) to execute silent removals via `/S`.

---

## 2. Startup Registration (`Run` Key)

When the user selects **Start with Windows**, the executable path is registered in:
```
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run
```
- Value Name: `<AppName>`
- Value Data: `"C:\Users\<User>\AppData\Local\Programs\<AppName>\<AppName>.exe"`

During uninstallation, this entry is automatically queried and deleted.

---

## 3. Shell Shortcuts (`.lnk`)

Shortcuts are created using the Windows Shell COM API:
- **Desktop**:
  `%USERPROFILE%\Desktop\<AppName>.lnk`
- **Start Menu Programs**:
  `%APPDATA%\Microsoft\Windows\Start Menu\Programs\<AppName>.lnk`

During uninstallation, both locations are scanned and cleanly purged.
