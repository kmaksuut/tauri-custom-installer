"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findSignToolExecutable = findSignToolExecutable;
exports.parseCertificateFile = parseCertificateFile;
exports.generateDevCertificate = generateDevCertificate;
exports.runCert = runCert;
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const picocolors_1 = __importDefault(require("picocolors"));
const exec_1 = require("../utils/exec");
const sfx_1 = require("../utils/sfx");
/**
 * Discovers Windows SDK `signtool.exe` on PATH or inside Windows Kits 10/11 bin directories.
 */
function findSignToolExecutable() {
    const fromPath = (0, exec_1.tryExecOutput)('where', ['signtool']);
    if (fromPath) {
        const first = fromPath.split(/\r?\n/).find((line) => line.trim().toLowerCase().endsWith('signtool.exe'));
        if (first && node_fs_1.default.existsSync(first.trim())) {
            return first.trim();
        }
    }
    const kitRoots = [
        'C:\\Program Files (x86)\\Windows Kits\\10\\bin',
        'C:\\Program Files\\Windows Kits\\10\\bin',
    ];
    for (const root of kitRoots) {
        if (!node_fs_1.default.existsSync(root))
            continue;
        const versions = node_fs_1.default
            .readdirSync(root, { withFileTypes: true })
            .filter((d) => d.isDirectory() && /^\d+\./.test(d.name))
            .map((d) => d.name)
            .sort()
            .reverse();
        for (const ver of versions) {
            for (const arch of ['x64', 'arm64', 'x86']) {
                const candidate = node_path_1.default.join(root, ver, arch, 'signtool.exe');
                if (node_fs_1.default.existsSync(candidate)) {
                    return candidate;
                }
            }
        }
        const legacyDirect = node_path_1.default.join(root, 'x64', 'signtool.exe');
        if (node_fs_1.default.existsSync(legacyDirect))
            return legacyDirect;
    }
    return null;
}
/**
 * Parses an X.509 `.cer` / `.crt` file in either PEM or DER format and computes thumbprints.
 */
function parseCertificateFile(certPath) {
    const raw = node_fs_1.default.readFileSync(certPath);
    const text = raw.toString('utf8').replace(/^\uFEFF/, '').trimStart();
    let format = 'DER';
    let derBytes = raw;
    if (text.startsWith('-----BEGIN CERTIFICATE-----')) {
        format = 'PEM';
        const match = text.match(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/);
        if (!match) {
            throw new Error(`Invalid PEM certificate markers in ${certPath}`);
        }
        const b64 = match[1].replace(/\s+/g, '');
        derBytes = Buffer.from(b64, 'base64');
    }
    if (derBytes.length < 32 || derBytes[0] !== 0x30) {
        throw new Error(`File does not contain a valid ASN.1 DER X.509 certificate: ${certPath}`);
    }
    const sha256Thumbprint = node_crypto_1.default.createHash('sha256').update(derBytes).digest('hex');
    const sha1Thumbprint = node_crypto_1.default.createHash('sha1').update(derBytes).digest('hex');
    let subject;
    let issuer;
    let validTo;
    if (typeof node_crypto_1.default.X509Certificate === 'function') {
        const x509 = new node_crypto_1.default.X509Certificate(derBytes);
        subject = x509.subject;
        issuer = x509.issuer;
        validTo = x509.validTo;
    }
    return { format, derBytes, sha256Thumbprint, sha1Thumbprint, subject, issuer, validTo };
}
function derLen(len) {
    if (len < 128)
        return Buffer.from([len]);
    const bytes = [];
    let tmp = len;
    while (tmp > 0) {
        bytes.unshift(tmp & 0xff);
        tmp >>= 8;
    }
    return Buffer.from([0x80 | bytes.length, ...bytes]);
}
function derWrap(tag, content) {
    return Buffer.concat([Buffer.from([tag]), derLen(content.length), content]);
}
function derOid(oidBytes) {
    return derWrap(0x06, Buffer.from(oidBytes));
}
function derInt(buf) {
    const padded = buf[0] >= 0x80 ? Buffer.concat([Buffer.from([0x00]), buf]) : buf;
    return derWrap(0x02, padded);
}
function derNameCn(cn) {
    // OID 2.5.4.3 = 0x55 0x04 0x03
    const attrTypeAndVal = derWrap(0x30, Buffer.concat([derOid([0x55, 0x04, 0x03]), derWrap(0x0c, Buffer.from(cn, 'utf8'))]));
    const rdn = derWrap(0x31, attrTypeAndVal);
    return derWrap(0x30, rdn);
}
function derUtcTime(date) {
    const pad = (n) => String(n).padStart(2, '0');
    const s = pad(date.getUTCFullYear() % 100) +
        pad(date.getUTCMonth() + 1) +
        pad(date.getUTCDate()) +
        pad(date.getUTCHours()) +
        pad(date.getUTCMinutes()) +
        pad(date.getUTCSeconds()) +
        'Z';
    return derWrap(0x17, Buffer.from(s, 'ascii'));
}
function derBitString(content) {
    return derWrap(0x03, Buffer.concat([Buffer.from([0x00]), content]));
}
/**
 * Generates a self-signed X.509 development certificate (`.cer` DER + `.key.pem` PKCS#8)
 * using Node built-in `crypto` with zero external binary dependencies.
 */
