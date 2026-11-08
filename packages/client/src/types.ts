export interface SystemInfo {
  default_install_path: string;
  program_files_path?: string | null;
  desktop_path?: string | null;
  start_menu_path?: string | null;
  available_space_bytes: number;
  is_elevated: boolean;
  is_already_installed: boolean;
  existing_version?: string | null;
  existing_install_path?: string | null;
}

export interface PathValidation {
  is_valid: boolean;
  is_writable: boolean;
  has_enough_space: boolean;
  available_bytes: number;
  error_message?: string | null;
}

export interface InstallOptions {
  app_name: string;
  app_id: string;
  app_version: string;
  publisher: string;
  executable_name: string;
  install_dir: string;
  create_desktop_shortcut: boolean;
  create_start_menu_shortcut: boolean;
  auto_launch_on_startup: boolean;
  launch_after_install: boolean;
}

export interface InstallProgress {
  stage: 'extracting' | 'creating_shortcuts' | 'registering' | 'finished' | string;
  current_file: string;
  files_completed: number;
  total_files: number;
  bytes_extracted: number;
  total_bytes: number;
  percent: number;
}

export interface RunningProcessInfo {
  is_running: boolean;
  process_ids: number[];
}

export interface UninstallOptions {
  app_id: string;
  install_dir: string;
  purge_user_data: boolean;
}

export interface UninstallProgress {
  stage: 'closing_process' | 'removing_shortcuts' | 'removing_registry' | 'deleting_files' | 'finished' | string;
  percent: number;
  message: string;
}

export type InstallerStep =
  | 'welcome'
  | 'options'
  | 'running_warning'
  | 'installing'
  | 'completed'
  | 'error';

export type UninstallStep =
  | 'confirm'
  | 'running_warning'
  | 'uninstalling'
  | 'completed'
  | 'error';

export interface InstallerConfig {
  appName: string;
  appId: string;
  appVersion: string;
  publisher: string;
  executableName: string;
  requiredBytes?: number;
  simulationMode?: boolean;
}
