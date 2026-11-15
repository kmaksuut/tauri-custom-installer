---
name: tci-orchestrator
description: Maintains repository health for tauri-custom-installer by cleaning temporary artifacts, synchronizing versions and metadata across npm and Cargo manifests, auditing security and template parity, and verifying builds and tarballs. Use when triaging bugs, preparing releases, updating versions, or cleaning the workspace.
---

# TCI Repository Orchestrator

This repository includes a zero-dependency permanent orchestrator script at `scripts/orchestrate.mjs`. Run it whenever migrating versions, debugging cross-package mismatches, fixing security issues, or validating releases.

## Commands

- **Full orchestration (`clean` -> `sync` -> `audit` -> `verify`)**:
  ```bash
  node scripts/orchestrate.mjs all
  # or: npm run orchestrate
  ```
- **Clean disposable artifacts**:
  ```bash
  node scripts/orchestrate.mjs clean
  # preview only: node scripts/orchestrate.mjs clean --dry-run
  ```
  Removes `templates/*/{dist,src-tauri/gen,src-tauri/payload,.tci,.tci-sdk,.payload_staging}` and `examples/sample-tauri-app/installer/{dist,src-tauri/gen,src-tauri/payload,.payload_staging}`, plus empty orphan directories outside `node_modules/`, `.git/`, and `target/`.
- **Synchronize versions and repository metadata**:
  ```bash
  node scripts/orchestrate.mjs sync
  # preview only: node scripts/orchestrate.mjs sync --dry-run
  ```
  Reads the canonical `version` and `repository.url` from root `package.json` and synchronizes them into:
  - `packages/cli/package.json` and `packages/client/package.json`
  - `packages/core/Cargo.toml` and `packages/runtime/Cargo.toml`
  - All `templates/*/package.json` and `templates/*/src-tauri/Cargo.toml`
  - `examples/sample-tauri-app/installer/{package.json,src-tauri/Cargo.toml}`
- **Static security & parity audit**:
  ```bash
  node scripts/orchestrate.mjs audit
  ```
  Verifies:
  1. Version and repository URL parity across every `package.json` and `Cargo.toml`.
  2. Template parity across all templates in `templates/` (`index.html`, `package.json`, `src-tauri/Cargo.toml`, `@tauri-custom-installer/client`, `validateInstallPath`, `checkRunning`, error handling).
  3. Rust core security invariants (`get_authoritative_manifest`, `sanitize_archive_entry_path`, `is_reparse_point`, `is_allowed_hook_registry_key`, and absence of `powershell`/`cmd.exe`/`wscript` shell-outs in shortcuts/registry code).
  4. Presence of AI contributor tooling (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules/tauri-custom-installer.mdc`, `.github/copilot-instructions.md`, `.agents/skills/*`).
  5. Tarball cleanliness (flags leftover `templates/*/dist`, `templates/*/node_modules`, `templates/*/src-tauri/gen`, or `templates/*/src-tauri/payload`).
- **Build & test verification**:
  ```bash
  node scripts/orchestrate.mjs verify
  ```
  Builds `@tauri-custom-installer/client` and `@tauri-custom-installer/cli`, runs client tests, runs `cargo test --package tauri-custom-installer-core`, and inspects `npm pack --dry-run` to ensure clean package tarballs.

## Downstream User CLI Equivalents

For applications initialized with `tci init`:
- `tci check` (`tci doctor`): Inspect toolchain prerequisites, `tci.config.json` sync, SDK/core paths, and prebuilt runtime status.
- `tci upgrade [--template <name>] [--reset-ui] [--dry-run]`: Upgrade vendored `.tci-sdk/client`, `src-tauri/core`, `installer.config.json`, `Cargo.toml`, `tauri.conf.json`, `capabilities/`, and `installer/AGENTS.md` without overwriting custom UI files unless `--reset-ui` is specified.
- `tci clean [--all] [--dry-run]`: Clean `.payload_staging`, `payload`, `gen`, `dist`, and `.tci` caches in an app workspace.
