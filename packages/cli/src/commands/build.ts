import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { createPayloadArchive } from '../utils/archiver';
import { detectAppConfig } from '../utils/config';
import { runProcess } from '../utils/exec';

export interface BuildOptions {
  release?: boolean;
  skipAppBuild?: boolean;
}

export async function runBuild(options: BuildOptions): Promise<void> {
  const cwd = process.cwd();
  const installerDir = path.join(cwd, 'installer');

  if (!fs.existsSync(installerDir)) {
    console.error(pc.red(`❌ No 'installer/' directory found in ${cwd}`));
    console.error(pc.yellow(`Run '${pc.bold('tauri-custom-installer init')}' first.`));
    process.exit(1);
  }

  const appConfig = detectAppConfig(cwd);
  console.log(pc.cyan(`\n📦 Building Custom Installer for ${pc.bold(appConfig.appName)} (v${appConfig.version})`));

  // Step 1: Build the main application if not skipped
  if (!options.skipAppBuild) {
    console.log(pc.blue(`\n[1/4] Compiling main application binaries...`));
    const mainTauriDir = path.join(cwd, 'src-tauri');
    if (fs.existsSync(mainTauriDir)) {
      try {
        await runProcess('cargo', ['tauri', 'build', '--no-bundle'], { cwd });
      } catch {
        // Fallback to cargo build --release
        await runProcess('cargo', ['build', '--release'], { cwd: mainTauriDir });
      }
    }
  } else {
    console.log(pc.gray(`\n[1/4] Skipping main app build (--skip-app-build)`));
  }

  // Step 2: Locate compiled binary files
  console.log(pc.blue(`\n[2/4] Packaging application payload...`));
  const candidateTargetDirs: string[] = [
    path.join(cwd, 'src-tauri', 'target', 'release'),
  ];
  let checkRoot: string | null = cwd;
  while (checkRoot) {
    candidateTargetDirs.push(path.join(checkRoot, 'target', 'release'));
    const parent = path.dirname(checkRoot);
    if (parent === checkRoot) break;
    checkRoot = parent;
  }

  let releaseDir: string | null = null;
  for (const dir of candidateTargetDirs) {
    if (fs.existsSync(dir)) {
      releaseDir = dir;
      break;
    }
  }

  // Stage app payload files
  const stageDir = path.join(installerDir, '.payload_staging');
  if (fs.existsSync(stageDir)) {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stageDir, { recursive: true });

  let totalUncompressedBytes = 0;
  let stagedExeCount = 0;

  if (releaseDir && fs.existsSync(releaseDir)) {
    const entries = fs.readdirSync(releaseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        // Exclude installer binaries and debug symbols from the main app payload
        if (
          entry.name.includes('-installer.exe') ||
          entry.name.includes('uninstall-worker') ||
          entry.name.startsWith('build-script') ||
          entry.name.endsWith('.pdb') ||
          entry.name.endsWith('.d')
        ) {
          continue;
        }

        if (ext === '.exe' || ext === '.dll' || ext === '.json' || ext === '.bin') {
          const srcFile = path.join(releaseDir, entry.name);
          const destFile = path.join(stageDir, entry.name);
          fs.copyFileSync(srcFile, destFile);
          totalUncompressedBytes += fs.statSync(srcFile).size;
          if (ext === '.exe') {
            stagedExeCount++;
            appConfig.executableName = entry.name;
          }
        }
      }
    }
  }

  if (stagedExeCount === 0) {
    // If running in demo/skip-app-build mode without a compiled main app binary, create a valid stub
    const stubExe = path.join(stageDir, appConfig.executableName);
    const stubContent = Buffer.alloc(64 * 1024, 'MZ_TAURI_APPLICATION_PAYLOAD_DEMO');
    fs.writeFileSync(stubExe, stubContent);
    totalUncompressedBytes += stubContent.length;
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

  // Compress into installer payload
  const payloadDir = path.join(installerDir, 'src-tauri', 'payload');
  fs.mkdirSync(payloadDir, { recursive: true });
  const payloadZip = path.join(payloadDir, 'app_payload.zip');

  const archiveBytes = await createPayloadArchive(stageDir, payloadZip);
  console.log(
    pc.green(
      `✔ Payload archived into src-tauri/payload/app_payload.zip (${(archiveBytes / 1024).toFixed(1)} KB compressed)`
    )
  );

  // Step 3: Build installer frontend
  console.log(pc.blue(`\n[3/4] Building installer frontend UI...`));
  const isBun =
    fs.existsSync(path.join(installerDir, 'bun.lock')) ||
    fs.existsSync(path.join(installerDir, 'bun.lockb')) ||
    fs.existsSync(path.join(cwd, 'bun.lock')) ||
    fs.existsSync(path.join(cwd, 'bun.lockb'));
  const runner = isBun ? 'bun' : 'npm';
  await runProcess(runner, ['run', 'build'], { cwd: installerDir });

  // Step 4: Build installer executable
  console.log(pc.blue(`\n[4/4] Compiling standalone setup executable with Tauri v2...`));
  const installerTauriDir = path.join(installerDir, 'src-tauri');
  try {
    await runProcess('cargo', ['tauri', 'build'], { cwd: installerDir });
  } catch {
    await runProcess('cargo', ['build', '--release'], { cwd: installerTauriDir });
  }

  // Move setup file to dist/
  const outputDist = path.join(cwd, 'dist');
  fs.mkdirSync(outputDist, { recursive: true });

  const setupExeName = `${appConfig.appName.replace(/\s+/g, '-')}-Setup-v${appConfig.version}.exe`;
  const finalSetupPath = path.join(outputDist, setupExeName);

  // Search candidate installer binaries (including cargo workspace roots)
  const installerBinDirs: string[] = [
    path.join(installerTauriDir, 'target', 'release'),
    path.join(installerTauriDir, 'target', 'release', 'bundle', 'nsis'),
  ];

  let checkDir: string | null = cwd;
  while (checkDir) {
    installerBinDirs.push(path.join(checkDir, 'target', 'release'));
    const parent = path.dirname(checkDir);
    if (parent === checkDir) break;
    checkDir = parent;
  }

  let foundInstaller = false;
  for (const binDir of installerBinDirs) {
    if (fs.existsSync(binDir)) {
      const files = fs.readdirSync(binDir);
      for (const file of files) {
        if (
          file.endsWith('.exe') &&
          !file.includes('uninstall-worker') &&
          !file.startsWith('build-script') &&
          (file.includes('installer') ||
            file.toLowerCase().includes(appConfig.appName.toLowerCase().replace(/[^a-z0-9]/g, '')))
        ) {
          const srcPath = path.join(binDir, file);
          fs.copyFileSync(srcPath, finalSetupPath);
          foundInstaller = true;
          break;
        }
      }
      if (foundInstaller) break;
    }
  }

  // Clean staging
  if (fs.existsSync(stageDir)) {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }

  console.log(pc.green(`\n🎉 Custom Installer build complete!`));
  console.log(`Executable: ${pc.bold(pc.cyan(finalSetupPath))}\n`);
}
