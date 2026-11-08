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

pub use models::*;
pub use uninstaller::run_worker_cleanup;

/// Checks if current process was launched as background cleanup worker.
/// If so, performs cleanup and terminates immediately.
pub fn check_worker_mode() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() >= 5 && args[1] == "--worker-cleanup" {
        let target_dir = &args[2];
        let app_id = &args[3];
        let app_name = &args[4];
        run_worker_cleanup(target_dir, app_id, app_name);
        std::process::exit(0);
    }
}

/// Initializes the `tauri-custom-installer` Tauri v2 plugin
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    check_worker_mode();

    Builder::new("custom-installer")
        .invoke_handler(tauri::generate_handler![
            commands::get_system_info,
            commands::validate_install_path,
            commands::check_running,
            commands::kill_running,
            commands::start_installation,
            commands::launch_installed_app,
            commands::start_uninstallation,
            commands::exit_installer
        ])
        .build()
}
