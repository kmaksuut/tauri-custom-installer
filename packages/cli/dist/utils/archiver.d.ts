export interface ArchiveResult {
    compressedBytes: number;
    format: 'tar.zst' | 'zip';
    fileCount: number;
    uncompressedBytes: number;
}
export declare function buildTarBuffer(sourceDir: string): {
    tarBuffer: Buffer;
    fileCount: number;
    uncompressedBytes: number;
};
export declare function createPayloadArchive(sourceDir: string, outputFile: string, preferZstd?: boolean): Promise<number>;
export declare function createPayloadArchiveDetailed(sourceDir: string, outputFile: string, preferZstd?: boolean): Promise<ArchiveResult>;
export declare function createZipArchive(sourceDir: string, outputFile: string): Promise<number>;
