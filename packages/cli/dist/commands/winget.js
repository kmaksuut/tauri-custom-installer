"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runWinget = runWinget;
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const picocolors_1 = __importDefault(require("picocolors"));
const config_1 = require("../utils/config");
function runWinget(options = {}) {
    const cwd = process.cwd();
    const appConfig = (0, config_1.detectAppConfig)(cwd);
    const outputDist = node_path_1.default.resolve(cwd, appConfig.outputDir || './dist');
    const setupFile = `${appConfig.appName.replace(/\s+/g, '-')}-Setup-${appConfig.version}-x64.exe`;
    const setupPath = node_path_1.default.join(outputDist, setupFile);
    let sha256 = '<SHA256_OF_SETUP_EXE>';
    if (node_fs_1.default.existsSync(setupPath)) {
        const buf = node_fs_1.default.readFileSync(setupPath);
        sha256 = node_crypto_1.default.createHash('sha256').update(buf).digest('hex').toUpperCase();
    }
    const installerUrl = options.url ||
        `https://github.com/your-org/${appConfig.appName.toLowerCase().replace(/\s+/g, '-')}/releases/download/v${appConfig.version}/${setupFile}`;
    const manifestYaml = `# Created with tauri-custom-installer (tci winget)
# yaml-language-server: $schema=https://aka.ms/winget-manifest.singleton.1.6.0.schema.json

PackageIdentifier: ${appConfig.identifier}
PackageVersion: ${appConfig.version}
PackageLocale: en-US
Publisher: ${appConfig.publisher}
PackageName: ${appConfig.appName}
License: MIT
ShortDescription: ${appConfig.appName} desktop application
InstallerType: exe
Scope: ${appConfig.installMode === 'perMachine' ? 'machine' : 'user'}
InstallerSwitches:
  Silent: /S
  SilentWithProgress: /P
  Custom: /NORESTART
  InstallLocation: /D=<INSTALLPATH>
Installers:
  - Architecture: x64
    InstallerUrl: ${installerUrl}
    InstallerSha256: ${sha256}
ManifestType: singleton
ManifestVersion: 1.6.0
`;
    const outFile = node_path_1.default.resolve(cwd, options.out || node_path_1.default.join(outputDist, `${appConfig.identifier}.winget.yaml`));
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(outFile), { recursive: true });
    node_fs_1.default.writeFileSync(outFile, manifestYaml, 'utf8');
    console.log(picocolors_1.default.green(`\n✔ Generated WinGet manifest: ${picocolors_1.default.bold(outFile)}\n`));
}
