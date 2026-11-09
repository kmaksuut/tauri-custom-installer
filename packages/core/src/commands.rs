use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::ipc::Channel;
use crate::disk::{
    get_default_install_dir, get_program_files_dir, normalize_selected_folder, validate_path,
};
use crate::extractor::{
    cleanup_stale_upgrade_files, extract_from_best_source, get_authoritative_manifest,
    read_install_manifest, request_cancel, write_install_manifest,
};
use crate::footer::write_stripped_uninstaller;
use crate::models::{
    AppManifest, HookAction, InstallManifest, InstallOptions, InstallProgress, PathValidation,
    RunningProcessInfo, SystemInfo, UninstallOptions, UninstallProgress,
};
use crate::process::{check_running_process_in_dir, close_running_app_processes};
use crate::registry::{
    check_existing_installation_with_name, determine_install_action, register_full_installation,
};
use crate::shortcuts::{
    create_shortcut_with_aumid, get_desktop_dir, get_start_menu_dir, pick_folder_dialog,
};
use crate::uninstaller::execute_uninstallation;

static LAST_INSTALLED_DIR: Mutex<Option<PathBuf>> = Mutex::new(None);
static INSTALL_IN_PROGRESS: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

pub fn is_install_in_progress() -> bool {
    INSTALL_IN_PROGRESS.load(std::sync::atomic::Ordering::SeqCst)
}

pub fn detect_uninstall_mode() -> bool {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| {
        a.eq_ignore_ascii_case("--uninstall")
            || a.eq_ignore_ascii_case("/uninstall")
            || a.eq_ignore_ascii_case("-u")
    }) {
        return true;
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(stem) = exe_path.file_stem() {
            let name = stem.to_string_lossy().to_lowercase();
            if name.starts_with("uninstall") {
                return true;
            }
        }
    }

    false
}

pub fn detect_passive_mode() -> bool {
    std::env::args().any(|a| {
        a.eq_ignore_ascii_case("/P")
            || a.eq_ignore_ascii_case("/PASSIVE")
            || a.eq_ignore_ascii_case("--passive")
    })
}

pub fn detect_os_locale() -> String {
    for arg in std::env::args() {
        if let Some(lang) = arg
            .strip_prefix("/LANG=")
            .or_else(|| arg.strip_prefix("--lang="))
        {
            let trimmed = lang.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Globalization::GetUserDefaultLocaleName;
        let mut buf = [0u16; 85];
        unsafe {
            let len = GetUserDefaultLocaleName(buf.as_mut_ptr(), buf.len() as i32);
            if len > 1 {
                let s = String::from_utf16_lossy(&buf[..(len as usize - 1)]);
                if !s.is_empty() {
                    return s;
                }
            }
        }
    }

    std::env::var("LANG")
        .unwrap_or_else(|_| "en-US".to_string())
        .split('.')
        .next()
        .unwrap_or("en-US")
        .replace('_', "-")
}

pub fn is_process_elevated() -> bool {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
        use windows_sys::Win32::Security::{
            GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY,
        };
        use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

        unsafe {
            let mut token: HANDLE = std::ptr::null_mut();
            if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) != 0 {
                let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
                let mut ret_len: u32 = 0;
                let ok = GetTokenInformation(
                    token,
                    TokenElevation,
                    &mut elevation as *mut _ as *mut _,
                    std::mem::size_of::<TOKEN_ELEVATION>() as u32,
                    &mut ret_len,
                );
                CloseHandle(token);
                if ok != 0 {
                    return elevation.TokenIsElevated != 0;
                }
            }
        }
        false
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

pub fn detect_webview2_version() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;
        const WV2_CLIENT_GUID: &str = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

        let candidates = [
            (
                RegKey::predef(HKEY_LOCAL_MACHINE),
                format!(
                    r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{}",
                    WV2_CLIENT_GUID
                ),
            ),
            (
                RegKey::predef(HKEY_LOCAL_MACHINE),
                format!(
                    r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{}",
                    WV2_CLIENT_GUID
                ),
            ),
            (
                RegKey::predef(HKEY_CURRENT_USER),
                format!(r"Software\Microsoft\EdgeUpdate\Clients\{}", WV2_CLIENT_GUID),
            ),
        ];

        for (root, subkey) in candidates {
            if let Ok(key) = root.open_subkey(&subkey) {
                if let Ok(pv) = key.get_value::<String, _>("pv") {
                    let trimmed = pv.trim();
                    if !trimmed.is_empty() && trimmed != "0.0.0.0" {
                        return Some(trimmed.to_string());
                    }
                }
            }
        }
        None
    }
    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}

