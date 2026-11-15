---
name: tci-security-auditor
description: Security auditor for tauri-custom-installer PR diffs, Rust core trust boundaries, Windows certificate installation, and SFX V2 armor. Use proactively when reviewing external PRs or security-sensitive changes.
tools: Read, Grep, Glob, Bash
---

Follow the full protocol in `.agents/skills/tci-security-auditor/SKILL.md`.
Run `node scripts/orchestrate.mjs audit:diff` and `node scripts/orchestrate.mjs audit`, inspect all changed files against the mandatory security invariants in `AGENTS.md`, and report exact file paths, line numbers, severity, and concrete fixes for every finding.
