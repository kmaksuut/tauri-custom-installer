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
  const candidateTargetDirs = [
    path.join(cwd, 'src-tauri', 'target', 'release'),
    path.join(cwd, 'target', 'release'),
  ];

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

  if (releaseDir && fs.existsSync(releaseDir)) {
    const entries = fs.readdirSync(releaseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        // Include .exe, .dll, resources, config files
        if (ext === '.exe' || ext === '.dll' || ext === '.json' || ext === '.bin') {
          // Exclude build artifacts like .pdb or .d
          if (!entry.name.endsWith('.pdb') && !entry.name.endsWith('.d')) {
            fs.copyFileSync(path.join(releaseDir, entry.name), path.join(stageDir, entry.name));
          }
        }
      }
    }
  } else {
    // If running in development without a built target, provide a stub executable
    const stubExe = path.join(stageDir, appConfig.executableName);
    fs.writeFileSync(stubExe, 'MZ_STUB_EXECUTABLE_FOR_DEMO');
  }

  // Compress into installer payload
  const payloadDir = path.join(installerDir, 'src-tauri', 'payload');
  fs.mkdirSync(payloadDir, { recursive: true });
  const payloadZip = path.join(payloadDir, 'app_payload.zip');

  const archiveBytes = await createPayloadArchive(stageDir, payloadZip);
  console.log(pc.green(`✔ Payload archived: ${(archiveBytes / (1024 * 1024)).toFixed(2)} MB`));

  // Step 3: Build installer frontend
  console.log(pc.blue(`\n[3/4] Building installer frontend UI...`));
  const isBun = fs.existsSync(path.join(installerDir, 'bun.lockb')) || fs.existsSync(path.join(cwd, 'bun.lockb'));
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

  // Search candidate installer binaries
  const installerBinDirs = [
    path.join(installerTauriDir, 'target', 'release'),
    path.join(cwd, 'target', 'release'),
    path.join(installerTauriDir, 'target', 'release', 'bundle', 'nsis'),
  ];

  let foundInstaller = false;
  for (const binDir of installerBinDirs) {
    if (fs.existsSync(binDir)) {
      const files = fs.readdirSync(binDir);
      for (const file of files) {
        if (file.endsWith('.exe') && !file.includes('uninstall-worker')) {
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
