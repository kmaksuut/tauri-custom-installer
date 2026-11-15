# AGENTS.md — Tauri Custom Installer Contributor & AI Guide

Welcome to `tauri-custom-installer` (`tci`). This repository is a monorepo for building modern, customizable, web-based Windows installers for Tauri v2 applications without NSIS.

## Repository Architecture

- `packages/core` (`tauri-custom-installer-core`): Rust core library implementing SFX V1/V2 binary footer reading & Authenticode-tolerant scanning (`footer.rs`), streaming `.tar.zst` / `.zip` extraction and transactional rollback (`extractor.rs`), disk & deny-list validation (`disk.rs`), native Win32 COM shortcuts + AUMID (`shortcuts.rs`), Windows Registry lifecycle + `TCI_DRY_RUN=1` sandbox (`registry.rs`), native Win32 CryptoAPI certificate installation (`certs.rs`), process detection/termination (`process.rs`), uninstaller + delayed self-cleanup worker (`uninstaller.rs`), and the `tci://` custom protocol handler (`lib.rs`).
- `packages/runtime` (`tci-runtime`): Minimal prebuilt Tauri v2 runtime executable bundled into Single-File SFX installers (`[tci-runtime.exe][ui.zip][payload][manifest][136-byte TciFooter][optional Authenticode]`).
- `packages/client` (`@tauri-custom-installer/client`): Framework-agnostic TypeScript SDK (`InstallerApi`, `createInstallerStore`, simulator mock for browser dev) plus bindings for `react`, `svelte`, `vue`, and `solid`.
- `packages/cli` (`@tauri-custom-installer/cli`, bins `tci` and `tauri-custom-installer`): CLI toolkit providing `init`, `dev`, `build` (with release UI obfuscation & SFX V2 cryptographic armor), `cert`, `upgrade` (`update`), `clean`, `winget`, and `check` (`doctor`).
- `templates/`: Official UI starter templates (`react`, `futuristic-3d`, `svelte`, `vue`, `vanilla`).
- `scripts/orchestrate.mjs`: Permanent repository orchestrator (`clean`, `sync`, `audit`, `audit:diff`, `audit:ui`, `verify`, `all`).
- `.agents/skills/` & `.claude/agents/`: Specialized AI skills and subagent definitions (`tci-orchestrator`, `tci-template-author`, `tci-security-auditor`, `tci-ui-expert`, `tci-test-engineer`).

## Mandatory Security & Architectural Invariants

1. **Authoritative Manifest Trust Boundary**: Sensitive metadata (`app_name`, `app_id`, `executable_name`, `hooks`, `certificates`, `url_schemes`, `file_associations`, `add_to_path`, `uncompressed_size_bytes`) MUST be read by Rust core via `get_authoritative_manifest()` (appended SFX manifest or trusted config), NEVER trusted from unverified frontend IPC payloads.
2. **Zero Shell-Out for OS Integration**: Shortcuts, folder dialogs (`shortcuts.rs`), and certificate store installation (`certs.rs`) use native Win32 COM / CryptoAPI. Do NOT shell out to PowerShell, `cmd.exe`, `certutil`, or VBScript.
3. **Symlink, Reparse Point, and Bomb Guards**: Always validate archive paths with `sanitize_archive_entry_path`, reject symlinks/reparse points (`is_reparse_point`), enforce `MAX_SINGLE_FILE_BYTES` (4 GB) and `MAX_TOTAL_EXTRACTED_BYTES` (16 GB) in `extractor.rs`, and keep dangerous install path protections in `disk.rs`.
4. **Protocol, Certificate & Hook Safety**: `tci://` URI paths in `packages/core/src/lib.rs` must decode via `percent_decode_path` and validate via `sanitize_archive_entry_path`. Declarative registry hooks (`run_declarative_hooks` in `commands.rs`) must preserve `is_allowed_hook_registry_key` restrictions and `TCI_DRY_RUN=1` sandbox redirection (`Software\tci-sandbox\...`). Certificate installation (`certs.rs`) must enforce store allow-lists, thumbprint verification when configured, and `TCI_DRY_RUN=1` no-op safety.
5. **Template UI Parity**: Every template in `templates/*` must use `@tauri-custom-installer/client`, validate the install path via `InstallerApi.validateInstallPath` before installing, check/handle running processes with stored PIDs via `InstallerApi.checkRunning`, guard WebGL context failures gracefully, and support install + uninstall modes (including error and running-process recovery views).

## Common Commands

- Orchestrate full hygiene, version sync, security audit, and tests:
  `npm run orchestrate`
- Run individual orchestrator stages:
  `npm run orchestrate:audit` | `node scripts/orchestrate.mjs audit:diff` | `node scripts/orchestrate.mjs audit:ui` | `npm run orchestrate:sync` | `npm run orchestrate:clean` | `npm run orchestrate:verify`
- Build TypeScript Client SDK & CLI:
  `npm run build`
- Run Rust Core Tests:
  `cargo test --package tauri-custom-installer-core`
- Run Client SDK Tests:
  `npm --prefix packages/client run test`
- Inspect Publish Tarball Hygiene:
  `npm pack --dry-run`

## Adding or Updating Templates & Versions

- Update canonical `version` and `repository.url` in root `package.json`, then run `npm run orchestrate:sync` to propagate across all JS and Rust manifests automatically.
- Keep build artifacts (`dist/`, `node_modules/`, `src-tauri/gen/`, `src-tauri/payload/`, `.payload_staging/`) out of version control and npm tarballs.
- When adding a new template under `templates/<name>`, update `AVAILABLE_TEMPLATES` in `packages/cli/src/commands/init.ts`, update `.github/workflows/ci.yml`, and run `npm run orchestrate:audit`.
