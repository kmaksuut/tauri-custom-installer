use std::fs;
use std::path::Path;

fn main() {
    let payload_dir = Path::new("payload");
    let payload_zip = payload_dir.join("app_payload.zip");

    if !payload_zip.exists() {
        let _ = fs::create_dir_all(payload_dir);
        let empty_zip: [u8; 22] = [
            0x50, 0x4B, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ];
        let _ = fs::write(&payload_zip, empty_zip);
    }

    println!("cargo:rerun-if-changed=payload/app_payload.zip");
    tauri_build::build()
}
