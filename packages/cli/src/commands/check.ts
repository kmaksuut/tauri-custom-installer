import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { detectAppConfig } from '../utils/config';
import { tryExecOutput } from '../utils/exec';
import { getCliPackageVersion, getCliRootDir } from './init';

export function runCheck(): void {
  const cwd = process.cwd();
  console.log(
    pc.cyan(
      `\n🔍 Checking system prerequisites & workspace health (tci v${getCliPackageVersion()})...\n`
    )
  );

  checkTool('Node.js', 'node', ['-v'], true);
  checkTool('Bun', 'bun', ['-v'], false);
  checkTool('Rust / Cargo', 'cargo', ['-V'], true);
  checkTool('Rustc', 'rustc', ['-V'], true);
  checkTool('Tauri CLI', 'cargo', ['tauri', '-V'], false);

  const cliRoot = getCliRootDir();
  const runtimeBin = path.join(cliRoot, 'vendor', 'runtime', 'tci-runtime.exe');
  if (fs.existsSync(runtimeBin)) {
    console.log(pc.green(`✔ Prebuilt SFX Runtime: ${runtimeBin}`));
  } else {
    console.log(
      pc.yellow(`⚠️  Prebuilt tci-runtime.exe not bundled (will compile via Cargo on first build)`)
    );
  }

  // Project diagnostics when executed inside an app workspace
  const installerDir = path.join(cwd, 'installer');
  const tciConfigPath = path.join(cwd, 'tci.config.json');

  if (fs.existsSync(tciConfigPath) || fs.existsSync(installerDir)) {
    console.log(pc.cyan(`\n📦 Project Diagnostics (${cwd}):`));

    const appConfig = detectAppConfig(cwd);
    console.log(
      pc.gray(`  Detected app: ${appConfig.appName} v${appConfig.version} (${appConfig.identifier})`)
    );

    if (fs.existsSync(tciConfigPath)) {
      try {
        JSON.parse(fs.readFileSync(tciConfigPath, 'utf8'));
        console.log(pc.green(`  ✔ tci.config.json is valid JSON`));
      } catch (err) {
        console.log(pc.red(`  ❌ tci.config.json has invalid JSON: ${String(err)}`));
      }
    } else {
      console.log(pc.yellow(`  ⚠️  Missing tci.config.json at project root`));
    }

    const installerConfigPath = path.join(installerDir, 'src', 'installer.config.json');
    if (fs.existsSync(installerConfigPath)) {
      try {
        const uiCfg = JSON.parse(fs.readFileSync(installerConfigPath, 'utf8'));
        if (uiCfg.appVersion !== appConfig.version || uiCfg.appName !== appConfig.appName) {
          console.log(
            pc.yellow(
              `  ⚠️  installer/src/installer.config.json (${uiCfg.appName} v${uiCfg.appVersion}) differs from tci.config.json — run \`tci upgrade\``
            )
          );
        } else {
          console.log(pc.green(`  ✔ installer/src/installer.config.json is in sync`));
        }
      } catch {
        console.log(pc.red(`  ❌ installer/src/installer.config.json is invalid JSON`));
      }
    }

    const tauriConfPath = path.join(installerDir, 'src-tauri', 'tauri.conf.json');
    if (fs.existsSync(tauriConfPath)) {
      try {
        const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
        if (tauriConf.bundle?.active === false) {
          console.log(pc.green(`  ✔ installer/src-tauri/tauri.conf.json bundle.active = false`));
        } else {
          console.log(
            pc.yellow(
              `  ⚠️  installer/src-tauri/tauri.conf.json bundle.active should be false for SFX builds`
            )
          );
        }
      } catch {
        console.log(pc.red(`  ❌ installer/src-tauri/tauri.conf.json is invalid JSON`));
      }
    }

    const installerPkgPath = path.join(installerDir, 'package.json');
    if (fs.existsSync(installerPkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(installerPkgPath, 'utf8'));
        const sdkRef = pkg.dependencies?.['@tauri-custom-installer/client'];
        if (typeof sdkRef === 'string' && sdkRef.startsWith('file:')) {
          const resolved = path.resolve(installerDir, sdkRef.slice(5));
          if (fs.existsSync(resolved)) {
            console.log(pc.green(`  ✔ Client SDK path exists (${sdkRef})`));
          } else {
            console.log(
              pc.red(`  ❌ Missing Client SDK path (${sdkRef}) — run \`tci upgrade\``)
            );
          }
        }
      } catch {
        // ignore
      }
    }

    const cargoTomlPath = path.join(installerDir, 'src-tauri', 'Cargo.toml');
    if (fs.existsSync(cargoTomlPath)) {
      const cargoText = fs.readFileSync(cargoTomlPath, 'utf8');
      const match = cargoText.match(/tauri-custom-installer-core\s*=\s*\{[^}]*path\s*=\s*"([^"]+)"/);
      if (match) {
        const resolvedCore = path.resolve(path.join(installerDir, 'src-tauri'), match[1]);
        if (fs.existsSync(resolvedCore)) {
          console.log(pc.green(`  ✔ Rust core crate path exists (${match[1]})`));
        } else {
          console.log(
            pc.red(`  ❌ Missing Rust core crate path (${match[1]}) — run \`tci upgrade\``)
          );
        }
      }
    }

    if (!fs.existsSync(path.join(installerDir, 'AGENTS.md'))) {
      console.log(
        pc.gray(`  ℹ️  Tip: run \`tci upgrade\` to generate installer/AGENTS.md for AI assistance`)
      );
    }

    const stagingPath = path.join(installerDir, '.payload_staging');
    if (fs.existsSync(stagingPath)) {
      console.log(
        pc.yellow(`  ⚠️  Leftover installer/.payload_staging found — run \`tci clean\``)
      );
    }
  }

  console.log(pc.green(`\n✔ System check completed.\n`));
}

function checkTool(name: string, cmd: string, args: string[], required: boolean): void {
  const out = tryExecOutput(cmd, args);
  if (out !== null) {
    const firstLine = out.split(/\r?\n/)[0].trim();
    console.log(pc.green(`✔ ${name}: ${pc.gray(firstLine)}`));
  } else if (required) {
    console.log(pc.red(`❌ ${name}: Missing or not in PATH`));
  } else {
    console.log(pc.yellow(`⚠️  ${name}: Not detected (optional)`));
  }
}
