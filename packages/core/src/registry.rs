use crate::models::InstallOptions;

#[cfg(target_os = "windows")]
use winreg::enums::*;
#[cfg(target_os = "windows")]
use winreg::RegKey;

pub struct ExistingInstall {
    pub version: String,
    pub install_path: String,
}

pub fn check_existing_installation(app_id: &str) -> Option<ExistingInstall> {
    #[cfg(target_os = "windows")]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let path = format!(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{}", app_id);
        if let Ok(key) = hkcu.open_subkey(&path) {
            let version: String = key.get_value("DisplayVersion").unwrap_or_default();
            let install_path: String = key.get_value("InstallLocation").unwrap_or_default();
            return Some(ExistingInstall {
                version,
                install_path,
            });
        }
    }
    let _ = app_id;
    None
}

pub fn register_uninstall_entry(options: &InstallOptions, total_size_bytes: u64) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let uninstall_path = format!(
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{}",
            options.app_id
        );
        let (key, _) = hkcu
            .create_subkey(&uninstall_path)
            .map_err(|e| format!("Failed to create registry subkey: {}", e))?;

        let exe_path = format!(r"{}\{}", options.install_dir, options.executable_name);
        let uninstall_exe_path = format!(r"{}\uninstall.exe", options.install_dir);
        let icon_path = format!(r"{},0", exe_path);
        let estimated_size_kb: u32 = (total_size_bytes / 1024) as u32;

        let _ = key.set_value("DisplayName", &options.app_name);
        let _ = key.set_value("DisplayVersion", &options.app_version);
        let _ = key.set_value("Publisher", &options.publisher);
        let _ = key.set_value("DisplayIcon", &icon_path);
        let _ = key.set_value("InstallLocation", &options.install_dir);
        let _ = key.set_value("UninstallString", &format!("\"{}\" --uninstall", uninstall_exe_path));
        let _ = key.set_value("QuietUninstallString", &format!("\"{}\" --uninstall /S", uninstall_exe_path));
        let _ = key.set_value("EstimatedSize", &estimated_size_kb);
        let _ = key.set_value("NoModify", &1u32);
        let _ = key.set_value("NoRepair", &1u32);

        // Auto-launch on startup registry
        if options.auto_launch_on_startup {
            let run_path = r"Software\Microsoft\Windows\CurrentVersion\Run";
            if let Ok((run_key, _)) = hkcu.create_subkey(run_path) {
                let _ = run_key.set_value(&options.app_name, &format!("\"{}\"", exe_path));
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = options;
        let _ = total_size_bytes;
    }

    Ok(())
}

pub fn remove_uninstall_entry(app_id: &str, app_name: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let uninstall_path = format!(
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{}",
            app_id
        );
        let _ = hkcu.delete_subkey_all(&uninstall_path);

        // Remove from startup Run key if present
        let run_path = r"Software\Microsoft\Windows\CurrentVersion\Run";
        if let Ok(run_key) = hkcu.open_subkey_with_flags(run_path, KEY_WRITE) {
            let _ = run_key.delete_value(app_name);
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app_id;
        let _ = app_name;
    }

    Ok(())
}
