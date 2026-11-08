use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use tauri::ipc::Channel;
use crate::disk::{get_default_install_dir, get_program_files_dir, validate_path};
use crate::extractor::{extract_payload, get_embedded_or_external_payload};
use crate::models::{
    InstallOptions, InstallProgress, PathValidation, RunningProcessInfo, SystemInfo,
    UninstallOptions, UninstallProgress,
};
use crate::process::{check_running_process, kill_processes};
use crate::registry::{check_existing_installation, register_uninstall_entry};
use crate::shortcuts::{create_shortcut, get_desktop_dir, get_start_menu_dir};
use crate::uninstaller::execute_uninstallation;

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

    Ok(SystemInfo {
        default_install_path: default_path.to_string_lossy().to_string(),
        program_files_path: prog_files.map(|p| p.to_string_lossy().to_string()),
        desktop_path: desktop.map(|p| p.to_string_lossy().to_string()),
        start_menu_path: start_menu.map(|p| p.to_string_lossy().to_string()),
        available_space_bytes: validation.available_bytes,
        is_elevated: false, // User-space install by default (no UAC required)
        is_already_installed: existing.is_some(),
        existing_version: existing.as_ref().map(|e| e.version.clone()),
        existing_install_path: existing.as_ref().map(|e| e.install_path.clone()),
    })
}

#[tauri::command]
pub fn validate_install_path(path: String, required_bytes: u64) -> PathValidation {
    validate_path(&path, required_bytes)
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
pub fn exit_installer<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    app.exit(0);
}
