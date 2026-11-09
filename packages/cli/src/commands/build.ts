import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { createPayloadArchiveDetailed, createZipArchive } from '../utils/archiver';
import { type AppConfig, detectAppConfig, detectPackageManager } from '../utils/config';
import { runProcess, tryExecOutput } from '../utils/exec';
import { buildSfxExecutable } from '../utils/sfx';

export interface BuildOptions {
  release?: boolean;
  debug?: boolean;
  skipAppBuild?: boolean;
  arch?: string;
  sign?: boolean;
  dryRun?: boolean;
}

interface StagedFileInfo {
  relPath: string;
  size: number;
}

function resolveCargoTargetDir(cargoDir: string): string {
  const metaJson = tryExecOutput(
    'cargo',
    ['metadata', '--format-version', '1', '--no-deps'],
    cargoDir
  );
  if (metaJson) {
    try {
      const parsed = JSON.parse(metaJson);
      if (parsed.target_directory && fs.existsSync(parsed.target_directory)) {
        return parsed.target_directory;
      }
    } catch {
      // ignore
    }
  }
  return path.join(cargoDir, 'target');
}

function resolveHostTargetTriple(archOverride?: string): string {
  if (archOverride === 'arm64' || archOverride === 'aarch64-pc-windows-msvc') {
    return 'aarch64-pc-windows-msvc';
  }
  if (archOverride === 'x86' || archOverride === 'i686-pc-windows-msvc') {
    return 'i686-pc-windows-msvc';
  }
  if (archOverride === 'x64' || archOverride === 'x86_64-pc-windows-msvc') {
    return 'x86_64-pc-windows-msvc';
  }
  const rustcInfo = tryExecOutput('rustc', ['-vV']);
  if (rustcInfo) {
    const match = rustcInfo.match(/^host:\s*(\S+)/m);
    if (match?.[1]) return match[1];
  }
  return 'x86_64-pc-windows-msvc';
}

function stageApplicationPayload(
  cwd: string,
  appConfig: AppConfig,
  releaseDir: string | null,
  stageDir: string,
  targetTriple: string
): { totalUncompressedBytes: number; stagedFiles: StagedFileInfo[] } {
  if (fs.existsSync(stageDir)) {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stageDir, { recursive: true });

  const stagedFiles: StagedFileInfo[] = [];
  let totalUncompressedBytes = 0;
  let mainBinaryStaged = false;

  const copyIntoStage = (srcFile: string, relDest: string) => {
    if (!fs.existsSync(srcFile) || !fs.statSync(srcFile).isFile()) return false;
    const destPath = path.join(stageDir, relDest);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcFile, destPath);
    const size = fs.statSync(srcFile).size;
    totalUncompressedBytes += size;
    stagedFiles.push({ relPath: relDest.replace(/\\/g, '/'), size });
    return true;
  };

  if (releaseDir && fs.existsSync(releaseDir)) {
    // 1. Stage main application binary
    const expectedMainExe = path.join(releaseDir, appConfig.executableName);
    if (copyIntoStage(expectedMainExe, appConfig.executableName)) {
      mainBinaryStaged = true;
    } else {
      // Fallback: find the primary non-installer executable in releaseDir
      const entries = fs.readdirSync(releaseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.isFile() &&
          entry.name.toLowerCase().endsWith('.exe') &&
          !entry.name.includes('-installer') &&
          !entry.name.includes('tci-runtime') &&
          !entry.name.includes('uninstall') &&
          !entry.name.startsWith('build-script')
        ) {
          if (copyIntoStage(path.join(releaseDir, entry.name), entry.name)) {
            appConfig.executableName = entry.name;
            mainBinaryStaged = true;
            break;
          }
        }
      }
    }

    // 2. Stage runtime DLLs (e.g., WebView2Loader.dll, ffmpeg.dll) next to the main binary
    const entries = fs.readdirSync(releaseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.dll')) {
        copyIntoStage(path.join(releaseDir, entry.name), entry.name);
      }
    }
  }

  // 3. Stage `bundle.externalBin` sidecars (stripping `-${targetTriple}` suffix per Tauri convention)
  const mainTauriDir = path.join(cwd, 'src-tauri');
  for (const extBin of appConfig.externalBin) {
    const cleanRel = extBin.replace(/\.exe$/i, '');
    const withTriple = path.resolve(mainTauriDir, `${cleanRel}-${targetTriple}.exe`);
    const plain = path.resolve(mainTauriDir, `${cleanRel}.exe`);
    const destName = `${path.basename(cleanRel)}.exe`;
    if (fs.existsSync(withTriple)) {
      copyIntoStage(withTriple, destName);
    } else if (fs.existsSync(plain)) {
      copyIntoStage(plain, destName);
    }
  }

  // 4. Stage `bundle.resources`
  if (Array.isArray(appConfig.resources)) {
    for (const resItem of appConfig.resources) {
      const srcPath = path.resolve(mainTauriDir, resItem);
      if (fs.existsSync(srcPath)) {
        if (fs.statSync(srcPath).isFile()) {
          copyIntoStage(srcPath, path.basename(srcPath));
        } else if (fs.statSync(srcPath).isDirectory()) {
          copyDirIntoStage(srcPath, path.basename(srcPath), copyIntoStage);
        }
      }
    }
  } else if (appConfig.resources && typeof appConfig.resources === 'object') {
    for (const [srcRel, destRel] of Object.entries(appConfig.resources)) {
      const srcPath = path.resolve(mainTauriDir, srcRel);
      if (fs.existsSync(srcPath)) {
        if (fs.statSync(srcPath).isFile()) {
          copyIntoStage(srcPath, destRel);
        } else if (fs.statSync(srcPath).isDirectory()) {
          copyDirIntoStage(srcPath, destRel, copyIntoStage);
        }
      }
    }
  }

  // 5. If running in --skip-app-build demo mode and no binary exists yet, create a valid demo stub
  if (!mainBinaryStaged) {
    const stubExe = path.join(stageDir, appConfig.executableName);
    const stubContent = Buffer.alloc(64 * 1024, 'MZ_TAURI_APPLICATION_PAYLOAD_DEMO');
    fs.writeFileSync(stubExe, stubContent);
    totalUncompressedBytes += stubContent.length;
    stagedFiles.push({ relPath: appConfig.executableName, size: stubContent.length });
  }

  return { totalUncompressedBytes, stagedFiles };
}

