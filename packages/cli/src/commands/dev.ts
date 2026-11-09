import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { detectAppConfig, detectPackageManager } from '../utils/config';
import { runProcess } from '../utils/exec';

export interface DevOptions {
  native?: boolean;
}

export async function runDev(options: DevOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const appConfig = detectAppConfig(cwd);
  const installerDir = path.resolve(cwd, appConfig.uiRoot || './installer');

  if (!fs.existsSync(installerDir)) {
    console.error(pc.red(`❌ No '${appConfig.uiRoot}' directory found in ${cwd}`));
    console.error(pc.yellow(`Run '${pc.bold('tauri-custom-installer init')}' first.`));
    process.exit(1);
  }

  const pm = detectPackageManager(installerDir);

  if (options.native) {
    console.log(
      pc.cyan(`\n🚀 Starting native installer window in ${pc.bold('DRY-RUN SANDBOX')} mode...`)
    );
    console.log(
      pc.gray(
        `Registry writes are isolated under HKCU\\Software\\tci-sandbox. Changes in installer/src update live.\n`
      )
    );
    await runProcess('cargo', ['tauri', 'dev'], {
      cwd: installerDir,
      env: {
        TCI_DRY_RUN: '1',
      },
    });
    return;
  }

  console.log(
    pc.cyan(`\n🚀 Starting installer UI development server with Hot Module Replacement...`)
  );
  console.log(
    pc.gray(
      `Mock simulation engine is active (?scenario=success|app_running|already_installed_upgrade|insufficient_space|uninstall).\n`
    )
  );

  await runProcess(pm, ['run', 'dev'], { cwd: installerDir });
}