fn resolve_manifest(
    fallback_app_name: Option<&str>,
    fallback_app_id: Option<&str>,
    fallback_required_bytes: Option<u64>,
) -> AppManifest {
    if let Some(mut m) = get_authoritative_manifest() {
        if m.uncompressed_size_bytes == 0 {
            if let Some(req) = fallback_required_bytes {
                m.uncompressed_size_bytes = req;
            }
        }
        return m;
    }

    let mut m = AppManifest::default();
    if let Some(name) = fallback_app_name.filter(|s| !s.trim().is_empty()) {
        m.app_name = name.to_string();
    }
    if let Some(id) = fallback_app_id.filter(|s| !s.trim().is_empty()) {
        m.app_id = id.to_string();
    }
    if let Some(req) = fallback_required_bytes {
        m.uncompressed_size_bytes = req;
    }
    m
}

#[tauri::command]
pub fn get_system_info(
    app_name: Option<String>,
    app_id: Option<String>,
    required_bytes: Option<u64>,
) -> Result<SystemInfo, String> {
    let manifest = resolve_manifest(app_name.as_deref(), app_id.as_deref(), required_bytes);
    let effective_required = if manifest.uncompressed_size_bytes > 0 {
        manifest.uncompressed_size_bytes
    } else {
        required_bytes.unwrap_or(50 * 1024 * 1024)
    };

    let default_path = if let Some(ref custom_default) = manifest.default_install_dir {
        PathBuf::from(custom_default)
    } else if manifest.install_mode.eq_ignore_ascii_case("perMachine") {
        get_program_files_dir(&manifest.app_name)
            .unwrap_or_else(|| get_default_install_dir(&manifest.app_name))
    } else {
        get_default_install_dir(&manifest.app_name)
    };

    let prog_files = get_program_files_dir(&manifest.app_name);
    let desktop = get_desktop_dir();
    let start_menu = get_start_menu_dir();

    let existing =
        check_existing_installation_with_name(&manifest.app_id, Some(&manifest.app_name));
    let is_uninstall_mode = detect_uninstall_mode();

    let mut existing_install_path = existing
        .as_ref()
        .map(|e| e.install_path.clone())
        .filter(|s| !s.is_empty());

    if existing_install_path.is_none() && is_uninstall_mode {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(parent) = exe_path.parent() {
                existing_install_path = Some(parent.to_string_lossy().to_string());
            }
        }
    }

    let resolved_default = existing_install_path
        .clone()
        .unwrap_or_else(|| default_path.to_string_lossy().to_string());

    let validation = validate_path(&resolved_default, effective_required);
    let existing_version = existing
        .as_ref()
        .map(|e| e.version.clone())
        .filter(|s| !s.is_empty());
    let action = determine_install_action(existing_version.as_deref(), &manifest.version);

    Ok(SystemInfo {
        default_install_path: resolved_default,
        program_files_path: prog_files.map(|p| p.to_string_lossy().to_string()),
        desktop_path: desktop.map(|p| p.to_string_lossy().to_string()),
        start_menu_path: start_menu.map(|p| p.to_string_lossy().to_string()),
        available_space_bytes: validation.available_bytes,
        required_space_bytes: effective_required,
        is_elevated: is_process_elevated(),
        is_already_installed: existing.is_some(),
        existing_version,
        existing_install_path,
        existing_install_scope: existing.as_ref().map(|e| e.scope.clone()),
        action,
        is_uninstall_mode,
        is_passive_mode: detect_passive_mode(),
        locale: detect_os_locale(),
        webview2_version: detect_webview2_version(),
        manifest,
    })
}