function copyDirIntoStage(
  srcDir: string,
  destRelPrefix: string,
  copyIntoStage: (src: string, rel: string) => boolean
) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullSrc = path.join(srcDir, entry.name);
    const relTarget = path.join(destRelPrefix, entry.name);
    if (entry.isDirectory()) {
      copyDirIntoStage(fullSrc, relTarget, copyIntoStage);
    } else if (entry.isFile()) {
      copyIntoStage(fullSrc, relTarget);
    }
  }
}

export async function runBuild(options: BuildOptions): Promise<void> {
  const startTime = Date.now();
  const cwd = process.cwd();
  const appConfig = detectAppConfig(cwd);
  const installerDir = path.resolve(cwd, appConfig.uiRoot || './installer');

  if (!fs.existsSync(installerDir)) {
    console.error(pc.red(`❌ No '${appConfig.uiRoot}' directory found in ${cwd}`));
    console.error(pc.yellow(`Run '${pc.bold('tauri-custom-installer init')}' first.`));
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
  const pm = detectPackageManager(cwd);

  console.log(
    pc.cyan(
      `\n📦 Building Custom Installer for ${pc.bold(appConfig.appName)} (v${appConfig.version}, ${archLabel}, ${profileDirName})`
    )
  );

  // Step 1: Build the main application if not skipped
  const mainTauriDir = path.join(cwd, 'src-tauri');
  if (!options.skipAppBuild && !options.dryRun && fs.existsSync(mainTauriDir)) {
    console.log(pc.blue(`\n[1/4] Compiling main application (${profileDirName})...`));
    await buildMainTauriApp(cwd, mainTauriDir, pm, isRelease);
  } else {
    console.log(
      pc.gray(
        `\n[1/4] Skipping main app compilation (${options.dryRun ? '--dry-run' : '--skip-app-build'})`
      )
    );
  }

  // Step 2: Locate compiled binary files & stage payload
  console.log(pc.blue(`\n[2/4] Staging & compressing application payload...`));
  let releaseDir: string | null = null;
  if (fs.existsSync(mainTauriDir)) {
    const cargoTarget = resolveCargoTargetDir(mainTauriDir);
    const candidates = [
      path.join(cargoTarget, targetTriple, profileDirName),
      path.join(cargoTarget, profileDirName),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        releaseDir = c;
        break;
      }
    }
  }

  const stageDir = path.join(installerDir, '.payload_staging');
  const { totalUncompressedBytes, stagedFiles } = stageApplicationPayload(
    cwd,
    appConfig,
    releaseDir,
    stageDir,
    targetTriple
  );

  if (options.dryRun) {
    console.log(pc.cyan(`\n📋 Dry-Run Payload File Manifest (${stagedFiles.length} files):`));
    for (const f of stagedFiles) {
      console.log(`  - ${pc.bold(f.relPath)} (${(f.size / 1024).toFixed(1)} KB)`);
    }
    console.log(
      pc.green(
        `\nTotal Uncompressed Payload: ${(totalUncompressedBytes / (1024 * 1024)).toFixed(2)} MB\n`
      )
    );
    fs.rmSync(stageDir, { recursive: true, force: true });
    return;
  }

  // Sync updated metadata and requiredBytes to installer/src/installer.config.json
  const installerConfigPath = path.join(installerDir, 'src', 'installer.config.json');
  if (fs.existsSync(path.dirname(installerConfigPath))) {
    const configData = {
      appName: appConfig.appName,
      appId: appConfig.identifier,
      appVersion: appConfig.version,
      publisher: appConfig.publisher,
      executableName: appConfig.executableName,
      requiredBytes: Math.max(totalUncompressedBytes, 15 * 1024 * 1024),
    };
    fs.writeFileSync(installerConfigPath, JSON.stringify(configData, null, 2));
  }

  const preferZstd = appConfig.compression !== 'zip';
  const payloadDir = path.join(installerDir, '.tci');
  fs.mkdirSync(payloadDir, { recursive: true });
  const payloadArchivePath = path.join(
    payloadDir,
    preferZstd ? 'app_payload.tar.zst' : 'app_payload.zip'
  );

  const archiveResult = await createPayloadArchiveDetailed(
    stageDir,
    payloadArchivePath,
    preferZstd
  );
  console.log(
    pc.green(
      `✔ Payload archived (${archiveResult.format}): ${(archiveResult.compressedBytes / 1024).toFixed(1)} KB (${archiveResult.fileCount} files)`
    )
  );

  // Step 3: Build installer frontend UI & pack ui.zip
  console.log(pc.blue(`\n[3/4] Building installer frontend UI...`));
  const installerPm = detectPackageManager(installerDir);
  await runProcess(installerPm, ['run', 'build'], { cwd: installerDir });

  const uiDistDir = path.resolve(cwd, appConfig.uiOutDir || path.join(installerDir, 'dist'));
  const uiZipPath = path.join(payloadDir, 'ui.zip');
  let uiZipBytes = 0;
  if (fs.existsSync(uiDistDir)) {
    uiZipBytes = await createZipArchive(uiDistDir, uiZipPath);
  }

  // Step 4: Resolve or compile runtime stub and assemble single-file SFX executable
  console.log(pc.blue(`\n[4/4] Assembling standalone setup executable...`));
  const runtimeExePath = await resolveOrBuildRuntimeExecutable(
    cwd,
    installerDir,
    appConfig,
    isRelease
  );

  const outputDist = path.resolve(cwd, appConfig.outputDir || './dist');
  fs.mkdirSync(outputDist, { recursive: true });

  const setupExeName = `${appConfig.appName.replace(/\s+/g, '-')}-Setup-${appConfig.version}-${archLabel}.exe`;
  const finalSetupPath = path.join(outputDist, setupExeName);

  // Also write backward-compatible name `<App>-Setup-v<version>.exe`
  const compatSetupName = `${appConfig.appName.replace(/\s+/g, '-')}-Setup-v${appConfig.version}.exe`;
  const compatSetupPath = path.join(outputDist, compatSetupName);

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

  const sfxResult = buildSfxExecutable({
    runtimeExePath,
    uiZipPath: uiZipBytes > 0 ? uiZipPath : null,
    payloadPath: payloadArchivePath,
    manifest: embeddedManifest,
    outputExePath: finalSetupPath,
  });

  if (compatSetupPath !== finalSetupPath) {
    fs.copyFileSync(finalSetupPath, compatSetupPath);
  }

  // Optional Code Signing
  let signStatus = 'Unsigned (no signCommand configured)';
  if (options.sign !== false && (appConfig.signCommand || appConfig.certificateThumbprint)) {
    signStatus = await signExecutableIfConfigured(finalSetupPath, appConfig);
    if (compatSetupPath !== finalSetupPath) {
      fs.copyFileSync(finalSetupPath, compatSetupPath);
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
    fs.writeFileSync(
      path.join(outputDist, 'latest.json'),
      JSON.stringify(latestJson, null, 2)
    );
  }

  // Clean temporary staging
  if (fs.existsSync(stageDir)) {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
  if (fs.existsSync(payloadDir)) {
    fs.rmSync(payloadDir, { recursive: true, force: true });
  }

  const ratio =
    archiveResult.uncompressedBytes > 0
      ? ((archiveResult.compressedBytes / archiveResult.uncompressedBytes) * 100).toFixed(1)
      : '100.0';
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(pc.green(`\n🎉 Custom Installer build complete in ${elapsedSec}s!`));
  console.log(pc.cyan(`┌──────────────────────────────────────────────────────────────`));
  console.log(
    `${pc.cyan('│')} ${pc.bold('Output File:')}      ${pc.cyan(finalSetupPath)}`
  );
  console.log(
    `${pc.cyan('│')} ${pc.bold('Payload Size:')}     ${(archiveResult.uncompressedBytes / 1024).toFixed(1)} KB → ${(archiveResult.compressedBytes / 1024).toFixed(1)} KB (${ratio}%, ${archiveResult.format})`
  );
  console.log(
    `${pc.cyan('│')} ${pc.bold('UI Bundle Size:')}   ${(sfxResult.uiBytes / 1024).toFixed(1)} KB`
  );
  console.log(
    `${pc.cyan('│')} ${pc.bold('Setup .exe Size:')}  ${(sfxResult.totalExeBytes / (1024 * 1024)).toFixed(2)} MB`
  );
  console.log(`${pc.cyan('│')} ${pc.bold('Code Signing:')}     ${signStatus}`);
  console.log(`${pc.cyan('│')} ${pc.bold('SHA-256:')}          ${sfxResult.setupSha256Hex}`);
  console.log(pc.cyan(`└──────────────────────────────────────────────────────────────\n`));
}

async function buildMainTauriApp(
  cwd: string,
  mainTauriDir: string,
  pm: string,
  isRelease: boolean
): Promise<void> {
  // Check if `@tauri-apps/cli` is installed in project or `cargo-tauri` is available
  const hasLocalTauriCli =
    fs.existsSync(path.join(cwd, 'node_modules', '.bin', 'tauri')) ||
    fs.existsSync(path.join(cwd, 'node_modules', '.bin', 'tauri.cmd'));
  const tauriArgs = ['tauri', 'build', '--no-bundle', ...(isRelease ? [] : ['--debug'])];

  if (hasLocalTauriCli) {
    const runner = pm === 'bun' ? 'bunx' : 'npx';
    await runProcess(runner, tauriArgs, { cwd });
    return;
  }

  if (tryExecOutput('cargo', ['tauri', '-V'], cwd)) {
    await runProcess('cargo', tauriArgs, { cwd });
    return;
  }

  // Fallback when neither @tauri-apps/cli nor cargo-tauri is installed:
  // Run `beforeBuildCommand` from tauri.conf.json first so frontend assets exist, then compile with cargo
  const tauriConfPath = path.join(mainTauriDir, 'tauri.conf.json');
  if (fs.existsSync(tauriConfPath)) {
    try {
      const conf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
      const beforeBuild = conf.build?.beforeBuildCommand;
      if (typeof beforeBuild === 'string' && beforeBuild.trim().length > 0) {
        const parts = beforeBuild.trim().split(/\s+/);
        await runProcess(parts[0], parts.slice(1), { cwd });
      }
    } catch {
      // ignore
    }
  }

  const cargoArgs = [
    'build',
    ...(isRelease ? ['--release'] : []),
    '--features',
    'tauri/custom-protocol',
  ];
  await runProcess('cargo', cargoArgs, { cwd: mainTauriDir });
}

async function resolveOrBuildRuntimeExecutable(
  cwd: string,
  installerDir: string,
  appConfig: AppConfig,
  isRelease: boolean
): Promise<string> {
  const profileDirName = isRelease ? 'release' : 'debug';

  // 1. Explicit TCI_RUNTIME_PATH environment variable
  if (process.env.TCI_RUNTIME_PATH && fs.existsSync(process.env.TCI_RUNTIME_PATH)) {
    return process.env.TCI_RUNTIME_PATH;
  }

  // 2. Packaged prebuilt runtime inside CLI vendor folder
  const vendorRuntime = path.resolve(__dirname, '..', 'vendor', 'runtime', 'tci-runtime.exe');
  if (fs.existsSync(vendorRuntime)) {
    return vendorRuntime;
  }

  // 3. If installer/src-tauri exists, build or reuse its binary
  const installerTauriDir = path.join(installerDir, 'src-tauri');
  if (fs.existsSync(installerTauriDir)) {
    // Ensure placeholder payload exists for legacy build.rs if present
    const legacyPayloadDir = path.join(installerTauriDir, 'payload');
    fs.mkdirSync(legacyPayloadDir, { recursive: true });
    const legacyZip = path.join(legacyPayloadDir, 'app_payload.zip');
    if (!fs.existsSync(legacyZip)) {
      const emptyZip = Buffer.from([
        0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]);
      fs.writeFileSync(legacyZip, emptyZip);
    }

    const cargoToml = fs.readFileSync(path.join(installerTauriDir, 'Cargo.toml'), 'utf8');
    const pkgMatch = cargoToml.match(/^\s*name\s*=\s*"([^"]+)"/m);
    const exactBinName = pkgMatch?.[1] ? `${pkgMatch[1]}.exe` : null;

    const targetDir = resolveCargoTargetDir(installerTauriDir);
    const binDir = path.join(targetDir, profileDirName);

    // Check if prebuilt `tci-runtime.exe` already exists in workspace target dir
    const prebuiltRuntime = path.join(binDir, 'tci-runtime.exe');
    if (fs.existsSync(prebuiltRuntime)) {
      return prebuiltRuntime;
    }

    await runProcess(
      'cargo',
      ['build', ...(isRelease ? ['--release'] : []), '--features', 'tauri/custom-protocol'],
      {
        cwd: installerTauriDir,
      }
    );

    if (exactBinName && fs.existsSync(path.join(binDir, exactBinName))) {
      return path.join(binDir, exactBinName);
    }

    if (fs.existsSync(binDir)) {
      const files = fs.readdirSync(binDir);
      const found = files.find(
        (f) =>
          f.endsWith('.exe') &&
          !f.includes('uninstall') &&
          !f.startsWith('build-script') &&
          (f.includes('installer') ||
            f.includes('runtime') ||
            f.toLowerCase().includes(appConfig.appName.toLowerCase().replace(/[^a-z0-9]/g, '')))
      );
      if (found) {
        return path.join(binDir, found);
      }
    }
  }

  throw new Error(
    `Could not locate or build installer runtime executable. Set TCI_RUNTIME_PATH or ensure Rust/Cargo is installed.`
  );
}

async function signExecutableIfConfigured(
  exePath: string,
  appConfig: AppConfig
): Promise<string> {
  try {
    if (appConfig.signCommand) {
      const cmdStr = appConfig.signCommand.includes('%1')
        ? appConfig.signCommand.replace(/%1/g, `"${exePath}"`)
        : `${appConfig.signCommand} "${exePath}"`;
      const parts = cmdStr.split(/\s+/);
      await runProcess(parts[0], parts.slice(1));
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
      await runProcess('signtool', args);
      return `Signed (thumbprint ${appConfig.certificateThumbprint.slice(0, 8)}...)`;
    }
  } catch (err: unknown) {
    return `Signing failed (${err instanceof Error ? err.message : String(err)})`;
  }
  return 'Unsigned';
}
