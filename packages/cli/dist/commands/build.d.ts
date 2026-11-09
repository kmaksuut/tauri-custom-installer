export interface BuildOptions {
    release?: boolean;
    debug?: boolean;
    skipAppBuild?: boolean;
    arch?: string;
    sign?: boolean;
    dryRun?: boolean;
}
export declare function runBuild(options: BuildOptions): Promise<void>;