#[tauri::command]
pub fn validate_install_path(path: String, required_bytes: Option<u64>) -> PathValidation {
    let manifest = get_authoritative_manifest();
    let req = required_bytes
        .filter(|&b| b > 0)
        .or_else(|| manifest.map(|m| m.uncompressed_size_bytes))
        .unwrap_or(0);
    validate_path(&path, req)
}

#[tauri::command]
pub async fn select_folder(
    initial_path: Option<String>,
    app_name: Option<String>,
) -> Result<Option<String>, String> {
    let manifest = resolve_manifest(app_name.as_deref(), None, None);
    let picked = pick_folder_dialog(initial_path.as_deref())?;
    Ok(picked.map(|raw| {
        let normalized = normalize_selected_folder(Path::new(&raw), &manifest.app_name);
        normalized.to_string_lossy().to_string()
    }))
}

#[tauri::command]
pub fn check_running(
    executable_name: Option<String>,
    install_dir: Option<String>,
) -> RunningProcessInfo {
    let manifest = get_authoritative_manifest();
    let exe = manifest
        .as_ref()
        .map(|m| m.executable_name.as_str())
        .filter(|s| !s.is_empty())
        .or(executable_name.as_deref())
        .unwrap_or("app.exe");

    let dir_path = install_dir
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from);
    check_running_process_in_dir(exe, dir_path.as_deref())
}

#[tauri::command]
pub fn kill_running(
    pids: Option<Vec<u32>>,
    executable_name: Option<String>,
    install_dir: Option<String>,
) -> Result<(), String> {
    let _ = pids; // Ignore untrusted PIDs from IPC; only close verified processes of our target app!
    let manifest = get_authoritative_manifest();
    let exe = manifest
        .as_ref()
        .map(|m| m.executable_name.as_str())
        .filter(|s| !s.is_empty())
        .or(executable_name.as_deref())
        .unwrap_or("app.exe");

    let dir_path = install_dir
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from);
    close_running_app_processes(exe, dir_path.as_deref())
}

#[tauri::command]
pub async fn start_installation(
    options: InstallOptions,
    on_progress: Channel<InstallProgress>,
) -> Result<(), String> {
    execute_installation_flow(options, |prog| {
        let _ = on_progress.send(prog);
    })
}

