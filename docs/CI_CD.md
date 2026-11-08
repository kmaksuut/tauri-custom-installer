# Continuous Integration & Delivery (CI/CD)

Automate building and releasing your custom Tauri v2 installer executables on GitHub Actions.

---

## GitHub Actions Release Workflow

Create `.github/workflows/release-installer.yml` in your repository:

```yaml
name: Release Custom Installer

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  build-installer:
    runs-on: windows-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Install Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install Rust Toolchain
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: x86_64-pc-windows-msvc

      - name: Cache Cargo Dependencies
        uses: Swatinem/rust-cache@v2

      - name: Install Node & Bun Dependencies
        run: |
          bun install
          cd installer && bun install

      - name: Build Custom Installer
        run: bun run installer:build

      - name: Publish GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: dist/*-Setup-*.exe
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## Cross-Compilation & Signing

### Code Signing on Windows
To sign the resulting `<AppName>-Setup.exe` with your Authenticode Certificate, add a step before publishing:

```yaml
      - name: Sign Setup Executable
        run: |
          & "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe" sign `
            /f "${{ secrets.CERT_PATH }}" `
            /p "${{ secrets.CERT_PASSWORD }}" `
            /tr "http://timestamp.digicert.com" `
            /td sha256 `
            /fd sha256 `
            dist/*-Setup-*.exe
```
