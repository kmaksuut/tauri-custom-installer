#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri_custom_installer_core::register(tauri::Builder::default())
        .run(tauri::generate_context!())
        .expect("Error while running Tauri Custom Installer runtime");
}
