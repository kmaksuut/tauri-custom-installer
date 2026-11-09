"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCheck = runCheck;
const node_child_process_1 = require("node:child_process");
const picocolors_1 = __importDefault(require("picocolors"));
function runCheck() {
    console.log(picocolors_1.default.cyan(`\n🔍 Checking system prerequisites for Tauri Custom Installer...\n`));
    checkTool('Node.js', 'node -v');
    checkTool('Bun', 'bun -v');
    checkTool('Rust / Cargo', 'cargo -v');
    checkTool('Rustc', 'rustc -vV');
    checkTool('Tauri CLI', 'cargo tauri -V');
    console.log(picocolors_1.default.green(`\n✔ System check completed.\n`));
}
function checkTool(name, command) {
    try {
        const out = (0, node_child_process_1.execSync)(command, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
        console.log(`  ${picocolors_1.default.green('✔')} ${name}: ${picocolors_1.default.bold(out.split('\n')[0])}`);
    }
    catch {
        console.log(`  ${picocolors_1.default.yellow('⚠')} ${name}: ${picocolors_1.default.gray('Not found in PATH or optional')}`);
    }
}
