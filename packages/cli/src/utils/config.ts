import fs from 'node:fs';
import path from 'node:path';

export interface TciFileAssociation {
  ext: string;
  name: string;
  description?: string;
  mimeType?: string;
  icon?: string;
}

export interface TciUserConfig {
  productName?: string;
  identifier?: string;
  version?: string;
  publisher?: string;
  mainBinaryName?: string;
  ui?: {
    root?: string;
    build?: string;
    outDir?: string;
    window?: {
      width?: number;
      height?: number;
      transparent?: boolean;
      resizable?: boolean;
    };
  };
  install?: {
    mode?: 'perUser' | 'perMachine' | 'both';
    defaultDir?: string;
    allowDowngrade?: boolean;
    shortcuts?: {
      desktop?: boolean;
      startMenu?: boolean;
      startMenuFolder?: string;
    };
    autostart?: 'ask' | 'always' | 'never';
    runAfterInstall?: boolean;
    license?: string;
    addToPath?: boolean;
  };
  compression?: 'zstd' | 'zip' | 'none';
  sign?: {
    command?: string;
    certificateThumbprint?: string;
    timestampUrl?: string;
  };
  output?: string;
  arch?: Array<'x64' | 'arm64' | 'x86'>;
}

export function defineConfig(config: TciUserConfig): TciUserConfig {
  return config;
}

export interface AppConfig {
  appName: string;
  version: string;
  identifier: string;
  executableName: string;
  publisher: string;
  installMode: 'perUser' | 'perMachine' | 'both';
  defaultInstallDir?: string;
  allowDowngrade: boolean;
  createDesktopShortcut: boolean;
  createStartMenuShortcut: boolean;
  startMenuFolder?: string;
  autostart: 'ask' | 'always' | 'never';
  runAfterInstall: boolean;
  licenseText?: string;
  addToPath: boolean;
  compression: 'zstd' | 'zip' | 'none';
  uiRoot: string;
  uiOutDir: string;
  outputDir: string;
  resources: string[] | Record<string, string>;
  externalBin: string[];
  fileAssociations: TciFileAssociation[];
  urlSchemes: string[];
  signCommand?: string;
  certificateThumbprint?: string;
  timestampUrl?: string;
  createUpdaterArtifacts: boolean;
}

export type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn';