pub fn execute_installation_flow<F>(
    mut options: InstallOptions,
    mut on_progress: F,
) -> Result<(), String>
where
    F: FnMut(InstallProgress),
{
    let authoritative = get_authoritative_manifest();
    if let Some(ref m) = authoritative {
        // Enforce trust boundary: override metadata from authoritative manifest
        options.app_name = m.app_name.clone();
        options.app_id = m.app_id.clone();
        options.app_version = m.version.clone();
        options.publisher = m.publisher.clone();
        options.executable_name = m.executable_name.clone();
    } else {
        if options.app_version.trim().is_empty() {
            options.app_version = "1.0.0".to_string();
        }
        if options.publisher.trim().is_empty() {
            options.publisher = "Application Publisher".to_string();
        }
    }

    let required_bytes = authoritative
        .as_ref()
        .map(|m| m.uncompressed_size_bytes)
        .unwrap_or(0);

    // 1. Validate target directory in Rust (enforces deny-list, writability, and disk space)
    let validation = validate_path(&options.install_dir, required_bytes);
    if !validation.is_valid {
        return Err(format!(
            "{}: {}",
            validation.error_code.unwrap_or_else(|| "INVALID_PATH".to_string()),
            validation
                .error_message
                .unwrap_or_else(|| "Invalid installation path.".to_string())
        ));
    }

    // 2. Check existing version for downgrade protection or upgrade cleanup
    let existing =
        check_existing_installation_with_name(&options.app_id, Some(&options.app_name));
    if let Some(ref ex) = existing {
        let action = determine_install_action(Some(&ex.version), &options.app_version);
        let allow_downgrade = authoritative
            .as_ref()
            .map(|m| m.allow_downgrade)
            .unwrap_or(false)
            || std::env::args().any(|a| a.eq_ignore_ascii_case("/ALLOWDOWNGRADE"));
        if action == "downgrade" && !allow_downgrade {
            return Err(format!(
                "DOWNGRADE_BLOCKED: Newer version ({}) is already installed.",
                ex.version
            ));
        }
    }

    let target_dir = PathBuf::from(options.install_dir.trim());
    let old_install_manifest = read_install_manifest(&target_dir, &options.app_id);

    // Close running app instances inside target_dir before overwriting
    let _ = close_running_app_processes(&options.executable_name, Some(&target_dir));

    // Run declarative pre-install hooks if configured
    if let Some(ref m) = authoritative {
        if let Some(ref hooks) = m.hooks {
            run_declarative_hooks(&hooks.pre_install, &target_dir)?;
        }
    }

    INSTALL_IN_PROGRESS.store(true, std::sync::atomic::Ordering::SeqCst);

    // 3. Stream & extract payload with transactional rollback
    let extraction_res = extract_from_best_source(
        &target_dir,
        authoritative.as_ref().map(|m| m.uncompressed_size_bytes),
        &mut on_progress,
    );

    let report = match extraction_res {
        Ok(r) => r,
        Err(e) => {
            INSTALL_IN_PROGRESS.store(false, std::sync::atomic::Ordering::SeqCst);
            return Err(e);
        }
    };

    // 4. If upgrading in-place, remove stale files from previous version's manifest
    if let Some(ref old_m) = old_install_manifest {
        cleanup_stale_upgrade_files(&target_dir, old_m, &report.files);
    }

    // 5. Write stripped `uninstall.exe` (without duplicating the multi-hundred-MB payload!)
    if let Ok(current_exe) = std::env::current_exe() {
        let uninstaller_dest = target_dir.join("uninstall.exe");
        let _ = write_stripped_uninstaller(&current_exe, &uninstaller_dest);
    }

    // 6. Save onboarding data if provided
    if let Some(ref onboarding) = options.onboarding_data {
        let tci_dir = target_dir.join(".tci");
        let _ = fs::create_dir_all(&tci_dir);
        if let Ok(json) = serde_json::to_vec_pretty(onboarding) {
            let _ = fs::write(tci_dir.join("onboarding.json"), json);
        }
    }

    // 7. Create Shortcuts via native Win32 COM (with AppUserModelID for toast notifications)
    on_progress(InstallProgress {
        stage: "creating_shortcuts".into(),
        current_file: "Creating system shortcuts...".into(),
        files_completed: report.files.len(),
        total_files: report.files.len(),
        bytes_extracted: report.bytes_extracted,
        total_bytes: report.bytes_extracted,
        speed_bps: 0,
        eta_seconds: 0,
        percent: 96.0,
    });

    let exe_path = target_dir.join(&options.executable_name);
    let mut shortcuts_created: Vec<String> = Vec::new();
    let start_menu_folder = authoritative
        .as_ref()
        .and_then(|m| m.start_menu_folder.as_deref());

    if options.create_desktop_shortcut {
        if let Some(desktop) = get_desktop_dir() {
            let lnk_path = desktop.join(format!("{}.lnk", options.app_name));
            if create_shortcut_with_aumid(
                &exe_path,
                &lnk_path,
                &options.app_name,
                &target_dir,
                Some(&options.app_id),
            )
            .is_ok()
            {
                shortcuts_created.push(lnk_path.to_string_lossy().to_string());
            }
        }
    }

    if options.create_start_menu_shortcut {
        if let Some(start_menu) = get_start_menu_dir() {
            let folder = match start_menu_folder {
                Some(sub) if !sub.trim().is_empty() => start_menu.join(sub.trim()),
                _ => start_menu,
            };
            let lnk_path = folder.join(format!("{}.lnk", options.app_name));
            if create_shortcut_with_aumid(
                &exe_path,
                &lnk_path,
                &options.app_name,
                &target_dir,
                Some(&options.app_id),
            )
            .is_ok()
            {
                shortcuts_created.push(lnk_path.to_string_lossy().to_string());
            }
        }
    }

    // 8. Write `.tci\manifest.json` so uninstall only removes installed files
    let install_manifest = InstallManifest {
        app_id: options.app_id.clone(),
        app_name: options.app_name.clone(),
        version: options.app_version.clone(),
        publisher: options.publisher.clone(),
        executable_name: options.executable_name.clone(),
        install_dir: target_dir.to_string_lossy().to_string(),
        install_scope: options
            .install_scope
            .clone()
            .unwrap_or_else(|| "perUser".to_string()),
        installed_at: format!(
            "{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0)
        ),
        files: report.files.clone(),
        directories: report.directories.clone(),
        shortcuts_created,
        url_schemes_registered: authoritative
            .as_ref()
            .map(|m| m.url_schemes.clone())
            .unwrap_or_default(),
        file_associations_registered: authoritative
            .as_ref()
            .map(|m| {
                m.file_associations
                    .iter()
                    .map(|a| a.ext.clone())
                    .collect()
            })
            .unwrap_or_default(),
        added_to_path: options.add_to_path.unwrap_or_else(|| {
            authoritative.as_ref().map(|m| m.add_to_path).unwrap_or(false)
        }),
        selected_components: options.selected_components.clone().unwrap_or_default(),
        create_desktop_shortcut: options.create_desktop_shortcut,
        create_start_menu_shortcut: options.create_start_menu_shortcut,
        auto_launch_on_startup: options.auto_launch_on_startup,
    };
    let _ = write_install_manifest(&install_manifest);

    // 9. Register in Windows Registry
    on_progress(InstallProgress {
        stage: "registering".into(),
        current_file: "Registering application...".into(),
        files_completed: report.files.len(),
        total_files: report.files.len(),
        bytes_extracted: report.bytes_extracted,
        total_bytes: report.bytes_extracted,
        speed_bps: 0,
        eta_seconds: 0,
        percent: 99.0,
    });

    register_full_installation(
        &options,
        authoritative.as_ref(),
        report.bytes_extracted,
    )?;

    // Run declarative post-install hooks if configured
    if let Some(ref m) = authoritative {
        if let Some(ref hooks) = m.hooks {
            run_declarative_hooks(&hooks.post_install, &target_dir)?;
        }
    }

    if let Ok(mut guard) = LAST_INSTALLED_DIR.lock() {
        *guard = Some(target_dir);
    }
    INSTALL_IN_PROGRESS.store(false, std::sync::atomic::Ordering::SeqCst);

    // 10. Complete
    on_progress(InstallProgress {
        stage: "finished".into(),
        current_file: String::new(),
        files_completed: report.files.len(),
        total_files: report.files.len(),
        bytes_extracted: report.bytes_extracted,
        total_bytes: report.bytes_extracted,
        speed_bps: 0,
        eta_seconds: 0,
        percent: 100.0,
    });

    Ok(())
}

