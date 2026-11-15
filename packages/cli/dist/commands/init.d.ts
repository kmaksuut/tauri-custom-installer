import { type AppConfig } from '../utils/config';
export declare const AVAILABLE_TEMPLATES: readonly ["react", "futuristic-3d", "svelte", "vue", "vanilla"];
export interface InitOptions {
    template?: string;
    name?: string;
    mode?: 'perUser' | 'perMachine' | 'both';
    yes?: boolean;
    force?: boolean;
}
export declare function normalizeTemplateName(template: string): string;
export declare function getCliRootDir(): string;
export declare function getCliPackageVersion(): string;
export declare function findDirUpwards(startDir: string, subPath: string): string | null;
export declare function resolveTemplateDir(cwd: string, template: string): string | null;
export declare function ensureProjectGitignore(cwd: string): void;
export declare function ensureRootPackageScripts(cwd: string): boolean;
export declare function writeInstallerAgentsMd(targetDir: string, templateName: string): void;
export declare function syncInstallerMetadataAndSdk(cwd: string, targetDir: string, appConfig: AppConfig, syncIcons?: boolean): void;
export declare function runInit(options: InitOptions): Promise<void>;
export declare function copyDirSync(src: string, dest: string, includeDist?: boolean): void;
