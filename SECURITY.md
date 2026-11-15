# Security Policy & Architecture Invariants

Security is foundational to `tauri-custom-installer` because installers routinely handle filesystem extraction, Windows Registry entries, certificate stores, and elevated setup flows.

## Supported Versions

Only the latest minor release (`0.2.x` / `master`) receives active security patches and orchestrator audits.

## Architectural Security Controls

### 1. Authoritative Manifest Trust Boundary
- Security-sensitive fields (`app_name`, `app_id`, `executable_name`, `hooks`, `certificates`, `url_schemes`, `file_associations`, `add_to_path`, `uncompressed_size_bytes`) are always read directly by `packages/core` via `get_authoritative_manifest()` from the embedded SFX footer manifest or trusted Rust configuration.
- Untrusted IPC payloads originating from WebView JavaScript cannot alter target registry keys, executable targets, or hook actions.

### 2. Zero Shell-Out OS Integration
- Windows Desktop/Start Menu shortcuts (`IShellLinkW`), native folder pickers (`IFileOpenDialog`), and certificate store installation (`CertOpenStore` / `CertAddEncodedCertificateToStore`) execute directly through native Win32 COM and CryptoAPI bindings.
- `packages/core` never spawns `powershell.exe`, `cmd.exe`, `wscript.exe`, or `certutil.exe` to execute installation steps.
- CLI execution helpers (`packages/cli/src/utils/exec.ts`) automatically redact `/p <secret>` arguments before surfacing subprocess errors.

### 3. SFX V2 Cryptographic Armor & Integrity (`footer.rs` / `sfx.ts`)
- Payload streams are checksummed with SHA-256 and verified before extraction via zero-copy bounded `SectionReader`.
- Release SFX V2 executables (`TCI_SFX_V2`) armor both `ui.zip` and `manifest.json` using symmetric SHA-256 CTR encryption keyed to the payload hash, UI hash, runtime stub size, and section tag, preventing trivial static tampering or plain-text secret scraping while remaining compatible with trailing PE Authenticode `WIN_CERTIFICATE` signatures.
- Stripped uninstaller generation (`write_stripped_uninstaller`) omits payload bytes and cleanly re-armors V2 UI and manifest sections under a zeroed payload digest.

### 4. Archive Bomb, Path Traversal & Reparse-Point Defenses (`extractor.rs` / `disk.rs` / `uninstaller.rs`)
- Archive entries are normalized and checked with `sanitize_archive_entry_path` (rejects `..`, drive prefixes, null bytes, UNC paths, and rooted paths).
- Archive symlinks and Windows NTFS junctions/reparse points (`is_reparse_point`) are rejected during extraction, certificate installation, and uninstallation.
- Streaming decompression enforces hard size caps: `MAX_SINGLE_FILE_BYTES` (4 GB) and `MAX_TOTAL_EXTRACTED_BYTES` (16 GB), with transactional rollback on failure or cancellation.
- `disk.rs` blocks dangerous installation targets (Windows directory, `System32`, drive roots, critical system paths).

### 5. Declarative Hooks & Win32 Certificate Pinning (`commands.rs` / `certs.rs`)
- Declarative registry hooks (`WriteRegistry`) are restricted via `is_allowed_hook_registry_key` and isolated under `HKCU\Software\tci-sandbox\...` whenever `TCI_DRY_RUN=1`.
- Bundled X.509 certificate installation enforces strict store allow-lists (`Root`, `TrustedPublisher`, `CA`, `My`), validates ASN.1 DER or PEM structure, verifies pinned lowercase SHA-256 thumbprints when configured (`sha256Thumbprint`), blocks symlink/reparse-point traversal, and performs dry-run no-ops under `TCI_DRY_RUN=1`.

### 6. `tci://` Custom Protocol Hardening (`lib.rs`)
- Custom protocol requests decode paths via `percent_decode_path` and sanitize every lookup via `sanitize_archive_entry_path` before reading files from the verified UI archive.

## Reporting a Vulnerability

Please **do not open public GitHub issues** for security vulnerabilities.
Instead, use GitHub's **Private Vulnerability Reporting** feature on `kmaksuut/tauri-custom-installer` or contact the maintainer privately with:
1. Affected package/module and version
2. Minimal reproduction steps or proof-of-concept
3. Potential impact and suggested remediation

## Automated Security Auditing

Contributors and CI can run repository security, UI parity, secret-hygiene, and diff audits locally:

```bash
npm run orchestrate:audit
npm run orchestrate:audit:ui
npm run orchestrate:audit:diff
```
