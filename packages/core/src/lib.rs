pub mod commands;
pub mod disk;
pub mod extractor;
pub mod footer;
pub mod models;
pub mod process;
pub mod registry;
pub mod shortcuts;
pub mod uninstaller;

use std::fs::OpenOptions;
use std::io::{Cursor, Read, Write};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Runtime;

pub use extractor::{
    get_authoritative_manifest, set_embedded_manifest, set_embedded_payload,
};
pub use footer::{read_appended_ui_zip, read_footer_from_current_exe, TciFooter};
pub use models::*;
pub use uninstaller::run_worker_cleanup;

/// Standard installer exit codes (compatible with NSIS / MSI / winget conventions)
pub const EXIT_SUCCESS: i32 = 0;
pub const EXIT_CANCELLED: i32 = 1;
pub const EXIT_GENERIC_ERROR: i32 = 2;
pub const EXIT_INVALID_PATH_OR_SPACE: i32 = 3;
pub const EXIT_WEBVIEW2_ERROR: i32 = 4;
pub const EXIT_BLOCKED_OR_DOWNGRADE: i32 = 5;
pub const EXIT_CORRUPTED_PAYLOAD: i32 = 6;
pub const EXIT_SUCCESS_REBOOT_REQUIRED: i32 = 3010;

#[derive(Debug, Clone, Default)]
pub struct ParsedCliArgs {
    pub is_silent: bool,
    pub is_passive: bool,
    pub is_uninstall: bool,
    pub is_update: bool,
    pub relaunch_after: bool,
    pub no_shortcuts: bool,
    pub no_desktop_shortcut: bool,
    pub allow_downgrade: bool,
    pub scope_override: Option<String>,
    pub custom_install_dir: Option<PathBuf>,
    pub log_file: Option<PathBuf>,
    pub lang: Option<String>,
}

/// Parses command-line arguments with full NSIS & Tauri updater compatibility,
/// including `/D=<path with spaces>` as the final argument on the command line.
pub fn parse_cli_args_from(args: &[String]) -> ParsedCliArgs {
    let mut parsed = ParsedCliArgs::default();

    for (idx, arg) in args.iter().enumerate().skip(1) {
        let upper = arg.to_uppercase();
        if upper == "/S" || arg == "--silent" || upper == "/QUIET" || arg == "-q" {
            parsed.is_silent = true;
        } else if upper == "/P" || upper == "/PASSIVE" || arg == "--passive" {
            parsed.is_passive = true;
        } else if upper == "--UNINSTALL" || upper == "/UNINSTALL" || arg == "-u" {
            parsed.is_uninstall = true;
        } else if upper == "/UPDATE" || arg == "--update" {
            parsed.is_update = true;
        } else if upper == "/R" || arg == "--relaunch" {
            parsed.relaunch_after = true;
        } else if upper == "/NS" || arg == "--no-shortcuts" {
            parsed.no_shortcuts = true;
        } else if upper == "/NODESKTOP" || arg == "--no-desktop-shortcut" {
            parsed.no_desktop_shortcut = true;
        } else if upper == "/ALLOWDOWNGRADE" || arg == "--allow-downgrade" {
            parsed.allow_downgrade = true;
        } else if upper == "/ALLUSERS" || arg == "--all-users" {
            parsed.scope_override = Some("perMachine".to_string());
        } else if upper == "/CURRENTUSER" || arg == "--current-user" {
            parsed.scope_override = Some("perUser".to_string());
        } else if let Some(log_p) = arg
            .strip_prefix("/LOG=")
            .or_else(|| arg.strip_prefix("/log="))
            .or_else(|| arg.strip_prefix("--log="))
        {
            parsed.log_file = Some(PathBuf::from(log_p.trim_matches('"')));
        } else if let Some(lang) = arg
            .strip_prefix("/LANG=")
            .or_else(|| arg.strip_prefix("/lang="))
            .or_else(|| arg.strip_prefix("--lang="))
        {
            parsed.lang = Some(lang.trim().to_string());
        } else if upper.starts_with("/D=") || arg.starts_with("--dir=") {
            let prefix_len = if upper.starts_with("/D=") { 3 } else { 6 };
            let first_part = &arg[prefix_len..];
            // NSIS convention: `/D=` at the end of the command line captures the remainder even with unquoted spaces
            if upper.starts_with("/D=") && idx + 1 < args.len() {
                let mut combined = first_part.to_string();
                for tail in &args[idx + 1..] {
                    if tail.starts_with('/') || tail.starts_with("--") {
                        break;
                    }
                    combined.push(' ');
                    combined.push_str(tail);
                }
                parsed.custom_install_dir =
                    Some(PathBuf::from(combined.trim().trim_matches('"')));
                break;
            } else {
                parsed.custom_install_dir =
                    Some(PathBuf::from(first_part.trim().trim_matches('"')));
            }
        }
    }

    if commands::detect_uninstall_mode() {
        parsed.is_uninstall = true;
    }

    parsed
}

