# GitHub Copilot Instructions — Tauri Custom Installer

This repository builds custom web-based Tauri v2 installers packaged as Single-File SFX executables (`[tci-runtime.exe][ui.zip][payload][manifest][136-byte TciFooter]`).

See [AGENTS.md](../AGENTS.md) for the full contributor guide.

## Key Engineering Rules

- **Rust Core (`packages/core`)**:
  - Use `get_authoritative_manifest()` as the security trust boundary for installation/hook metadata.
  - Reject archive path traversal (`sanitize_archive_entry_path`), symlinks/junctions (`is_reparse_point`), and decompression bombs (`MAX_SINGLE_FILE_BYTES`, `MAX_TOTAL_EXTRACTED_BYTES`).
  - Keep `InstallManifest` backward-compatible with older versions via `#[serde(default)]`.
  - Respect `TCI_DRY_RUN=1` registry sandboxing (`Software\tci-sandbox\...`) in `registry.rs` and `commands.rs`.
  - Use Win32 COM in `shortcuts.rs`; never shell out to PowerShell/CMD/VBScript.
- **CLI & Client (`packages/cli`, `packages/client`)**:
  - Keep `packages/cli/scripts/bundle-assets.cjs` and `.npmignore` free of `node_modules/`, `target/`, `dist/`, `gen/`, `payload/`, and `.payload_staging/`.
  - Resolve CLI package paths via `getCliRootDir()` (`packages/cli/src/commands/init.ts`).
- **Verification**:
  - Run `npm run orchestrate` (`node scripts/orchestrate.mjs all`) to clean artifacts, sync versions across npm/Cargo manifests, run security/parity audits, build TypeScript packages, run Rust/Client tests, and verify `npm pack --dry-run`.
