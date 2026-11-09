import fs from 'node:fs';
import path from 'node:path';

export interface AppConfig {
  appName: string;
  version: string;
  identifier: string;
  executableName: string;
  publisher: string;
}

export function detectAppConfig(cwd: string = process.cwd()): AppConfig {
  let appName = 'MyTauriApp';
  let version = '1.0.0';
  let identifier = 'com.tauri.custominstaller';
  let publisher = 'Tauri Developer';
  let cargoBinName: string | null = null;

  // 1. Check tauri.conf.json
  const tauriConfPaths = [
    path.join(cwd, 'src-tauri', 'tauri.conf.json'),
    path.join(cwd, 'tauri.conf.json'),
  ];

  for (const confPath of tauriConfPaths) {
    if (fs.existsSync(confPath)) {
      try {
        const content = JSON.parse(fs.readFileSync(confPath, 'utf8'));
        if (content.productName) appName = content.productName;
        if (content.version) version = content.version;
        if (content.identifier) identifier = content.identifier;
        if (content.bundle?.publisher) publisher = content.bundle.publisher;
        if (content.mainBinaryName) cargoBinName = content.mainBinaryName;
        break;
      } catch {
        // ignore parse errors
      }
    }
  }

  // 2. Check src-tauri/Cargo.toml for binary package name
  const cargoTomlPath = path.join(cwd, 'src-tauri', 'Cargo.toml');
  if (!cargoBinName && fs.existsSync(cargoTomlPath)) {
    try {
      const cargoContent = fs.readFileSync(cargoTomlPath, 'utf8');
      const nameMatch = cargoContent.match(/^\s*name\s*=\s*"([^"]+)"/m);
      if (nameMatch && nameMatch[1]) {
        cargoBinName = nameMatch[1];
      }
    } catch {
      // ignore
    }
  }

  // 3. Check package.json if values still default
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name && appName === 'MyTauriApp') {
        appName = pkg.name;
      }
      if (pkg.version && version === '1.0.0') {
        version = pkg.version;
      }
      if (pkg.author && publisher === 'Tauri Developer') {
        publisher = typeof pkg.author === 'string' ? pkg.author : pkg.author.name || publisher;
      }
    } catch {
      // ignore
    }
  }

  const baseExe = cargoBinName
    ? cargoBinName
    : appName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const cleanExeName = baseExe.endsWith('.exe') ? baseExe : `${baseExe}.exe`;

  return {
    appName,
    version,
    identifier,
    executableName: cleanExeName,
    publisher,
  };
}
