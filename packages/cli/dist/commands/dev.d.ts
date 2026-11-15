export interface DevOptions {
    native?: boolean;
    tauri?: boolean;
}
export declare function runDev(options?: DevOptions): Promise<void>;