fn harden_windows_process() {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::System::LibraryLoader::{
            SetDefaultDllDirectories, LOAD_LIBRARY_SEARCH_SYSTEM32,
        };
        unsafe {
            let _ = SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32);
        }
    }
}

fn acquire_single_instance_mutex(app_id: &str) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::System::Threading::CreateMutexW;
        let clean: String = app_id
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
            .collect();
        let name = format!("Local\\tci_{}_setup_mutex", clean);
        let mut wide: Vec<u16> = std::ffi::OsStr::new(&name).encode_wide().collect();
        wide.push(0);
        unsafe {
            let _ = CreateMutexW(std::ptr::null(), 0, wide.as_ptr());
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app_id;
    }
}

fn write_log_line(log_path: &PathBuf, message: &str) {
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(file, "[{}] {}", ts, message);
    }
}

fn map_error_to_exit_code(err: &str) -> i32 {
    if err.starts_with("CANCELLED") {
        EXIT_CANCELLED
    } else if err.starts_with("INSUFFICIENT_SPACE") || err.starts_with("INVALID_PATH") {
        EXIT_INVALID_PATH_OR_SPACE
    } else if err.starts_with("CORRUPTED") {
        EXIT_CORRUPTED_PAYLOAD
    } else if err.starts_with("DOWNGRADE_BLOCKED") || err.starts_with("APP_RUNNING") {
        EXIT_BLOCKED_OR_DOWNGRADE
    } else {
        EXIT_GENERIC_ERROR
    }
}

/// Checks CLI arguments for background worker cleanup or silent/unattended installation/uninstallation.
pub fn check_worker_or_silent_mode(
    fallback_app_name: &str,
    fallback_app_id: &str,
    fallback_executable_name: &str,
) {
    harden_windows_process();

    let args: Vec<String> = std::env::args().collect();

    // 1. Background uninstaller worker mode
    if args.len() >= 5 && args[1] == "--worker-cleanup" {
        let target_dir = &args[2];
        let id = &args[3];
        let name = &args[4];
        run_worker_cleanup(target_dir, id, name);
        std::process::exit(EXIT_SUCCESS);
    }

    let parsed = parse_cli_args_from(&args);
    let manifest = get_authoritative_manifest().unwrap_or_else(|| AppManifest {
        app_name: fallback_app_name.to_string(),
        app_id: fallback_app_id.to_string(),
        executable_name: fallback_executable_name.to_string(),
        ..Default::default()
    });

    acquire_single_instance_mutex(&manifest.app_id);

    let log_file = parsed.log_file.clone().unwrap_or_else(|| {
        std::env::temp_dir().join(format!("tci-{}-install.log", manifest.app_id))
    });

    // 2. Silent uninstallation mode: `--uninstall /S`
    if parsed.is_silent && parsed.is_uninstall {
        write_log_line(
            &log_file,
            &format!("Starting silent uninstallation for {}", manifest.app_id),
        );
        let install_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.to_string_lossy().to_string()))
            .unwrap_or_default();

        let options = UninstallOptions {
            app_id: manifest.app_id.clone(),
            install_dir,
            purge_user_data: false,
        };
        match uninstaller::execute_uninstallation(
            &options,
            &manifest.app_name,
            &manifest.executable_name,
            |prog| {
                write_log_line(&log_file, &format!("[{}] {}", prog.stage, prog.message));
            },
        ) {
            Ok(()) => {
                write_log_line(&log_file, "Silent uninstallation succeeded.");
                std::process::exit(EXIT_SUCCESS);
            }
            Err(e) => {
                write_log_line(&log_file, &format!("Silent uninstallation failed: {}", e));
                std::process::exit(map_error_to_exit_code(&e));
            }
        }
    }

    // 3. Silent installation / update mode (`/S`)
    if parsed.is_silent {
        write_log_line(
            &log_file,
            &format!(
                "Starting silent installation for {} v{}",
                manifest.app_name, manifest.version
            ),
        );

        let existing = registry::check_existing_installation_with_name(
            &manifest.app_id,
            Some(&manifest.app_name),
        );

        let target_dir = if let Some(ref custom_dir) = parsed.custom_install_dir {
            custom_dir.clone()
        } else if let Some(ref ex) = existing {
            if !ex.install_path.is_empty() {
                PathBuf::from(&ex.install_path)
            } else {
                disk::get_default_install_dir(&manifest.app_name)
            }
        } else if let Some(ref def_dir) = manifest.default_install_dir {
            PathBuf::from(def_dir)
        } else {
            disk::get_default_install_dir(&manifest.app_name)
        };

        let create_desktop = if parsed.no_shortcuts || parsed.no_desktop_shortcut {
            false
        } else if let Some(ref ex) = existing {
            ex.desktop_shortcut.unwrap_or(manifest.create_desktop_shortcut)
        } else {
            manifest.create_desktop_shortcut
        };

        let create_start_menu = if parsed.no_shortcuts {
            false
        } else if let Some(ref ex) = existing {
            ex.start_menu_shortcut
                .unwrap_or(manifest.create_start_menu_shortcut)
        } else {
            manifest.create_start_menu_shortcut
        };

        let autostart = if let Some(ref ex) = existing {
            ex.autostart.unwrap_or(manifest.autostart == "always")
        } else {
            manifest.autostart == "always"
        };

        let scope = parsed
            .scope_override
            .or_else(|| existing.as_ref().map(|e| e.scope.clone()))
            .unwrap_or_else(|| manifest.install_mode.clone());

        let options = InstallOptions {
            app_name: manifest.app_name.clone(),
            app_id: manifest.app_id.clone(),
            app_version: manifest.version.clone(),
            publisher: manifest.publisher.clone(),
            executable_name: manifest.executable_name.clone(),
            install_dir: target_dir.to_string_lossy().to_string(),
            install_scope: Some(scope),
            create_desktop_shortcut: create_desktop,
            create_start_menu_shortcut: create_start_menu,
            auto_launch_on_startup: autostart,
            launch_after_install: parsed.relaunch_after,
            add_to_path: Some(manifest.add_to_path),
            selected_components: None,
            onboarding_data: None,
        };

        match commands::execute_installation_flow(options, |prog| {
            if prog.stage != "extracting" || prog.percent >= 99.0 {
                write_log_line(
                    &log_file,
                    &format!("[{}] {:.0}% {}", prog.stage, prog.percent, prog.current_file),
                );
            }
        }) {
            Ok(()) => {
                if parsed.relaunch_after {
                    let _ = commands::launch_installed_app(None);
                }
                write_log_line(&log_file, "Silent installation completed successfully.");
                std::process::exit(EXIT_SUCCESS);
            }
            Err(e) => {
                write_log_line(&log_file, &format!("Silent installation failed: {}", e));
                std::process::exit(map_error_to_exit_code(&e));
            }
        }
    }
}

