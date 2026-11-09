"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TCI_FOOTER_SIZE = exports.TCI_FOOTER_MAGIC = void 0;
exports.buildSfxExecutable = buildSfxExecutable;
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
exports.TCI_FOOTER_MAGIC = Buffer.from([
    0x54, 0x43, 0x49, 0x5f, 0x53, 0x46, 0x58, 0x5f, // "TCI_SFX_"
    0x56, 0x31, 0x00, 0x01, 0xfe, 0x20, 0x26, 0x00, // "V1\0\x01\xfe\x20\x26\0"
]);
exports.TCI_FOOTER_SIZE = 136;
function buildSfxExecutable(input) {
    let runtimeBuf = node_fs_1.default.readFileSync(input.runtimeExePath);
    // If the runtime executable already has an appended TciFooter, strip it back to the bare runtime stub
    if (runtimeBuf.length >= exports.TCI_FOOTER_SIZE) {
        const tailMagic = runtimeBuf.subarray(runtimeBuf.length - 16);
        if (tailMagic.equals(exports.TCI_FOOTER_MAGIC)) {
            const prevFooter = runtimeBuf.subarray(runtimeBuf.length - exports.TCI_FOOTER_SIZE);
            const origRuntimeSize = Number(prevFooter.readBigUInt64LE(0));
            if (origRuntimeSize > 0 && origRuntimeSize <= runtimeBuf.length - exports.TCI_FOOTER_SIZE) {
                runtimeBuf = runtimeBuf.subarray(0, origRuntimeSize);
            }
        }
    }
    const uiBuf = input.uiZipPath && node_fs_1.default.existsSync(input.uiZipPath)
        ? node_fs_1.default.readFileSync(input.uiZipPath)
        : Buffer.alloc(0);
    const payloadBuf = node_fs_1.default.readFileSync(input.payloadPath);
    const payloadSha256 = node_crypto_1.default.createHash('sha256').update(payloadBuf).digest();
    const uiSha256 = uiBuf.length > 0
        ? node_crypto_1.default.createHash('sha256').update(uiBuf).digest()
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
    exports.TCI_FOOTER_MAGIC.copy(footer, 120);
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(input.outputExePath), { recursive: true });
    const finalBuf = Buffer.concat([runtimeBuf, uiBuf, payloadBuf, manifestBuf, footer]);
    node_fs_1.default.writeFileSync(input.outputExePath, finalBuf);
    const setupSha256Hex = node_crypto_1.default.createHash('sha256').update(finalBuf).digest('hex');
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
