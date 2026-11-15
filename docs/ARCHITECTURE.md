# Architecture Overview

`tauri-custom-installer` separates untrusted frontend presentation from a security-hardened native Rust core and a Node/TypeScript packaging CLI.

## Monorepo Component Map

```text
tauri-custom-installer/
├── packages/
│   ├── core/        # Rust engine: SFX footer, extraction, Win32 COM/CryptoAPI, registry, hooks, tci://
│   ├── runtime/     # Prebuilt Tauri v2 SFX stub executable (tci-runtime.exe)
│   ├── client/      # TypeScript SDK (InstallerApi, createInstallerStore, Mock driver, framework adapters)
│   └── cli/         # CLI toolkit (tci init, dev, build, cert, winget, upgrade, clean, check)
├── templates/       # Official starter UIs: react, futuristic-3d, svelte, vue, vanilla
├── scripts/         # orchestrate.mjs (clean, sync, audit, audit:ui, audit:diff, verify)
└── docs/            # Architecture, Integration, CI/CD, Registry specs
```

## Single-File SFX Binary Layout (`TCI_SFX_V1` & `TCI_SFX_V2`)

A compiled `-Setup.exe` installer contains every asset in a single portable PE executable:

```text
+-------------------------------------------------------------------+
| tci-runtime.exe (Prebuilt Tauri v2 Native Stub)                   |
+-------------------------------------------------------------------+
| ui.zip (Compiled HTML/JS/CSS bundle — V2: SHA-256 CTR armored)    |
+-------------------------------------------------------------------+
| payload (.tar.zst or .zip — Compressed Application Files)         |
+-------------------------------------------------------------------+
| manifest.json (Authoritative AppManifest — V2: SHA-256 CTR armored)|
+-------------------------------------------------------------------+
| TciFooter (136 bytes, "TCI_SFX_V1..." or "TCI_SFX_V2...")         |
+-------------------------------------------------------------------+
| [Optional] Authenticode PKCS#7 WIN_CERTIFICATE Signature Trailer  |
+-------------------------------------------------------------------+
```

### Key Runtime Design Details

1. **O(1) Streaming Memory Footprint**: `SectionReader` (`packages/core/src/footer.rs`) opens a bounded window directly over the payload offset inside the running `.exe`, streaming multi-gigabyte archives without reading the entire payload into RAM.
2. **Release V2 Cryptographic Armor**: During `tci build`, `ui.zip` and `manifest.json` can be armored (`armor: true` unless obfuscation/release protections are disabled). Keystream blocks derive from `SHA256("TCI_ARMOR_V2" || payload_sha256 || ui_sha256 || le_u64(runtime_size) || section_tag || le_u64(counter))`.
3. **Authenticode Coexistence**: `read_footer_from_path` searches backwards across trailing signature padding so Authenticode signatures added after packaging never break footer discovery.
4. **Zero-Payload Uninstaller (`uninstall.exe`)**: On installation completion, `write_stripped_uninstaller` emits `<install_dir>\uninstall.exe` without the payload section and re-armors V2 UI/manifest sections cleanly under `payload_sha256 = [0; 32]`.
5. **Custom `tci://` Protocol (`packages/core/src/lib.rs`)**: Serves UI bundle assets directly from the verified `ui.zip` buffer with `percent_decode_path` + `sanitize_archive_entry_path` guards and strict MIME mapping.

## Native Windows Integrations (`packages/core`)

- **COM & Shell (`shortcuts.rs`)**: `IShellLinkW` shortcut creation with explicit AppUserModelID (`AUMID`) and `IFileOpenDialog` directory selection.
- **CryptoAPI (`certs.rs`)**: DER/PEM parsing, allow-listed store names (`Root`, `TrustedPublisher`, `CA`, `My`), SHA-256 thumbprint verification, symlink checks, and direct `CertOpenStore` + `CertAddEncodedCertificateToStore`.
- **Registry & Hooks (`registry.rs`, `commands.rs`)**: Add/Remove Programs (`Uninstall`), URL protocols, file associations, Run key autostart, `PATH` updates, and allow-listed declarative hooks (`WriteRegistry`, `CopyFile`, `RunBundledExe`, `InstallCertificate`). `TCI_DRY_RUN=1` redirects registry writes to `HKCU\Software\tci-sandbox\...` and makes certificate imports validated no-ops.
- **Transactional Rollback (`extractor.rs`, `uninstaller.rs`)**: Tracks newly created files/directories during install so cancellation or extraction errors roll back cleanly, and uses a delayed self-cleanup worker when uninstalling from `<install_dir>\uninstall.exe`.