fn guess_mime_type(path: &str) -> &'static str {
    let lower = path.to_lowercase();
    if lower.ends_with(".html") || lower.ends_with(".htm") {
        "text/html; charset=utf-8"
    } else if lower.ends_with(".js") || lower.ends_with(".mjs") {
        "application/javascript; charset=utf-8"
    } else if lower.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if lower.ends_with(".json") {
        "application/json; charset=utf-8"
    } else if lower.ends_with(".svg") {
        "image/svg+xml"
    } else if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".ico") {
        "image/x-icon"
    } else if lower.ends_with(".woff2") {
        "font/woff2"
    } else if lower.ends_with(".woff") {
        "font/woff"
    } else {
        "application/octet-stream"
    }
}

/// Registers all custom installer IPC commands, CLI/silent mode handlers,
/// and appended `ui.zip` protocol handlers directly onto a `tauri::Builder`.
pub fn register<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    let manifest = get_authoritative_manifest().unwrap_or_default();
    check_worker_or_silent_mode(
        &manifest.app_name,
        &manifest.app_id,
        &manifest.executable_name,
    );

    // Load appended UI zip archive if present in footer (`[runtime][ui.zip][payload][manifest][footer]`)
    let appended_ui_bytes: Option<Arc<Vec<u8>>> = std::env::current_exe()
        .ok()
        .and_then(|exe| read_appended_ui_zip(&exe).ok().flatten())
        .map(Arc::new);

    let builder = if let Some(ui_archive_bytes) = appended_ui_bytes {
        builder.register_uri_scheme_protocol("tci", move |_ctx, request| {
            let uri_path = request.uri().path().trim_start_matches('/');
            let requested = if uri_path.is_empty() {
                "index.html"
            } else {
                uri_path
            };

            let cursor = Cursor::new(ui_archive_bytes.as_slice());
            if let Ok(mut zip) = zip::ZipArchive::new(cursor) {
                let target_name = if zip.by_name(requested).is_ok() {
                    requested
                } else {
                    "index.html"
                };

                if let Ok(mut file) = zip.by_name(target_name) {
                    let mut body = Vec::with_capacity(file.size() as usize);
                    if file.read_to_end(&mut body).is_ok() {
                        return tauri::http::Response::builder()
                            .status(200)
                            .header("Content-Type", guess_mime_type(target_name))
                            .header(
                                "Content-Security-Policy",
                                "default-src 'self' tci: http://tci.localhost ipc: http://ipc.localhost; img-src 'self' data: blob: tci: http://tci.localhost; style-src 'self' 'unsafe-inline' tci: http://tci.localhost; script-src 'self' 'unsafe-inline' tci: http://tci.localhost",
                            )
                            .body(body)
                            .unwrap();
                    }
                }
            }

            tauri::http::Response::builder()
                .status(404)
                .body(b"Not Found".to_vec())
                .unwrap()
        })
    } else {
        builder
    };

    builder
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if commands::is_install_in_progress() {
                    extractor::request_cancel();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_system_info,
            commands::validate_install_path,
            commands::select_folder,
            commands::check_running,
            commands::kill_running,
            commands::start_installation,
            commands::cancel_installation,
            commands::launch_installed_app,
            commands::open_external_url,
            commands::start_uninstallation,
            commands::minimize_installer,
            commands::exit_installer
        ])
}
