use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use tauri::ipc::Channel;
use crate::disk::{get_default_install_dir, get_program_files_dir, validate_path};
use crate::extractor::{extract_payload, get_embedded_or_external_payload, request_cancel};
use crate::models::{
    InstallOptions, InstallProgress, PathValidation, RunningProcessInfo, SystemInfo,
    UninstallOptions, UninstallProgress,
};
use crate::process::{check_running_process, kill_processes};
use crate::registry::{check_existing_installation, register_uninstall_entry};
use crate::shortcuts::{create_shortcut, get_desktop_dir, get_start_menu_dir};
use crate::uninstaller::execute_uninstallation;

pub fn detect_uninstall_mode() -> bool {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| {
        a.eq_ignore_ascii_case("--uninstall")
            || a.eq_ignore_ascii_case("/uninstall")
            || a.eq_ignore_ascii_case("-u")
    }) {
        return true;
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(stem) = exe_path.file_stem() {
            let name = stem.to_string_lossy().to_lowercase();
            if name.starts_with("uninstall") {
                return true;
            }
        }
    }

    false
}

#[tauri::command]
pub fn get_system_info(
    app_name: String,
    app_id: String,
    required_bytes: u64,
) -> Result<SystemInfo, String> {
    let default_path = get_default_install_dir(&app_name);
    let prog_files = get_program_files_dir(&app_name);
    let desktop = get_desktop_dir();
    let start_menu = get_start_menu_dir();

    let validation = validate_path(&default_path.to_string_lossy(), required_bytes);
    let existing = check_existing_installation(&app_id);
    let is_uninstall_mode = detect_uninstall_mode();

    let mut existing_install_path = existing.as_ref().map(|e| e.install_path.clone());
    if existing_install_path.is_none() && is_uninstall_mode {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(parent) = exe_path.parent() {
                existing_install_path = Some(parent.to_string_lossy().to_string());
            }
        }
    }

    let resolved_default = existing_install_path
        .clone()
        .unwrap_or_else(|| default_path.to_string_lossy().to_string());

    Ok(SystemInfo {
        default_install_path: resolved_default,
        program_files_path: prog_files.map(|p| p.to_string_lossy().to_string()),
        desktop_path: desktop.map(|p| p.to_string_lossy().to_string()),
        start_menu_path: start_menu.map(|p| p.to_string_lossy().to_string()),
        available_space_bytes: validation.available_bytes,
        is_elevated: false,
        is_already_installed: existing.is_some(),
        existing_version: existing.as_ref().map(|e| e.version.clone()),
        existing_install_path,
        is_uninstall_mode,
    })
}

#[tauri::command]
pub fn validate_install_path(path: String, required_bytes: u64) -> PathValidation {
    validate_path(&path, required_bytes)
}

#[tauri::command]
pub async fn select_folder(initial_path: Option<String>) -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        let start_dir = initial_path.unwrap_or_default().replace('\'', "''");
        let script = format!(
            "Add-Type -AssemblyName System.Windows.Forms; \
             $dlg = New-Object System.Windows.Forms.FolderBrowserDialog; \
             $dlg.Description = 'Select Installation Directory'; \
             $dlg.ShowNewFolderButton = $true; \
             if ('{}' -ne '' -and (Test-Path '{}')) {{ $dlg.SelectedPath = '{}' }}; \
             if ($dlg.ShowDialog() -eq 'OK') {{ Write-Output $dlg.SelectedPath }}",
            start_dir, start_dir, start_dir
        );

        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Sta", "-Command", &script])
            .output()
            .map_err(|e| format!("Failed to open folder dialog: {}", e))?;

        let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if selected.is_empty() {
            return Ok(None);
        }
        return Ok(Some(selected));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = initial_path;
        Ok(None)
    }
}

#[tauri::command]
pub fn check_running(executable_name: String) -> RunningProcessInfo {
    check_running_process(&executable_name)
}

#[tauri::command]
pub fn kill_running(pids: Vec<u32>) -> Result<(), String> {
    kill_processes(&pids)
}

#[tauri::command]
pub async fn start_installation(
    options: InstallOptions,
    on_progress: Channel<InstallProgress>,
) -> Result<(), String> {
    let target_dir = PathBuf::from(&options.install_dir);

    // 1. Fetch payload
    let payload_bytes = get_embedded_or_external_payload()?;
    let total_archive_size = payload_bytes.len() as u64;

    // 2. Extract payload with progress reporting
    let extracted_size = extract_payload(
        Cursor::new(payload_bytes),
        &target_dir,
        |prog| {
            let _ = on_progress.send(prog);
        },
    )?;

    // 3. Create uninstaller stub in destination directory
    if let Ok(current_exe) = std::env::current_exe() {
        let uninstaller_dest = target_dir.join("uninstall.exe");
        let _ = fs::copy(&current_exe, &uninstaller_dest);
    }

    // 4. Create Shortcuts if requested
    let _ = on_progress.send(InstallProgress {
        stage: "creating_shortcuts".into(),
        current_file: "Creating system shortcuts...".into(),
        files_completed: 1,
        total_files: 1,
        bytes_extracted: extracted_size,
        total_bytes: extracted_size,
        percent: 96.0,
    });

    let exe_path = target_dir.join(&options.executable_name);
    if options.create_desktop_shortcut {
        if let Some(desktop) = get_desktop_dir() {
            let lnk_path = desktop.join(format!("{}.lnk", options.app_name));
            let _ = create_shortcut(&exe_path, &lnk_path, &options.app_name, &target_dir);
        }
    }

    if options.create_start_menu_shortcut {
        if let Some(start_menu) = get_start_menu_dir() {
            let lnk_path = start_menu.join(format!("{}.lnk", options.app_name));
            let _ = create_shortcut(&exe_path, &lnk_path, &options.app_name, &target_dir);
        }
    }

    // 5. Register in Windows Registry
    let _ = on_progress.send(InstallProgress {
        stage: "registering".into(),
        current_file: "Registering application...".into(),
        files_completed: 1,
        total_files: 1,
        bytes_extracted: extracted_size,
        total_bytes: extracted_size,
        percent: 99.0,
    });

    register_uninstall_entry(&options, extracted_size.max(total_archive_size))?;

    // 6. Complete
    let _ = on_progress.send(InstallProgress {
        stage: "finished".into(),
        current_file: "".into(),
        files_completed: 1,
        total_files: 1,
        bytes_extracted: extracted_size,
        total_bytes: extracted_size,
        percent: 100.0,
    });

    Ok(())
}

#[tauri::command]
pub fn cancel_installation() -> Result<(), String> {
    request_cancel();
    Ok(())
}

#[tauri::command]
pub fn launch_installed_app(executable_path: String) -> Result<(), String> {
    let path = Path::new(&executable_path);
    if !path.exists() {
        return Err(format!("Executable does not exist at {:?}", path));
    }

    let parent_dir = path.parent().unwrap_or(Path::new(""));

    std::process::Command::new(path)
        .current_dir(parent_dir)
        .spawn()
        .map_err(|e| format!("Failed to launch application: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn start_uninstallation(
    options: UninstallOptions,
    app_name: String,
    executable_name: String,
    on_progress: Channel<UninstallProgress>,
) -> Result<(), String> {
    execute_uninstallation(&options, &app_name, &executable_name, |prog| {
        let _ = on_progress.send(prog);
    })
}

#[tauri::command]
pub fn minimize_installer<R: tauri::Runtime>(window: tauri::Window<R>) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn exit_installer<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    app.exit(0);
}
