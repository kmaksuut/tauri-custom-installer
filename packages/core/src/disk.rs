use std::fs;
use std::path::{Path, PathBuf};
use sysinfo::Disks;
use crate::models::PathValidation;

pub fn get_default_install_dir(app_name: &str) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Some(local_app_data) = dirs::data_local_dir() {
            return local_app_data.join("Programs").join(app_name);
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Some(data_dir) = dirs::data_local_dir() {
            return data_dir.join(app_name);
        }
    }

    PathBuf::from("C:\\Program Files").join(app_name)
}

pub fn get_program_files_dir(app_name: &str) -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(prog_files) = std::env::var("ProgramFiles") {
            return Some(PathBuf::from(prog_files).join(app_name));
        }
        Some(PathBuf::from("C:\\Program Files").join(app_name))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app_name;
        None
    }
}

pub fn get_available_space(path: &Path) -> u64 {
    let disks = Disks::new_with_refreshed_list();
    let absolute_path = match path.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            // Traverse up to find an existing ancestor
            let mut curr = path;
            while let Some(parent) = curr.parent() {
                if parent.exists() {
                    if let Ok(canonical) = parent.canonicalize() {
                        return get_available_space(&canonical);
                    }
                }
                curr = parent;
            }
            path.to_path_buf()
        }
    };

    let mut best_match: Option<(usize, u64)> = None;

    for disk in disks.iter() {
        let mount_point = disk.mount_point();
        if absolute_path.starts_with(mount_point) {
            let mount_len = mount_point.as_os_str().len();
            match best_match {
                None => best_match = Some((mount_len, disk.available_space())),
                Some((len, _)) if mount_len > len => {
                    best_match = Some((mount_len, disk.available_space()));
                }
                _ => {}
            }
        }
    }

    best_match.map(|(_, space)| space).unwrap_or(u64::MAX)
}

pub fn check_path_writable(path: &Path) -> bool {
    let target_dir = if path.exists() {
        path.to_path_buf()
    } else {
        // Find existing parent
        let mut curr = path;
        while let Some(parent) = curr.parent() {
            if parent.exists() {
                return check_path_writable(parent);
            }
            curr = parent;
        }
        return false;
    };

    let test_file = target_dir.join(format!(".write_test_{}", std::process::id()));
    match fs::write(&test_file, b"test") {
        Ok(_) => {
            let _ = fs::remove_file(&test_file);
            true
        }
        Err(_) => false,
    }
}

pub fn validate_path(path_str: &str, required_bytes: u64) -> PathValidation {
    let path = Path::new(path_str);
    if path_str.trim().is_empty() {
        return PathValidation {
            is_valid: false,
            is_writable: false,
            has_enough_space: false,
            available_bytes: 0,
            error_message: Some("Path cannot be empty".to_string()),
        };
    }

    let is_writable = check_path_writable(path);
    if !is_writable {
        return PathValidation {
            is_valid: false,
            is_writable: false,
            has_enough_space: false,
            available_bytes: 0,
            error_message: Some("Target directory is not writable. Administrative privileges may be required.".to_string()),
        };
    }

    let available_space = get_available_space(path);
    let has_enough_space = available_space >= required_bytes;

    PathValidation {
        is_valid: has_enough_space,
        is_writable: true,
        has_enough_space,
        available_bytes: available_space,
        error_message: if !has_enough_space {
            Some(format!(
                "Insufficient disk space. Required: {} MB, Available: {} MB",
                required_bytes / (1024 * 1024),
                available_space / (1024 * 1024)
            ))
        } else {
            None
        },
    }
}
