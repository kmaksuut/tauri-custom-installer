use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{self, Cursor, Read, Seek, SeekFrom};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::Instant;
use sha2::{Digest, Sha256};
use zip::ZipArchive;
use crate::footer::{
    read_appended_manifest, read_footer_from_current_exe, verify_section_sha256, SectionReader,
};
use crate::models::{AppManifest, InstallManifest, InstallProgress, InstalledFileEntry};

static EMBEDDED_PAYLOAD: OnceLock<&'static [u8]> = OnceLock::new();
static EMBEDDED_MANIFEST_JSON: OnceLock<&'static str> = OnceLock::new();
static CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);

const ZSTD_MAGIC: [u8; 4] = [0x28, 0xB5, 0x2F, 0xFD];

#[derive(Debug, Clone)]
pub struct ExtractionReport {
    pub bytes_extracted: u64,
    pub files: Vec<InstalledFileEntry>,
    pub directories: Vec<String>,
}

/// Registers static embedded payload bytes (legacy/ejected build mode)
pub fn set_embedded_payload(bytes: &'static [u8]) {
    let _ = EMBEDDED_PAYLOAD.set(bytes);
}

/// Registers static embedded manifest JSON (ejected build mode)
pub fn set_embedded_manifest(json: &'static str) {
    let _ = EMBEDDED_MANIFEST_JSON.set(json);
}

/// Resolves the authoritative `AppManifest` from:
/// 1. Appended footer in the current executable (`[runtime][ui][payload][manifest][footer]`)
/// 2. Embedded manifest registered via `set_embedded_manifest`
/// 3. `.tci\manifest.json` beside `uninstall.exe` (when running in uninstall mode)
/// 4. `TCI_MANIFEST_PATH` or `installer.config.json` in dev mode
pub fn get_authoritative_manifest() -> Option<AppManifest> {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(m) = read_appended_manifest(&exe_path) {
            return Some(m);
        }
        if let Some(parent) = exe_path.parent() {
            let tci_manifest = parent.join(".tci").join("manifest.json");
            if let Ok(bytes) = fs::read(&tci_manifest) {
                if let Ok(im) = serde_json::from_slice::<InstallManifest>(&bytes) {
                    return Some(AppManifest {
                        app_name: im.app_name,
                        app_id: im.app_id,
                        version: im.version,
                        publisher: im.publisher,
                        executable_name: im.executable_name,
                        install_mode: im.install_scope,
                        default_install_dir: Some(im.install_dir),
                        create_desktop_shortcut: im.create_desktop_shortcut,
                        create_start_menu_shortcut: im.create_start_menu_shortcut,
                        ..Default::default()
                    });
                }
            }
        }
    }

    if let Some(raw) = EMBEDDED_MANIFEST_JSON.get() {
        if let Ok(m) = serde_json::from_str::<AppManifest>(raw) {
            return Some(m);
        }
    }

    if let Ok(path) = std::env::var("TCI_MANIFEST_PATH") {
        if let Ok(bytes) = fs::read(&path) {
            if let Ok(m) = serde_json::from_slice::<AppManifest>(&bytes) {
                return Some(m);
            }
        }
    }

    for candidate in ["tci.manifest.json", "installer.config.json", "../installer.config.json"] {
        if let Ok(bytes) = fs::read(candidate) {
            if let Ok(m) = serde_json::from_slice::<AppManifest>(&bytes) {
                return Some(m);
            }
        }
    }

    None
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

