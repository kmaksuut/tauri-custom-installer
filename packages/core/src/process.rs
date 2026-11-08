use sysinfo::{ProcessesToUpdate, System};
use crate::models::RunningProcessInfo;

pub fn check_running_process(executable_name: &str) -> RunningProcessInfo {
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let clean_name = executable_name
        .trim_end_matches(".exe")
        .to_lowercase();

    let mut pids = Vec::new();
    let current_pid = sysinfo::get_current_pid().ok();

    for (pid, process) in sys.processes() {
        if Some(*pid) == current_pid {
            continue; // Skip self
        }

        let p_name = process.name().to_string_lossy().to_lowercase();
        let p_name_clean = p_name.trim_end_matches(".exe");

        if p_name == executable_name.to_lowercase() || p_name_clean == clean_name {
            pids.push(pid.as_u32());
        }
    }

    RunningProcessInfo {
        is_running: !pids.is_empty(),
        process_ids: pids,
    }
}

pub fn kill_processes(pids: &[u32]) -> Result<(), String> {
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    for &pid in pids {
        let sys_pid = sysinfo::Pid::from_u32(pid);
        if let Some(process) = sys.process(sys_pid) {
            if !process.kill() {
                // If soft kill didn't work, wait and try harder on Windows
                #[cfg(target_os = "windows")]
                {
                    use std::process::Command;
                    let _ = Command::new("taskkill")
                        .args(["/F", "/PID", &pid.to_string()])
                        .output();
                }
            }
        }
    }

    Ok(())
}
