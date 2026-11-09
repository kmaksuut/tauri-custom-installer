use std::fs;
use std::path::Path;

fn main() {
    let dist_dir = Path::new("../dist");
    if !dist_dir.exists() {
        let _ = fs::create_dir_all(dist_dir);
        let _ = fs::write(dist_dir.join("index.html"), "<!doctype html><html><body></body></html>");
    }

    let payload_dir = Path::new("payload");
    let payload_zip = payload_dir.join("app_payload.zip");

    if !payload_zip.exists() {
        let _ = fs::create_dir_all(payload_dir);
        // Minimal valid empty ZIP End-of-Central-Directory (EOCD) record (22 bytes)
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
