"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDev = runDev;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const picocolors_1 = __importDefault(require("picocolors"));
const config_1 = require("../utils/config");
const exec_1 = require("../utils/exec");
async function runDev(options = {}) {
    const cwd = process.cwd();
    const appConfig = (0, config_1.detectAppConfig)(cwd);
    const installerDir = node_path_1.default.resolve(cwd, appConfig.uiRoot || './installer');
    if (!node_fs_1.default.existsSync(installerDir)) {
        console.error(picocolors_1.default.red(`❌ No '${appConfig.uiRoot}' directory found in ${cwd}`));
        console.error(picocolors_1.default.yellow(`Run '${picocolors_1.default.bold('tauri-custom-installer init')}' first.`));
        process.exit(1);
    }
    const pm = (0, config_1.detectPackageManager)(installerDir);
    if (options.native) {
        console.log(picocolors_1.default.cyan(`\n🚀 Starting native installer window in ${picocolors_1.default.bold('DRY-RUN SANDBOX')} mode...`));
        console.log(picocolors_1.default.gray(`Registry writes are isolated under HKCU\\Software\\tci-sandbox. Changes in installer/src update live.\n`));
        await (0, exec_1.runProcess)('cargo', ['tauri', 'dev'], {
            cwd: installerDir,
            env: {
                TCI_DRY_RUN: '1',
            },
        });
        return;
    }
    console.log(picocolors_1.default.cyan(`\n🚀 Starting installer UI development server with Hot Module Replacement...`));
    console.log(picocolors_1.default.gray(`Mock simulation engine is active (?scenario=success|app_running|already_installed_upgrade|insufficient_space|uninstall).\n`));
    await (0, exec_1.runProcess)(pm, ['run', 'dev'], { cwd: installerDir });
}
