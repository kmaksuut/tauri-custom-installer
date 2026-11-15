# Tauri Custom Installer (`tci`)

Build fast, customizable, web-powered **Windows Self-Extracting (SFX) installers** for **Tauri v2** applications—without NSIS, Inno Setup, or WebView bootstrapper bloat.

> [!NOTE]
> `tauri-custom-installer` replaces legacy script-based installers with a compact Tauri v2 SFX runtime stub (`tci-runtime.exe`), streaming `.tar.zst` / `.zip` decompression, native Win32 OS integration (zero PowerShell/shell-outs), release UI obfuscation, SHA-256 CTR SFX V2 armoring, and browser-based hot-reload previewing.

<p align="center">
  <img src="./assets/tci1.png" alt="Tauri Custom Installer Welcome Screen" width="48%" />
  &nbsp;
  <img src="./assets/tci2.png" alt="Tauri Custom Installer Progress View" width="48%" />
</p>

---

## ⚡ The Mental Model: How It Works

Traditional installers run rigid 1990s scripts (NSIS) or download massive 100MB+ Chromium runtimes. `tauri-custom-installer` packages everything into **a single standalone `.exe`** with zero external dependencies:

```text
+-----------------------------------------------------------------------------------------+
|                                  YourApp-Setup.exe                                      |
+-----------------------------------------------------------------------------------------+
| [1] tci-runtime.exe (Lightweight Tauri v2 Rust executable stub)                         |
| [2] ui.zip          (Compiled Svelte/React/Vue/3D wizard — Encrypted via SHA-256 CTR)   |
| [3] payload archive (Compressed application files: .tar.zst or .zip)                    |
| [4] manifest.json   (Authoritative app metadata & registry hooks — SHA-256 CTR encrypted)|
| [5] 136-byte Footer (Byte offsets, payload SHA-256, UI SHA-256, V2 armor signature)     |
| [6] [Optional]      (Appended Authenticode PKCS#7 code signature from signtool)         |
+-----------------------------------------------------------------------------------------+
```

### What happens when the user double-clicks `YourApp-Setup.exe`?
1. **Instant Launch**: `tci-runtime.exe` starts immediately and scans its own binary backwards to read the 136-byte footer.
2. **In-Memory Decryption**: The UI bundle (`ui.zip`) is decrypted in memory using symmetric SHA-256 CTR stream ciphering bound to the binary digests.
3. **Embedded Custom Protocol**: The installer UI loads over `tci://localhost/` directly from RAM without touching the hard drive.
4. **Authoritative Trust Boundary**: Rust core enforces all security invariants. Malicious frontend IPC tampering cannot alter installation targets or registry keys.
5. **Streaming Zero-Copy Extraction**: Gigabytes of files decompress in streaming chunks ($O(1)$ RAM usage) with automatic transactional rollback on error.
6. **Zero Shell-Out Windows Integration**: Desktop shortcuts (`IShellLinkW`), directory dialogs (`IFileOpenDialog`), certificate store enrollment (`CryptoAPI`), and Add/Remove Programs registry entries execute natively without spawning `powershell.exe` or `cmd.exe`.
7. **Clean Uninstaller**: Writes `<install_dir>\uninstall.exe` without copying the payload, preserving the custom UI for seamless uninstallation and delayed self-deletion.

---

## 🎨 Pick Your UI Template

Run `init` inside your Tauri v2 project and pick the framework you love:

| Template | Alias(es) | Framework Stack | Features | Guide |
| --- | --- | --- | --- | --- |
| `react` *(default)* | — | React 19 + Tailwind CSS | Glassmorphism, Lucide Icons, `useInstaller` hook | [React Guide](./templates/react/README.md) |
| `futuristic-3d` | `3d`, `gaming`, `gaming-3d`, `three`, `threejs` | Three.js + WebGL + React | Interactive 3D core, procedural Web Audio SFX, fallback guard | [3D Guide](./templates/futuristic-3d/README.md) |
| `svelte` | — | **Svelte 5 Runes** (`$state`) | Ultra-light reactive wizard, minimal bundle size | [Svelte Guide](./templates/svelte/README.md) |
| `vue` | — | Vue 3 Composition API | `<script setup lang="ts">`, Vue reactivity | [Vue Guide](./templates/vue/README.md) |
| `vanilla` | — | Zero-Framework HTML/CSS/TS | Smallest possible binary footprint | [Vanilla Guide](./templates/vanilla/README.md) |

---

