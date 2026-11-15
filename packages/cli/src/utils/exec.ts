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

function redactSensitiveArgs(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    out.push(args[i]);
    if (args[i].toLowerCase() === '/p' && i + 1 < args.length) {
      out.push('***');
      i++;
    }
  }
  return out;
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
        const safeArgs = redactSensitiveArgs(args).join(' ');
        reject(new Error(`Command '${command} ${safeArgs}' exited with code ${code}`));
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

/**
 * Splits a shell-style command line into executable and argument tokens,
 * preserving spaces inside single or double quotes.
 */
export function splitCommandLine(commandLine: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let hasToken = false;

  for (let i = 0; i < commandLine.length; i++) {
    const ch = commandLine[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      hasToken = true;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      hasToken = true;
    } else if (/\s/.test(ch)) {
      if (hasToken) {
        args.push(current);
        current = '';
        hasToken = false;
      }
    } else {
      current += ch;
      hasToken = true;
    }
  }

  if (hasToken) {
    args.push(current);
  }
  return args;
}
