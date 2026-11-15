import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { tryExecOutput } from '../utils/exec';
import { inspectSfxExecutable } from '../utils/sfx';

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
export function findSignToolExecutable(): string | null {
  const fromPath = tryExecOutput('where', ['signtool']);
  if (fromPath) {
    const first = fromPath.split(/\r?\n/).find((line) => line.trim().toLowerCase().endsWith('signtool.exe'));
    if (first && fs.existsSync(first.trim())) {
      return first.trim();
    }
  }

  const kitRoots = [
    'C:\\Program Files (x86)\\Windows Kits\\10\\bin',
    'C:\\Program Files\\Windows Kits\\10\\bin',
  ];

  for (const root of kitRoots) {
    if (!fs.existsSync(root)) continue;
    const versions = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^\d+\./.test(d.name))
      .map((d) => d.name)
      .sort()
      .reverse();

    for (const ver of versions) {
      for (const arch of ['x64', 'arm64', 'x86']) {
        const candidate = path.join(root, ver, arch, 'signtool.exe');
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }

    const legacyDirect = path.join(root, 'x64', 'signtool.exe');
    if (fs.existsSync(legacyDirect)) return legacyDirect;
  }

  return null;
}

/**
 * Parses an X.509 `.cer` / `.crt` file in either PEM or DER format and computes thumbprints.
 */
export function parseCertificateFile(certPath: string): ParsedCertInfo {
  const raw = fs.readFileSync(certPath);
  const text = raw.toString('utf8').replace(/^\uFEFF/, '').trimStart();

  let format: 'PEM' | 'DER' = 'DER';
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

  const sha256Thumbprint = crypto.createHash('sha256').update(derBytes).digest('hex');
  const sha1Thumbprint = crypto.createHash('sha1').update(derBytes).digest('hex');

  let subject: string | undefined;
  let issuer: string | undefined;
  let validTo: string | undefined;
  if (typeof crypto.X509Certificate === 'function') {
    const x509 = new crypto.X509Certificate(derBytes);
    subject = x509.subject;
    issuer = x509.issuer;
    validTo = x509.validTo;
  }

  return { format, derBytes, sha256Thumbprint, sha1Thumbprint, subject, issuer, validTo };
}

function derLen(len: number): Buffer {
  if (len < 128) return Buffer.from([len]);
  const bytes: number[] = [];
  let tmp = len;
  while (tmp > 0) {
    bytes.unshift(tmp & 0xff);
    tmp >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function derWrap(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLen(content.length), content]);
}

function derOid(oidBytes: number[]): Buffer {
  return derWrap(0x06, Buffer.from(oidBytes));
}

function derInt(buf: Buffer): Buffer {
  const padded = buf[0] >= 0x80 ? Buffer.concat([Buffer.from([0x00]), buf]) : buf;
  return derWrap(0x02, padded);
}

function derNameCn(cn: string): Buffer {
  // OID 2.5.4.3 = 0x55 0x04 0x03
  const attrTypeAndVal = derWrap(
    0x30,
    Buffer.concat([derOid([0x55, 0x04, 0x03]), derWrap(0x0c, Buffer.from(cn, 'utf8'))])
  );
  const rdn = derWrap(0x31, attrTypeAndVal);
  return derWrap(0x30, rdn);
}

function derUtcTime(date: Date): Buffer {
  const pad = (n: number) => String(n).padStart(2, '0');
  const s =
    pad(date.getUTCFullYear() % 100) +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z';
  return derWrap(0x17, Buffer.from(s, 'ascii'));
}

function derBitString(content: Buffer): Buffer {
  return derWrap(0x03, Buffer.concat([Buffer.from([0x00]), content]));
}

/**
 * Generates a self-signed X.509 development certificate (`.cer` DER + `.key.pem` PKCS#8)
 * using Node built-in `crypto` with zero external binary dependencies.
 */
export function generateDevCertificate(
  outDir: string,
  subjectCn = 'Tauri Custom Installer Dev'
): { cerPath: string; keyPath: string; sha256Thumbprint: string; sha1Thumbprint: string } {
  fs.mkdirSync(outDir, { recursive: true });
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const serial = crypto.randomBytes(8);
  serial[0] &= 0x7f;
  if (serial[0] === 0) serial[0] = 0x01;

  // sha256WithRSAEncryption: 1.2.840.113549.1.1.11
  const sha256WithRsaAlg = derWrap(
    0x30,
    Buffer.concat([
      derOid([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]),
      Buffer.from([0x05, 0x00]),
    ])
  );

  const now = new Date();
  const expires = new Date(now.getTime() + 365 * 5 * 24 * 60 * 60 * 1000);
  const name = derNameCn(subjectCn);
  const validity = derWrap(0x30, Buffer.concat([derUtcTime(now), derUtcTime(expires)]));

  const tbsCertificate = derWrap(
    0x30,
    Buffer.concat([
      derWrap(0xa0, derInt(Buffer.from([0x02]))), // version v3
      derInt(serial),
      sha256WithRsaAlg,
      name,
      validity,
      name,
      publicKey,
    ])
  );

  const signature = crypto.sign('sha256', tbsCertificate, privateKey);
  const certDer = derWrap(
    0x30,
    Buffer.concat([tbsCertificate, sha256WithRsaAlg, derBitString(signature)])
  );

  const safeSlug = subjectCn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tci-dev';
  const cerPath = path.join(outDir, `${safeSlug}.cer`);
  const keyPath = path.join(outDir, `${safeSlug}.key.pem`);

  fs.writeFileSync(cerPath, certDer);
  fs.writeFileSync(keyPath, privateKey, { encoding: 'utf8', mode: 0o600 });

  const sha256Thumbprint = crypto.createHash('sha256').update(certDer).digest('hex');
  const sha1Thumbprint = crypto.createHash('sha1').update(certDer).digest('hex');

  return { cerPath, keyPath, sha256Thumbprint, sha1Thumbprint };
}

