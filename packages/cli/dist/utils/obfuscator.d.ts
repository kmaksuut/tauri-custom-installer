export interface ObfuscateOptions {
    seedHex?: string;
}
export interface ObfuscateResult {
    filesProcessed: number;
    sourcemapsRemoved: number;
    stringsEncoded: number;
    bytesBefore: number;
    bytesAfter: number;
}
/**
 * Strips source maps & comments, encodes JS string literals into a polymorphic
 * XOR+Base64 lookup table, and injects runtime DevTools/contextmenu hardening into HTML files.
 */
export declare function obfuscateUiBundleDirectory(distDir: string, options?: ObfuscateOptions): ObfuscateResult;