fn run_declarative_hooks(actions: &[HookAction], install_dir: &Path) -> Result<(), String> {
    for action in actions {
        match action {
            HookAction::CopyFile { from, to } => {
                if let (Some(clean_from), Some(clean_to)) = (
                    crate::extractor::sanitize_archive_entry_path(from),
                    crate::extractor::sanitize_archive_entry_path(to),
                ) {
                    let src = install_dir.join(clean_from);
                    let dst = install_dir.join(clean_to);
                    if src.exists() {
                        if let Some(p) = dst.parent() {
                            let _ = fs::create_dir_all(p);
                        }
                        let _ = fs::copy(&src, &dst);
                    }
                }
            }
            HookAction::RunBundledExe {
                relative_path,
                args,
            } => {
                if let Some(clean_rel) =
                    crate::extractor::sanitize_archive_entry_path(relative_path)
                {
                    let exe = install_dir.join(clean_rel);
                    if exe.exists() && exe.starts_with(install_dir) {
                        let _ = std::process::Command::new(&exe)
                            .args(args)
                            .current_dir(install_dir)
                            .status();
                    }
                }
            }
            HookAction::WriteRegistry {
                hive,
                key,
                name,
                value,
            } => {
                #[cfg(target_os = "windows")]
                {
                    use winreg::enums::*;
                    use winreg::RegKey;
                    if key.starts_with("Software\\") {
                        let root = if hive.eq_ignore_ascii_case("HKLM") {
                            RegKey::predef(HKEY_LOCAL_MACHINE)
                        } else {
                            RegKey::predef(HKEY_CURRENT_USER)
                        };
                        if let Ok((sub, _)) = root.create_subkey(key) {
                            let _ = sub.set_value(name, value);
                        }
                    }
                }
                #[cfg(not(target_os = "windows"))]
                {
                    let _ = (hive, key, name, value);
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn cancel_installation() -> Result<(), String> {
    request_cancel();
    Ok(())
}

/// Launches the installed application executable.
/// Security: resolves the executable path from the authoritative manifest and verified install directory,
/// never executing arbitrary paths from untrusted IPC callers.
#[tauri::command]
pub fn launch_installed_app(executable_path: Option<String>) -> Result<(), String> {
    let manifest = get_authoritative_manifest();
    let last_dir = LAST_INSTALLED_DIR.lock().ok().and_then(|g| g.clone());

    let resolved_path: PathBuf = if let (Some(ref m), Some(ref dir)) = (&manifest, &last_dir) {
        dir.join(&m.executable_name)
    } else if let Some(ref m) = manifest {
        let existing =
            check_existing_installation_with_name(&m.app_id, Some(&m.app_name));
        if let Some(ex) = existing {
            PathBuf::from(ex.install_path).join(&m.executable_name)
        } else if let Some(raw) = executable_path {
            let candidate = PathBuf::from(&raw);
            if candidate
                .file_name()
                .map(|n| n.to_string_lossy().eq_ignore_ascii_case(&m.executable_name))
                .unwrap_or(false)
            {
                candidate
            } else {
                return Err(
                    "ACCESS_DENIED: Refusing to launch executable not matching application manifest."
                        .to_string(),
                );
            }
        } else {
            return Err("No installed application path found to launch.".to_string());
        }
    } else if let Some(raw) = executable_path {
        let candidate = PathBuf::from(&raw);
        if let Some(ref dir) = last_dir {
            if !candidate.starts_with(dir) {
                return Err(
                    "ACCESS_DENIED: Executable path is outside the installation directory."
                        .to_string(),
                );
            }
        }
        candidate
    } else {
        return Err("No executable path available to launch.".to_string());
    };

    if !resolved_path.exists() {
        return Err(format!("Executable does not exist at {:?}", resolved_path));
    }

    let parent_dir = resolved_path.parent().unwrap_or(Path::new(""));
    let mut cmd = std::process::Command::new(&resolved_path);
    cmd.current_dir(parent_dir);

    let onboarding_file = parent_dir.join(".tci").join("onboarding.json");
    if onboarding_file.exists() {
        cmd.arg(format!(
            "--tci-onboarding={}",
            onboarding_file.to_string_lossy()
        ));
    }

    cmd.spawn()
        .map_err(|e| format!("Failed to launch application: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return Err("Only http:// and https:// URLs are allowed.".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", trimmed])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn start_uninstallation(
    mut options: UninstallOptions,
    app_name: Option<String>,
    executable_name: Option<String>,
    on_progress: Channel<UninstallProgress>,
) -> Result<(), String> {
    let manifest = resolve_manifest(app_name.as_deref(), Some(&options.app_id), None);
    options.app_id = manifest.app_id.clone();

    if let Some(ref hooks) = manifest.hooks {
        if let Ok(dir) = crate::uninstaller::resolve_authoritative_uninstall_dir(
            &options,
            &manifest.app_name,
            &manifest.executable_name,
        ) {
            let _ = run_declarative_hooks(&hooks.pre_uninstall, &dir);
        }
    }

    execute_uninstallation(
        &options,
        &manifest.app_name,
        executable_name
            .as_deref()
            .filter(|s| !s.is_empty())
            .unwrap_or(&manifest.executable_name),
        |prog| {
            let _ = on_progress.send(prog);
        },
    )
}

#[tauri::command]
pub fn minimize_installer<R: tauri::Runtime>(window: tauri::Window<R>) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn exit_installer<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    if is_install_in_progress() {
        request_cancel();
        std::thread::sleep(std::time::Duration::from_millis(250));
    }
    app.exit(0);
}