export async function runCert(
  action = 'check',
  target?: string,
  options: CertCommandOptions = {}
): Promise<void> {
  const mode = action.toLowerCase();

  if (mode === 'generate') {
    const outDir = path.resolve(process.cwd(), options.outDir || './certs');
    const subject = options.subject || 'Tauri Custom Installer Dev';
    const generated = generateDevCertificate(outDir, subject);

    console.log(pc.green('\n✔ Self-signed development certificate generated:\n'));
    console.log(`  Certificate (.cer): ${pc.cyan(generated.cerPath)}`);
    console.log(`  Private Key (.pem): ${pc.yellow(generated.keyPath)} ${pc.gray('(do NOT commit to git!)')}`);
    console.log(`  SHA-256 Thumbprint: ${pc.white(generated.sha256Thumbprint)}`);
    console.log(`  SHA-1 Thumbprint:   ${pc.gray(generated.sha1Thumbprint)}`);
    console.log(pc.cyan('\nExample tci.config.json entry (bundles & pins cert into installer):\n'));
    console.log(
      JSON.stringify(
        {
          certificates: [
            {
              path: path.relative(process.cwd(), generated.cerPath).replace(/\\/g, '/'),
              store: options.store || 'TrustedPublisher',
              scope: options.scope || 'currentUser',
              sha256Thumbprint: generated.sha256Thumbprint,
            },
          ],
        },
        null,
        2
      )
    );
    return;
  }

  if (mode === 'verify') {
    if (!target) {
      console.error(pc.red('❌ Missing executable path. Usage: tci cert verify <setup.exe>'));
      process.exit(1);
    }
    const absExe = path.resolve(process.cwd(), target);
    if (!fs.existsSync(absExe)) {
      console.error(pc.red(`❌ File not found: ${absExe}`));
      process.exit(1);
    }
    const info = inspectSfxExecutable(absExe);
    console.log(pc.cyan(`\n🔐 Inspecting SFX & Signature Layout: ${absExe}\n`));
    console.log(`  File Size:            ${info.fileSizeBytes} bytes`);
    console.log(
      `  TCI SFX Footer:       ${info.hasFooter ? pc.green(info.isV2Armored ? 'VALID (V2 Armored)' : 'VALID (V1)') : pc.red('NOT FOUND')}`
    );
    if (info.hasFooter) {
      console.log(`  Footer Offset:        ${info.footerOffset}`);
      console.log(`  Authenticode Trailer: ${info.hasAuthenticodeTrailer ? pc.green('PRESENT (coexistence valid)') : pc.yellow('Not detected (unsigned)')}`);
      console.log(`  Payload SHA-256:      ${info.payloadSha256Hex}`);
      console.log(`  UI Archive SHA-256:   ${info.uiSha256Hex}`);
    } else {
      process.exit(1);
    }
    return;
  }

  if (mode === 'check') {
    console.log(pc.cyan('\n🔐 Certificate & Signing Environment Check\n'));
    const signtool = findSignToolExecutable();
    if (signtool) {
      console.log(`  ✔ signtool.exe: ${pc.green(signtool)}`);
    } else {
      console.log(`  ⚠ signtool.exe: ${pc.yellow('Not found in PATH or Windows Kits 10')}`);
    }

    if (target) {
      const absCert = path.resolve(process.cwd(), target);
      if (!fs.existsSync(absCert)) {
        console.error(pc.red(`  ❌ Certificate file not found: ${absCert}`));
        process.exit(1);
      }
      const parsed = parseCertificateFile(absCert);
      console.log(`  ✔ Format:             ${parsed.format}`);
      if (parsed.subject) console.log(`  ✔ Subject:            ${parsed.subject}`);
      if (parsed.validTo) console.log(`  ✔ Valid To:           ${parsed.validTo}`);
      console.log(`  ✔ SHA-256 Thumbprint: ${pc.green(parsed.sha256Thumbprint)}`);
      console.log(`  ✔ SHA-1 Thumbprint:   ${parsed.sha1Thumbprint}`);
    }
    return;
  }

  console.error(pc.red(`❌ Unknown cert subcommand '${action}'. Use: check, generate, or verify.`));
  process.exit(1);
}
