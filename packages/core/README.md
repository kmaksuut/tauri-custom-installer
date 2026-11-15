# tauri-custom-installer-core

Rust native core engine (`packages/core`) powering Windows Self-Extracting (SFX) installers, transactionally safe extraction, Win32 COM shortcuts, CryptoAPI certificate installation, Windows Registry ARP integration, and the `tci://` custom protocol handler for Tauri v2.

## Core Modules

| Module | Responsibility |
| --- | --- |
| `lib.rs` | `tci://` custom protocol asset serving with `percent_decode_path`, path sanitization, and strict mime resolution |
| `footer.rs` | 136-byte `TciFooter` parser (`TCI_SFX_V1` & armored `TCI_SFX_V2`), Authenticode-tolerant trailer scanner, zero-copy `SectionReader`, SHA-256 CTR section armoring, and stripped `uninstall.exe` generator |
| `extractor.rs` | Streaming `.tar.zst` & `.zip` decompression, archive path traversal checks (`sanitize_archive_entry_path`), archive bomb guards (`MAX_SINGLE_FILE_BYTES` = 4 GB, `MAX_TOTAL_EXTRACTED_BYTES` = 16 GB), and transactional rollback |
| `disk.rs` | Drive free-space checks, writability probing, and dangerous system path deny-list (`Windows`, `System32`, drive roots, etc.) |
| `shortcuts.rs` | Zero-shell-out Win32 COM `IShellLinkW` shortcut creation, AppUserModelID (`AUMID`) assignment, and `IFileOpenDialog` native folder selection |
| `registry.rs` | Windows Uninstall (ARP) registration, custom URL schemes, file associations, Run key autostart, `PATH` updates, and `TCI_DRY_RUN=1` sandbox isolation (`HKCU\Software\tci-sandbox\...`) |
| `certs.rs` | Native Win32 CryptoAPI (`CertOpenStore`, `CertAddEncodedCertificateToStore`) certificate installation supporting DER & PEM inputs, store allow-lists, SHA-256 thumbprint pinning, reparse-point checks, and dry-run safety |
| `process.rs` | Native Win32 running-process detection by executable path/image and safe PID termination |
| `uninstaller.rs` | Reparse-point/junction guard (`is_reparse_point`), clean artifact removal, optional user-data purge, and delayed self-deleting worker |
| `commands.rs` | Tauri IPC commands enforcing `get_authoritative_manifest()` and allow-listed declarative hooks (`run_declarative_hooks`) |
| `models.rs` | Serde models for `AppManifest`, `DeclarativeHooks`, `HookAction`, `CertificateConfig`, progress events, and validation responses |

## Binary SFX Layout (V1 & V2 Armored)

```text
[ tci-runtime.exe stub ]
[ ui.zip ]               (V2: SHA-256 CTR armored)
[ payload (.tar.zst/.zip) ]
[ manifest.json ]        (V2: SHA-256 CTR armored)
[ 136-byte TciFooter ]   ("TCI_SFX_V1..." or "TCI_SFX_V2...")
[ optional PE Authenticode WIN_CERTIFICATE trailer ]
```

- **Authenticode Coexistence**: `read_footer_from_path` locates the `TciFooter` cleanly even after `signtool.exe` appends an Authenticode PKCS#7 signature trailer at EOF.
- **Zero-Payload Uninstaller (`uninstall.exe`)**: `write_stripped_uninstaller` copies only the runtime stub, UI bundle, and manifest—Omitting payload bytes and re-armoring V2 sections cleanly under `payload_sha256 = [0; 32]`.

## Security Invariants

1. **Authoritative Manifest**: Security-critical fields (`app_name`, `app_id`, `executable_name`, `hooks`, `certificates`, `url_schemes`, `file_associations`, `add_to_path`) come exclusively from the verified `AppManifest` read by Rust—never from untrusted frontend IPC payloads.
2. **Zero Shell-Out OS Integration**: No PowerShell, `cmd.exe`, VBScript, or `certutil.exe` subprocesses are spawned for shortcuts, folder dialogs, or certificate store imports.
3. **Symlink & Reparse Point Rejection**: Rejects archive symlinks and Windows NTFS junctions/reparse points during both installation and certificate import.
4. **Dry-Run Isolation (`TCI_DRY_RUN=1`)**: Registry writes redirect to `HKCU\Software\tci-sandbox\...` and Win32 CryptoAPI store imports become validated no-ops after format/thumbprint checks pass.

## Testing

```bash
cargo test --package tauri-custom-installer-core
```