## 🚀 Step-by-Step: Adding to an Existing Tauri Project

### Step 1: Scaffold Installer UI (Example: Svelte Template)

Run in your Tauri v2 project root:

```bash
# Svelte 5 Template
npx @tauri-custom-installer/cli init --template svelte

# Or choose any other template:
# npx @tauri-custom-installer/cli init --template react
# npx @tauri-custom-installer/cli init --template futuristic-3d
```

This command automatically:
- Creates an `./installer` folder with your chosen template.
- Generates `tci.config.json` in your project root.
- Updates `.gitignore` to prevent secret leaks (`certs/`, `*.pfx`, `*.key`, `.tci/`).

### Step 2: Develop & Preview in Hot-Reload Simulator

Test your installer in your favorite browser with hot module replacement (HMR):

```bash
npx @tauri-custom-installer/cli dev
```

Append query parameters in your browser URL to test every possible edge case:
- `http://localhost:5173/?scenario=success` — Normal clean install flow.
- `http://localhost:5173/?scenario=app_running` — App process currently running; tests PID killer prompt.
- `http://localhost:5173/?scenario=already_installed_upgrade` — Existing installation detected; upgrade flow.
- `http://localhost:5173/?scenario=insufficient_space` — Simulates disk space failure.
- `http://localhost:5173/?scenario=uninstall` — Previews the uninstaller view.

> [!TIP]
> Want to test the real native Windows window? Run `npx @tauri-custom-installer/cli dev --tauri`. This opens a native window in **Safe Sandbox Mode (`TCI_DRY_RUN=1`)** where registry writes are isolated under `HKCU\Software\tci-sandbox` without touching system settings.

### Step 3: Build Standalone Windows Installer (`-Setup.exe`)

```bash
npx @tauri-custom-installer/cli build
```

This compiles your Tauri app, obfuscates the frontend JavaScript, encrypts the SFX V2 sections, verifies certificates, and outputs your final installer to `target/tci/<AppName>-Setup.exe`.

---

## 🔐 Certificates & Code Signing: Everything You Need to Know

There are **two completely different certificate concepts** developers encounter. `tauri-custom-installer` handles both natively:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. Authenticode Code Signing (Signs Your .exe)                                         │
│    • Purpose: Eliminates Windows SmartScreen warnings ("Unknown Publisher").          │
│    • Tooling: Uses signtool.exe via tci.config.json `sign` configuration.              │
└────────────────────────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 2. Windows Certificate Store Installation (Installs CA/Publisher into Windows)        │
│    • Purpose: Enrolls private Root CAs or publisher certs on the user's machine.       │
│    • Tooling: Native Win32 CryptoAPI via tci.config.json `certificates` array.         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1. Authenticode Code Signing (Signing the Installer Executable)

#### Local Development Testing:
1. Verify that `signtool.exe` is available:
   ```bash
   npx @tauri-custom-installer/cli cert check
   ```
2. Generate a temporary local development certificate:
   ```bash
   npx @tauri-custom-installer/cli cert generate --out-dir ./certs
   ```
3. Configure `tci.config.json`:
   ```jsonc
   {
     "sign": {
       "pfxPath": "./certs/dev-cert.pfx",
       "passwordEnv": "TCI_PFX_PASSWORD", // Set $env:TCI_PFX_PASSWORD in your shell
       "timestampUrl": "http://timestamp.digicert.com"
     }
   }
   ```

#### Production Signing (Hardware Token / Certificate Store):
If your code signing certificate is stored in your Windows Certificate Store (e.g., EV Hardware Token / YubiKey):
```jsonc
{
  "sign": {
    "certificateThumbprint": "1a2b3c4d5e6f...",
    "timestampUrl": "http://timestamp.digicert.com"
  }
}
```

> [!IMPORTANT]
> **Authenticode Coexistence Guarantee**: When `signtool.exe` signs a binary, it appends a `WIN_CERTIFICATE` structure at the end of the file. `tauri-custom-installer`'s footer scanner automatically accounts for Authenticode signatures, meaning signing will **never** corrupt the installer footer or payload.

---

### 2. Windows Certificate Store Installation (Bundling Certificates)

If your application needs to install a custom root certificate, enterprise CA, or trusted publisher certificate onto the target Windows machine during installation:

1. Inspect your `.cer` file's SHA-256 thumbprint:
   ```bash
   npx @tauri-custom-installer/cli cert verify ./certs/my-ca.cer
   ```