export function detectPackageManager(cwd: string = process.cwd()): PackageManager {
  const ua = process.env.npm_config_user_agent || '';
  if (ua.startsWith('bun/')) return 'bun';
  if (ua.startsWith('pnpm/')) return 'pnpm';
  if (ua.startsWith('yarn/')) return 'yarn';

  let curr = path.resolve(cwd);
  while (curr) {
    if (fs.existsSync(path.join(curr, 'bun.lock')) || fs.existsSync(path.join(curr, 'bun.lockb'))) {
      return 'bun';
    }
    if (fs.existsSync(path.join(curr, 'pnpm-lock.yaml'))) {
      return 'pnpm';
    }
    if (fs.existsSync(path.join(curr, 'yarn.lock'))) {
      return 'yarn';
    }
    if (fs.existsSync(path.join(curr, 'package-lock.json'))) {
      return 'npm';
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }

  return 'npm';
}

export function detectAppConfig(cwd: string = process.cwd()): AppConfig {
  let appName = 'MyTauriApp';
  let version = '1.0.0';
  let identifier = 'com.tauri.custominstaller';
  let publisher = 'Tauri Developer';
  let cargoBinName: string | null = null;
  let resources: string[] | Record<string, string> = [];
  let externalBin: string[] = [];
  let fileAssociations: TciFileAssociation[] = [];
  let urlSchemes: string[] = [];
  let signCommand: string | undefined;
  let certificateThumbprint: string | undefined;
  let timestampUrl: string | undefined;
  let createUpdaterArtifacts = false;
  let installMode: 'perUser' | 'perMachine' | 'both' = 'perUser';
  let startMenuFolder: string | undefined;

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
        if (content.bundle?.resources) resources = content.bundle.resources;
        if (Array.isArray(content.bundle?.externalBin)) externalBin = content.bundle.externalBin;
        if (Array.isArray(content.bundle?.fileAssociations)) {
          fileAssociations = content.bundle.fileAssociations.map((a: Record<string, unknown>) => ({
            ext: Array.isArray(a.ext) ? String(a.ext[0] || '') : String(a.ext || ''),
            name: String(a.name || a.ext || 'Document'),
            description: a.description ? String(a.description) : undefined,
            mimeType: a.mimeType ? String(a.mimeType) : undefined,
          }));
        }
        if (content.bundle?.windows?.nsis?.installMode) {
          const mode = content.bundle.windows.nsis.installMode;
          if (mode === 'perMachine' || mode === 'both') installMode = mode;
        }
        if (content.bundle?.windows?.nsis?.startMenuFolder) {
          startMenuFolder = String(content.bundle.windows.nsis.startMenuFolder);
        }
        if (content.bundle?.windows?.signCommand) {
          signCommand =
            typeof content.bundle.windows.signCommand === 'string'
              ? content.bundle.windows.signCommand
              : content.bundle.windows.signCommand.cmd;
        }
        if (content.bundle?.windows?.certificateThumbprint) {
          certificateThumbprint = String(content.bundle.windows.certificateThumbprint);
        }
        if (content.bundle?.windows?.timestampUrl) {
          timestampUrl = String(content.bundle.windows.timestampUrl);
        }
        if (content.bundle?.createUpdaterArtifacts) {
          createUpdaterArtifacts = Boolean(content.bundle.createUpdaterArtifacts);
        }
        const deepLinkSchemes =
          content.plugins?.['deep-link']?.desktop?.schemes ||
          content.plugins?.['deep-link']?.schemes;
        if (Array.isArray(deepLinkSchemes)) {
          urlSchemes = deepLinkSchemes.map(String);
        }
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

  // 3. Check package.json & optional "installer" config key
  let userConfig: TciUserConfig = {};
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
      if (pkg.installer && typeof pkg.installer === 'object') {
        userConfig = { ...userConfig, ...pkg.installer };
      }
    } catch {
      // ignore
    }
  }

  // 4. Check tci.config.json
  const tciJsonPath = path.join(cwd, 'tci.config.json');
  if (fs.existsSync(tciJsonPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(tciJsonPath, 'utf8'));
      userConfig = { ...userConfig, ...parsed };
    } catch {
      // ignore
    }
  }

  if (userConfig.productName) appName = userConfig.productName;
  if (userConfig.version) version = userConfig.version;
  if (userConfig.identifier) identifier = userConfig.identifier;
  if (userConfig.publisher) publisher = userConfig.publisher;
  if (userConfig.mainBinaryName) cargoBinName = userConfig.mainBinaryName;
  if (userConfig.install?.mode) installMode = userConfig.install.mode;
  if (userConfig.install?.shortcuts?.startMenuFolder) {
    startMenuFolder = userConfig.install.shortcuts.startMenuFolder;
  }
  if (userConfig.sign?.command) signCommand = userConfig.sign.command;
  if (userConfig.sign?.certificateThumbprint) {
    certificateThumbprint = userConfig.sign.certificateThumbprint;
  }
  if (userConfig.sign?.timestampUrl) timestampUrl = userConfig.sign.timestampUrl;

  let licenseText: string | undefined;
  const licenseCandidate = userConfig.install?.license
    ? path.resolve(cwd, userConfig.install.license)
    : path.join(cwd, 'LICENSE');
  if (fs.existsSync(licenseCandidate) && fs.statSync(licenseCandidate).isFile()) {
    try {
      licenseText = fs.readFileSync(licenseCandidate, 'utf8');
    } catch {
      // ignore
    }
  }

  const baseExe = cargoBinName
    ? cargoBinName
    : appName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const cleanExeName = baseExe.endsWith('.exe') ? baseExe : `${baseExe}.exe`;

  const uiRoot = userConfig.ui?.root || './installer';
  const uiOutDir = userConfig.ui?.outDir || path.join(uiRoot, 'dist');
  const outputDir = userConfig.output || './dist';

  return {
    appName,
    version,
    identifier,
    executableName: cleanExeName,
    publisher,
    installMode,
    defaultInstallDir: userConfig.install?.defaultDir,
    allowDowngrade: userConfig.install?.allowDowngrade ?? false,
    createDesktopShortcut: userConfig.install?.shortcuts?.desktop ?? true,
    createStartMenuShortcut: userConfig.install?.shortcuts?.startMenu ?? true,
    startMenuFolder,
    autostart: userConfig.install?.autostart ?? 'ask',
    runAfterInstall: userConfig.install?.runAfterInstall ?? true,
    licenseText,
    addToPath: userConfig.install?.addToPath ?? false,
    compression: userConfig.compression ?? 'zstd',
    uiRoot,
    uiOutDir,
    outputDir,
    resources,
    externalBin,
    fileAssociations,
    urlSchemes,
    signCommand,
    certificateThumbprint,
    timestampUrl,
    createUpdaterArtifacts,
  };
}
