import { execSync } from 'node:child_process';
import pc from 'picocolors';

export function runCheck(): void {
  console.log(pc.cyan(`\n🔍 Checking system prerequisites for Tauri Custom Installer...\n`));

  checkTool('Node.js', 'node -v');
  checkTool('Bun', 'bun -v');
  checkTool('Rust / Cargo', 'cargo -v');
  checkTool('Rustc', 'rustc -vV');
  checkTool('Tauri CLI', 'cargo tauri -V');

  console.log(pc.green(`\n✔ System check completed.\n`));
}

function checkTool(name: string, command: string) {
  try {
    const out = execSync(command, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    console.log(`  ${pc.green('✔')} ${name}: ${pc.bold(out.split('\n')[0])}`);
  } catch {
    console.log(`  ${pc.yellow('⚠')} ${name}: ${pc.gray('Not found in PATH or optional')}`);
  }
}
