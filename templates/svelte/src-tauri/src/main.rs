#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

const EMBEDDED_PAYLOAD: &[u8] = include_bytes!("../payload/app_payload.zip");

fn main() {
    tauri_custom_installer_core::set_embedded_payload(EMBEDDED_PAYLOAD);

    tauri_custom_installer_core::register(tauri::Builder::default())
        .run(tauri::generate_context!())
        .expect("error while running svelte installer");
}
