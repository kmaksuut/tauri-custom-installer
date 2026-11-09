use std::fs;
use std::path::Path;

fn main() {
    let dist_dir = Path::new("../dist");
    if !dist_dir.exists() {
        let _ = fs::create_dir_all(dist_dir);
        let _ = fs::write(dist_dir.join("index.html"), "<!doctype html><html><body></body></html>");
    }
    tauri_build::build()
}
