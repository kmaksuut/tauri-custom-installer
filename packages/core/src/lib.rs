pub mod commands;
pub mod disk;
pub mod extractor;
pub mod models;
pub mod process;
pub mod registry;
pub mod shortcuts;
pub mod uninstaller;

use tauri::plugin::{Builder, TauriPlugin};
use tauri::Runtime;

pub use extractor::set_embedded_payload;
pub use models::*;
pub use uninstaller::run_worker_cleanup;

/// Checks CLI arguments for silent mode (`/S`, `--silent`) or background worker cleanup.
pub fn check_worker_or_silent_mode(app_name: &str, app_id: &str, executable_name: &str) {
    let args: Vec<String> = std::env::args().collect();

    // 1. Worker mode
    if args.len() >= 5 && args[1] == "--worker-cleanup" {
        let target_dir = &args[2];
        let id = &args[3];
        let name = &args[4];
        run_worker_cleanup(target_dir, id, name);
        std::process::exit(0);
    }

    // 2. Silent uninstallation mode: `--uninstall /S` or `/S --uninstall`
    let is_silent = args.iter().any(|a| a.eq_ignore_ascii_case("/S") || a == "--silent");
    let is_uninstall = commands::detect_uninstall_mode();

    if is_silent && is_uninstall {
        if let Ok(exe_path) = std::env::current_exe() {
            let install_dir = exe_path
                .parent()
                .unwrap_or(std::path::Path::new(""))
                .to_string_lossy()
                .to_string();
            let options = UninstallOptions {
                app_id: app_id.to_string(),
                install_dir,
                purge_user_data: false,
            };
            let _ = uninstaller::execute_uninstallation(&options, app_name, executable_name, |_| {});
        }
        std::process::exit(0);
    }

    // 3. Silent installation mode: `/S` with optional `/D=C:\Custom\Path`
    if is_silent {
        let mut target_dir = disk::get_default_install_dir(app_name);

        for arg in &args {
            if let Some(stripped) = arg.strip_prefix("/D=") {
                target_dir = std::path::PathBuf::from(stripped);
            } else if let Some(stripped) = arg.strip_prefix("--dir=") {
                target_dir = std::path::PathBuf::from(stripped);
            }
        }

        if let Ok(payload_bytes) = extractor::get_embedded_or_external_payload() {
            let archive_size = payload_bytes.len() as u64;
            let extracted_size = extractor::extract_payload(
                std::io::Cursor::new(payload_bytes),
                &target_dir,
                |_| {},
            )
            .unwrap_or(archive_size);

            if let Ok(current_exe) = std::env::current_exe() {
                let uninstaller_dest = target_dir.join("uninstall.exe");
                let _ = std::fs::copy(&current_exe, &uninstaller_dest);
            }

            let exe_path = target_dir.join(executable_name);
            if let Some(desktop) = shortcuts::get_desktop_dir() {
                let lnk_path = desktop.join(format!("{}.lnk", app_name));
                let _ = shortcuts::create_shortcut(&exe_path, &lnk_path, app_name, &target_dir);
            }
            if let Some(start_menu) = shortcuts::get_start_menu_dir() {
                let lnk_path = start_menu.join(format!("{}.lnk", app_name));
                let _ = shortcuts::create_shortcut(&exe_path, &lnk_path, app_name, &target_dir);
            }

            let options = InstallOptions {
                app_name: app_name.to_string(),
                app_id: app_id.to_string(),
                app_version: "1.0.0".to_string(),
                publisher: "Tauri Developer".to_string(),
                executable_name: executable_name.to_string(),
                install_dir: target_dir.to_string_lossy().to_string(),
                create_desktop_shortcut: true,
                create_start_menu_shortcut: true,
                auto_launch_on_startup: false,
                launch_after_install: false,
            };
            let _ = registry::register_uninstall_entry(&options, extracted_size);
        }

        std::process::exit(0);
    }
}

fn handle_worker_arg() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() >= 5 && args[1] == "--worker-cleanup" {
        let target_dir = &args[2];
        let app_id = &args[3];
        let app_name = &args[4];
        run_worker_cleanup(target_dir, app_id, app_name);
        std::process::exit(0);
    }
}

/// Registers all custom installer IPC commands directly onto a `tauri::Builder`.
/// This is the recommended way to wire up the installer backend in Tauri v2.
pub fn register<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    handle_worker_arg();

    builder.invoke_handler(tauri::generate_handler![
        commands::get_system_info,
        commands::validate_install_path,
        commands::select_folder,
        commands::check_running,
        commands::kill_running,
        commands::start_installation,
        commands::cancel_installation,
        commands::launch_installed_app,
        commands::start_uninstallation,
        commands::minimize_installer,
        commands::exit_installer
    ])
}

/// Initializes the `tauri-custom-installer` Tauri v2 plugin
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    handle_worker_arg();

    Builder::new("custom-installer")
        .invoke_handler(tauri::generate_handler![
            commands::get_system_info,
            commands::validate_install_path,
            commands::select_folder,
            commands::check_running,
            commands::kill_running,
            commands::start_installation,
            commands::cancel_installation,
            commands::launch_installed_app,
            commands::start_uninstallation,
            commands::minimize_installer,
            commands::exit_installer
        ])
        .build()
}