/// Validates and normalizes a relative path inside an archive.
/// Rejects `..`, root paths, drive letters, NTFS Alternate Data Streams (`:`),
/// and reserved Windows device names (`CON`, `NUL`, `COM1`, etc.).
pub fn sanitize_archive_entry_path(raw: &str) -> Option<PathBuf> {
    let normalized = raw.replace('\\', "/");
    if normalized.is_empty() || normalized.starts_with('/') || normalized.contains(':') {
        return None;
    }

    let path = Path::new(&normalized);
    let mut clean = PathBuf::new();

    for comp in path.components() {
        match comp {
            Component::Normal(os_str) => {
                let seg = os_str.to_string_lossy();
                if seg.is_empty() || seg == "." || seg == ".." || seg.contains(':') {
                    return None;
                }
                let stem = seg
                    .split('.')
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_uppercase();
                if matches!(
                    stem.as_str(),
                    "CON"
                        | "PRN"
                        | "AUX"
                        | "NUL"
                        | "COM1"
                        | "COM2"
                        | "COM3"
                        | "COM4"
                        | "COM5"
                        | "COM6"
                        | "COM7"
                        | "COM8"
                        | "COM9"
                        | "LPT1"
                        | "LPT2"
                        | "LPT3"
                        | "LPT4"
                        | "LPT5"
                        | "LPT6"
                        | "LPT7"
                        | "LPT8"
                        | "LPT9"
                ) {
                    return None;
                }
                clean.push(os_str);
            }
            Component::CurDir => continue,
            _ => return None,
        }
    }

    if clean.as_os_str().is_empty() {
        None
    } else {
        Some(clean)
    }
}

/// Backward-compatible wrapper around `extract_payload_Detailed` returning total extracted bytes.
pub fn extract_payload<R: Read + Seek, F>(
    reader: R,
    target_dir: &Path,
    on_progress: F,
) -> Result<u64, String>
where
    F: FnMut(InstallProgress),
{
    let report = extract_payload_detailed(reader, target_dir, None, on_progress)?;
    Ok(report.bytes_extracted)
}

