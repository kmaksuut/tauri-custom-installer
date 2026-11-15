# @tauri-custom-installer/cli

Command-line toolkit (`tci` / `tauri-custom-installer`) for scaffolding, developing, signing, hardening, and packaging Single-File Windows SFX installers for **Tauri v2** applications—without NSIS or WiX.

## Installation

Install in your Tauri v2 workspace or run directly via `bunx` or `npx`:

```bash
# Using Bun:
bun add -d @tauri-custom-installer/cli
# Or run without global/local install:
bunx @tauri-custom-installer/cli init

# Using npm:
npm install -D @tauri-custom-installer/cli
# Or run without global/local install:
npx @tauri-custom-installer/cli init
```

Both `tci` and `tauri-custom-installer` bin aliases are exposed.

## CLI Commands

### `tci init`

Scaffolds an installer UI directory (`./installer` by default), writes `tci.config.json`, adds certificate/secret ignore rules to `.gitignore`, and installs workspace dependencies.

```bash
# Using Bun:
bunx @tauri-custom-installer/cli init --template react
bunx @tauri-custom-installer/cli init --template futuristic-3d
bunx @tauri-custom-installer/cli init --template svelte
bunx @tauri-custom-installer/cli init --template vue
bunx @tauri-custom-installer/cli init --template vanilla

# Using npm / npx:
npx @tauri-custom-installer/cli init --template react
npx @tauri-custom-installer/cli init --template futuristic-3d
npx @tauri-custom-installer/cli init --template svelte
npx @tauri-custom-installer/cli init --template vue
npx @tauri-custom-installer/cli init --template vanilla
```

- **Template aliases**: `3d`, `gaming`, `gaming-3d`, `three`, `threejs`, `futuristic` resolve cleanly to `futuristic-3d`.
- **Scopes**: Choose default install scope (`perUser`, `perMachine`, or `both`) interactively or via `--scope`.

### `tci dev`

Launches the installer UI dev server with Hot Module Replacement and the `@tauri-custom-installer/client` browser simulator (`?scenario=success|app_running|already_installed_upgrade|insufficient_space|uninstall`), or runs the live native Tauri dry-run window (`TCI_DRY_RUN=1`) backed by an isolated `HKCU\Software\tci-sandbox` registry hive.

### `tci build`

Compiles your Tauri application and installer frontend, stages certificates & payload archives, and produces a standalone Windows `<AppName>-Setup.exe` SFX executable:

1. **Tauri & UI Build**: Builds your application payload (`.tar.zst` or `.zip`) and installer frontend bundle (`dist/`).
2. **Release UI Obfuscation**: When `obfuscate !== false` (release builds), removes `.map` sourcemaps, strips comments, injects HTML guard metadata, and encodes JS string literals (`utils/obfuscator.ts`).
3. **Certificate Staging & Pinning**: Validates configured `.cer`/`.crt` certificates (`certificates[]` in `tci.config.json`), verifies optional `sha256Thumbprint` pins, and stages them under `.tci/certs/`.
4. **SFX V2 Cryptographic Armor**: Wraps `ui.zip` and embedded `manifest.json` using symmetric SHA-256 CTR-mode armoring (`TCI_SFX_V2`) bound to payload/UI SHA-256 digests and stub size (`utils/sfx.ts`).
5. **Authenticode Code Signing**: Signs the assembled executable using `sign.command` (`signCommand`), local PFX (`sign.pfxPath` + `sign.passwordEnv`), or installed store thumbprint (`certificateThumbprint`) + RFC 3161 timestamping (`timestampUrl`) without exposing `/p` passwords in error logs.

### `tci cert [action] [target]`

Manages development code-signing certificates and certificate inspection:

- `tci cert check` — Locates `signtool.exe` from installed Windows Kits / SDKs and validates signing readiness.
- `tci cert generate` — Generates a self-signed `.pfx` + `.cer` development certificate using a temporary generated password saved outside version control.
- `tci cert verify <path>` — Parses DER/PEM X.509 certificates or PFX bundles and prints SHA-256 thumbprint metadata for pinning in `tci.config.json`.

### `tci upgrade` (alias: `update`)

Checks and updates `@tauri-custom-installer/client` and workspace installer configuration cleanly to the latest CLI version.

### `tci clean`

Removes temporary `.tci/`, `.payload_staging/`, staging archives, and intermediate build artifacts cleanly without touching source templates.

### `tci check` (alias: `doctor`)

Verifies local Windows build readiness (`rustc`, `cargo`, Tauri CLI, `signtool.exe`, `tci.config.json` validity).

### `tci winget`

Generates **WinGet** (`winget-pkgs`) submission YAML manifests (version, installer, defaultLocale) from your `tci.config.json` and built `-Setup.exe` SHA-256 hash.

## Configuration (`tci.config.json`)

```jsonc
{
  "appName": "My App",
  "appId": "com.example.myapp",
  "version": "1.0.0",
  "publisher": "Example Corp",
  "executableName": "my-app.exe",
  "installMode": "perUser",
  "obfuscate": true,
  "certificates": [
    {
      "path": "./certs/company-root.cer",
      "store": "TrustedPublisher",
      "scope": "currentUser",
      "sha256Thumbprint": "optional-64-char-sha256-hex"
    }
  ],
  "sign": {
    "pfxPath": "./certs/codesign.pfx",
    "passwordEnv": "TCI_PFX_PASSWORD",
    "timestampUrl": "http://timestamp.digicert.com"
  }
}
```

## Security & Operational Guarantees

- **Zero Credential Leaks**: Command execution redacts `/p <secret>` arguments automatically on error (`utils/exec.ts`).
- **Prebuilt Stub Fallback**: Bundles compressed `tci-runtime` metadata cleanly and locates Windows SDK tools automatically.
- **Ignore Hygiene**: `tci init` updates `.gitignore` to exclude `certs/`, `*.pfx`, `*.p12`, `*.key`, `*.key.pem`, and `.tci/`.
