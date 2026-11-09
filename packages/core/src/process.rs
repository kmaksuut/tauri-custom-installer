use std::path::Path;
use crate::models::RunningProcessInfo;

/// Checks for running processes matching `executable_name` and optionally scoped to `install_dir`.
/// Uses Win32 ToolHelp32 + `QueryFullProcessImageNameW` so unrelated processes from other directories
/// are not falsely matched when `install_dir` is provided and exists.
pub fn check_running_process(executable_name: &str) -> RunningProcessInfo {
    check_running_process_in_dir(executable_name, None)
}

pub fn check_running_process_in_dir(
    executable_name: &str,
    install_dir: Option<&Path>,
) -> RunningProcessInfo {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
        use windows_sys::Win32::System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
            TH32CS_SNAPPROCESS,
        };
        use windows_sys::Win32::System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
        };

        let target_base = executable_name
            .trim_end_matches(".exe")
            .to_lowercase();
        let target_with_ext = format!("{}.exe", target_base);
        let current_pid = std::process::id();

        let normalized_dir = install_dir.and_then(|d| {
            if d.exists() {
                Some(
                    d.to_string_lossy()
                        .replace('/', "\\")
                        .trim_end_matches('\\')
                        .to_lowercase(),
                )
            } else {
                None
            }
        });

        let mut pids = Vec::new();
        let mut names = Vec::new();

        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snapshot == INVALID_HANDLE_VALUE || snapshot.is_null() {
                return RunningProcessInfo {
                    is_running: false,
                    process_ids: Vec::new(),
                    process_names: Vec::new(),
                };
            }

            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

            if Process32FirstW(snapshot, &mut entry) != 0 {
                loop {
                    let pid = entry.th32ProcessID;
                    if pid != 0 && pid != current_pid {
                        let name_len = entry
                            .szExeFile
                            .iter()
                            .position(|&c| c == 0)
                            .unwrap_or(entry.szExeFile.len());
                        let exe_name = String::from_utf16_lossy(&entry.szExeFile[..name_len]);
                        let exe_lower = exe_name.to_lowercase();

                        if exe_lower == target_with_ext || exe_lower == target_base {
                            let mut matches_scope = true;
                            if let Some(ref dir_prefix) = normalized_dir {
                                let h_proc =
                                    OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
                                if !h_proc.is_null() {
                                    let mut img_buf = [0u16; 1024];
                                    let mut img_len = img_buf.len() as u32;
                                    if QueryFullProcessImageNameW(
                                        h_proc,
                                        0,
                                        img_buf.as_mut_ptr(),
                                        &mut img_len,
                                    ) != 0
                                    {
                                        let full_path = String::from_utf16_lossy(
                                            &img_buf[..img_len as usize],
                                        )
                                        .replace('/', "\\")
                                        .to_lowercase();
                                        matches_scope = full_path
                                            .starts_with(&format!("{}\\", dir_prefix));
                                    }
                                    CloseHandle(h_proc);
                                }
                            }

                            if matches_scope {
                                pids.push(pid);
                                names.push(exe_name);
                            }
                        }
                    }

                    if Process32NextW(snapshot, &mut entry) == 0 {
                        break;
                    }
                }
            }

            CloseHandle(snapshot);
        }

        RunningProcessInfo {
            is_running: !pids.is_empty(),
            process_ids: pids,
            process_names: names,
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = executable_name;
        let _ = install_dir;
        RunningProcessInfo {
            is_running: false,
            process_ids: Vec::new(),
            process_names: Vec::new(),
        }
    }
}

/// Closes only processes belonging to the target application (`executable_name` inside `install_dir`).
/// First sends `WM_CLOSE` to top-level windows for graceful shutdown, then terminates remaining processes.
pub fn close_running_app_processes(
    executable_name: &str,
    install_dir: Option<&Path>,
) -> Result<(), String> {
    let info = check_running_process_in_dir(executable_name, install_dir);
    if !info.is_running {
        return Ok(());
    }
    kill_processes(&info.process_ids)
}

pub fn kill_processes(pids: &[u32]) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Foundation::{CloseHandle, BOOL, HWND, LPARAM};
        use windows_sys::Win32::System::Threading::{
            OpenProcess, TerminateProcess, PROCESS_TERMINATE,
        };
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            EnumWindows, GetWindowThreadProcessId, PostMessageW, WM_CLOSE,
        };

        let current_pid = std::process::id();

        unsafe extern "system" fn close_windows_for_pid(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let target_pid = lparam as u32;
            let mut win_pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut win_pid);
            if win_pid == target_pid {
                let _ = PostMessageW(hwnd, WM_CLOSE, 0, 0);
            }
            1
        }

        unsafe {
            // 1. Graceful WM_CLOSE broadcast to matching PIDs
            for &pid in pids {
                if pid == 0 || pid == current_pid {
                    continue;
                }
                let _ = EnumWindows(Some(close_windows_for_pid), pid as isize);
            }

            std::thread::sleep(std::time::Duration::from_millis(400));

            // 2. Terminate any remaining processes
            for &pid in pids {
                if pid == 0 || pid == current_pid {
                    continue;
                }
                let h_proc = OpenProcess(PROCESS_TERMINATE, 0, pid);
                if !h_proc.is_null() {
                    let _ = TerminateProcess(h_proc, 1);
                    CloseHandle(h_proc);
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = pids;
    }

    Ok(())
}
