use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use crate::disk::is_dangerous_install_path;
use crate::extractor::{read_install_manifest, sanitize_archive_entry_path};
use crate::models::{UninstallOptions, UninstallProgress};
use crate::process::close_running_app_processes;
use crate::registry::{check_existing_installation_with_name, remove_full_registry_entries};
use crate::shortcuts::remove_shortcuts;

/// Checks if a path is a symlink / NTFS junction / reparse point so we never follow it into another directory.
fn is_reparse_point(path: &Path) -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
        if let Ok(meta) = fs::symlink_metadata(path) {
            return (meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT) != 0;
        }
        false
    }
    #[cfg(not(target_os = "windows"))]
    {
        fs::symlink_metadata(path)
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(false)
    }
}

/// Resolves the authoritative installation directory for uninstallation:
/// 1. From `<current_exe_parent>` if `current_exe_parent\.tci\manifest.json` exists
/// 2. From the Windows Registry `Uninstall\<app_id>` (`InstallLocation`)
/// 3. From `options.install_dir` ONLY if it passes `is_dangerous_install_path` and contains `.tci\manifest.json` or `<executable_name>`
pub fn resolve_authoritative_uninstall_dir(
    options: &UninstallOptions,
    app_name: &str,
    _executable_name: &str,
) -> Result<PathBuf, String> {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            if parent.join(".tci").join("manifest.json").exists() {
                if let Some(err) = is_dangerous_install_path(parent) {
                    return Err(format!("Refusing to uninstall dangerous path: {}", err));
                }
                return Ok(parent.to_path_buf());
            }
        }
    }

    if let Some(existing) = check_existing_installation_with_name(&options.app_id, Some(app_name)) {
        if !existing.install_path.trim().is_empty() {
            let p = PathBuf::from(existing.install_path.trim());
            if let Some(err) = is_dangerous_install_path(&p) {
                return Err(format!("Refusing to uninstall dangerous registry path: {}", err));
            }
            return Ok(p);
        }
    }

    let candidate = PathBuf::from(options.install_dir.trim());
    if let Some(err) = is_dangerous_install_path(&candidate) {
        return Err(format!("INVALID_PATH: {}", err));
    }

    Ok(candidate)
}

