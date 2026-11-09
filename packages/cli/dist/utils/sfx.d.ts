export declare const TCI_FOOTER_MAGIC: Buffer<ArrayBuffer>;
export declare const TCI_FOOTER_SIZE = 136;
export interface SfxBuildInput {
    runtimeExePath: string;
    uiZipPath?: string | null;
    payloadPath: string;
    manifest: Record<string, unknown>;
    outputExePath: string;
}
export interface SfxBuildOutput {
    totalExeBytes: number;
    runtimeBytes: number;
    uiBytes: number;
    payloadBytes: number;
    manifestBytes: number;
    payloadSha256Hex: string;
    setupSha256Hex: string;
}
export declare function buildSfxExecutable(input: SfxBuildInput): SfxBuildOutput;
