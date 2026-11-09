use serde::{Deserialize, Serialize};

fn default_install_mode() -> String {
    "perUser".to_string()
}

fn default_true() -> bool {
    true
}

fn default_autostart() -> String {
    "ask".to_string()
}

fn default_payload_format() -> String {
    "zip".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FileAssociation {
    pub ext: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub mime_type: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ComponentDef {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub size_bytes: u64,
    #[serde(default = "default_true")]
    pub default_selected: bool,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum HookAction {
    #[serde(rename_all = "camelCase")]
    WriteRegistry {
        hive: String,
        key: String,
        name: String,
        value: String,
    },
    #[serde(rename_all = "camelCase")]
    CopyFile {
        from: String,
        to: String,
    },
    #[serde(rename_all = "camelCase")]
    RunBundledExe {
        relative_path: String,
        #[serde(default)]
        args: Vec<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DeclarativeHooks {
    #[serde(default)]
    pub pre_install: Vec<HookAction>,
    #[serde(default)]
    pub post_install: Vec<HookAction>,
    #[serde(default)]
    pub pre_uninstall: Vec<HookAction>,
}

/// Authoritative application and installer configuration embedded at build time.
/// Never trusted from untrusted frontend IPC calls when embedded in the installer.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppManifest {
    #[serde(alias = "product_name", alias = "app_name")]
    pub app_name: String,
    #[serde(alias = "identifier", alias = "app_id")]
    pub app_id: String,
    #[serde(alias = "app_version")]
    pub version: String,
    #[serde(default)]
    pub publisher: String,
    #[serde(alias = "main_binary_name", alias = "executable_name")]
    pub executable_name: String,
    #[serde(default = "default_install_mode", alias = "install_mode")]
    pub install_mode: String,
    #[serde(default, alias = "default_install_dir")]
    pub default_install_dir: Option<String>,
    #[serde(default, alias = "allow_downgrade")]
    pub allow_downgrade: bool,
    #[serde(default = "default_true", alias = "create_desktop_shortcut")]
    pub create_desktop_shortcut: bool,
    #[serde(default = "default_true", alias = "create_start_menu_shortcut")]
    pub create_start_menu_shortcut: bool,
    #[serde(default, alias = "start_menu_folder")]
    pub start_menu_folder: Option<String>,
    #[serde(default = "default_autostart")]
    pub autostart: String,
    #[serde(default = "default_true", alias = "run_after_install")]
    pub run_after_install: bool,
    #[serde(default, alias = "license_text")]
    pub license_text: Option<String>,
    #[serde(default, alias = "uncompressed_size_bytes")]
    pub uncompressed_size_bytes: u64,
    #[serde(default, alias = "compressed_size_bytes")]
    pub compressed_size_bytes: u64,
    #[serde(default, alias = "file_count")]
    pub file_count: usize,
    #[serde(default, alias = "payload_sha256")]
    pub payload_sha256: Option<String>,
    #[serde(default = "default_payload_format", alias = "payload_format")]
    pub payload_format: String,
    #[serde(default, alias = "url_schemes")]
    pub url_schemes: Vec<String>,
    #[serde(default, alias = "file_associations")]
    pub file_associations: Vec<FileAssociation>,
    #[serde(default)]
    pub components: Vec<ComponentDef>,
    #[serde(default)]
    pub hooks: Option<DeclarativeHooks>,
    #[serde(default, alias = "about_url")]
    pub about_url: Option<String>,
    #[serde(default, alias = "help_url")]
    pub help_url: Option<String>,
    #[serde(default, alias = "update_url")]
    pub update_url: Option<String>,
    #[serde(default, alias = "add_to_path")]
    pub add_to_path: bool,
    #[serde(default, alias = "minimum_webview2_version")]
    pub minimum_webview2_version: Option<String>,
}

impl Default for AppManifest {
    fn default() -> Self {
        Self {
            app_name: "Tauri Application".to_string(),
            app_id: "com.tauri.app".to_string(),
            version: "0.1.0".to_string(),
            publisher: "Application Publisher".to_string(),
            executable_name: "app.exe".to_string(),
            install_mode: "perUser".to_string(),
            default_install_dir: None,
            allow_downgrade: false,
            create_desktop_shortcut: true,
            create_start_menu_shortcut: true,
            start_menu_folder: None,
            autostart: "ask".to_string(),
            run_after_install: true,
            license_text: None,
            uncompressed_size_bytes: 0,
            compressed_size_bytes: 0,
            file_count: 0,
            payload_sha256: None,
            payload_format: "zip".to_string(),
            url_schemes: Vec::new(),
            file_associations: Vec::new(),
            components: Vec::new(),
            hooks: None,
            about_url: None,
            help_url: None,
            update_url: None,
            add_to_path: false,
            minimum_webview2_version: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledFileEntry {
    pub relative_path: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallManifest {
    pub app_id: String,
    pub app_name: String,
    pub version: String,
    pub publisher: String,
    pub executable_name: String,
    pub install_dir: String,
    pub install_scope: String,
    pub installed_at: String,
    pub files: Vec<InstalledFileEntry>,
    pub directories: Vec<String>,
    pub shortcuts_created: Vec<String>,
    pub url_schemes_registered: Vec<String>,
    pub file_associations_registered: Vec<String>,
    pub added_to_path: bool,
    pub selected_components: Vec<String>,
    pub create_desktop_shortcut: bool,
    pub create_start_menu_shortcut: bool,
    pub auto_launch_on_startup: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    pub default_install_path: String,
    pub program_files_path: Option<String>,
    pub desktop_path: Option<String>,
    pub start_menu_path: Option<String>,
    pub available_space_bytes: u64,
    pub required_space_bytes: u64,
    pub is_elevated: bool,
    pub is_already_installed: bool,
    pub existing_version: Option<String>,
    pub existing_install_path: Option<String>,
    pub existing_install_scope: Option<String>,
    pub action: String,
    pub is_uninstall_mode: bool,
    pub is_passive_mode: bool,
    pub locale: String,
    pub webview2_version: Option<String>,
    pub manifest: AppManifest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathValidation {
    pub is_valid: bool,
    pub is_writable: bool,
    pub has_enough_space: bool,
    pub available_bytes: u64,
    pub required_bytes: u64,
    pub normalized_path: String,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallOptions {
    #[serde(default, alias = "appName")]
    pub app_name: String,
    #[serde(default, alias = "appId")]
    pub app_id: String,
    #[serde(default, alias = "appVersion")]
    pub app_version: String,
    #[serde(default)]
    pub publisher: String,
    #[serde(default, alias = "executableName")]
    pub executable_name: String,
    #[serde(alias = "installDir")]
    pub install_dir: String,
    #[serde(default, alias = "installScope")]
    pub install_scope: Option<String>,
    #[serde(default = "default_true", alias = "createDesktopShortcut")]
    pub create_desktop_shortcut: bool,
    #[serde(default = "default_true", alias = "createStartMenuShortcut")]
    pub create_start_menu_shortcut: bool,
    #[serde(default, alias = "autoLaunchOnStartup")]
    pub auto_launch_on_startup: bool,
    #[serde(default = "default_true", alias = "launchAfterInstall")]
    pub launch_after_install: bool,
    #[serde(default, alias = "addToPath")]
    pub add_to_path: Option<bool>,
    #[serde(default, alias = "selectedComponents")]
    pub selected_components: Option<Vec<String>>,
    #[serde(default, alias = "onboardingData")]
    pub onboarding_data: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallProgress {
    pub stage: String,
    pub current_file: String,
    pub files_completed: usize,
    pub total_files: usize,
    pub bytes_extracted: u64,
    pub total_bytes: u64,
    pub speed_bps: u64,
    pub eta_seconds: u64,
    pub percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunningProcessInfo {
    pub is_running: bool,
    pub process_ids: Vec<u32>,
    #[serde(default)]
    pub process_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UninstallOptions {
    #[serde(default, alias = "appId")]
    pub app_id: String,
    #[serde(default, alias = "installDir")]
    pub install_dir: String,
    #[serde(default, alias = "purgeUserData")]
    pub purge_user_data: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UninstallProgress {
    pub stage: String,
    pub percent: f64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructuredError {
    pub code: String,
    pub message: String,
    pub details: Option<String>,
}
