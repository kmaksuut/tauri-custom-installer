import { InstallerApi } from '@tauri-custom-installer/client';
import installerConfig from './installer.config.json';

const APP_NAME = installerConfig.appName;
const APP_ID = installerConfig.appId;
const APP_VERSION = installerConfig.appVersion;
const PUBLISHER = installerConfig.publisher;
const EXECUTABLE_NAME = installerConfig.executableName;

let installPath = '';
let isPathValid = true;
let existingVersion: string | null = null;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function setError(message: string | null) {
  const banner = document.getElementById('error-banner');
  if (!banner) return;
  if (message) {
    banner.textContent = message;
    banner.classList.remove('hidden');
  } else {
    banner.textContent = '';
    banner.classList.add('hidden');
  }
}

async function validatePath(targetPath: string): Promise<boolean> {
  const statusEl = document.getElementById('path-status');
  const installBtn = document.getElementById('btn-install') as HTMLButtonElement | null;

  try {
    const validation = await InstallerApi.validateInstallPath(
      targetPath,
      installerConfig.requiredBytes
    );
    isPathValid = validation.is_valid;
    if (installBtn) {
      installBtn.disabled = !validation.is_valid;
    }

    if (statusEl) {
      statusEl.classList.remove('status-ok', 'status-error');
      if (validation.is_valid) {
        statusEl.classList.add('status-ok');
        const freeText = `Available space: ${formatBytes(validation.available_bytes)}`;
        statusEl.textContent = existingVersion
          ? `Upgrading existing v${existingVersion} • ${freeText}`
          : freeText;
      } else {
        statusEl.classList.add('status-error');
        statusEl.textContent = validation.error_message || 'Invalid installation directory.';
      }
    }
    return validation.is_valid;
  } catch (err) {
    isPathValid = false;
    if (installBtn) installBtn.disabled = true;
    if (statusEl) {
      statusEl.classList.remove('status-ok');
      statusEl.classList.add('status-error');
      statusEl.textContent = err instanceof Error ? err.message : String(err);
    }
    return false;
  }
}

async function init() {
  const info = await InstallerApi.getSystemInfo(APP_NAME, APP_ID, installerConfig.requiredBytes);
  installPath = info.default_install_path;
  existingVersion = info.existing_version || null;

  const pathInput = document.getElementById('input-path') as HTMLInputElement | null;
  if (pathInput) {
    pathInput.value = installPath;
    pathInput.addEventListener('input', (e) => {
      installPath = (e.target as HTMLInputElement).value;
      setError(null);
      void validatePath(installPath);
    });
  }

  await validatePath(installPath);

  const installBtn = document.getElementById('btn-install') as HTMLButtonElement | null;
  if (installBtn && existingVersion && info.action === 'upgrade') {
    installBtn.textContent = `Upgrade to v${APP_VERSION}`;
  }

  document.getElementById('app-name')!.innerText = `${APP_NAME} v${APP_VERSION}`;
  document.getElementById('window-title')!.innerText = info.is_uninstall_mode
    ? `${APP_NAME} Uninstaller`
    : `${APP_NAME} Setup`;

  if (info.is_uninstall_mode) {
    document.getElementById('step-welcome')?.classList.add('hidden');
    document.getElementById('step-uninstall')?.classList.remove('hidden');
  }

  document.getElementById('btn-minimize')?.addEventListener('click', () => {
    void InstallerApi.minimizeInstaller();
  });

  document.getElementById('btn-close')?.addEventListener('click', () => {
    void InstallerApi.exitInstaller();
  });

  document.getElementById('btn-browse')?.addEventListener('click', async () => {
    setError(null);
    const selected = await InstallerApi.selectFolder(installPath, APP_NAME);
    if (selected) {
      installPath = selected;
      if (pathInput) pathInput.value = selected;
      await validatePath(installPath);
    }
  });

  document.getElementById('btn-install')?.addEventListener('click', async () => {
    setError(null);
    const valid = isPathValid ? await validatePath(installPath) : false;
    if (!valid) return;

    const chkDesktop = (document.getElementById('chk-desktop') as HTMLInputElement).checked;
    const chkStartMenu = (document.getElementById('chk-startmenu') as HTMLInputElement).checked;

    const progressFill = document.getElementById('progress-fill')!;
    const progressFile = document.getElementById('progress-file')!;

    try {
      const running = await InstallerApi.checkRunning(EXECUTABLE_NAME, installPath);
      if (running.is_running) {
        await InstallerApi.killRunning(running.process_ids, EXECUTABLE_NAME, installPath);
      }

      document.getElementById('step-welcome')?.classList.add('hidden');
      document.getElementById('step-installing')?.classList.remove('hidden');

      await InstallerApi.startInstallation(
        {
          app_name: APP_NAME,
          app_id: APP_ID,
          app_version: APP_VERSION,
          publisher: PUBLISHER,
          executable_name: EXECUTABLE_NAME,
          install_dir: installPath,
          create_desktop_shortcut: chkDesktop,
          create_start_menu_shortcut: chkStartMenu,
          auto_launch_on_startup: false,
          launch_after_install: true,
        },
        (prog) => {
          progressFill.style.width = `${prog.percent}%`;
          progressFile.innerText = prog.current_file || 'Finalizing...';
        }
      );

      document.getElementById('step-installing')?.classList.add('hidden');
      document.getElementById('step-completed')?.classList.remove('hidden');
    } catch (err) {
      document.getElementById('step-installing')?.classList.add('hidden');
      document.getElementById('step-welcome')?.classList.remove('hidden');
      setError(err instanceof Error ? err.message : String(err));
    }
  });

  document.getElementById('btn-uninstall')?.addEventListener('click', async () => {
    setError(null);
    try {
      await InstallerApi.startUninstallation(
        {
          app_id: APP_ID,
          install_dir: installPath,
          purge_user_data: false,
        },
        APP_NAME,
        EXECUTABLE_NAME,
        () => {}
      );
      await InstallerApi.exitInstaller();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  });

  document.getElementById('btn-finish')?.addEventListener('click', async () => {
    try {
      await InstallerApi.launchInstalledApp(`${installPath}\\${EXECUTABLE_NAME}`);
    } finally {
      await InstallerApi.exitInstaller();
    }
  });
}

void init();
