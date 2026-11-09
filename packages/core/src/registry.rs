use crate::models::{AppManifest, FileAssociation, InstallOptions};

#[cfg(target_os = "windows")]
use winreg::enums::*;
#[cfg(target_os = "windows")]
use winreg::RegKey;

#[derive(Debug, Clone)]
pub struct ExistingInstall {
    pub version: String,
    pub install_path: String,
    pub scope: String,
    pub desktop_shortcut: Option<bool>,
    pub start_menu_shortcut: Option<bool>,
    pub autostart: Option<bool>,
    pub legacy_nsis_uninstall: Option<String>,
}

fn is_dry_run() -> bool {
    std::env::var("TCI_DRY_RUN")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn uninstall_subkey_path(key_name: &str) -> String {
    if is_dry_run() {
        format!(
            r"Software\tci-sandbox\Microsoft\Windows\CurrentVersion\Uninstall\{}",
            key_name
        )
    } else {
        format!(
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{}",
            key_name
        )
    }
}

/// Compares two semantic version strings (e.g. `"1.2.0"` vs `"1.1.9"`).
/// Returns `Ordering::Greater` if `a > b`, `Ordering::Equal` if `a == b`, `Ordering::Less` if `a < b`.
pub fn compare_versions(a: &str, b: &str) -> std::cmp::Ordering {
    let parse_parts = |s: &str| -> Vec<u64> {
        s.trim_start_matches('v')
            .split(|c: char| !c.is_ascii_digit())
            .filter(|p| !p.is_empty())
            .filter_map(|p| p.parse::<u64>().ok())
            .collect()
    };
    let va = parse_parts(a);
    let vb = parse_parts(b);
    let max_len = va.len().max(vb.len());
    for i in 0..max_len {
        let pa = *va.get(i).unwrap_or(&0);
        let pb = *vb.get(i).unwrap_or(&0);
        match pa.cmp(&pb) {
            std::cmp::Ordering::Equal => continue,
            non_eq => return non_eq,
        }
    }
    std::cmp::Ordering::Equal
}

/// Determines the installation action (`"install"`, `"upgrade"`, `"repair"`, or `"downgrade"`)
/// based on the existing installed version and the target manifest version.
pub fn determine_install_action(existing_version: Option<&str>, target_version: &str) -> String {
    match existing_version {
        None => "install".to_string(),
        Some(ex) if ex.trim().is_empty() => "install".to_string(),
        Some(ex) => match compare_versions(target_version, ex) {
            std::cmp::Ordering::Greater => "upgrade".to_string(),
            std::cmp::Ordering::Equal => "repair".to_string(),
            std::cmp::Ordering::Less => "downgrade".to_string(),
        },
    }
}

pub fn check_existing_installation(app_id: &str) -> Option<ExistingInstall> {
    check_existing_installation_with_name(app_id, None)
}

/// Checks HKCU and HKLM for an existing installation by `app_id` or `app_name`
/// (which also detects existing Tauri NSIS installations for seamless migration).
pub fn check_existing_installation_with_name(
    app_id: &str,
    app_name: Option<&str>,
) -> Option<ExistingInstall> {
    #[cfg(target_os = "windows")]
    {
        let mut candidates = vec![app_id.to_string()];
        if let Some(name) = app_name {
            if !name.is_empty() && name != app_id {
                candidates.push(name.to_string());
            }
        }

        let hives = [
            (RegKey::predef(HKEY_CURRENT_USER), "perUser"),
            (RegKey::predef(HKEY_LOCAL_MACHINE), "perMachine"),
        ];

        for (hive, scope) in hives {
            for candidate in &candidates {
                let path = uninstall_subkey_path(candidate);
                if let Ok(key) = hive.open_subkey(&path) {
                    let version: String = key.get_value("DisplayVersion").unwrap_or_default();
                    let install_path: String = key
                        .get_value("InstallLocation")
                        .unwrap_or_default();
                    if install_path.is_empty() && version.is_empty() {
                        continue;
                    }
                    let desktop_shortcut: Option<u32> = key.get_value("TciDesktopShortcut").ok();
                    let start_menu_shortcut: Option<u32> =
                        key.get_value("TciStartMenuShortcut").ok();
                    let autostart: Option<u32> = key.get_value("TciAutostart").ok();
                    let uninstall_str: Option<String> = key.get_value("QuietUninstallString").ok()
                        .or_else(|| key.get_value("UninstallString").ok());

                    let is_legacy_nsis = candidate != app_id
                        && key.get_value::<String, _>("TciInstallScope").is_err();

                    return Some(ExistingInstall {
                        version,
                        install_path,
                        scope: scope.to_string(),
                        desktop_shortcut: desktop_shortcut.map(|v| v != 0),
                        start_menu_shortcut: start_menu_shortcut.map(|v| v != 0),
                        autostart: autostart.map(|v| v != 0),
                        legacy_nsis_uninstall: if is_legacy_nsis { uninstall_str } else { None },
                    });
                }
            }
        }
    }
    let _ = app_id;
    let _ = app_name;
    None
}

pub fn register_uninstall_entry(
    options: &InstallOptions,
    total_size_bytes: u64,
) -> Result<(), String> {
    register_full_installation(options, None, total_size_bytes)
}

pub fn register_full_installation(
    options: &InstallOptions,
    manifest: Option<&AppManifest>,
    total_size_bytes: u64,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let scope = options
            .install_scope
            .as_deref()
            .unwrap_or("perUser");
        let use_hklm = scope.eq_ignore_ascii_case("perMachine") && !is_dry_run();
        let root = if use_hklm {
            RegKey::predef(HKEY_LOCAL_MACHINE)
        } else {
            RegKey::predef(HKEY_CURRENT_USER)
        };

        let uninstall_path = uninstall_subkey_path(&options.app_id);
        let (key, _) = root
            .create_subkey(&uninstall_path)
            .map_err(|e| format!("Failed to create registry subkey '{}': {}", uninstall_path, e))?;

        let exe_path = format!(
            r"{}\{}",
            options.install_dir.trim_end_matches('\\'),
            options.executable_name
        );
        let uninstall_exe_path = format!(
            r"{}\uninstall.exe",
            options.install_dir.trim_end_matches('\\')
        );
        let icon_path = format!(r"{},0", exe_path);
        let estimated_size_kb: u32 = (total_size_bytes / 1024).min(u32::MAX as u64) as u32;

        // Parse major.minor version numbers
        let mut ver_parts = options
            .app_version
            .trim_start_matches('v')
            .split('.')
            .filter_map(|p| p.parse::<u32>().ok());
        let ver_major: u32 = ver_parts.next().unwrap_or(1);
        let ver_minor: u32 = ver_parts.next().unwrap_or(0);
        let install_date = current_yyyymmdd();

        key.set_value("DisplayName", &options.app_name)
            .map_err(|e| format!("Failed to write DisplayName: {}", e))?;
        key.set_value("DisplayVersion", &options.app_version)
            .map_err(|e| format!("Failed to write DisplayVersion: {}", e))?;
        let _ = key.set_value("VersionMajor", &ver_major);
        let _ = key.set_value("VersionMinor", &ver_minor);
        let _ = key.set_value("Publisher", &options.publisher);
        let _ = key.set_value("DisplayIcon", &icon_path);
        key.set_value("InstallLocation", &options.install_dir)
            .map_err(|e| format!("Failed to write InstallLocation: {}", e))?;
        let _ = key.set_value("InstallDate", &install_date);
        let _ = key.set_value(
            "UninstallString",
            &format!("\"{}\" --uninstall", uninstall_exe_path),
        );
        let _ = key.set_value(
            "QuietUninstallString",
            &format!("\"{}\" --uninstall /S", uninstall_exe_path),
        );
        let _ = key.set_value(
            "ModifyPath",
            &format!("\"{}\"", uninstall_exe_path),
        );
        let _ = key.set_value("EstimatedSize", &estimated_size_kb);
        let _ = key.set_value("NoModify", &0u32);
        let _ = key.set_value("NoRepair", &0u32);

        // Save TCI state for future `/UPDATE` and silent upgrades
        let _ = key.set_value("TciInstallScope", &scope.to_string());
        let _ = key.set_value(
            "TciDesktopShortcut",
            &(if options.create_desktop_shortcut { 1u32 } else { 0u32 }),
        );
        let _ = key.set_value(
            "TciStartMenuShortcut",
            &(if options.create_start_menu_shortcut { 1u32 } else { 0u32 }),
        );
        let _ = key.set_value(
            "TciAutostart",
            &(if options.auto_launch_on_startup { 1u32 } else { 0u32 }),
        );

        if let Some(m) = manifest {
            if let Some(ref url) = m.about_url {
                let _ = key.set_value("URLInfoAbout", url);
            }
            if let Some(ref url) = m.help_url {
                let _ = key.set_value("HelpLink", url);
            }
            if let Some(ref url) = m.update_url {
                let _ = key.set_value("URLUpdateInfo", url);
            }
        }

        // 2. Register `App Paths\<executable_name>` so `Win+R -> <exe>` works
        let app_paths_subkey = if is_dry_run() {
            format!(
                r"Software\tci-sandbox\Microsoft\Windows\CurrentVersion\App Paths\{}",
                options.executable_name
            )
        } else {
            format!(
                r"Software\Microsoft\Windows\CurrentVersion\App Paths\{}",
                options.executable_name
            )
        };
        if let Ok((ap_key, _)) = root.create_subkey(&app_paths_subkey) {
            let _ = ap_key.set_value("", &exe_path);
            let _ = ap_key.set_value("Path", &options.install_dir);
        }

        // 3. Auto-launch on startup registry (`CurrentVersion\Run`)
        let run_path = if is_dry_run() {
            r"Software\tci-sandbox\Microsoft\Windows\CurrentVersion\Run"
        } else {
            r"Software\Microsoft\Windows\CurrentVersion\Run"
        };
        if options.auto_launch_on_startup {
            if let Ok((run_key, _)) = root.create_subkey(run_path) {
                let _ = run_key.set_value(&options.app_name, &format!("\"{}\"", exe_path));
            }
        } else if let Ok(run_key) = root.open_subkey_with_flags(run_path, KEY_WRITE) {
            let _ = run_key.delete_value(&options.app_name);
        }

        // 4. Register file associations and deep-link URL schemes if present in manifest
        if let Some(m) = manifest {
            if !m.file_associations.is_empty() {
                register_file_associations(&root, &m.app_id, &exe_path, &m.file_associations);
            }
            if !m.url_schemes.is_empty() {
                register_url_schemes(&root, &m.app_name, &exe_path, &m.url_schemes);
            }
            let should_add_path = options.add_to_path.unwrap_or(m.add_to_path);
            if should_add_path && !is_dry_run() {
                let _ = add_dir_to_user_path(&options.install_dir);
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = options;
        let _ = manifest;
        let _ = total_size_bytes;
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn register_file_associations(
    root: &RegKey,
    app_id: &str,
    exe_path: &str,
    associations: &[FileAssociation],
) {
    let classes_prefix = if is_dry_run() {
        r"Software\tci-sandbox\Classes"
    } else {
        r"Software\Classes"
    };

    for assoc in associations {
        let clean_ext = assoc.ext.trim_start_matches('.');
        if clean_ext.is_empty() {
            continue;
        }
        let prog_id = format!("{}.{}", app_id, clean_ext);

        let ext_key_path = format!(r"{}\.{}", classes_prefix, clean_ext);
        if let Ok((ext_key, _)) = root.create_subkey(&ext_key_path) {
            let _ = ext_key.set_value("", &prog_id);
            if let Some(ref mime) = assoc.mime_type {
                let _ = ext_key.set_value("Content Type", mime);
            }
            if let Ok((ow_key, _)) = ext_key.create_subkey("OpenWithProgids") {
                let _ = ow_key.set_value(&prog_id, &"");
            }
        }

        let prog_key_path = format!(r"{}\{}", classes_prefix, prog_id);
        if let Ok((prog_key, _)) = root.create_subkey(&prog_key_path) {
            let desc = assoc
                .description
                .as_deref()
                .unwrap_or(&assoc.name);
            let _ = prog_key.set_value("", &desc);
            if let Ok((icon_key, _)) = prog_key.create_subkey("DefaultIcon") {
                let _ = icon_key.set_value("", &format!("\"{}\",0", exe_path));
            }
            if let Ok((cmd_key, _)) = prog_key.create_subkey(r"shell\open\command") {
                let _ = cmd_key.set_value("", &format!("\"{}\" \"%1\"", exe_path));
            }
        }
    }

    notify_shell_associations_changed();
}

#[cfg(target_os = "windows")]
fn register_url_schemes(root: &RegKey, app_name: &str, exe_path: &str, schemes: &[String]) {
    let classes_prefix = if is_dry_run() {
        r"Software\tci-sandbox\Classes"
    } else {
        r"Software\Classes"
    };

    for scheme in schemes {
        let clean = scheme.trim().trim_end_matches("://").trim_end_matches(':');
        if clean.is_empty() {
            continue;
        }
        let scheme_path = format!(r"{}\{}", classes_prefix, clean);
        if let Ok((s_key, _)) = root.create_subkey(&scheme_path) {
            let _ = s_key.set_value("", &format!("URL:{} Protocol", app_name));
            let _ = s_key.set_value("URL Protocol", &"");
            if let Ok((icon_key, _)) = s_key.create_subkey("DefaultIcon") {
                let _ = icon_key.set_value("", &format!("\"{}\",0", exe_path));
            }
            if let Ok((cmd_key, _)) = s_key.create_subkey(r"shell\open\command") {
                let _ = cmd_key.set_value("", &format!("\"{}\" \"%1\"", exe_path));
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn notify_shell_associations_changed() {
    use windows_sys::Win32::UI::Shell::{SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_IDLIST};
    unsafe {
        SHChangeNotify(
            SHCNE_ASSOCCHANGED as i32,
            SHCNF_IDLIST,
            std::ptr::null(),
            std::ptr::null(),
        );
    }
}

#[cfg(target_os = "windows")]
pub fn add_dir_to_user_path(install_dir: &str) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (env_key, _) = hkcu
        .create_subkey("Environment")
        .map_err(|e| e.to_string())?;
    let current_path: String = env_key.get_value("Path").unwrap_or_default();
    let norm_target = install_dir.trim_end_matches('\\').to_lowercase();
    let already_in = current_path
        .split(';')
        .any(|p| p.trim().trim_end_matches('\\').to_lowercase() == norm_target);
    if !already_in {
        let new_path = if current_path.trim().is_empty() {
            install_dir.to_string()
        } else if current_path.ends_with(';') {
            format!("{}{}", current_path, install_dir)
        } else {
            format!("{};{}", current_path, install_dir)
        };
        env_key
            .set_value("Path", &new_path)
            .map_err(|e| e.to_string())?;
        broadcast_environment_change();
    }
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn remove_dir_from_user_path(install_dir: &str) {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(env_key) = hkcu.open_subkey_with_flags("Environment", KEY_READ | KEY_WRITE) {
        if let Ok(current_path) = env_key.get_value::<String, _>("Path") {
            let norm_target = install_dir.trim_end_matches('\\').to_lowercase();
            let filtered: Vec<&str> = current_path
                .split(';')
                .filter(|p| {
                    let clean = p.trim().trim_end_matches('\\').to_lowercase();
                    !clean.is_empty() && clean != norm_target
                })
                .collect();
            let new_path = filtered.join(";");
            if new_path != current_path {
                let _ = env_key.set_value("Path", &new_path);
                broadcast_environment_change();
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn broadcast_environment_change() {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
    };
    let mut env_wide: Vec<u16> = std::ffi::OsStr::new("Environment").encode_wide().collect();
    env_wide.push(0);
    unsafe {
        let mut result: usize = 0;
        let _ = SendMessageTimeoutW(
            HWND_BROADCAST,
            WM_SETTINGCHANGE,
            0,
            env_wide.as_ptr() as isize,
            SMTO_ABORTIFHUNG,
            2000,
            &mut result,
        );
    }
}

pub fn remove_uninstall_entry(app_id: &str, app_name: &str) -> Result<(), String> {
    remove_full_registry_entries(app_id, app_name, None, &[], &[], None)
}

pub fn remove_full_registry_entries(
    app_id: &str,
    app_name: &str,
    executable_name: Option<&str>,
    url_schemes: &[String],
    file_associations: &[String],
    install_dir: Option<&str>,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let classes_prefix = if is_dry_run() {
            r"Software\tci-sandbox\Classes"
        } else {
            r"Software\Classes"
        };
        let run_path = if is_dry_run() {
            r"Software\tci-sandbox\Microsoft\Windows\CurrentVersion\Run"
        } else {
            r"Software\Microsoft\Windows\CurrentVersion\Run"
        };

        for root in [
            RegKey::predef(HKEY_CURRENT_USER),
            RegKey::predef(HKEY_LOCAL_MACHINE),
        ] {
            let uninstall_path = uninstall_subkey_path(app_id);
            let _ = root.delete_subkey_all(&uninstall_path);

            if let Ok(run_key) = root.open_subkey_with_flags(run_path, KEY_WRITE) {
                let _ = run_key.delete_value(app_name);
            }

            if let Some(exe) = executable_name {
                let app_paths_subkey = if is_dry_run() {
                    format!(
                        r"Software\tci-sandbox\Microsoft\Windows\CurrentVersion\App Paths\{}",
                        exe
                    )
                } else {
                    format!(
                        r"Software\Microsoft\Windows\CurrentVersion\App Paths\{}",
                        exe
                    )
                };
                let _ = root.delete_subkey_all(&app_paths_subkey);
            }

            for scheme in url_schemes {
                let clean = scheme.trim().trim_end_matches("://").trim_end_matches(':');
                if !clean.is_empty() {
                    let _ = root.delete_subkey_all(format!(r"{}\{}", classes_prefix, clean));
                }
            }

            for ext in file_associations {
                let clean_ext = ext.trim_start_matches('.');
                if !clean_ext.is_empty() {
                    let prog_id = format!("{}.{}", app_id, clean_ext);
                    let _ = root.delete_subkey_all(format!(r"{}\{}", classes_prefix, prog_id));
                    if let Ok(ow_key) = root.open_subkey_with_flags(
                        format!(r"{}\.{}\OpenWithProgids", classes_prefix, clean_ext),
                        KEY_WRITE,
                    ) {
                        let _ = ow_key.delete_value(&prog_id);
                    }
                }
            }
        }

        if let Some(dir) = install_dir {
            if !is_dry_run() {
                remove_dir_from_user_path(dir);
            }
        }

        if !file_associations.is_empty() {
            notify_shell_associations_changed();
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app_id;
        let _ = app_name;
        let _ = executable_name;
        let _ = url_schemes;
        let _ = file_associations;
        let _ = install_dir;
    }

    Ok(())
}

fn current_yyyymmdd() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Civil date from Unix days (Howard Hinnant's algorithm)
    let z = (secs / 86400) as i64 + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };
    format!("{:04}{:02}{:02}", year, m, d)
}
