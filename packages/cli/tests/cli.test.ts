import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'bun:test';
import { generateDevCertificate, parseCertificateFile } from '../src/commands/cert';
import { runClean } from '../src/commands/clean';
import { splitCommandLine } from '../src/utils/exec';
import { obfuscateUiBundleDirectory } from '../src/utils/obfuscator';
import { buildSfxExecutable, inspectSfxExecutable } from '../src/utils/sfx';

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('TCI CLI Security, Armor, Signing & Hygiene', () => {
  it('splits shell-style command lines with single and double quotes safely', () => {
    const parsed = splitCommandLine(
      `"C:\\Program Files (x86)\\Windows Kits\\signtool.exe" sign /f 'C:\\My Certs\\dev.pfx' "%1"`
    );
    expect(parsed).toEqual([
      'C:\\Program Files (x86)\\Windows Kits\\signtool.exe',
      'sign',
      '/f',
      'C:\\My Certs\\dev.pfx',
      '%1',
    ]);
    expect(splitCommandLine('   ')).toEqual([]);
  });

  it('obfuscates UI JS strings, strips sourcemaps, injects HTML guard, and preserves valid ESM execution', async () => {
    const uiDir = makeTempDir('tci-cli-obf-');
    const jsPath = path.join(uiDir, 'bundle.js');
    const mapPath = path.join(uiDir, 'bundle.js.map');
    const htmlPath = path.join(uiDir, 'index.html');

    fs.writeFileSync(
      jsPath,
      `// Secret dev comment\nexport function getGreeting() {\n  const label = "SuperSecretInstallerTitle";\n  return label + " OK";\n}\n`,
      'utf8'
    );
    fs.writeFileSync(mapPath, '{"version":3}', 'utf8');
    fs.writeFileSync(htmlPath, '<!doctype html><html><head><title>App</title></head><body><!-- secret --></body></html>', 'utf8');

    const res = obfuscateUiBundleDirectory(uiDir, { seedHex: '00112233445566778899aabbccddeeff' });
    expect(res.sourcemapsRemoved).toBe(1);
    expect(res.filesProcessed).toBe(2);
    expect(res.stringsEncoded).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(mapPath)).toBe(false);

    const obfJs = fs.readFileSync(jsPath, 'utf8');
    expect(obfJs).not.toContain('SuperSecretInstallerTitle');
    expect(obfJs).not.toContain('Secret dev comment');

    const obfHtml = fs.readFileSync(htmlPath, 'utf8');
    expect(obfHtml).toContain('data-tci-guard="1"');
    expect(obfHtml).not.toContain('<!-- secret -->');

    const loaded = await import(pathToFileURL(jsPath).href);
    expect(loaded.getGreeting()).toBe('SuperSecretInstallerTitle OK');
  });

  it('builds V2 SHA-256 CTR armored SFX executables and detects Authenticode trailers', () => {
    const workDir = makeTempDir('tci-cli-sfx-');
    const runtimePath = path.join(workDir, 'tci-runtime.exe');
    const uiZipPath = path.join(workDir, 'ui.zip');
    const payloadPath = path.join(workDir, 'payload.tar.zst');
    const outExePath = path.join(workDir, 'MyApp-Setup.exe');

    fs.writeFileSync(runtimePath, Buffer.from('MZ_RUNTIME_STUB_BYTES_0123456789'));
    fs.writeFileSync(uiZipPath, Buffer.from('PK_FAKE_UI_ARCHIVE_PLAINTEXT_MARKER_XYZ'));
    fs.writeFileSync(payloadPath, Buffer.from('ZSTD_FAKE_PAYLOAD_DATA'));

    const buildRes = buildSfxExecutable({
      runtimeExePath: runtimePath,
      uiZipPath,
      payloadPath,
      manifest: { appName: 'ConfidentialAppName', version: '0.2.0' },
      outputExePath: outExePath,
      armor: true,
    });

    expect(buildRes.isV2Armored).toBe(true);

    const rawExe = fs.readFileSync(outExePath);
    expect(rawExe.includes(Buffer.from('ConfidentialAppName'))).toBe(false);
    expect(rawExe.includes(Buffer.from('PLAINTEXT_MARKER_XYZ'))).toBe(false);

    const inspectedUnsigned = inspectSfxExecutable(outExePath);
    expect(inspectedUnsigned.hasFooter).toBe(true);
    expect(inspectedUnsigned.isV2Armored).toBe(true);
    expect(inspectedUnsigned.hasAuthenticodeTrailer).toBe(false);

    // Append simulated Authenticode signature trailer
    fs.appendFileSync(outExePath, Buffer.alloc(1024, 0xaa));
    const inspectedSigned = inspectSfxExecutable(outExePath);
    expect(inspectedSigned.hasFooter).toBe(true);
    expect(inspectedSigned.isV2Armored).toBe(true);
    expect(inspectedSigned.hasAuthenticodeTrailer).toBe(true);
  });

  it('generates and parses valid ASN.1 DER development certificates', () => {
    const certDir = makeTempDir('tci-cli-cert-');
    const generated = generateDevCertificate(certDir, 'TCI Test Cert');
    expect(fs.existsSync(generated.cerPath)).toBe(true);
    expect(fs.existsSync(generated.keyPath)).toBe(true);
    expect(generated.sha256Thumbprint).toMatch(/^[0-9a-f]{64}$/);

    const parsed = parseCertificateFile(generated.cerPath);
    expect(parsed.format).toBe('DER');
    expect(parsed.sha256Thumbprint).toBe(generated.sha256Thumbprint);
    expect(parsed.sha1Thumbprint).toBe(generated.sha1Thumbprint);
  });

  it('cleans temporary staging and payload directories with runClean', () => {
    const workspaceDir = makeTempDir('tci-cli-clean-');
    const stagingDir = path.join(workspaceDir, 'installer', '.payload_staging');
    const payloadDir = path.join(workspaceDir, 'installer', 'src-tauri', 'payload');
    const tciCache = path.join(workspaceDir, '.tci');
    const keptSrc = path.join(workspaceDir, 'installer', 'src', 'App.tsx');

    fs.mkdirSync(stagingDir, { recursive: true });
    fs.mkdirSync(payloadDir, { recursive: true });
    fs.mkdirSync(tciCache, { recursive: true });
    fs.mkdirSync(path.dirname(keptSrc), { recursive: true });
    fs.writeFileSync(path.join(stagingDir, 'temp.bin'), '123');
    fs.writeFileSync(path.join(payloadDir, 'app_payload.zip'), '456');
    fs.writeFileSync(path.join(tciCache, 'state.json'), '{}');
    fs.writeFileSync(keptSrc, 'export const App = () => null;');

    const prevCwd = process.cwd();
    try {
      process.chdir(workspaceDir);
      runClean({ dryRun: false });
    } finally {
      process.chdir(prevCwd);
    }

    expect(fs.existsSync(stagingDir)).toBe(false);
    expect(fs.existsSync(payloadDir)).toBe(false);
    expect(fs.existsSync(tciCache)).toBe(false);
    expect(fs.existsSync(keptSrc)).toBe(true);
  });
});
