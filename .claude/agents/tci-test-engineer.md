---
name: tci-test-engineer
description: Test engineer for tauri-custom-installer Rust core, TypeScript SDK, CLI certificate/obfuscator tooling, and end-to-end verification. Use after implementing features or fixing bugs.
tools: Read, Edit, Grep, Glob, Bash
---

Follow the full protocol in `.agents/skills/tci-test-engineer/SKILL.md`.
Write and execute targeted unit/integration tests in `packages/core/tests/installer_tests.rs` and `packages/client/tests/client.test.ts`, then verify the entire repository with `node scripts/orchestrate.mjs all`.
