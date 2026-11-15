export declare const TCI_FOOTER_MAGIC: Buffer<ArrayBuffer>;
export declare const TCI_FOOTER_MAGIC_V2: Buffer<ArrayBuffer>;
export declare const TCI_FOOTER_SIZE = 136;
export declare const ARMOR_SECTION_UI = 1;
export declare const ARMOR_SECTION_MANIFEST = 2;
export interface SfxBuildInput {
    runtimeExePath: string;
    uiZipPath?: string | null;
    payloadPath: string;
    manifest: Record<string, unknown>;
    outputExePath: string;
    armor?: boolean;
}
export interface SfxBuildOutput {
    totalExeBytes: number;
    runtimeBytes: number;
    uiBytes: number;
    payloadBytes: number;
    manifestBytes: number;
    payloadSha256Hex: string;
    uiSha256Hex: string;
    setupSha256Hex: string;
    isV2Armored: boolean;
}
export interface SfxInspectionResult {
    hasFooter: boolean;
    isV2Armored: boolean;
    hasAuthenticodeTrailer: boolean;
    footerOffset: number;
    fileSizeBytes: number;
    runtimeSize: number;
    uiOffset: number;
    uiSize: number;
    payloadOffset: number;
    payloadSize: number;
    manifestOffset: number;
    manifestSize: number;
    payloadSha256Hex: string;
    uiSha256Hex: string;
}
/**
 * Symmetric SHA-256 CTR-mode keystream transform matching Rust core `footer::transform_armor_bytes`.
 */
export declare function transformArmorBytes(data: Buffer, payloadSha256: Buffer, uiSha256: Buffer, runtimeSize: bigint, sectionTag: number): Buffer;
export declare function buildSfxExecutable(input: SfxBuildInput): SfxBuildOutput;
/**
 * Inspects a built setup executable for V1/V2 TCI SFX footer and trailing Authenticode signatures.
 */
export declare function inspectSfxExecutable(exePath: string): SfxInspectionResult;
