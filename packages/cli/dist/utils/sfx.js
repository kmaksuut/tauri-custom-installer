"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ARMOR_SECTION_MANIFEST = exports.ARMOR_SECTION_UI = exports.TCI_FOOTER_SIZE = exports.TCI_FOOTER_MAGIC_V2 = exports.TCI_FOOTER_MAGIC = void 0;
exports.transformArmorBytes = transformArmorBytes;
exports.buildSfxExecutable = buildSfxExecutable;
exports.inspectSfxExecutable = inspectSfxExecutable;
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
exports.TCI_FOOTER_MAGIC = Buffer.from([
    0x54, 0x43, 0x49, 0x5f, 0x53, 0x46, 0x58, 0x5f, // "TCI_SFX_"
    0x56, 0x31, 0x00, 0x01, 0xfe, 0x20, 0x26, 0x00, // "V1\0\x01\xfe\x20\x26\0"
]);
exports.TCI_FOOTER_MAGIC_V2 = Buffer.from([
    0x54, 0x43, 0x49, 0x5f, 0x53, 0x46, 0x58, 0x5f, // "TCI_SFX_"
    0x56, 0x32, 0x00, 0x02, 0xfe, 0x20, 0x26, 0x00, // "V2\0\x02\xfe\x20\x26\0"
]);
exports.TCI_FOOTER_SIZE = 136;
exports.ARMOR_SECTION_UI = 1;
exports.ARMOR_SECTION_MANIFEST = 2;
/**
 * Symmetric SHA-256 CTR-mode keystream transform matching Rust core `footer::transform_armor_bytes`.
 */
function transformArmorBytes(data, payloadSha256, uiSha256, runtimeSize, sectionTag) {
    const out = Buffer.from(data);
    const runtimeLe = Buffer.alloc(8);
    runtimeLe.writeBigUInt64LE(runtimeSize, 0);
    const tagBuf = Buffer.from([sectionTag]);
    const domain = Buffer.from('TCI_ARMOR_V2', 'ascii');
    const counterLe = Buffer.alloc(8);
    let blockIdx = 0n;
    for (let offset = 0; offset < out.length; offset += 32) {
        counterLe.writeBigUInt64LE(blockIdx, 0);
        const keystream = node_crypto_1.default
            .createHash('sha256')
            .update(domain)
            .update(payloadSha256)
            .update(uiSha256)
            .update(runtimeLe)
            .update(tagBuf)
            .update(counterLe)
            .digest();
        const end = Math.min(offset + 32, out.length);
        for (let i = offset; i < end; i++) {
            out[i] ^= keystream[i - offset];
        }
        blockIdx++;
    }
    return out;
}
function buildSfxExecutable(input) {
    let runtimeBuf = node_fs_1.default.readFileSync(input.runtimeExePath);
    // If the runtime executable already has an appended TciFooter (V1 or V2), strip back to bare stub
    if (runtimeBuf.length >= exports.TCI_FOOTER_SIZE) {
        const tailMagic = runtimeBuf.subarray(runtimeBuf.length - 16);
        if (tailMagic.equals(exports.TCI_FOOTER_MAGIC) || tailMagic.equals(exports.TCI_FOOTER_MAGIC_V2)) {
            const prevFooter = runtimeBuf.subarray(runtimeBuf.length - exports.TCI_FOOTER_SIZE);
            const origRuntimeSize = Number(prevFooter.readBigUInt64LE(0));
            if (origRuntimeSize > 0 && origRuntimeSize <= runtimeBuf.length - exports.TCI_FOOTER_SIZE) {
                runtimeBuf = runtimeBuf.subarray(0, origRuntimeSize);
            }
        }
    }
    const plaintextUiBuf = input.uiZipPath && node_fs_1.default.existsSync(input.uiZipPath)
        ? node_fs_1.default.readFileSync(input.uiZipPath)
        : Buffer.alloc(0);
    const payloadBuf = node_fs_1.default.readFileSync(input.payloadPath);
    const payloadSha256 = node_crypto_1.default.createHash('sha256').update(payloadBuf).digest();
    const uiSha256 = plaintextUiBuf.length > 0
        ? node_crypto_1.default.createHash('sha256').update(plaintextUiBuf).digest()
        : Buffer.alloc(32, 0);
    const enrichedManifest = {
        ...input.manifest,
        payloadSha256: payloadSha256.toString('hex'),
    };
    const plaintextManifestBuf = Buffer.from(JSON.stringify(enrichedManifest), 'utf8');
    const useArmor = input.armor !== false;
    const runtimeSize = BigInt(runtimeBuf.length);
    const writtenUiBuf = useArmor && plaintextUiBuf.length > 0
        ? transformArmorBytes(plaintextUiBuf, payloadSha256, uiSha256, runtimeSize, exports.ARMOR_SECTION_UI)
        : plaintextUiBuf;
    const writtenManifestBuf = useArmor
        ? transformArmorBytes(plaintextManifestBuf, payloadSha256, uiSha256, runtimeSize, exports.ARMOR_SECTION_MANIFEST)
        : plaintextManifestBuf;
    const uiOffset = runtimeSize;
    const uiSize = BigInt(writtenUiBuf.length);
    const payloadOffset = uiOffset + uiSize;
    const payloadSize = BigInt(payloadBuf.length);
    const manifestOffset = payloadOffset + payloadSize;
    const manifestSize = BigInt(writtenManifestBuf.length);
    const footer = Buffer.alloc(exports.TCI_FOOTER_SIZE, 0);
    footer.writeBigUInt64LE(runtimeSize, 0);
    footer.writeBigUInt64LE(uiOffset, 8);
    footer.writeBigUInt64LE(uiSize, 16);
    footer.writeBigUInt64LE(payloadOffset, 24);
    footer.writeBigUInt64LE(payloadSize, 32);
    footer.writeBigUInt64LE(manifestOffset, 40);
    footer.writeBigUInt64LE(manifestSize, 48);
    payloadSha256.copy(footer, 56);
    uiSha256.copy(footer, 88);
    (useArmor ? exports.TCI_FOOTER_MAGIC_V2 : exports.TCI_FOOTER_MAGIC).copy(footer, 120);
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(input.outputExePath), { recursive: true });
    const finalBuf = Buffer.concat([runtimeBuf, writtenUiBuf, payloadBuf, writtenManifestBuf, footer]);
    node_fs_1.default.writeFileSync(input.outputExePath, finalBuf);
    const setupSha256Hex = node_crypto_1.default.createHash('sha256').update(finalBuf).digest('hex');
    return {
        totalExeBytes: finalBuf.length,
        runtimeBytes: runtimeBuf.length,
        uiBytes: writtenUiBuf.length,
        payloadBytes: payloadBuf.length,
        manifestBytes: writtenManifestBuf.length,
        payloadSha256Hex: payloadSha256.toString('hex'),
        uiSha256Hex: uiSha256.toString('hex'),
        setupSha256Hex,
        isV2Armored: useArmor,
    };
}
/**
 * Inspects a built setup executable for V1/V2 TCI SFX footer and trailing Authenticode signatures.
 */
