export interface InitOptions {
    template?: string;
    name?: string;
    mode?: 'perUser' | 'perMachine' | 'both';
    yes?: boolean;
    force?: boolean;
}
export declare function runInit(options: InitOptions): Promise<void>;
