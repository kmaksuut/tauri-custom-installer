use std::fs::{self, File};
use std::io::{self, Read, Seek};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use zip::ZipArchive;
use crate::models::InstallProgress;

static EMBEDDED_PAYLOAD: OnceLock<&'static [u8]> = OnceLock::new();
static CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);

/// Registers static embedded payload bytes (typically from `include_bytes!("../payload/app_payload.zip")`)
pub fn set_embedded_payload(bytes: &'static [u8]) {
    let _ = EMBEDDED_PAYLOAD.set(bytes);
}

pub fn request_cancel() {
    CANCEL_REQUESTED.store(true, Ordering::SeqCst);
}

pub fn reset_cancel() {
    CANCEL_REQUESTED.store(false, Ordering::SeqCst);
}

pub fn is_cancelled() -> bool {
    CANCEL_REQUESTED.load(Ordering::SeqCst)
}

pub fn extract_payload<R: Read + Seek, F>(
    reader: R,
    target_dir: &Path,
    mut on_progress: F,
) -> Result<u64, String>
where
    F: FnMut(InstallProgress),
{
    reset_cancel();

    let mut archive = ZipArchive::new(reader).map_err(|e| format!("Failed to read archive: {}", e))?;
    let total_files = archive.len();

    let mut total_uncompressed_bytes: u64 = 0;
    for i in 0..total_files {
        if let Ok(file) = archive.by_index(i) {
            total_uncompressed_bytes += file.size();
        }
    }

    let mut bytes_extracted: u64 = 0;
    let dir_existed_before = target_dir.exists();
    fs::create_dir_all(target_dir)
        .map_err(|e| format!("Failed to create destination directory {:?}: {}", target_dir, e))?;

    for i in 0..total_files {
        if is_cancelled() {
            if !dir_existed_before {
                let _ = fs::remove_dir_all(target_dir);
            }
            return Err("Installation cancelled by user.".to_string());
        }

        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read entry {}: {}", i, e))?;

        let raw_name = file.name().to_string();
        let enclosed_name = match file.enclosed_name() {
            Some(p) => p.to_owned(),
            None => continue, // Skip malicious zip-slip paths
        };

        let out_path = target_dir.join(&enclosed_name);

        if file.is_dir() {
            fs::create_dir_all(&out_path)
                .map_err(|e| format!("Failed to create directory {:?}: {}", out_path, e))?;
        } else {
            if let Some(parent) = out_path.parent() {
                if !parent.exists() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create parent dir {:?}: {}", parent, e))?;
                }
            }

            let mut outfile = File::create(&out_path)
                .map_err(|e| format!("Failed to create file {:?}: {}", out_path, e))?;

            let mut buffer = [0u8; 65536]; // 64 KB buffer
            loop {
                if is_cancelled() {
                    drop(outfile);
                    if !dir_existed_before {
                        let _ = fs::remove_dir_all(target_dir);
                    }
                    return Err("Installation cancelled by user.".to_string());
                }

                let n = file
                    .read(&mut buffer)
                    .map_err(|e| format!("Failed reading file {}: {}", raw_name, e))?;
                if n == 0 {
                    break;
                }
                io::Write::write_all(&mut outfile, &buffer[..n])
                    .map_err(|e| format!("Failed writing file {}: {}", raw_name, e))?;

                bytes_extracted += n as u64;

                let percent = if total_uncompressed_bytes > 0 {
                    (bytes_extracted as f64 / total_uncompressed_bytes as f64) * 100.0
                } else {
                    100.0
                };

                on_progress(InstallProgress {
                    stage: "extracting".into(),
                    current_file: raw_name.clone(),
                    files_completed: i + 1,
                    total_files,
                    bytes_extracted,
                    total_bytes: total_uncompressed_bytes,
                    percent: percent.min(99.0),
                });
            }

            // Preserve unix executable permissions if applicable
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Some(mode) = file.unix_mode() {
                    let _ = fs::set_permissions(&out_path, fs::Permissions::from_mode(mode));
                }
            }
        }
    }

    Ok(bytes_extracted)
}

pub fn get_embedded_or_external_payload() -> Result<Vec<u8>, String> {
    // 1. Check if embedded payload is registered and has entries (> 22 bytes empty zip header)
    if let Some(embedded) = EMBEDDED_PAYLOAD.get() {
        if embedded.len() > 22 {
            return Ok(embedded.to_vec());
        }
    }

    // 2. Check if payload file is in same directory as current executable
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            let beside = parent.join("app_payload.zip");
            if beside.exists() {
                return fs::read(&beside).map_err(|e| format!("Failed reading payload file: {}", e));
            }
        }
    }

    // 3. Check current working directory
    let cwd_payload = PathBuf::from("payload/app_payload.zip");
    if cwd_payload.exists() {
        return fs::read(&cwd_payload).map_err(|e| format!("Failed reading cwd payload: {}", e));
    }

    // 4. If embedded payload exists (even empty placeholder), return it so dev builds don't crash
    if let Some(embedded) = EMBEDDED_PAYLOAD.get() {
        if !embedded.is_empty() {
            return Ok(embedded.to_vec());
        }
    }

    Err("No app_payload.zip found. Ensure the application payload is bundled via `tci build`.".to_string())
}
