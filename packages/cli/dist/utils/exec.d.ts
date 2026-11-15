export interface ExecOptions {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
}
export declare function runProcess(command: string, args: string[], options?: ExecOptions): Promise<void>;
export declare function tryExecOutput(command: string, args: string[], cwd?: string): string | null;
/**
 * Splits a shell-style command line into executable and argument tokens,
 * preserving spaces inside single or double quotes.
 */
export declare function splitCommandLine(commandLine: string): string[];
