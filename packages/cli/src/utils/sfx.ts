import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const TCI_FOOTER_MAGIC = Buffer.from([
  0x54, 0x43, 0x49, 0x5f, 0x53, 0x46, 0x58, 0x5f, // "TCI_SFX_"
  0x56, 0x31, 0x00, 0x01, 0xfe, 0x20, 0x26, 0x00, // "V1\0\x01\xfe\x20\x26\0"
]);
export const TCI_FOOTER_SIZE = 136;

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

export function buildSfxExecutable(input: SfxBuildInput): SfxBuildOutput {
  let runtimeBuf = fs.readFileSync(input.runtimeExePath);

  // If the runtime executable already has an appended TciFooter, strip it back to the bare runtime stub
  if (runtimeBuf.length >= TCI_FOOTER_SIZE) {
    const tailMagic = runtimeBuf.subarray(runtimeBuf.length - 16);
    if (tailMagic.equals(TCI_FOOTER_MAGIC)) {
      const prevFooter = runtimeBuf.subarray(runtimeBuf.length - TCI_FOOTER_SIZE);
      const origRuntimeSize = Number(prevFooter.readBigUInt64LE(0));
      if (origRuntimeSize > 0 && origRuntimeSize <= runtimeBuf.length - TCI_FOOTER_SIZE) {
        runtimeBuf = runtimeBuf.subarray(0, origRuntimeSize);
      }
    }
  }

  const uiBuf =
    input.uiZipPath && fs.existsSync(input.uiZipPath)
      ? fs.readFileSync(input.uiZipPath)
      : Buffer.alloc(0);

  const payloadBuf = fs.readFileSync(input.payloadPath);
  const payloadSha256 = crypto.createHash('sha256').update(payloadBuf).digest();
  const uiSha256 =
    uiBuf.length > 0
      ? crypto.createHash('sha256').update(uiBuf).digest()
      : Buffer.alloc(32, 0);

  const enrichedManifest = {
    ...input.manifest,
    payloadSha256: payloadSha256.toString('hex'),
  };
  const manifestBuf = Buffer.from(JSON.stringify(enrichedManifest), 'utf8');

  const runtimeSize = BigInt(runtimeBuf.length);
  const uiOffset = runtimeSize;
  const uiSize = BigInt(uiBuf.length);
  const payloadOffset = uiOffset + uiSize;
  const payloadSize = BigInt(payloadBuf.length);
  const manifestOffset = payloadOffset + payloadSize;
  const manifestSize = BigInt(manifestBuf.length);

  const footer = Buffer.alloc(TCI_FOOTER_SIZE, 0);
  footer.writeBigUInt64LE(runtimeSize, 0);
  footer.writeBigUInt64LE(uiOffset, 8);
  footer.writeBigUInt64LE(uiSize, 16);
  footer.writeBigUInt64LE(payloadOffset, 24);
  footer.writeBigUInt64LE(payloadSize, 32);
  footer.writeBigUInt64LE(manifestOffset, 40);
  footer.writeBigUInt64LE(manifestSize, 48);
  payloadSha256.copy(footer, 56);
  uiSha256.copy(footer, 88);
  TCI_FOOTER_MAGIC.copy(footer, 120);

  fs.mkdirSync(path.dirname(input.outputExePath), { recursive: true });
  const finalBuf = Buffer.concat([runtimeBuf, uiBuf, payloadBuf, manifestBuf, footer]);
  fs.writeFileSync(input.outputExePath, finalBuf);

  const setupSha256Hex = crypto.createHash('sha256').update(finalBuf).digest('hex');

  return {
    totalExeBytes: finalBuf.length,
    runtimeBytes: runtimeBuf.length,
    uiBytes: uiBuf.length,
    payloadBytes: payloadBuf.length,
    manifestBytes: manifestBuf.length,
    payloadSha256Hex: payloadSha256.toString('hex'),
    setupSha256Hex,
  };
}
