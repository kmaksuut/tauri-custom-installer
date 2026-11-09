"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runProcess = runProcess;
exports.tryExecOutput = tryExecOutput;
const node_child_process_1 = require("node:child_process");
function escapeWinArg(arg) {
    if (!/[\s"&^|<>()%!]/.test(arg)) {
        return arg;
    }
    return `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
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
                reject(new Error(`Command '${command} ${args.join(' ')}' exited with code ${code}`));
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