function generateDevCertificate(outDir, subjectCn = 'Tauri Custom Installer Dev') {
    node_fs_1.default.mkdirSync(outDir, { recursive: true });
    const { publicKey, privateKey } = node_crypto_1.default.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'der' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const serial = node_crypto_1.default.randomBytes(8);
    serial[0] &= 0x7f;
    if (serial[0] === 0)
        serial[0] = 0x01;
    // sha256WithRSAEncryption: 1.2.840.113549.1.1.11
    const sha256WithRsaAlg = derWrap(0x30, Buffer.concat([
        derOid([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]),
        Buffer.from([0x05, 0x00]),
    ]));
    const now = new Date();
    const expires = new Date(now.getTime() + 365 * 5 * 24 * 60 * 60 * 1000);
    const name = derNameCn(subjectCn);
    const validity = derWrap(0x30, Buffer.concat([derUtcTime(now), derUtcTime(expires)]));
    const tbsCertificate = derWrap(0x30, Buffer.concat([
        derWrap(0xa0, derInt(Buffer.from([0x02]))), // version v3
        derInt(serial),
        sha256WithRsaAlg,
        name,
        validity,
        name,
        publicKey,
    ]));
    const signature = node_crypto_1.default.sign('sha256', tbsCertificate, privateKey);
    const certDer = derWrap(0x30, Buffer.concat([tbsCertificate, sha256WithRsaAlg, derBitString(signature)]));
    const safeSlug = subjectCn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tci-dev';
    const cerPath = node_path_1.default.join(outDir, `${safeSlug}.cer`);
    const keyPath = node_path_1.default.join(outDir, `${safeSlug}.key.pem`);
    node_fs_1.default.writeFileSync(cerPath, certDer);
    node_fs_1.default.writeFileSync(keyPath, privateKey, { encoding: 'utf8', mode: 0o600 });
    const sha256Thumbprint = node_crypto_1.default.createHash('sha256').update(certDer).digest('hex');
    const sha1Thumbprint = node_crypto_1.default.createHash('sha1').update(certDer).digest('hex');
    return { cerPath, keyPath, sha256Thumbprint, sha1Thumbprint };
}
async function runCert(action = 'check', target, options = {}) {
    const mode = action.toLowerCase();
    if (mode === 'generate') {
        const outDir = node_path_1.default.resolve(process.cwd(), options.outDir || './certs');
        const subject = options.subject || 'Tauri Custom Installer Dev';
        const generated = generateDevCertificate(outDir, subject);
        console.log(picocolors_1.default.green('\n✔ Self-signed development certificate generated:\n'));
        console.log(`  Certificate (.cer): ${picocolors_1.default.cyan(generated.cerPath)}`);
        console.log(`  Private Key (.pem): ${picocolors_1.default.yellow(generated.keyPath)} ${picocolors_1.default.gray('(do NOT commit to git!)')}`);
        console.log(`  SHA-256 Thumbprint: ${picocolors_1.default.white(generated.sha256Thumbprint)}`);
        console.log(`  SHA-1 Thumbprint:   ${picocolors_1.default.gray(generated.sha1Thumbprint)}`);
        console.log(picocolors_1.default.cyan('\nExample tci.config.json entry (bundles & pins cert into installer):\n'));
        console.log(JSON.stringify({
            certificates: [
                {
                    path: node_path_1.default.relative(process.cwd(), generated.cerPath).replace(/\\/g, '/'),
                    store: options.store || 'TrustedPublisher',
                    scope: options.scope || 'currentUser',
                    sha256Thumbprint: generated.sha256Thumbprint,
                },
            ],
        }, null, 2));
        return;
    }
    if (mode === 'verify') {
        if (!target) {
            console.error(picocolors_1.default.red('❌ Missing executable path. Usage: tci cert verify <setup.exe>'));
            process.exit(1);
        }
        const absExe = node_path_1.default.resolve(process.cwd(), target);
        if (!node_fs_1.default.existsSync(absExe)) {
            console.error(picocolors_1.default.red(`❌ File not found: ${absExe}`));
            process.exit(1);
        }
        const info = (0, sfx_1.inspectSfxExecutable)(absExe);
        console.log(picocolors_1.default.cyan(`\n🔐 Inspecting SFX & Signature Layout: ${absExe}\n`));
        console.log(`  File Size:            ${info.fileSizeBytes} bytes`);
        console.log(`  TCI SFX Footer:       ${info.hasFooter ? picocolors_1.default.green(info.isV2Armored ? 'VALID (V2 Armored)' : 'VALID (V1)') : picocolors_1.default.red('NOT FOUND')}`);
        if (info.hasFooter) {
            console.log(`  Footer Offset:        ${info.footerOffset}`);
            console.log(`  Authenticode Trailer: ${info.hasAuthenticodeTrailer ? picocolors_1.default.green('PRESENT (coexistence valid)') : picocolors_1.default.yellow('Not detected (unsigned)')}`);
            console.log(`  Payload SHA-256:      ${info.payloadSha256Hex}`);
            console.log(`  UI Archive SHA-256:   ${info.uiSha256Hex}`);
        }
        else {
            process.exit(1);
        }
        return;
    }
    if (mode === 'check') {
        console.log(picocolors_1.default.cyan('\n🔐 Certificate & Signing Environment Check\n'));
        const signtool = findSignToolExecutable();
        if (signtool) {
            console.log(`  ✔ signtool.exe: ${picocolors_1.default.green(signtool)}`);
        }
        else {
            console.log(`  ⚠ signtool.exe: ${picocolors_1.default.yellow('Not found in PATH or Windows Kits 10')}`);
        }
        if (target) {
            const absCert = node_path_1.default.resolve(process.cwd(), target);
            if (!node_fs_1.default.existsSync(absCert)) {
                console.error(picocolors_1.default.red(`  ❌ Certificate file not found: ${absCert}`));
                process.exit(1);
            }
            const parsed = parseCertificateFile(absCert);
            console.log(`  ✔ Format:             ${parsed.format}`);
            if (parsed.subject)
                console.log(`  ✔ Subject:            ${parsed.subject}`);
            if (parsed.validTo)
                console.log(`  ✔ Valid To:           ${parsed.validTo}`);
            console.log(`  ✔ SHA-256 Thumbprint: ${picocolors_1.default.green(parsed.sha256Thumbprint)}`);
            console.log(`  ✔ SHA-1 Thumbprint:   ${parsed.sha1Thumbprint}`);
        }
        return;
    }
    console.error(picocolors_1.default.red(`❌ Unknown cert subcommand '${action}'. Use: check, generate, or verify.`));
    process.exit(1);
}