/// Extracts either a `.tar.zst` or `.zip` payload stream into `target_dir` with:
/// - Transactional backup & rollback on cancellation or failure (never deletes pre-existing files!)
/// - Throttled progress reporting (~30 Hz) with `speed_bps` and `eta_seconds`
/// - Per-file SHA-256 recording for `.tci/manifest.json` and differential upgrades
pub fn extract_payload_detailed<R: Read + Seek, F>(
    mut reader: R,
    target_dir: &Path,
    expected_uncompressed_bytes: Option<u64>,
    mut on_progress: F,
) -> Result<ExtractionReport, String>
where
    F: FnMut(InstallProgress),
{
    reset_cancel();

    // Detect archive magic (zstd vs zip)
    let mut magic = [0u8; 4];
    let n_magic = reader
        .read(&mut magic)
        .map_err(|e| format!("Failed reading payload header: {}", e))?;
    reader
        .seek(SeekFrom::Start(0))
        .map_err(|e| format!("Failed seeking payload start: {}", e))?;

    if n_magic < 4 {
        return Err("Payload archive is empty or truncated.".to_string());
    }

    let dir_existed_before = target_dir.exists();
    fs::create_dir_all(target_dir)
        .map_err(|e| format!("Failed to create destination directory {:?}: {}", target_dir, e))?;

    let backup_dir = target_dir.join(".tci-backup");
    let _ = fs::remove_dir_all(&backup_dir);

    let mut created_files: Vec<PathBuf> = Vec::new();
    let mut created_dirs: Vec<PathBuf> = Vec::new();
    let mut backed_up_files: Vec<(PathBuf, PathBuf)> = Vec::new();
    let mut manifest_files: Vec<InstalledFileEntry> = Vec::new();
    let mut manifest_dirs: Vec<String> = Vec::new();

    let result = if magic == ZSTD_MAGIC {
        extract_tar_zst_stream(
            reader,
            target_dir,
            &backup_dir,
            expected_uncompressed_bytes,
            &mut created_files,
            &mut created_dirs,
            &mut backed_up_files,
            &mut manifest_files,
            &mut manifest_dirs,
            &mut on_progress,
        )
    } else {
        extract_zip_stream(
            reader,
            target_dir,
            &backup_dir,
            &mut created_files,
            &mut created_dirs,
            &mut backed_up_files,
            &mut manifest_files,
            &mut manifest_dirs,
            &mut on_progress,
        )
    };

    match result {
        Ok(bytes_extracted) => {
            let _ = fs::remove_dir_all(&backup_dir);
            Ok(ExtractionReport {
                bytes_extracted,
                files: manifest_files,
                directories: manifest_dirs,
            })
        }
        Err(err) => {
            // Rollback newly created files
            for f in created_files.iter().rev() {
                let _ = fs::remove_file(f);
            }
            // Restore overwritten files from backup
            for (backup_path, original_path) in backed_up_files.iter().rev() {
                if backup_path.exists() {
                    let _ = fs::rename(backup_path, original_path);
                }
            }
            let _ = fs::remove_dir_all(&backup_dir);
            // Remove newly created directories if empty
            for d in created_dirs.iter().rev() {
                let _ = fs::remove_dir(d);
            }
            if !dir_existed_before {
                let _ = fs::remove_dir(target_dir);
            }
            Err(err)
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn extract_tar_zst_stream<R: Read, F>(
    reader: R,
    target_dir: &Path,
    backup_dir: &Path,
    expected_uncompressed_bytes: Option<u64>,
    created_files: &mut Vec<PathBuf>,
    created_dirs: &mut Vec<PathBuf>,
    backed_up_files: &mut Vec<(PathBuf, PathBuf)>,
    manifest_files: &mut Vec<InstalledFileEntry>,
    manifest_dirs: &mut Vec<String>,
    on_progress: &mut F,
) -> Result<u64, String>
where
    F: FnMut(InstallProgress),
{
    let decoder = zstd::stream::read::Decoder::new(reader)
        .map_err(|e| format!("Failed to initialize zstd decoder: {}", e))?;
    let mut archive = tar::Archive::new(decoder);

    let total_bytes = expected_uncompressed_bytes.unwrap_or(0);
    let mut bytes_extracted: u64 = 0;
    let mut files_completed: usize = 0;
    let start_time = Instant::now();
    let mut last_emit = Instant::now();

    let entries = archive
        .entries()
        .map_err(|e| format!("Failed to read tar entries: {}", e))?;

    for entry_res in entries {
        if is_cancelled() {
            return Err("CANCELLED: Installation cancelled by user.".to_string());
        }

        let mut entry = entry_res.map_err(|e| format!("Corrupted tar entry: {}", e))?;
        let entry_type = entry.header().entry_type();

        // Security: never extract symlinks, hardlinks, or device nodes
        if entry_type.is_symlink()
            || entry_type.is_hard_link()
            || entry_type.is_block_special()
            || entry_type.is_character_special()
            || entry_type.is_fifo()
        {
            continue;
        }

        let raw_path = entry
            .path()
            .map_err(|e| format!("Invalid path in tar archive: {}", e))?
            .to_string_lossy()
            .to_string();

        let rel_path = match sanitize_archive_entry_path(&raw_path) {
            Some(p) => p,
            None => continue,
        };
        let rel_str = rel_path.to_string_lossy().replace('\\', "/");
        let out_path = target_dir.join(&rel_path);

        if entry_type.is_dir() {
            ensure_dir_tracked(&out_path, target_dir, created_dirs, manifest_dirs)?;
            continue;
        }

        if let Some(parent) = out_path.parent() {
            ensure_dir_tracked(parent, target_dir, created_dirs, manifest_dirs)?;
        }

        backup_if_exists(&out_path, target_dir, backup_dir, backed_up_files, created_files)?;

        let mut outfile = File::create(&out_path)
            .map_err(|e| format!("Failed to create file {:?}: {}", out_path, e))?;
        let mut hasher = Sha256::new();
        let mut file_size: u64 = 0;
        let mut buffer = vec![0u8; 262_144]; // 256 KB buffer for fast I/O

        loop {
            if is_cancelled() {
                return Err("CANCELLED: Installation cancelled by user.".to_string());
            }
            let n = entry
                .read(&mut buffer)
                .map_err(|e| format!("Failed reading {}: {}", rel_str, e))?;
            if n == 0 {
                break;
            }
            io::Write::write_all(&mut outfile, &buffer[..n])
                .map_err(|e| format!("Failed writing {}: {}", rel_str, e))?;
            hasher.update(&buffer[..n]);
            file_size += n as u64;
            bytes_extracted += n as u64;

            if last_emit.elapsed().as_millis() >= 33 {
                last_emit = Instant::now();
                let elapsed_secs = start_time.elapsed().as_secs_f64().max(0.001);
                let speed_bps = (bytes_extracted as f64 / elapsed_secs) as u64;
                let effective_total = total_bytes.max(bytes_extracted);
                let remaining = effective_total.saturating_sub(bytes_extracted);
                let eta_seconds = if speed_bps > 0 {
                    remaining / speed_bps
                } else {
                    0
                };
                let percent = if effective_total > 0 {
                    ((bytes_extracted as f64 / effective_total as f64) * 100.0).min(99.0)
                } else {
                    50.0
                };

                on_progress(InstallProgress {
                    stage: "extracting".into(),
                    current_file: rel_str.clone(),
                    files_completed: files_completed + 1,
                    total_files: files_completed + 1,
                    bytes_extracted,
                    total_bytes: effective_total,
                    speed_bps,
                    eta_seconds,
                    percent,
                });
            }
        }

        files_completed += 1;
        let sha_hex = to_hex(&hasher.finalize());
        manifest_files.push(InstalledFileEntry {
            relative_path: rel_str,
            size: file_size,
            sha256: sha_hex,
        });
    }

    Ok(bytes_extracted)
}

#[allow(clippy::too_many_arguments)]
fn extract_zip_stream<R: Read + Seek, F>(
    reader: R,
    target_dir: &Path,
    backup_dir: &Path,
    created_files: &mut Vec<PathBuf>,
    created_dirs: &mut Vec<PathBuf>,
    backed_up_files: &mut Vec<(PathBuf, PathBuf)>,
    manifest_files: &mut Vec<InstalledFileEntry>,
    manifest_dirs: &mut Vec<String>,
    on_progress: &mut F,
) -> Result<u64, String>
where
    F: FnMut(InstallProgress),
{
    let mut archive =
        ZipArchive::new(reader).map_err(|e| format!("Failed to read archive: {}", e))?;
    let total_files = archive.len();

    let mut total_uncompressed_bytes: u64 = 0;
    for i in 0..total_files {
        if let Ok(file) = archive.by_index(i) {
            total_uncompressed_bytes += file.size();
        }
    }

    let mut bytes_extracted: u64 = 0;
    let start_time = Instant::now();
    let mut last_emit = Instant::now();

    for i in 0..total_files {
        if is_cancelled() {
            return Err("Installation cancelled by user.".to_string());
        }

        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read entry {}: {}", i, e))?;

        let raw_name = file.name().to_string();
        let rel_path = match sanitize_archive_entry_path(&raw_name) {
            Some(p) => p,
            None => continue,
        };
        let rel_str = rel_path.to_string_lossy().replace('\\', "/");
        let out_path = target_dir.join(&rel_path);

        if file.is_dir() {
            ensure_dir_tracked(&out_path, target_dir, created_dirs, manifest_dirs)?;
        } else {
            if let Some(parent) = out_path.parent() {
                ensure_dir_tracked(parent, target_dir, created_dirs, manifest_dirs)?;
            }

            backup_if_exists(&out_path, target_dir, backup_dir, backed_up_files, created_files)?;

            let mut outfile = File::create(&out_path)
                .map_err(|e| format!("Failed to create file {:?}: {}", out_path, e))?;

            let mut hasher = Sha256::new();
            let mut file_size: u64 = 0;
            let mut buffer = [0u8; 65536];
            loop {
                if is_cancelled() {
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

                hasher.update(&buffer[..n]);
                file_size += n as u64;
                bytes_extracted += n as u64;

                let is_last_chunk = file_size == file.size();
                if is_last_chunk || last_emit.elapsed().as_millis() >= 33 {
                    last_emit = Instant::now();
                    let elapsed_secs = start_time.elapsed().as_secs_f64().max(0.001);
                    let speed_bps = (bytes_extracted as f64 / elapsed_secs) as u64;
                    let remaining = total_uncompressed_bytes.saturating_sub(bytes_extracted);
                    let eta_seconds = if speed_bps > 0 {
                        remaining / speed_bps
                    } else {
                        0
                    };
                    let percent = if total_uncompressed_bytes > 0 {
                        (bytes_extracted as f64 / total_uncompressed_bytes as f64) * 100.0
                    } else {
                        100.0
                    };

                    on_progress(InstallProgress {
                        stage: "extracting".into(),
                        current_file: rel_str.clone(),
                        files_completed: i + 1,
                        total_files,
                        bytes_extracted,
                        total_bytes: total_uncompressed_bytes,
                        speed_bps,
                        eta_seconds,
                        percent: percent.min(99.0),
                    });
                }
            }

            manifest_files.push(InstalledFileEntry {
                relative_path: rel_str,
                size: file_size,
                sha256: to_hex(&hasher.finalize()),
            });
        }
    }

    Ok(bytes_extracted)
}

fn ensure_dir_tracked(
    dir: &Path,
    target_root: &Path,
    created_dirs: &mut Vec<PathBuf>,
    manifest_dirs: &mut Vec<String>,
) -> Result<(), String> {
    if dir == target_root {
        return Ok(());
    }
    let mut stack = Vec::new();
    let mut curr = dir;
    while curr != target_root && curr.starts_with(target_root) {
        stack.push(curr.to_path_buf());
        match curr.parent() {
            Some(p) => curr = p,
            None => break,
        }
    }
    for d in stack.into_iter().rev() {
        if !d.exists() {
            fs::create_dir_all(&d)
                .map_err(|e| format!("Failed to create directory {:?}: {}", d, e))?;
            created_dirs.push(d.clone());
        }
        if let Ok(rel) = d.strip_prefix(target_root) {
            let rel_s = rel.to_string_lossy().replace('\\', "/");
            if !rel_s.is_empty() && !manifest_dirs.contains(&rel_s) {
                manifest_dirs.push(rel_s);
            }
        }
    }
    Ok(())
}

fn backup_if_exists(
    out_path: &Path,
    target_root: &Path,
    backup_dir: &Path,
    backed_up_files: &mut Vec<(PathBuf, PathBuf)>,
    created_files: &mut Vec<PathBuf>,
) -> Result<(), String> {
    if out_path.exists() {
        if let Ok(rel) = out_path.strip_prefix(target_root) {
            let b_path = backup_dir.join(rel);
            if let Some(p) = b_path.parent() {
                let _ = fs::create_dir_all(p);
            }
            if fs::rename(out_path, &b_path).is_ok() {
                backed_up_files.push((b_path, out_path.to_path_buf()));
                return Ok(());
            }
        }
    }
    created_files.push(out_path.to_path_buf());
    Ok(())
}

fn to_hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        use std::fmt::Write;
        let _ = write!(&mut s, "{:02x}", b);
    }
    s
}

/// Removes stale files left over from a previous version after an in-place upgrade,
/// using the previous `.tci\manifest.json`.
pub fn cleanup_stale_upgrade_files(
    target_dir: &Path,
    old_manifest: &InstallManifest,
    new_files: &[InstalledFileEntry],
) {
    let new_set: HashSet<String> = new_files
        .iter()
        .map(|f| f.relative_path.replace('\\', "/").to_lowercase())
        .collect();

    for old_file in &old_manifest.files {
        let key = old_file.relative_path.replace('\\', "/").to_lowercase();
        if !new_set.contains(&key) {
            if let Some(clean_rel) = sanitize_archive_entry_path(&old_file.relative_path) {
                let stale_path = target_dir.join(clean_rel);
                if stale_path.exists() && stale_path.is_file() {
                    let _ = fs::remove_file(stale_path);
                }
            }
        }
    }
}

/// Writes the installation manifest to both `<install_dir>\.tci\manifest.json`
/// and `%LOCALAPPDATA%\tci\<app_id>\manifest.json` so the uninstaller always knows
/// the exact list of installed files and directories.
pub fn write_install_manifest(manifest: &InstallManifest) -> Result<(), String> {
    let install_dir = Path::new(&manifest.install_dir);
    let tci_dir = install_dir.join(".tci");
    fs::create_dir_all(&tci_dir)
        .map_err(|e| format!("Failed to create .tci manifest directory: {}", e))?;

    let json = serde_json::to_vec_pretty(manifest)
        .map_err(|e| format!("Failed to serialize install manifest: {}", e))?;

    fs::write(tci_dir.join("manifest.json"), &json)
        .map_err(|e| format!("Failed to write .tci/manifest.json: {}", e))?;

    if let Some(local_data) = dirs::data_local_dir() {
        let backup_dir = local_data.join("tci").join(&manifest.app_id);
        if fs::create_dir_all(&backup_dir).is_ok() {
            let _ = fs::write(backup_dir.join("manifest.json"), &json);
        }
    }

    Ok(())
}

pub fn read_install_manifest(install_dir: &Path, app_id: &str) -> Option<InstallManifest> {
    let local_manifest = install_dir.join(".tci").join("manifest.json");
    if let Ok(bytes) = fs::read(&local_manifest) {
        if let Ok(m) = serde_json::from_slice::<InstallManifest>(&bytes) {
            return Some(m);
        }
    }
    if let Some(local_data) = dirs::data_local_dir() {
        let backup = local_data
            .join("tci")
            .join(app_id)
            .join("manifest.json");
        if let Ok(bytes) = fs::read(&backup) {
            if let Ok(m) = serde_json::from_slice::<InstallManifest>(&bytes) {
                return Some(m);
            }
        }
    }
    None
}

/// Streams and extracts the payload from the best available source:
/// 1. Appended SFX section in the current executable (`SectionReader`, O(1) memory + SHA-256 verification)
/// 2. External payload file (`app_payload.tar.zst` or `app_payload.zip`)
/// 3. Static `EMBEDDED_PAYLOAD` slice
pub fn extract_from_best_source<F>(
    target_dir: &Path,
    expected_uncompressed_bytes: Option<u64>,
    mut on_progress: F,
) -> Result<ExtractionReport, String>
where
    F: FnMut(InstallProgress),
{
    // 1. Check appended SFX footer in current executable (streaming from disk, constant memory)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(footer) = read_footer_from_current_exe() {
            if footer.payload_size > 0 {
                let mut section =
                    SectionReader::open(&exe_path, footer.payload_offset, footer.payload_size)
                        .map_err(|e| format!("Failed opening appended payload section: {}", e))?;

                if footer.payload_sha256 != [0u8; 32] {
                    on_progress(InstallProgress {
                        stage: "verifying".into(),
                        current_file: "Verifying payload integrity (SHA-256)...".into(),
                        files_completed: 0,
                        total_files: 1,
                        bytes_extracted: 0,
                        total_bytes: footer.payload_size,
                        speed_bps: 0,
                        eta_seconds: 0,
                        percent: 1.0,
                    });
                    verify_section_sha256(&mut section, &footer.payload_sha256)?;
                }

                return extract_payload_detailed(
                    section,
                    target_dir,
                    expected_uncompressed_bytes,
                    on_progress,
                );
            }
        }
    }

    // 2. Check external file or embedded slice
    let payload_bytes = get_embedded_or_external_payload()?;
    extract_payload_detailed(
        Cursor::new(payload_bytes),
        target_dir,
        expected_uncompressed_bytes,
        on_progress,
    )
}