pub fn execute_uninstallation<F>(
    options: &UninstallOptions,
    app_name: &str,
    executable_name: &str,
    mut on_progress: F,
) -> Result<(), String>
where
    F: FnMut(UninstallProgress),
{
    let install_dir = resolve_authoritative_uninstall_dir(options, app_name, executable_name)?;
    let manifest = read_install_manifest(&install_dir, &options.app_id);

    let effective_app_id = manifest
        .as_ref()
        .map(|m| m.app_id.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(&options.app_id);
    let effective_app_name = manifest
        .as_ref()
        .map(|m| m.app_name.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(app_name);
    let effective_exe = manifest
        .as_ref()
        .map(|m| m.executable_name.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(executable_name);

    // 1. Check & terminate running processes inside `install_dir`
    on_progress(UninstallProgress {
        stage: "closing_process".into(),
        percent: 15.0,
        message: format!("Closing running instances of {}...", effective_app_name),
    });

    let _ = close_running_app_processes(effective_exe, Some(&install_dir));

    // 2. Delete installed files based on `.tci/manifest.json` (before removing registry!)
    on_progress(UninstallProgress {
        stage: "deleting_files".into(),
        percent: 45.0,
        message: "Removing installed application files...".into(),
    });

    if install_dir.exists() {
        remove_installed_files_from_dir(&install_dir, manifest.as_ref(), effective_exe);
    }

    // 3. Purge user data (%APPDATA%\<app_id>, %LOCALAPPDATA%\<app_id>) if requested
    if options.purge_user_data {
        on_progress(UninstallProgress {
            stage: "purging_data".into(),
            percent: 65.0,
            message: "Removing application settings and WebView2 cache...".into(),
        });
        purge_application_user_data(effective_app_id, effective_app_name);
    }

    // Remove backup manifest in %LOCALAPPDATA%\tci\<app_id>
    if let Some(local_data) = dirs::data_local_dir() {
        let tci_backup = local_data.join("tci").join(effective_app_id);
        if tci_backup.exists() && !is_reparse_point(&tci_backup) {
            let _ = fs::remove_dir_all(&tci_backup);
        }
    }

    // 4. Remove shortcuts
    on_progress(UninstallProgress {
        stage: "removing_shortcuts".into(),
        percent: 80.0,
        message: "Removing Desktop and Start Menu shortcuts...".into(),
    });
    let recorded_shortcuts = manifest
        .as_ref()
        .map(|m| m.shortcuts_created.as_slice())
        .unwrap_or(&[]);
    remove_shortcuts(effective_app_name, None, recorded_shortcuts);

    // 5. Remove registry entries LAST (so if earlier steps fail, the app isn't orphaned)
    on_progress(UninstallProgress {
        stage: "removing_registry".into(),
        percent: 92.0,
        message: "Removing Windows Registry entries...".into(),
    });
    let schemes = manifest
        .as_ref()
        .map(|m| m.url_schemes_registered.as_slice())
        .unwrap_or(&[]);
    let assocs = manifest
        .as_ref()
        .map(|m| m.file_associations_registered.as_slice())
        .unwrap_or(&[]);
    remove_full_registry_entries(
        effective_app_id,
        effective_app_name,
        Some(effective_exe),
        schemes,
        assocs,
        Some(&install_dir.to_string_lossy()),
    )?;

    // 6. Spawn background worker to remove `uninstall.exe` and any now-empty directories
    if install_dir.exists() {
        let _ = spawn_cleanup_worker(&install_dir, effective_app_id, effective_app_name);
    }

    on_progress(UninstallProgress {
        stage: "finished".into(),
        percent: 100.0,
        message: format!("{} was cleanly uninstalled.", effective_app_name),
    });

    Ok(())
}

/// Removes only the files and directories recorded in `InstallManifest` (or known app files),
/// never deleting pre-existing unrelated files if the user installed into a shared folder.
pub fn remove_installed_files_from_dir(
    install_dir: &Path,
    manifest: Option<&crate::models::InstallManifest>,
    executable_name: &str,
) {
    if is_dangerous_install_path(install_dir).is_some() || is_reparse_point(install_dir) {
        return;
    }

    if let Some(m) = manifest {
        for entry in &m.files {
            if let Some(rel) = sanitize_archive_entry_path(&entry.relative_path) {
                let file_path = install_dir.join(rel);
                if file_path.exists() {
                    if is_reparse_point(&file_path) {
                        let _ = fs::remove_file(&file_path)
                            .or_else(|_| fs::remove_dir(&file_path));
                    } else if file_path.is_file() {
                        let _ = fs::remove_file(&file_path);
                    }
                }
            }
        }

        // Remove .tci metadata folder
        let tci_dir = install_dir.join(".tci");
        if tci_dir.exists() && !is_reparse_point(&tci_dir) {
            let _ = fs::remove_dir_all(&tci_dir);
        }

        // Remove recorded subdirectories in reverse order (deepest first), only if empty (`remove_dir`)
        let mut sorted_dirs = m.directories.clone();
        sorted_dirs.sort_by_key(|b| std::cmp::Reverse(b.len()));
        for d in sorted_dirs {
            if let Some(rel) = sanitize_archive_entry_path(&d) {
                let dir_path = install_dir.join(rel);
                if dir_path.exists() {
                    let _ = fs::remove_dir(&dir_path);
                }
            }
        }
    } else {
        // Fallback when no manifest exists: remove known executable, .tci, and uninstall.exe
        if !executable_name.is_empty() {
            let exe = install_dir.join(executable_name);
            if exe.exists() && exe.is_file() {
                let _ = fs::remove_file(&exe);
            }
        }
        let tci_dir = install_dir.join(".tci");
        if tci_dir.exists() && !is_reparse_point(&tci_dir) {
            let _ = fs::remove_dir_all(&tci_dir);
        }
    }
}

pub fn purge_application_user_data(app_id: &str, app_name: &str) {
    let candidates: Vec<String> = [app_id.trim(), app_name.trim()]
        .into_iter()
        .filter(|s| {
            !s.is_empty()
                && !s.contains("..")
                && !s.contains('/')
                && !s.contains('\\')
                && !s.contains(':')
        })
        .map(|s| s.to_string())
        .collect();

    for base_dir in [dirs::data_dir(), dirs::data_local_dir()].into_iter().flatten() {
        for sub in &candidates {
            let target = base_dir.join(sub);
            if target.exists()
                && target.starts_with(&base_dir)
                && target != base_dir
                && !is_reparse_point(&target)
            {
                let _ = fs::remove_dir_all(&target);
            }
        }
    }
}

fn spawn_cleanup_worker(install_dir: &Path, app_id: &str, app_name: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(current_exe) = std::env::current_exe() {
            let nonce = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            let worker_dir = std::env::temp_dir().join(format!(
                "tci-cleanup-{}-{}",
                std::process::id(),
                nonce
            ));
            let _ = fs::create_dir_all(&worker_dir);
            let worker_exe = worker_dir.join("tci-worker.exe");

            // Copy only the stripped runtime stub (without payload) if footer exists
            let _ = crate::footer::write_stripped_uninstaller(&current_exe, &worker_exe);

            // Schedule reboot cleanup of the temp worker via Win32 MoveFileExW(MOVEFILE_DELAY_UNTIL_REBOOT)
            schedule_delete_on_reboot(&worker_exe);
            schedule_delete_on_reboot(&worker_dir);

            let mut cmd = Command::new(&worker_exe);
            cmd.args([
                "--worker-cleanup",
                install_dir.to_str().unwrap_or_default(),
                app_id,
                app_name,
            ]);

            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);

            cmd.spawn()
                .map_err(|e| format!("Failed to spawn cleanup worker: {}", e))?;
            return Ok(());
        }
    }

    let _ = app_id;
    let _ = app_name;
    let uninst = install_dir.join("uninstall.exe");
    if uninst.exists() {
        let _ = fs::remove_file(&uninst);
    }
    let _ = fs::remove_dir(install_dir);
    Ok(())
}

#[cfg(target_os = "windows")]
fn schedule_delete_on_reboot(path: &Path) {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_DELAY_UNTIL_REBOOT};
    let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
    wide.push(0);
    unsafe {
        let _ = MoveFileExW(wide.as_ptr(), std::ptr::null(), MOVEFILE_DELAY_UNTIL_REBOOT);
    }
}

pub fn run_worker_cleanup(target_dir: &str, app_id: &str, app_name: &str) {
    std::thread::sleep(std::time::Duration::from_millis(800));

    let path = Path::new(target_dir);
    if path.exists() && is_dangerous_install_path(path).is_none() && !is_reparse_point(path) {
        let uninst = path.join("uninstall.exe");
        let tci_dir = path.join(".tci");

        for _ in 0..8 {
            if uninst.exists() {
                let _ = fs::remove_file(&uninst);
            }
            if tci_dir.exists() && !is_reparse_point(&tci_dir) {
                let _ = fs::remove_dir_all(&tci_dir);
            }
            // Only remove `path` if it is now completely empty (`fs::remove_dir`, never `remove_dir_all`!)
            if fs::remove_dir(path).is_ok() || !uninst.exists() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(350));
        }
        let _ = fs::remove_dir(path);
    }

    remove_shortcuts(app_name, None, &[]);
    let _ = remove_full_registry_entries(app_id, app_name, None, &[], &[], Some(target_dir));
}
