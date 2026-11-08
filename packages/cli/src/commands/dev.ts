import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { runProcess } from '../utils/exec';

export async function runDev(): Promise<void> {
  const cwd = process.cwd();
  const installerDir = path.join(cwd, 'installer');

  if (!fs.existsSync(installerDir)) {
    console.error(pc.red(`❌ No 'installer/' directory found in ${cwd}`));
    console.error(pc.yellow(`Run '${pc.bold('tauri-custom-installer init')}' first.`));
    process.exit(1);
  }

  console.log(pc.cyan(`\n🚀 Starting installer UI development server with Hot Module Replacement...`));
  console.log(pc.gray(`Mock simulation engine is active. Changes in installer/src will update live.\n`));

  // Determine package manager (bun / npm)
  const isBun = fs.existsSync(path.join(installerDir, 'bun.lockb')) || fs.existsSync(path.join(cwd, 'bun.lockb'));
  const runner = isBun ? 'bun' : 'npm';
  const args = isBun ? ['run', 'dev'] : ['run', 'dev'];

  await runProcess(runner, args, { cwd: installerDir });
}
