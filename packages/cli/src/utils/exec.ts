import { spawn } from 'node:child_process';

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export function runProcess(command: string, args: string[], options: ExecOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const proc = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: 'inherit',
      shell: isWindows,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command '${command} ${args.join(' ')}' exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}
