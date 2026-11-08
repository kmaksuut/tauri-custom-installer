use std::fs;
use std::path::Path;
use std::process::Command;
use crate::models::{UninstallOptions, UninstallProgress};
use crate::process::check_running_process;
use crate::registry::remove_uninstall_entry;
use crate::shortcuts::remove_shortcuts;

pub fn execute_uninstallation<F>(
    options: &UninstallOptions,
    app_name: &str,
    executable_name: &str,
    mut on_progress: F,
) -> Result<(), String>
where
    F: FnMut(UninstallProgress),
{
    // 1. Check & terminate running processes
    on_progress(UninstallProgress {
        stage: "closing_process".into(),
        percent: 15.0,
        message: format!("Checking for running instances of {}...", app_name),
    });

    let running = check_running_process(executable_name);
    if running.is_running {
        crate::process::kill_processes(&running.process_ids)?;
        std::thread::sleep(std::time::Duration::from_millis(500));
    }

    // 2. Remove shortcuts
    on_progress(UninstallProgress {
        stage: "removing_shortcuts".into(),
        percent: 40.0,
        message: "Removing Desktop and Start Menu shortcuts...".into(),
    });
    remove_shortcuts(app_name);

    // 3. Remove registry entries
    on_progress(UninstallProgress {
        stage: "removing_registry".into(),
        percent: 65.0,
        message: "Removing Windows Registry entries...".into(),
    });
    remove_uninstall_entry(&options.app_id, app_name)?;

    // 4. File cleanup
    on_progress(UninstallProgress {
        stage: "deleting_files".into(),
        percent: 85.0,
        message: "Removing installed application files...".into(),
    });

    let install_dir = Path::new(&options.install_dir);
    if install_dir.exists() {
        spawn_cleanup_worker(install_dir, &options.app_id, app_name)?;
    }

    on_progress(UninstallProgress {
        stage: "finished".into(),
        percent: 100.0,
        message: format!("{} successfully uninstalled.", app_name),
    });

    Ok(())
}

fn spawn_cleanup_worker(install_dir: &Path, app_id: &str, app_name: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(current_exe) = std::env::current_exe() {
            let temp_dir = std::env::temp_dir();
            let worker_exe = temp_dir.join(format!("{}-uninstall-worker.exe", app_id));

            // Copy ourselves to temp
            let _ = fs::copy(&current_exe, &worker_exe);

            // Spawns worker with --worker-cleanup
            let mut cmd = Command::new(&worker_exe);
            cmd.args([
                "--worker-cleanup",
                install_dir.to_str().unwrap_or_default(),
                app_id,
                app_name,
            ]);

            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }

            cmd.spawn()
                .map_err(|e| format!("Failed to spawn cleanup worker: {}", e))?;
            return Ok(());
        }
    }

    // On non-windows or fallback:
    let _ = fs::remove_dir_all(install_dir);
    Ok(())
}

pub fn run_worker_cleanup(target_dir: &str, app_id: &str, app_name: &str) {
    // Wait a moment for original process to terminate
    std::thread::sleep(std::time::Duration::from_millis(1200));

    let path = Path::new(target_dir);
    if path.exists() {
        // Attempt removal up to 5 times (in case files are releasing locks)
        for _ in 0..5 {
            if fs::remove_dir_all(path).is_ok() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    }

    // Ensure shortcuts and registry are purged
    remove_shortcuts(app_name);
    let _ = remove_uninstall_entry(app_id, app_name);

    // Self-delete worker
    #[cfg(target_os = "windows")]
    {
        if let Ok(worker_exe) = std::env::current_exe() {
            let cmd_script = format!(
                "ping 127.0.0.1 -n 2 > nul & del /f /q \"{}\"",
                worker_exe.to_string_lossy()
            );
            let _ = Command::new("cmd")
                .args(["/c", &cmd_script])
                .spawn();
        }
    }
}
