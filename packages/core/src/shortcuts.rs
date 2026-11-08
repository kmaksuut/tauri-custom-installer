use std::fs;
use std::path::{Path, PathBuf};

pub fn get_desktop_dir() -> Option<PathBuf> {
    dirs::desktop_dir()
}

pub fn get_start_menu_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        if let Some(roaming) = dirs::data_dir() {
            let start_menu = roaming
                .join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs");
            if start_menu.exists() {
                return Some(start_menu);
            }
        }
    }
    None
}

pub fn create_shortcut(
    target_exe: &Path,
    shortcut_path: &Path,
    description: &str,
    working_dir: &Path,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if let Some(parent) = shortcut_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let script = format!(
            "$ws = New-Object -ComObject WScript.Shell; \
             $s = $ws.CreateShortcut('{}'); \
             $s.TargetPath = '{}'; \
             $s.WorkingDirectory = '{}'; \
             $s.Description = '{}'; \
             $s.Save();",
            shortcut_path.to_string_lossy().replace('\'', "''"),
            target_exe.to_string_lossy().replace('\'', "''"),
            working_dir.to_string_lossy().replace('\'', "''"),
            description.replace('\'', "''")
        );

        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output()
            .map_err(|e| format!("Failed to execute shortcut creation command: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to create shortcut: {}", err));
        }

        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = target_exe;
        let _ = shortcut_path;
        let _ = description;
        let _ = working_dir;
        Ok(())
    }
}

pub fn remove_shortcuts(app_name: &str) {
    if let Some(desktop) = get_desktop_dir() {
        let lnk = desktop.join(format!("{}.lnk", app_name));
        if lnk.exists() {
            let _ = fs::remove_file(lnk);
        }
    }

    if let Some(start_menu) = get_start_menu_dir() {
        let lnk = start_menu.join(format!("{}.lnk", app_name));
        if lnk.exists() {
            let _ = fs::remove_file(lnk);
        }
    }
}