2. Add it to `tci.config.json`:
   ```jsonc
   {
     "certificates": [
       {
         "path": "./certs/my-ca.cer",
         "store": "TrustedPublisher", // "Root" | "TrustedPublisher" | "CA" | "My"
         "scope": "currentUser",      // "currentUser" (no UAC) or "localMachine" (requires admin)
         "sha256Thumbprint": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
       }
     ]
   }
   ```

#### Why is this secure?
- **Zero Shell-Out**: Executes directly via native Win32 `CertOpenStore` and `CertAddEncodedCertificateToStore`. No `powershell` or `certutil.exe` subprocesses are spawned.
- **SHA-256 Pinning**: Verifies that the certificate bytes strictly match `sha256Thumbprint` before installation.
- **Reparse-Point & Symlink Guard**: Blocks path traversal attacks and junction escapes.
- **Dry-Run Safe**: In `TCI_DRY_RUN=1` development mode, certificates are parsed and validated without touching system stores.

---

## 🛠️ CLI Command Cheatsheet

| Command | Alias | What It Does |
| --- | --- | --- |
| `tci init` | — | Scaffold installer UI template, `tci.config.json`, and `.gitignore` rules |
| `tci dev` | — | Launch browser HMR simulator or native sandboxed window (`--tauri`) |
| `tci build` | — | Package single-file SFX V2 armored & signed Windows `-Setup.exe` |
| `tci cert check` | — | Locate Windows SDK `signtool.exe` |
| `tci cert generate` | — | Create local self-signed `.pfx` certificate for development |
| `tci cert verify <file>` | — | Parse certificate and output pinned SHA-256 thumbprint |
| `tci winget` | — | Generate WinGet submission YAML manifests (`winget-pkgs`) |
| `tci upgrade` | `update` | Synchronize client SDK and installer template to latest version |
| `tci clean` | — | Clean intermediate staging artifacts (`.tci/`, `.payload_staging/`) |
| `tci check` | `doctor` | Verify Rust toolchain, Tauri CLI, and signing prerequisites |

---

## ⚙️ Full Configuration Schema (`tci.config.json`)

```jsonc
{
  "appName": "Acme Studio",
  "appId": "com.acme.studio",
  "version": "1.0.0",
  "publisher": "Acme Software Inc.",
  "executableName": "acme-studio.exe",
  "uiRoot": "./installer",
  "installMode": "perUser", // "perUser" | "perMachine" | "both"
  "obfuscate": true,        // Strips sourcemaps, encodes JS strings, enables SFX V2 armor
  "certificates": [
    {
      "path": "./certs/root-ca.cer",
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

---

## 📦 Monorepo Architecture

- [`packages/core`](./packages/core/README.md) (`tauri-custom-installer-core`): Rust SFX V1/V2 engine, `SectionReader`, `.tar.zst`/`.zip` transactional extractor, Win32 COM/CryptoAPI OS integration, Registry sandbox, and `tci://` protocol handler.
- [`packages/client`](./packages/client/README.md) (`@tauri-custom-installer/client`): Framework-agnostic SDK (`InstallerApi`, `createInstallerStore`, simulator driver, RTL/i18n) + React/Svelte/Vue/Solid bindings.
- [`packages/cli`](./packages/cli/README.md) (`@tauri-custom-installer/cli`): `tci` CLI for scaffolding, obfuscation, SFX V2 packaging, certificates, signing, and WinGet generation.
- [`packages/runtime`](./packages/runtime/Cargo.toml) (`tci-runtime`): Minimal Tauri v2 runtime executable embedded at the head of Single-File SFX binaries.
- [Architecture Deep-Dive](./docs/ARCHITECTURE.md) | [Integration Guide](./docs/INTEGRATION_GUIDE.md) | [Security Policy](./SECURITY.md) | [CI/CD Guide](./docs/CI_CD.md) | [Windows Registry Spec](./docs/WINDOWS_REGISTRY.md)

---

## 🧪 Repository Health & Orchestrator

Maintain repository hygiene, synchronize versions, and run audits across all packages:

```bash
# Run full clean, version sync, security/UI audits, and package test suites:
npm run orchestrate

# Individual orchestrator stages:
npm run orchestrate:clean
npm run orchestrate:sync
npm run orchestrate:audit
npm run orchestrate:audit:ui
npm run orchestrate:audit:diff
npm run orchestrate:verify
```

---

## 📄 License

MIT © [kmaksuut](https://github.com/kmaksuut)
