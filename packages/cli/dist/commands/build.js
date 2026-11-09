"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runBuild = runBuild;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const picocolors_1 = __importDefault(require("picocolors"));
const archiver_1 = require("../utils/archiver");
const config_1 = require("../utils/config");
const exec_1 = require("../utils/exec");
const sfx_1 = require("../utils/sfx");
function resolveCargoTargetDir(cargoDir) {
    const metaJson = (0, exec_1.tryExecOutput)('cargo', ['metadata', '--format-version', '1', '--no-deps'], cargoDir);
    if (metaJson) {
        try {
            const parsed = JSON.parse(metaJson);
            if (parsed.target_directory && node_fs_1.default.existsSync(parsed.target_directory)) {
                return parsed.target_directory;
            }
        }
        catch {
            // ignore
        }
    }
    return node_path_1.default.join(cargoDir, 'target');
}
function resolveHostTargetTriple(archOverride) {
    if (archOverride === 'arm64' || archOverride === 'aarch64-pc-windows-msvc') {
        return 'aarch64-pc-windows-msvc';
    }
    if (archOverride === 'x86' || archOverride === 'i686-pc-windows-msvc') {
        return 'i686-pc-windows-msvc';
    }
    if (archOverride === 'x64' || archOverride === 'x86_64-pc-windows-msvc') {
        return 'x86_64-pc-windows-msvc';
    }
    const rustcInfo = (0, exec_1.tryExecOutput)('rustc', ['-vV']);
    if (rustcInfo) {
        const match = rustcInfo.match(/^host:\s*(\S+)/m);
        if (match?.[1])
            return match[1];
    }
    return 'x86_64-pc-windows-msvc';
}
function stageApplicationPayload(cwd, appConfig, releaseDir, stageDir, targetTriple) {
    if (node_fs_1.default.existsSync(stageDir)) {
        node_fs_1.default.rmSync(stageDir, { recursive: true, force: true });
    }
    node_fs_1.default.mkdirSync(stageDir, { recursive: true });
    const stagedFiles = [];
    let totalUncompressedBytes = 0;
    let mainBinaryStaged = false;
    const copyIntoStage = (srcFile, relDest) => {
        if (!node_fs_1.default.existsSync(srcFile) || !node_fs_1.default.statSync(srcFile).isFile())
            return false;
        const destPath = node_path_1.default.join(stageDir, relDest);
        node_fs_1.default.mkdirSync(node_path_1.default.dirname(destPath), { recursive: true });
        node_fs_1.default.copyFileSync(srcFile, destPath);
        const size = node_fs_1.default.statSync(srcFile).size;
        totalUncompressedBytes += size;
        stagedFiles.push({ relPath: relDest.replace(/\\/g, '/'), size });
        return true;
    };
    if (releaseDir && node_fs_1.default.existsSync(releaseDir)) {
        // 1. Stage main application binary
        const expectedMainExe = node_path_1.default.join(releaseDir, appConfig.executableName);
        if (copyIntoStage(expectedMainExe, appConfig.executableName)) {
            mainBinaryStaged = true;
        }
        else {
            // Fallback: find the primary non-installer executable in releaseDir
            const entries = node_fs_1.default.readdirSync(releaseDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isFile() &&
                    entry.name.toLowerCase().endsWith('.exe') &&
                    !entry.name.includes('-installer') &&
                    !entry.name.includes('tci-runtime') &&
                    !entry.name.includes('uninstall') &&
                    !entry.name.startsWith('build-script')) {
                    if (copyIntoStage(node_path_1.default.join(releaseDir, entry.name), entry.name)) {
                        appConfig.executableName = entry.name;
                        mainBinaryStaged = true;
                        break;
                    }
                }
            }
        }
        // 2. Stage runtime DLLs (e.g., WebView2Loader.dll, ffmpeg.dll) next to the main binary
        const entries = node_fs_1.default.readdirSync(releaseDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && entry.name.toLowerCase().endsWith('.dll')) {
                copyIntoStage(node_path_1.default.join(releaseDir, entry.name), entry.name);
            }
        }
    }
    // 3. Stage `bundle.externalBin` sidecars (stripping `-${targetTriple}` suffix per Tauri convention)
    const mainTauriDir = node_path_1.default.join(cwd, 'src-tauri');
    for (const extBin of appConfig.externalBin) {
        const cleanRel = extBin.replace(/\.exe$/i, '');
        const withTriple = node_path_1.default.resolve(mainTauriDir, `${cleanRel}-${targetTriple}.exe`);
        const plain = node_path_1.default.resolve(mainTauriDir, `${cleanRel}.exe`);
        const destName = `${node_path_1.default.basename(cleanRel)}.exe`;
        if (node_fs_1.default.existsSync(withTriple)) {
            copyIntoStage(withTriple, destName);
        }
        else if (node_fs_1.default.existsSync(plain)) {
            copyIntoStage(plain, destName);
        }
    }
    // 4. Stage `bundle.resources`
    if (Array.isArray(appConfig.resources)) {
        for (const resItem of appConfig.resources) {
            const srcPath = node_path_1.default.resolve(mainTauriDir, resItem);
            if (node_fs_1.default.existsSync(srcPath)) {
                if (node_fs_1.default.statSync(srcPath).isFile()) {
                    copyIntoStage(srcPath, node_path_1.default.basename(srcPath));
                }
                else if (node_fs_1.default.statSync(srcPath).isDirectory()) {
                    copyDirIntoStage(srcPath, node_path_1.default.basename(srcPath), copyIntoStage);
                }
            }
        }
    }
    else if (appConfig.resources && typeof appConfig.resources === 'object') {
        for (const [srcRel, destRel] of Object.entries(appConfig.resources)) {
            const srcPath = node_path_1.default.resolve(mainTauriDir, srcRel);
            if (node_fs_1.default.existsSync(srcPath)) {
                if (node_fs_1.default.statSync(srcPath).isFile()) {
                    copyIntoStage(srcPath, destRel);
                }
                else if (node_fs_1.default.statSync(srcPath).isDirectory()) {
                    copyDirIntoStage(srcPath, destRel, copyIntoStage);
                }
            }
        }
    }
    // 5. If running in --skip-app-build demo mode and no binary exists yet, create a valid demo stub
    if (!mainBinaryStaged) {
        const stubExe = node_path_1.default.join(stageDir, appConfig.executableName);
        const stubContent = Buffer.alloc(64 * 1024, 'MZ_TAURI_APPLICATION_PAYLOAD_DEMO');
        node_fs_1.default.writeFileSync(stubExe, stubContent);
        totalUncompressedBytes += stubContent.length;
        stagedFiles.push({ relPath: appConfig.executableName, size: stubContent.length });
    }
    return { totalUncompressedBytes, stagedFiles };
}
function copyDirIntoStage(srcDir, destRelPrefix, copyIntoStage) {
    const entries = node_fs_1.default.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
        const fullSrc = node_path_1.default.join(srcDir, entry.name);
        const relTarget = node_path_1.default.join(destRelPrefix, entry.name);
        if (entry.isDirectory()) {
            copyDirIntoStage(fullSrc, relTarget, copyIntoStage);
        }
        else if (entry.isFile()) {
            copyIntoStage(fullSrc, relTarget);
        }
    }
}
async function runBuild(options) {
    const startTime = Date.now();
    const cwd = process.cwd();
    const appConfig = (0, config_1.detectAppConfig)(cwd);
    const installerDir = node_path_1.default.resolve(cwd, appConfig.uiRoot || './installer');
    if (!node_fs_1.default.existsSync(installerDir)) {
        console.error(picocolors_1.default.red(`❌ No '${appConfig.uiRoot}' directory found in ${cwd}`));
        console.error(picocolors_1.default.yellow(`Run '${picocolors_1.default.bold('tauri-custom-installer init')}' first.`));
        process.exit(1);
    }
    const isRelease = options.debug ? false : options.release !== false;
    const profileDirName = isRelease ? 'release' : 'debug';
    const targetTriple = resolveHostTargetTriple(options.arch);
    const archLabel = targetTriple.startsWith('aarch64')
        ? 'arm64'
        : targetTriple.startsWith('i686')
            ? 'x86'
            : 'x64';
    const pm = (0, config_1.detectPackageManager)(cwd);
    console.log(picocolors_1.default.cyan(`\n📦 Building Custom Installer for ${picocolors_1.default.bold(appConfig.appName)} (v${appConfig.version}, ${archLabel}, ${profileDirName})`));
    // Step 1: Build the main application if not skipped
    const mainTauriDir = node_path_1.default.join(cwd, 'src-tauri');
    if (!options.skipAppBuild && !options.dryRun && node_fs_1.default.existsSync(mainTauriDir)) {
        console.log(picocolors_1.default.blue(`\n[1/4] Compiling main application (${profileDirName})...`));
        await buildMainTauriApp(cwd, mainTauriDir, pm, isRelease);
    }
    else {
        console.log(picocolors_1.default.gray(`\n[1/4] Skipping main app compilation (${options.dryRun ? '--dry-run' : '--skip-app-build'})`));
    }
    // Step 2: Locate compiled binary files & stage payload
    console.log(picocolors_1.default.blue(`\n[2/4] Staging & compressing application payload...`));
    let releaseDir = null;
    if (node_fs_1.default.existsSync(mainTauriDir)) {
        const cargoTarget = resolveCargoTargetDir(mainTauriDir);
        const candidates = [
            node_path_1.default.join(cargoTarget, targetTriple, profileDirName),
            node_path_1.default.join(cargoTarget, profileDirName),
        ];
        for (const c of candidates) {
            if (node_fs_1.default.existsSync(c)) {
                releaseDir = c;
                break;
            }
        }
    }
    const stageDir = node_path_1.default.join(installerDir, '.payload_staging');
    const { totalUncompressedBytes, stagedFiles } = stageApplicationPayload(cwd, appConfig, releaseDir, stageDir, targetTriple);
    if (options.dryRun) {
        console.log(picocolors_1.default.cyan(`\n📋 Dry-Run Payload File Manifest (${stagedFiles.length} files):`));
        for (const f of stagedFiles) {
            console.log(`  - ${picocolors_1.default.bold(f.relPath)} (${(f.size / 1024).toFixed(1)} KB)`);
        }
        console.log(picocolors_1.default.green(`\nTotal Uncompressed Payload: ${(totalUncompressedBytes / (1024 * 1024)).toFixed(2)} MB\n`));
        node_fs_1.default.rmSync(stageDir, { recursive: true, force: true });
        return;
    }
    // Sync updated metadata and requiredBytes to installer/src/installer.config.json
    const installerConfigPath = node_path_1.default.join(installerDir, 'src', 'installer.config.json');
    if (node_fs_1.default.existsSync(node_path_1.default.dirname(installerConfigPath))) {
        const configData = {
            appName: appConfig.appName,
            appId: appConfig.identifier,
            appVersion: appConfig.version,
            publisher: appConfig.publisher,
            executableName: appConfig.executableName,
            requiredBytes: Math.max(totalUncompressedBytes, 15 * 1024 * 1024),
        };
        node_fs_1.default.writeFileSync(installerConfigPath, JSON.stringify(configData, null, 2));
    }
    const preferZstd = appConfig.compression !== 'zip';
    const payloadDir = node_path_1.default.join(installerDir, '.tci');
    node_fs_1.default.mkdirSync(payloadDir, { recursive: true });
    const payloadArchivePath = node_path_1.default.join(payloadDir, preferZstd ? 'app_payload.tar.zst' : 'app_payload.zip');
    const archiveResult = await (0, archiver_1.createPayloadArchiveDetailed)(stageDir, payloadArchivePath, preferZstd);
    console.log(picocolors_1.default.green(`✔ Payload archived (${archiveResult.format}): ${(archiveResult.compressedBytes / 1024).toFixed(1)} KB (${archiveResult.fileCount} files)`));
    // Step 3: Build installer frontend UI & pack ui.zip
    console.log(picocolors_1.default.blue(`\n[3/4] Building installer frontend UI...`));
    const installerPm = (0, config_1.detectPackageManager)(installerDir);
    await (0, exec_1.runProcess)(installerPm, ['run', 'build'], { cwd: installerDir });
    const uiDistDir = node_path_1.default.resolve(cwd, appConfig.uiOutDir || node_path_1.default.join(installerDir, 'dist'));
    const uiZipPath = node_path_1.default.join(payloadDir, 'ui.zip');
    let uiZipBytes = 0;
    if (node_fs_1.default.existsSync(uiDistDir)) {
        uiZipBytes = await (0, archiver_1.createZipArchive)(uiDistDir, uiZipPath);
    }
    // Step 4: Resolve or compile runtime stub and assemble single-file SFX executable
    console.log(picocolors_1.default.blue(`\n[4/4] Assembling standalone setup executable...`));
    const runtimeExePath = await resolveOrBuildRuntimeExecutable(cwd, installerDir, appConfig, isRelease);
    const outputDist = node_path_1.default.resolve(cwd, appConfig.outputDir || './dist');
    node_fs_1.default.mkdirSync(outputDist, { recursive: true });
    const setupExeName = `${appConfig.appName.replace(/\s+/g, '-')}-Setup-${appConfig.version}-${archLabel}.exe`;
    const finalSetupPath = node_path_1.default.join(outputDist, setupExeName);
    // Also write backward-compatible name `<App>-Setup-v<version>.exe`
    const compatSetupName = `${appConfig.appName.replace(/\s+/g, '-')}-Setup-v${appConfig.version}.exe`;
    const compatSetupPath = node_path_1.default.join(outputDist, compatSetupName);
    const embeddedManifest = {
        appName: appConfig.appName,
        appId: appConfig.identifier,
        version: appConfig.version,
        publisher: appConfig.publisher,
        executableName: appConfig.executableName,
        installMode: appConfig.installMode,
        defaultInstallDir: appConfig.defaultInstallDir ?? null,
        allowDowngrade: appConfig.allowDowngrade,
        createDesktopShortcut: appConfig.createDesktopShortcut,
        createStartMenuShortcut: appConfig.createStartMenuShortcut,
        startMenuFolder: appConfig.startMenuFolder ?? null,
        autostart: appConfig.autostart,
        runAfterInstall: appConfig.runAfterInstall,
        licenseText: appConfig.licenseText ?? null,
        uncompressedSizeBytes: archiveResult.uncompressedBytes,
        compressedSizeBytes: archiveResult.compressedBytes,
        fileCount: archiveResult.fileCount,
        payloadFormat: archiveResult.format,
        urlSchemes: appConfig.urlSchemes,
        fileAssociations: appConfig.fileAssociations,
        components: [],
        addToPath: appConfig.addToPath,
    };
    const sfxResult = (0, sfx_1.buildSfxExecutable)({
        runtimeExePath,
        uiZipPath: uiZipBytes > 0 ? uiZipPath : null,
        payloadPath: payloadArchivePath,
        manifest: embeddedManifest,
        outputExePath: finalSetupPath,
    });
    if (compatSetupPath !== finalSetupPath) {
        node_fs_1.default.copyFileSync(finalSetupPath, compatSetupPath);
    }
    // Optional Code Signing
    let signStatus = 'Unsigned (no signCommand configured)';
    if (options.sign !== false && (appConfig.signCommand || appConfig.certificateThumbprint)) {
        signStatus = await signExecutableIfConfigured(finalSetupPath, appConfig);
        if (compatSetupPath !== finalSetupPath) {
            node_fs_1.default.copyFileSync(finalSetupPath, compatSetupPath);
        }
    }
    // Optional Updater Artifact (`latest.json`)
    if (appConfig.createUpdaterArtifacts) {
        const latestJson = {
            version: appConfig.version,
            notes: `${appConfig.appName} v${appConfig.version}`,
            pub_date: new Date().toISOString(),
            platforms: {
                [`windows-${archLabel === 'arm64' ? 'aarch64' : archLabel === 'x86' ? 'i686' : 'x86_64'}`]: {
                    signature: sfxResult.setupSha256Hex,
                    url: setupExeName,
                },
            },
        };
        node_fs_1.default.writeFileSync(node_path_1.default.join(outputDist, 'latest.json'), JSON.stringify(latestJson, null, 2));
    }
    // Clean temporary staging
    if (node_fs_1.default.existsSync(stageDir)) {
        node_fs_1.default.rmSync(stageDir, { recursive: true, force: true });
    }
    if (node_fs_1.default.existsSync(payloadDir)) {
        node_fs_1.default.rmSync(payloadDir, { recursive: true, force: true });
    }
    const ratio = archiveResult.uncompressedBytes > 0
        ? ((archiveResult.compressedBytes / archiveResult.uncompressedBytes) * 100).toFixed(1)
        : '100.0';
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(picocolors_1.default.green(`\n🎉 Custom Installer build complete in ${elapsedSec}s!`));
    console.log(picocolors_1.default.cyan(`┌──────────────────────────────────────────────────────────────`));
    console.log(`${picocolors_1.default.cyan('│')} ${picocolors_1.default.bold('Output File:')}      ${picocolors_1.default.cyan(finalSetupPath)}`);
    console.log(`${picocolors_1.default.cyan('│')} ${picocolors_1.default.bold('Payload Size:')}     ${(archiveResult.uncompressedBytes / 1024).toFixed(1)} KB → ${(archiveResult.compressedBytes / 1024).toFixed(1)} KB (${ratio}%, ${archiveResult.format})`);
    console.log(`${picocolors_1.default.cyan('│')} ${picocolors_1.default.bold('UI Bundle Size:')}   ${(sfxResult.uiBytes / 1024).toFixed(1)} KB`);
    console.log(`${picocolors_1.default.cyan('│')} ${picocolors_1.default.bold('Setup .exe Size:')}  ${(sfxResult.totalExeBytes / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`${picocolors_1.default.cyan('│')} ${picocolors_1.default.bold('Code Signing:')}     ${signStatus}`);
    console.log(`${picocolors_1.default.cyan('│')} ${picocolors_1.default.bold('SHA-256:')}          ${sfxResult.setupSha256Hex}`);
    console.log(picocolors_1.default.cyan(`└──────────────────────────────────────────────────────────────\n`));
}
async function buildMainTauriApp(cwd, mainTauriDir, pm, isRelease) {
    // Check if `@tauri-apps/cli` is installed in project or `cargo-tauri` is available
    const hasLocalTauriCli = node_fs_1.default.existsSync(node_path_1.default.join(cwd, 'node_modules', '.bin', 'tauri')) ||
        node_fs_1.default.existsSync(node_path_1.default.join(cwd, 'node_modules', '.bin', 'tauri.cmd'));
    const tauriArgs = ['tauri', 'build', '--no-bundle', ...(isRelease ? [] : ['--debug'])];
    if (hasLocalTauriCli) {
        const runner = pm === 'bun' ? 'bunx' : 'npx';
        await (0, exec_1.runProcess)(runner, tauriArgs, { cwd });
        return;
    }
    if ((0, exec_1.tryExecOutput)('cargo', ['tauri', '-V'], cwd)) {
        await (0, exec_1.runProcess)('cargo', tauriArgs, { cwd });
        return;
    }
    // Fallback when neither @tauri-apps/cli nor cargo-tauri is installed:
    // Run `beforeBuildCommand` from tauri.conf.json first so frontend assets exist, then compile with cargo
    const tauriConfPath = node_path_1.default.join(mainTauriDir, 'tauri.conf.json');
    if (node_fs_1.default.existsSync(tauriConfPath)) {
        try {
            const conf = JSON.parse(node_fs_1.default.readFileSync(tauriConfPath, 'utf8'));
            const beforeBuild = conf.build?.beforeBuildCommand;
            if (typeof beforeBuild === 'string' && beforeBuild.trim().length > 0) {
                const parts = beforeBuild.trim().split(/\s+/);
                await (0, exec_1.runProcess)(parts[0], parts.slice(1), { cwd });
            }
        }
        catch {
            // ignore
        }
    }
    const cargoArgs = ['build', ...(isRelease ? ['--release'] : [])];
    await (0, exec_1.runProcess)('cargo', cargoArgs, { cwd: mainTauriDir });
}
async function resolveOrBuildRuntimeExecutable(cwd, installerDir, appConfig, isRelease) {
    const profileDirName = isRelease ? 'release' : 'debug';
    // 1. Explicit TCI_RUNTIME_PATH environment variable
    if (process.env.TCI_RUNTIME_PATH && node_fs_1.default.existsSync(process.env.TCI_RUNTIME_PATH)) {
        return process.env.TCI_RUNTIME_PATH;
    }
    // 2. Packaged prebuilt runtime inside CLI vendor folder
    const vendorRuntime = node_path_1.default.resolve(__dirname, '..', 'vendor', 'runtime', 'tci-runtime.exe');
    if (node_fs_1.default.existsSync(vendorRuntime)) {
        return vendorRuntime;
    }
    // 3. If installer/src-tauri exists, build or reuse its binary
    const installerTauriDir = node_path_1.default.join(installerDir, 'src-tauri');
    if (node_fs_1.default.existsSync(installerTauriDir)) {
        // Ensure placeholder payload exists for legacy build.rs if present
        const legacyPayloadDir = node_path_1.default.join(installerTauriDir, 'payload');
        node_fs_1.default.mkdirSync(legacyPayloadDir, { recursive: true });
        const legacyZip = node_path_1.default.join(legacyPayloadDir, 'app_payload.zip');
        if (!node_fs_1.default.existsSync(legacyZip)) {
            const emptyZip = Buffer.from([
                0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            ]);
            node_fs_1.default.writeFileSync(legacyZip, emptyZip);
        }
        const cargoToml = node_fs_1.default.readFileSync(node_path_1.default.join(installerTauriDir, 'Cargo.toml'), 'utf8');
        const pkgMatch = cargoToml.match(/^\s*name\s*=\s*"([^"]+)"/m);
        const exactBinName = pkgMatch?.[1] ? `${pkgMatch[1]}.exe` : null;
        const targetDir = resolveCargoTargetDir(installerTauriDir);
        const binDir = node_path_1.default.join(targetDir, profileDirName);
        // Check if prebuilt `tci-runtime.exe` already exists in workspace target dir
        const prebuiltRuntime = node_path_1.default.join(binDir, 'tci-runtime.exe');
        if (node_fs_1.default.existsSync(prebuiltRuntime)) {
            return prebuiltRuntime;
        }
        await (0, exec_1.runProcess)('cargo', ['build', ...(isRelease ? ['--release'] : [])], {
            cwd: installerTauriDir,
        });
        if (exactBinName && node_fs_1.default.existsSync(node_path_1.default.join(binDir, exactBinName))) {
            return node_path_1.default.join(binDir, exactBinName);
        }
        if (node_fs_1.default.existsSync(binDir)) {
            const files = node_fs_1.default.readdirSync(binDir);
            const found = files.find((f) => f.endsWith('.exe') &&
                !f.includes('uninstall') &&
                !f.startsWith('build-script') &&
                (f.includes('installer') ||
                    f.includes('runtime') ||
                    f.toLowerCase().includes(appConfig.appName.toLowerCase().replace(/[^a-z0-9]/g, ''))));
            if (found) {
                return node_path_1.default.join(binDir, found);
            }
        }
    }
    throw new Error(`Could not locate or build installer runtime executable. Set TCI_RUNTIME_PATH or ensure Rust/Cargo is installed.`);
}
async function signExecutableIfConfigured(exePath, appConfig) {
    try {
        if (appConfig.signCommand) {
            const cmdStr = appConfig.signCommand.includes('%1')
                ? appConfig.signCommand.replace(/%1/g, `"${exePath}"`)
                : `${appConfig.signCommand} "${exePath}"`;
            const parts = cmdStr.split(/\s+/);
            await (0, exec_1.runProcess)(parts[0], parts.slice(1));
            return 'Signed (custom signCommand)';
        }
        if (appConfig.certificateThumbprint) {
            const args = [
                'sign',
                '/sha1',
                appConfig.certificateThumbprint,
                '/fd',
                'SHA256',
                ...(appConfig.timestampUrl
                    ? ['/tr', appConfig.timestampUrl, '/td', 'SHA256']
                    : []),
                exePath,
            ];
            await (0, exec_1.runProcess)('signtool', args);
            return `Signed (thumbprint ${appConfig.certificateThumbprint.slice(0, 8)}...)`;
        }
    }
    catch (err) {
        return `Signing failed (${err instanceof Error ? err.message : String(err)})`;
    }
    return 'Unsigned';
}
