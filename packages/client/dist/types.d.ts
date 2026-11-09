export interface FileAssociation {
    ext: string;
    name: string;
    description?: string | null;
    mimeType?: string | null;
    icon?: string | null;
}
export interface ComponentDef {
    id: string;
    name: string;
    description: string;
    sizeBytes: number;
    defaultSelected: boolean;
    required: boolean;
    files: string[];
}
export interface AppManifest {
    appName: string;
    appId: string;
    version: string;
    publisher: string;
    executableName: string;
    installMode: 'perUser' | 'perMachine' | 'both' | string;
    defaultInstallDir?: string | null;
    allowDowngrade: boolean;
    createDesktopShortcut: boolean;
    createStartMenuShortcut: boolean;
    startMenuFolder?: string | null;
    autostart: 'ask' | 'always' | 'never' | string;
    runAfterInstall: boolean;
    licenseText?: string | null;
    uncompressedSizeBytes: number;
    compressedSizeBytes: number;
    fileCount: number;
    payloadSha256?: string | null;
    payloadFormat: 'tar.zst' | 'zip' | string;
    urlSchemes: string[];
    fileAssociations: FileAssociation[];
    components: ComponentDef[];
    aboutUrl?: string | null;
    helpUrl?: string | null;
    updateUrl?: string | null;
    addToPath: boolean;
}
export type InstallAction = 'install' | 'upgrade' | 'repair' | 'downgrade';
export interface SystemInfo {
    default_install_path: string;
    program_files_path?: string | null;
    desktop_path?: string | null;
    start_menu_path?: string | null;
    available_space_bytes: number;
    required_space_bytes?: number;
    is_elevated: boolean;
    is_already_installed: boolean;
    existing_version?: string | null;
    existing_install_path?: string | null;
    existing_install_scope?: string | null;
    action?: InstallAction | string;
    is_uninstall_mode?: boolean;
    is_passive_mode?: boolean;
    locale?: string;
    webview2_version?: string | null;
    manifest?: AppManifest;
}
export type ErrorCode = 'INSUFFICIENT_SPACE' | 'INVALID_PATH' | 'ACCESS_DENIED' | 'FILE_LOCKED' | 'CORRUPTED' | 'CANCELLED' | 'DOWNGRADE_BLOCKED' | 'APP_RUNNING' | 'WEBVIEW2' | 'INTERNAL_ERROR';
export interface StructuredError {
    code: ErrorCode | string;
    message: string;
    details?: string | null;
}
export interface PathValidation {
    is_valid: boolean;
    is_writable: boolean;
    has_enough_space: boolean;
    available_bytes: number;
    required_bytes?: number;
    normalized_path?: string;
    error_code?: ErrorCode | string | null;
    error_message?: string | null;
}
export interface InstallOptions {
    app_name?: string;
    app_id?: string;
    app_version?: string;
    publisher?: string;
    executable_name?: string;
    install_dir: string;
    install_scope?: 'perUser' | 'perMachine' | string;
    create_desktop_shortcut: boolean;
    create_start_menu_shortcut: boolean;
    auto_launch_on_startup: boolean;
    launch_after_install: boolean;
    add_to_path?: boolean;
    selected_components?: string[];
    onboarding_data?: Record<string, unknown>;
}
export interface InstallProgress {
    stage: 'verifying' | 'extracting' | 'creating_shortcuts' | 'registering' | 'finished' | string;
    current_file: string;
    files_completed: number;
    total_files: number;
    bytes_extracted: number;
    total_bytes: number;
    speed_bps?: number;
    eta_seconds?: number;
    percent: number;
}
export interface RunningProcessInfo {
    is_running: boolean;
    process_ids: number[];
    process_names?: string[];
}
export interface UninstallOptions {
    app_id: string;
    install_dir: string;
    purge_user_data: boolean;
}
export interface UninstallProgress {
    stage: 'closing_process' | 'deleting_files' | 'purging_data' | 'removing_shortcuts' | 'removing_registry' | 'finished' | string;
    percent: number;
    message: string;
}
export type InstallerStep = 'welcome' | 'license' | 'options' | 'running_warning' | 'installing' | 'completed' | 'error' | 'cancelled';
export type UninstallStep = 'confirm' | 'running_warning' | 'uninstalling' | 'completed' | 'error';
export type SimulationScenario = 'success' | 'slow_disk' | 'insufficient_space' | 'app_running' | 'permission_denied' | 'already_installed_upgrade' | 'repair' | 'downgrade' | 'corrupted_payload' | 'uninstall';
export interface InstallerConfig {
    appName?: string;
    appId?: string;
    appVersion?: string;
    publisher?: string;
    executableName?: string;
    requiredBytes?: number;
    simulationMode?: boolean;
    scenario?: SimulationScenario;
}
//# sourceMappingURL=types.d.ts.map