function inspectSfxExecutable(exePath) {
    const buf = node_fs_1.default.readFileSync(exePath);
    const fileSizeBytes = buf.length;
    const empty = {
        hasFooter: false,
        isV2Armored: false,
        hasAuthenticodeTrailer: false,
        footerOffset: -1,
        fileSizeBytes,
        runtimeSize: 0,
        uiOffset: 0,
        uiSize: 0,
        payloadOffset: 0,
        payloadSize: 0,
        manifestOffset: 0,
        manifestSize: 0,
        payloadSha256Hex: '',
        uiSha256Hex: '',
    };
    if (fileSizeBytes < exports.TCI_FOOTER_SIZE) {
        return empty;
    }
    const scanStart = Math.max(0, fileSizeBytes - 131072);
    for (let end = fileSizeBytes; end >= scanStart + exports.TCI_FOOTER_SIZE; end--) {
        const magic = buf.subarray(end - 16, end);
        const isV2 = magic.equals(exports.TCI_FOOTER_MAGIC_V2);
        const isV1 = magic.equals(exports.TCI_FOOTER_MAGIC);
        if (!isV1 && !isV2)
            continue;
        const footerStart = end - exports.TCI_FOOTER_SIZE;
        const footerSlice = buf.subarray(footerStart, end);
        const runtimeSize = Number(footerSlice.readBigUInt64LE(0));
        const uiOffset = Number(footerSlice.readBigUInt64LE(8));
        const uiSize = Number(footerSlice.readBigUInt64LE(16));
        const payloadOffset = Number(footerSlice.readBigUInt64LE(24));
        const payloadSize = Number(footerSlice.readBigUInt64LE(32));
        const manifestOffset = Number(footerSlice.readBigUInt64LE(40));
        const manifestSize = Number(footerSlice.readBigUInt64LE(48));
        if (runtimeSize <= footerStart &&
            uiOffset + uiSize <= footerStart &&
            payloadOffset + payloadSize <= footerStart &&
            manifestOffset + manifestSize <= footerStart) {
            return {
                hasFooter: true,
                isV2Armored: isV2,
                hasAuthenticodeTrailer: end < fileSizeBytes,
                footerOffset: footerStart,
                fileSizeBytes,
                runtimeSize,
                uiOffset,
                uiSize,
                payloadOffset,
                payloadSize,
                manifestOffset,
                manifestSize,
                payloadSha256Hex: footerSlice.subarray(56, 88).toString('hex'),
                uiSha256Hex: footerSlice.subarray(88, 120).toString('hex'),
            };
        }
    }
    return empty;
}
