use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    pub default_install_path: String,
    pub program_files_path: Option<String>,
    pub desktop_path: Option<String>,
    pub start_menu_path: Option<String>,
    pub available_space_bytes: u64,
    pub is_elevated: bool,
    pub is_already_installed: bool,
    pub existing_version: Option<String>,
    pub existing_install_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathValidation {
    pub is_valid: bool,
    pub is_writable: bool,
    pub has_enough_space: bool,
    pub available_bytes: u64,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallOptions {
    pub app_name: String,
    pub app_id: String,
    pub app_version: String,
    pub publisher: String,
    pub executable_name: String,
    pub install_dir: String,
    pub create_desktop_shortcut: bool,
    pub create_start_menu_shortcut: bool,
    pub auto_launch_on_startup: bool,
    pub launch_after_install: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallProgress {
    pub stage: String,
    pub current_file: String,
    pub files_completed: usize,
    pub total_files: usize,
    pub bytes_extracted: u64,
    pub total_bytes: u64,
    pub percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunningProcessInfo {
    pub is_running: bool,
    pub process_ids: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UninstallOptions {
    pub app_id: String,
    pub install_dir: String,
    pub purge_user_data: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UninstallProgress {
    pub stage: String,
    pub percent: f64,
    pub message: String,
}
