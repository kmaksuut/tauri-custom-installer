"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defineConfig = defineConfig;
exports.detectPackageManager = detectPackageManager;
exports.detectAppConfig = detectAppConfig;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function defineConfig(config) {
    return config;
}
function detectPackageManager(cwd = process.cwd()) {
    const ua = process.env.npm_config_user_agent || '';
    if (ua.startsWith('bun/'))
        return 'bun';
    if (ua.startsWith('pnpm/'))
        return 'pnpm';
    if (ua.startsWith('yarn/'))
        return 'yarn';
    let curr = node_path_1.default.resolve(cwd);
    while (curr) {
        if (node_fs_1.default.existsSync(node_path_1.default.join(curr, 'bun.lock')) || node_fs_1.default.existsSync(node_path_1.default.join(curr, 'bun.lockb'))) {
            return 'bun';
        }
        if (node_fs_1.default.existsSync(node_path_1.default.join(curr, 'pnpm-lock.yaml'))) {
            return 'pnpm';
        }
        if (node_fs_1.default.existsSync(node_path_1.default.join(curr, 'yarn.lock'))) {
            return 'yarn';
        }
        if (node_fs_1.default.existsSync(node_path_1.default.join(curr, 'package-lock.json'))) {
            return 'npm';
        }
        const parent = node_path_1.default.dirname(curr);
        if (parent === curr)
            break;
        curr = parent;
    }
    return 'npm';
}
function detectAppConfig(cwd = process.cwd()) {
    let appName = 'MyTauriApp';
    let version = '1.0.0';
    let identifier = 'com.tauri.custominstaller';
    let publisher = 'Tauri Developer';
    let cargoBinName = null;
    let resources = [];
    let externalBin = [];
    let fileAssociations = [];
    let urlSchemes = [];
    let signCommand;
    let certificateThumbprint;
    let timestampUrl;
    let createUpdaterArtifacts = false;
    let installMode = 'perUser';
    let startMenuFolder;
    // 1. Check tauri.conf.json
    const tauriConfPaths = [
        node_path_1.default.join(cwd, 'src-tauri', 'tauri.conf.json'),
        node_path_1.default.join(cwd, 'tauri.conf.json'),
    ];
    for (const confPath of tauriConfPaths) {
        if (node_fs_1.default.existsSync(confPath)) {
            try {
                const content = JSON.parse(node_fs_1.default.readFileSync(confPath, 'utf8'));
                if (content.productName)
                    appName = content.productName;
                if (content.version)
                    version = content.version;
                if (content.identifier)
                    identifier = content.identifier;
                if (content.bundle?.publisher)
                    publisher = content.bundle.publisher;
                if (content.mainBinaryName)
                    cargoBinName = content.mainBinaryName;
                if (content.bundle?.resources)
                    resources = content.bundle.resources;
                if (Array.isArray(content.bundle?.externalBin))
                    externalBin = content.bundle.externalBin;
                if (Array.isArray(content.bundle?.fileAssociations)) {
                    fileAssociations = content.bundle.fileAssociations.map((a) => ({
                        ext: Array.isArray(a.ext) ? String(a.ext[0] || '') : String(a.ext || ''),
                        name: String(a.name || a.ext || 'Document'),
                        description: a.description ? String(a.description) : undefined,
                        mimeType: a.mimeType ? String(a.mimeType) : undefined,
                    }));
                }
                if (content.bundle?.windows?.nsis?.installMode) {
                    const mode = content.bundle.windows.nsis.installMode;
                    if (mode === 'perMachine' || mode === 'both')
                        installMode = mode;
                }
                if (content.bundle?.windows?.nsis?.startMenuFolder) {
                    startMenuFolder = String(content.bundle.windows.nsis.startMenuFolder);
                }
                if (content.bundle?.windows?.signCommand) {
                    signCommand =
                        typeof content.bundle.windows.signCommand === 'string'
                            ? content.bundle.windows.signCommand
                            : content.bundle.windows.signCommand.cmd;
                }
                if (content.bundle?.windows?.certificateThumbprint) {
                    certificateThumbprint = String(content.bundle.windows.certificateThumbprint);
                }
                if (content.bundle?.windows?.timestampUrl) {
                    timestampUrl = String(content.bundle.windows.timestampUrl);
                }
                if (content.bundle?.createUpdaterArtifacts) {
                    createUpdaterArtifacts = Boolean(content.bundle.createUpdaterArtifacts);
                }
                const deepLinkSchemes = content.plugins?.['deep-link']?.desktop?.schemes ||
                    content.plugins?.['deep-link']?.schemes;
                if (Array.isArray(deepLinkSchemes)) {
                    urlSchemes = deepLinkSchemes.map(String);
                }
                break;
            }
            catch {
                // ignore parse errors
            }
        }
    }
    // 2. Check src-tauri/Cargo.toml for binary package name
    const cargoTomlPath = node_path_1.default.join(cwd, 'src-tauri', 'Cargo.toml');
    if (!cargoBinName && node_fs_1.default.existsSync(cargoTomlPath)) {
        try {
            const cargoContent = node_fs_1.default.readFileSync(cargoTomlPath, 'utf8');
            const nameMatch = cargoContent.match(/^\s*name\s*=\s*"([^"]+)"/m);
            if (nameMatch && nameMatch[1]) {
                cargoBinName = nameMatch[1];
            }
        }
        catch {
            // ignore
        }
    }
    // 3. Check package.json & optional "installer" config key
    let userConfig = {};
    const pkgPath = node_path_1.default.join(cwd, 'package.json');
    if (node_fs_1.default.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(node_fs_1.default.readFileSync(pkgPath, 'utf8'));
            if (pkg.name && appName === 'MyTauriApp') {
                appName = pkg.name;
            }
            if (pkg.version && version === '1.0.0') {
                version = pkg.version;
            }
            if (pkg.author && publisher === 'Tauri Developer') {
                publisher = typeof pkg.author === 'string' ? pkg.author : pkg.author.name || publisher;
            }
            if (pkg.installer && typeof pkg.installer === 'object') {
                userConfig = { ...userConfig, ...pkg.installer };
            }
        }
        catch {
            // ignore
        }
    }
    // 4. Check tci.config.json
    const tciJsonPath = node_path_1.default.join(cwd, 'tci.config.json');
    if (node_fs_1.default.existsSync(tciJsonPath)) {
        try {
            const parsed = JSON.parse(node_fs_1.default.readFileSync(tciJsonPath, 'utf8'));
            userConfig = { ...userConfig, ...parsed };
        }
        catch {
            // ignore
        }
    }
    if (userConfig.productName)
        appName = userConfig.productName;
    if (userConfig.version)
        version = userConfig.version;
    if (userConfig.identifier)
        identifier = userConfig.identifier;
    if (userConfig.publisher)
        publisher = userConfig.publisher;
    if (userConfig.mainBinaryName)
        cargoBinName = userConfig.mainBinaryName;
    if (userConfig.install?.mode)
        installMode = userConfig.install.mode;
    if (userConfig.install?.shortcuts?.startMenuFolder) {
        startMenuFolder = userConfig.install.shortcuts.startMenuFolder;
    }
    if (userConfig.sign?.command)
        signCommand = userConfig.sign.command;
    if (userConfig.sign?.certificateThumbprint) {
        certificateThumbprint = userConfig.sign.certificateThumbprint;
    }
    if (userConfig.sign?.timestampUrl)
        timestampUrl = userConfig.sign.timestampUrl;
    let licenseText;
    const licenseCandidate = userConfig.install?.license
        ? node_path_1.default.resolve(cwd, userConfig.install.license)
        : node_path_1.default.join(cwd, 'LICENSE');
    if (node_fs_1.default.existsSync(licenseCandidate) && node_fs_1.default.statSync(licenseCandidate).isFile()) {
        try {
            licenseText = node_fs_1.default.readFileSync(licenseCandidate, 'utf8');
        }
        catch {
            // ignore
        }
    }
    const baseExe = cargoBinName
        ? cargoBinName
        : appName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const cleanExeName = baseExe.endsWith('.exe') ? baseExe : `${baseExe}.exe`;
    const uiRoot = userConfig.ui?.root || './installer';
    const uiOutDir = userConfig.ui?.outDir || node_path_1.default.join(uiRoot, 'dist');
    const outputDir = userConfig.output || './dist';
    return {
        appName,
        version,
        identifier,
        executableName: cleanExeName,
        publisher,
        installMode,
        defaultInstallDir: userConfig.install?.defaultDir,
        allowDowngrade: userConfig.install?.allowDowngrade ?? false,
        createDesktopShortcut: userConfig.install?.shortcuts?.desktop ?? true,
        createStartMenuShortcut: userConfig.install?.shortcuts?.startMenu ?? true,
        startMenuFolder,
        autostart: userConfig.install?.autostart ?? 'ask',
        runAfterInstall: userConfig.install?.runAfterInstall ?? true,
        licenseText,
        addToPath: userConfig.install?.addToPath ?? false,
        compression: userConfig.compression ?? 'zstd',
        uiRoot,
        uiOutDir,
        outputDir,
        resources,
        externalBin,
        fileAssociations,
        urlSchemes,
        signCommand,
        certificateThumbprint,
        timestampUrl,
        createUpdaterArtifacts,
    };
}
