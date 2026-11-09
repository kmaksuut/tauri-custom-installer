import { spawn, execFileSync } from 'node:child_process';

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

function escapeWinArg(arg: string): string {
  if (!/[\s"&^|<>()%!]/.test(arg)) {
    return arg;
  }
  return `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
}

export function runProcess(
  command: string,
  args: string[],
  options: ExecOptions = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const cwd = options.cwd || process.cwd();
    const env = { ...process.env, ...options.env };

    const proc = isWindows
      ? spawn(
          process.env.ComSpec || 'cmd.exe',
          ['/d', '/s', '/c', `"${[command, ...args.map(escapeWinArg)].join(' ')}"`],
          {
            cwd,
            env,
            stdio: 'inherit',
            windowsVerbatimArguments: true,
          }
        )
      : spawn(command, args, {
          cwd,
          env,
          stdio: 'inherit',
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

export function tryExecOutput(
  command: string,
  args: string[],
  cwd: string = process.cwd()
): string | null {
  try {
    return execFileSync(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}
