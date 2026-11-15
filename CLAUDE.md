# CLAUDE.md

Read [AGENTS.md](./AGENTS.md) for the complete architecture, security invariants, and orchestrator workflow.

## Quick Rules

- **Source of truth**: Canonical package version and repository URL live in root `package.json`. Run `node scripts/orchestrate.mjs sync` after changing them so all Cargo and npm manifests stay synchronized.
- **Verification before finishing**: Run `node scripts/orchestrate.mjs all` (cleans stale artifacts, verifies version/repo parity, runs security + PR diff + UI parity audits, builds TS packages, runs client + Rust tests, and checks `npm pack --dry-run`).
- **Specialized Subagents & Skills**: Use `tci-security-auditor`, `tci-ui-expert`, `tci-test-engineer`, `tci-orchestrator`, and `tci-template-author` in `.agents/skills/` and `.claude/agents/`.
- **Rust core (`packages/core/src/`)**: Never introduce PowerShell/CMD/VBS/`certutil` spawning for shortcuts, registry, or certificate operations, never weaken `sanitize_archive_entry_path`, `is_reparse_point`, `is_dangerous_install_path`, or `is_allowed_hook_registry_key`, and preserve `TCI_DRY_RUN=1` sandbox routing in `registry.rs`, `certs.rs`, and `commands.rs`.
- **CLI & Templates (`packages/cli/`, `templates/`)**: Use `getCliRootDir()` when resolving packaged `templates/` or `vendor/` paths, use `splitCommandLine()` when executing user-configured commands (`beforeBuildCommand`, `signCommand`), and keep generated files (`dist/`, `payload/`, `gen/`, `.payload_staging/`) out of `npm pack`.