pub fn get_embedded_or_external_payload() -> Result<Vec<u8>, String> {
    if let Some(embedded) = EMBEDDED_PAYLOAD.get() {
        if embedded.len() > 22 {
            return Ok(embedded.to_vec());
        }
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(footer) = read_footer_from_current_exe() {
            if footer.payload_size > 0 {
                let mut section =
                    SectionReader::open(&exe_path, footer.payload_offset, footer.payload_size)
                        .map_err(|e| format!("Failed opening appended payload: {}", e))?;
                verify_section_sha256(&mut section, &footer.payload_sha256)?;
                let mut buf = Vec::with_capacity(footer.payload_size as usize);
                section
                    .read_to_end(&mut buf)
                    .map_err(|e| format!("Failed reading appended payload: {}", e))?;
                return Ok(buf);
            }
        }

        if let Some(parent) = exe_path.parent() {
            for name in ["app_payload.tar.zst", "app_payload.zip"] {
                let beside = parent.join(name);
                if beside.exists() {
                    return fs::read(&beside)
                        .map_err(|e| format!("Failed reading payload file: {}", e));
                }
            }
        }
    }

    for rel in [
        "payload/app_payload.tar.zst",
        "payload/app_payload.zip",
        "src-tauri/payload/app_payload.tar.zst",
        "src-tauri/payload/app_payload.zip",
    ] {
        let p = PathBuf::from(rel);
        if p.exists() {
            return fs::read(&p).map_err(|e| format!("Failed reading cwd payload: {}", e));
        }
    }

    if let Some(embedded) = EMBEDDED_PAYLOAD.get() {
        if !embedded.is_empty() {
            return Ok(embedded.to_vec());
        }
    }

    Err("No application payload found. Ensure the installer was built via `tci build`.".to_string())
}
