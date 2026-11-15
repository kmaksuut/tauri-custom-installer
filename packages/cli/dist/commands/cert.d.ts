export interface CertCommandOptions {
    outDir?: string;
    subject?: string;
    store?: string;
    scope?: string;
}
export interface ParsedCertInfo {
    format: 'PEM' | 'DER';
    derBytes: Buffer;
    sha256Thumbprint: string;
    sha1Thumbprint: string;
    subject?: string;
    issuer?: string;
    validTo?: string;
}
/**
 * Discovers Windows SDK `signtool.exe` on PATH or inside Windows Kits 10/11 bin directories.
 */
export declare function findSignToolExecutable(): string | null;
/**
 * Parses an X.509 `.cer` / `.crt` file in either PEM or DER format and computes thumbprints.
 */
export declare function parseCertificateFile(certPath: string): ParsedCertInfo;
/**
 * Generates a self-signed X.509 development certificate (`.cer` DER + `.key.pem` PKCS#8)
 * using Node built-in `crypto` with zero external binary dependencies.
 */
export declare function generateDevCertificate(outDir: string, subjectCn?: string): {
    cerPath: string;
    keyPath: string;
    sha256Thumbprint: string;
    sha1Thumbprint: string;
};
export declare function runCert(action?: string, target?: string, options?: CertCommandOptions): Promise<void>;
