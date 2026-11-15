# Integration Guide

Integrate `tauri-custom-installer` into any **Tauri v2** desktop repository in minutes.

## 1. Prerequisites

- **Node.js** `>= 20` (or **Bun** `>= 1.1`)
- **Rust** toolchain (`rustc`, `cargo`) + Windows MSVC build tools
- Optional (for Authenticode signing): Windows SDK containing `signtool.exe`

Validate your local environment at any time:

```bash
npx @tauri-custom-installer/cli check
```

## 2. Scaffold an Installer UI

Inside your Tauri v2 project root, initialize one of the five supported templates (`react`, `futuristic-3d`, `svelte`, `vue`, or `vanilla`):

```bash
# React (default)
npx @tauri-custom-installer/cli init

# Interactive Three.js 3D UI
npx @tauri-custom-installer/cli init --template futuristic-3d

# Svelte 5 / Vue 3 / Vanilla TS
npx @tauri-custom-installer/cli init --template svelte
npx @tauri-custom-installer/cli init --template vue
npx @tauri-custom-installer/cli init --template vanilla
```

This creates:
- `./installer/` (customizable Vite UI app + `src/installer.config.json`)
- `./tci.config.json` (authoritative production installer configuration)
- Safe `.gitignore` entries (`certs/`, `*.pfx`, `*.p12`, `*.key`, `*.key.pem`, `.tci/`, `.payload_staging/`)

## 3. Configure `tci.config.json`

Edit `tci.config.json` to customize metadata, install scope, bundled certificates, UI obfuscation, and Authenticode signing:

```jsonc
{
  "appName": "Acme Studio",
  "appId": "com.acme.studio",
  "version": "1.2.0",
  "publisher": "Acme Software Inc.",
  "executableName": "acme-studio.exe",
  "uiRoot": "./installer",
  "installMode": "perUser",
  "obfuscate": true,
  "certificates": [
    {
      "path": "./certs/acme-ca.cer",
      "store": "TrustedPublisher",
      "scope": "currentUser",
      "sha256Thumbprint": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    }
  ],
  "sign": {
    "pfxPath": "./certs/codesign.pfx",
    "passwordEnv": "TCI_PFX_PASSWORD",
    "timestampUrl": "http://timestamp.digicert.com"
  }
}
```

### Configuration Tips
- **`obfuscate`**: Defaults to `true` on release builds (`tci build`). Removes sourcemaps, strips comments, encodes JS strings, and enables V2 SHA-256 CTR SFX armoring. Pass `false` only when inspecting debug builds.
- **`certificates`**: Bundles `.cer` / `.crt` files into `.tci/certs/` during packaging and installs them natively into Windows CryptoAPI stores (`Root`, `TrustedPublisher`, `CA`, or `My`) on install. Always pin `sha256Thumbprint` in production.
- **Certificate Helpers**: Run `tci cert check` to verify Windows SDK `signtool.exe` availability, `tci cert generate` for local self-signed test certs, or `tci cert verify ./certs/acme-ca.cer` to inspect SHA-256 thumbprints.

## 4. Develop & Test Your Installer UI

Run the browser simulator with HMR:

```bash
npx @tauri-custom-installer/cli dev
```

Exercise every workflow using URL query strings:
- `?scenario=success`
- `?scenario=app_running`
- `?scenario=already_installed_upgrade`
- `?scenario=insufficient_space`
- `?scenario=uninstall`

## 5. Build, Sign & Clean Up

Compile your Tauri application, stage payloads, armor/obfuscate UI sections, and emit `<AppName>-Setup.exe`:

```bash
npx @tauri-custom-installer/cli build
```

Generate WinGet manifests if publishing to `winget-pkgs`:

```bash
npx @tauri-custom-installer/cli winget
```

Clean intermediate build/staging folders or upgrade workspace versions later:

```bash
npx @tauri-custom-installer/cli clean
npx @tauri-custom-installer/cli upgrade
```
