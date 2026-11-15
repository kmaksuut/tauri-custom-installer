export interface UpgradeOptions {
    template?: string;
    resetUi?: boolean;
    dryRun?: boolean;
    yes?: boolean;
}
export declare function runUpgrade(options?: UpgradeOptions): Promise<void>;
