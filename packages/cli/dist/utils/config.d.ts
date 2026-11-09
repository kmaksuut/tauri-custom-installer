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
export declare function defineConfig(config: TciUserConfig): TciUserConfig;
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
export declare function detectPackageManager(cwd?: string): PackageManager;
export declare function detectAppConfig(cwd?: string): AppConfig;
