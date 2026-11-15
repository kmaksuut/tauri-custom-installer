"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runProcess = runProcess;
exports.tryExecOutput = tryExecOutput;
exports.splitCommandLine = splitCommandLine;
const node_child_process_1 = require("node:child_process");
function escapeWinArg(arg) {
    if (!/[\s"&^|<>()%!]/.test(arg)) {
        return arg;
    }
    return `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
}
function redactSensitiveArgs(args) {
    const out = [];
    for (let i = 0; i < args.length; i++) {
        out.push(args[i]);
        if (args[i].toLowerCase() === '/p' && i + 1 < args.length) {
            out.push('***');
            i++;
        }
    }
    return out;
}
function runProcess(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const isWindows = process.platform === 'win32';
        const cwd = options.cwd || process.cwd();
        const env = { ...process.env, ...options.env };
        const proc = isWindows
            ? (0, node_child_process_1.spawn)(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${[command, ...args.map(escapeWinArg)].join(' ')}"`], {
                cwd,
                env,
                stdio: 'inherit',
                windowsVerbatimArguments: true,
            })
            : (0, node_child_process_1.spawn)(command, args, {
                cwd,
                env,
                stdio: 'inherit',
            });
        proc.on('close', (code) => {
            if (code === 0) {
                resolve();
            }
            else {
                const safeArgs = redactSensitiveArgs(args).join(' ');
                reject(new Error(`Command '${command} ${safeArgs}' exited with code ${code}`));
            }
        });
        proc.on('error', (err) => {
            reject(err);
        });
    });
}
function tryExecOutput(command, args, cwd = process.cwd()) {
    try {
        return (0, node_child_process_1.execFileSync)(command, args, {
            cwd,
            stdio: ['ignore', 'pipe', 'ignore'],
            encoding: 'utf8',
        }).trim();
    }
    catch {
        return null;
    }
}
/**
 * Splits a shell-style command line into executable and argument tokens,
 * preserving spaces inside single or double quotes.
 */
function splitCommandLine(commandLine) {
    const args = [];
    let current = '';
    let quote = null;
    let hasToken = false;
    for (let i = 0; i < commandLine.length; i++) {
        const ch = commandLine[i];
        if (quote) {
            if (ch === quote) {
                quote = null;
            }
            else {
                current += ch;
            }
            hasToken = true;
        }
        else if (ch === '"' || ch === "'") {
            quote = ch;
            hasToken = true;
        }
        else if (/\s/.test(ch)) {
            if (hasToken) {
                args.push(current);
                current = '';
                hasToken = false;
            }
        }
        else {
            current += ch;
            hasToken = true;
        }
    }
    if (hasToken) {
        args.push(current);
    }
    return args;
}
