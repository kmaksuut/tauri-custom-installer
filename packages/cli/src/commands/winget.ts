import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { detectAppConfig } from '../utils/config';

export interface WingetOptions {
  url?: string;
  out?: string;
}

export function runWinget(options: WingetOptions = {}): void {
  const cwd = process.cwd();
  const appConfig = detectAppConfig(cwd);
  const outputDist = path.resolve(cwd, appConfig.outputDir || './dist');

  const setupFile = `${appConfig.appName.replace(/\s+/g, '-')}-Setup-${appConfig.version}-x64.exe`;
  const setupPath = path.join(outputDist, setupFile);

  let sha256 = '<SHA256_OF_SETUP_EXE>';
  if (fs.existsSync(setupPath)) {
    const buf = fs.readFileSync(setupPath);
    sha256 = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
  }

  const installerUrl =
    options.url ||
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

  const outFile = path.resolve(
    cwd,
    options.out || path.join(outputDist, `${appConfig.identifier}.winget.yaml`)
  );
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, manifestYaml, 'utf8');

  console.log(pc.green(`\n✔ Generated WinGet manifest: ${pc.bold(outFile)}\n`));
}
