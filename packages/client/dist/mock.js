const DUMMY_FILES = [
    'app/resources.pak',
    'app/main.exe',
    'app/v8_context_snapshot.bin',
    'app/icudtl.dat',
    'app/ffmpeg.dll',
    'app/d3dcompiler_47.dll',
    'app/locales/en-US.pak',
    'app/locales/es.pak',
    'app/locales/de.pak',
    'app/locales/tr.pak',
    'app/assets/icons/app.ico',
    'app/assets/splash.png',
    'app/modules/sqlite3.node',
    'app/webview2_loader.dll',
    'app/uninstall.exe',
];
const MOCK_FOLDER_CHOICES = [
    'C:\\Users\\Developer\\AppData\\Local\\MyApp',
    'D:\\Apps\\MyApp',
    'C:\\Tools\\MyApp',
];
export function isTauriEnvironment() {
    if (typeof window === 'undefined')
        return false;
    return Boolean(window.__TAURI_INTERNALS__ ||
        window.__TAURI__);
}
export class MockInstallerDriver {
    static cancelRequested = false;
    static currentScenario = 'success';
    static folderChoiceIndex = 0;
    static stepDelayMs = 120;
    static setScenario(scenario) {
        this.currentScenario = scenario;
    }
    static getScenario() {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const fromUrl = params.get('scenario');
            if (fromUrl)
                return fromUrl;
            if (params.get('mode') === 'uninstall')
                return 'uninstall';
        }
        return this.currentScenario;
    }
    static setStepDelay(ms) {
        this.stepDelayMs = Math.max(0, ms);
    }
    static getSystemInfo(appName = 'Tauri Application', appId = 'com.tauri.app', requiredBytes = 50 * 1024 * 1024) {
        const scenario = this.getScenario();
        const isUninstall = scenario === 'uninstall';
        const isUpgrade = scenario === 'already_installed_upgrade';
        const isRepair = scenario === 'repair';
        const isDowngrade = scenario === 'downgrade';
        const manifest = {
            appName,
            appId,
            version: '1.2.0',
            publisher: 'Tauri Developer',
            executableName: `${appName.toLowerCase().replace(/\s+/g, '-')}.exe`,
            installMode: 'perUser',
            defaultInstallDir: null,
            allowDowngrade: false,
            createDesktopShortcut: true,
            createStartMenuShortcut: true,
            startMenuFolder: null,
            autostart: 'ask',
            runAfterInstall: true,
            licenseText: null,
            uncompressedSizeBytes: requiredBytes,
            compressedSizeBytes: Math.floor(requiredBytes * 0.38),
            fileCount: DUMMY_FILES.length,
            payloadSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            payloadFormat: 'tar.zst',
            urlSchemes: [],
            fileAssociations: [],
            components: [],
            aboutUrl: null,
            helpUrl: null,
            updateUrl: null,
            addToPath: false,
        };
        const availableSpace = scenario === 'insufficient_space'
            ? Math.max(1024 * 1024, Math.floor(requiredBytes / 4))
            : 184 * 1024 * 1024 * 1024;
        return {
            default_install_path: `C:\\Users\\Developer\\AppData\\Local\\${appName}`,
            program_files_path: `C:\\Program Files\\${appName}`,
            desktop_path: 'C:\\Users\\Developer\\Desktop',
            start_menu_path: 'C:\\Users\\Developer\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs',
            available_space_bytes: availableSpace,
            required_space_bytes: requiredBytes,
            is_elevated: false,
            is_already_installed: isUpgrade || isRepair || isDowngrade || isUninstall,
            existing_version: isUpgrade
                ? '1.0.0'
                : isRepair
                    ? '1.2.0'
                    : isDowngrade
                        ? '2.0.0'
                        : null,
            existing_install_path: isUpgrade || isRepair || isDowngrade || isUninstall
                ? `C:\\Users\\Developer\\AppData\\Local\\${appName}`
                : null,
            existing_install_scope: 'perUser',
            action: isUpgrade
                ? 'upgrade'
                : isRepair
                    ? 'repair'
                    : isDowngrade
                        ? 'downgrade'
                        : 'install',
            is_uninstall_mode: isUninstall,
            is_passive_mode: false,
            locale: typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US',
            webview2_version: '131.0.2903.86',
            manifest,
        };
    }
    static validateInstallPath(path, requiredBytes) {
        const scenario = this.getScenario();
        const trimmed = (path || '').trim();
        if (!trimmed) {
            return {
                is_valid: false,
                is_writable: false,
                has_enough_space: false,
                available_bytes: 0,
                required_bytes: requiredBytes,
                normalized_path: '',
                error_code: 'INVALID_PATH',
                error_message: 'Installation path cannot be empty.',
            };
        }
        const lower = trimmed.toLowerCase().replace(/\//g, '\\').replace(/\\+$/, '');
        if (lower === 'c:' ||
            lower === 'c:\\windows' ||
            lower.startsWith('c:\\windows\\') ||
            lower === 'c:\\program files') {
            return {
                is_valid: false,
                is_writable: false,
                has_enough_space: false,
                available_bytes: 0,
                required_bytes: requiredBytes,
                normalized_path: trimmed,
                error_code: 'INVALID_PATH',
                error_message: 'Cannot install directly into a protected system root directory.',
            };
        }
        if (scenario === 'permission_denied') {
            return {
                is_valid: false,
                is_writable: false,
                has_enough_space: true,
                available_bytes: 184 * 1024 * 1024 * 1024,
                required_bytes: requiredBytes,
                normalized_path: trimmed,
                error_code: 'ACCESS_DENIED',
                error_message: 'Target directory is not writable. Choose a user-writable folder or run as Administrator.',
            };
        }
        const available = scenario === 'insufficient_space'
            ? Math.max(1024 * 1024, Math.floor(requiredBytes / 4))
            : 184 * 1024 * 1024 * 1024;
        const enough = available >= requiredBytes;
        return {
            is_valid: enough,
            is_writable: true,
            has_enough_space: enough,
            available_bytes: available,
            required_bytes: requiredBytes,
            normalized_path: trimmed,
            error_code: enough ? null : 'INSUFFICIENT_SPACE',
            error_message: enough ? null : 'Insufficient disk space on target drive.',
        };
    }
    static async selectFolder(initialPath, appName = 'MyApp') {
        // Cycles through realistic destination folders without calling blocking `window.prompt`
        const chosen = MOCK_FOLDER_CHOICES[this.folderChoiceIndex % MOCK_FOLDER_CHOICES.length].replace('MyApp', appName || 'MyApp');
        this.folderChoiceIndex++;
        return chosen || initialPath || null;
    }
    static checkRunning(_executableName) {
        if (this.getScenario() === 'app_running') {
            return {
                is_running: true,
                process_ids: [4820, 9104],
                process_names: [_executableName || 'app.exe'],
            };
        }
        return {
            is_running: false,
            process_ids: [],
            process_names: [],
        };
    }
    static cancelInstallation() {
        this.cancelRequested = true;
    }
    static async simulateInstallation(_options, onProgress) {
        this.cancelRequested = false;
        const scenario = this.getScenario();
        if (scenario === 'corrupted_payload') {
            onProgress({
                stage: 'verifying',
                current_file: 'Verifying payload integrity (SHA-256)...',
                files_completed: 0,
                total_files: DUMMY_FILES.length,
                bytes_extracted: 0,
                total_bytes: 128 * 1024 * 1024,
                speed_bps: 0,
                eta_seconds: 0,
                percent: 2,
            });
            await new Promise((resolve) => setTimeout(resolve, this.stepDelayMs));
            throw new Error('CORRUPTED: Installer payload integrity check (SHA-256) failed. Please re-download the installer.');
        }
        if (scenario === 'downgrade') {
            throw new Error('DOWNGRADE_BLOCKED: Newer version (2.0.0) is already installed.');
        }
        const totalFiles = DUMMY_FILES.length;
        const totalBytes = 128 * 1024 * 1024;
        const delay = scenario === 'slow_disk' ? this.stepDelayMs * 3 : this.stepDelayMs;
        const speedBps = scenario === 'slow_disk' ? 8 * 1024 * 1024 : 64 * 1024 * 1024;
        for (let i = 0; i < totalFiles; i++) {
            if (this.cancelRequested) {
                throw new Error('CANCELLED: Installation cancelled by user.');
            }
            const file = DUMMY_FILES[i];
            const progressPercent = ((i + 1) / totalFiles) * 95;
            const bytesExtracted = Math.floor((progressPercent / 100) * totalBytes);
            const remainingBytes = Math.max(0, totalBytes - bytesExtracted);
            const etaSeconds = Math.ceil(remainingBytes / speedBps);
            onProgress({
                stage: 'extracting',
                current_file: file,
                files_completed: i + 1,
                total_files: totalFiles,
                bytes_extracted: bytesExtracted,
                total_bytes: totalBytes,
                speed_bps: speedBps,
                eta_seconds: etaSeconds,
                percent: Math.round(progressPercent),
            });
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
        if (this.cancelRequested) {
            throw new Error('CANCELLED: Installation cancelled by user.');
        }
        onProgress({
            stage: 'creating_shortcuts',
            current_file: 'Creating system shortcuts (with AppUserModelID)...',
            files_completed: totalFiles,
            total_files: totalFiles,
            bytes_extracted: totalBytes,
            total_bytes: totalBytes,
            speed_bps: speedBps,
            eta_seconds: 0,
            percent: 98,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
        onProgress({
            stage: 'finished',
            current_file: '',
            files_completed: totalFiles,
            total_files: totalFiles,
            bytes_extracted: totalBytes,
            total_bytes: totalBytes,
            speed_bps: speedBps,
            eta_seconds: 0,
            percent: 100,
        });
    }
    static async simulateUninstallation(options, appName, onProgress) {
        const stages = [
            {
                stage: 'closing_process',
                percent: 15,
                message: `Closing running instances of ${appName}...`,
            },
            {
                stage: 'deleting_files',
                percent: 45,
                message: 'Removing installed files listed in .tci/manifest.json...',
            },
            ...(options.purge_user_data
                ? [
                    {
                        stage: 'purging_data',
                        percent: 65,
                        message: 'Removing application settings and WebView2 cache...',
                    },
                ]
                : []),
            {
                stage: 'removing_shortcuts',
                percent: 82,
                message: 'Removing shortcuts from Desktop & Start Menu...',
            },
            {
                stage: 'removing_registry',
                percent: 94,
                message: 'Removing Windows Registry entries...',
            },
            {
                stage: 'finished',
                percent: 100,
                message: `${appName} was cleanly uninstalled.`,
            },
        ];
        for (const s of stages) {
            onProgress(s);
            await new Promise((resolve) => setTimeout(resolve, this.stepDelayMs));
        }
    }
}
//# sourceMappingURL=mock.js.map