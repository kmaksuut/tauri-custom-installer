import { InstallerApi } from '@tauri-custom-installer/client';
import installerConfig from './installer.config.json';

const APP_NAME = installerConfig.appName;
const APP_ID = installerConfig.appId;
const APP_VERSION = installerConfig.appVersion;
const PUBLISHER = installerConfig.publisher;
const EXECUTABLE_NAME = installerConfig.executableName;

let installPath = '';

async function init() {
  const info = await InstallerApi.getSystemInfo(APP_NAME, APP_ID, installerConfig.requiredBytes);
  installPath = info.default_install_path;

  const pathInput = document.getElementById('input-path') as HTMLInputElement;
  if (pathInput) {
    pathInput.value = installPath;
    pathInput.addEventListener('input', (e) => {
      installPath = (e.target as HTMLInputElement).value;
    });
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
    InstallerApi.minimizeInstaller();
  });

  document.getElementById('btn-close')?.addEventListener('click', () => {
    InstallerApi.exitInstaller();
  });

  document.getElementById('btn-browse')?.addEventListener('click', async () => {
    const selected = await InstallerApi.selectFolder(installPath);
    if (selected) {
      installPath = selected;
      if (pathInput) pathInput.value = selected;
    }
  });

  document.getElementById('btn-install')?.addEventListener('click', async () => {
    const chkDesktop = (document.getElementById('chk-desktop') as HTMLInputElement).checked;
    const chkStartMenu = (document.getElementById('chk-startmenu') as HTMLInputElement).checked;

    document.getElementById('step-welcome')?.classList.add('hidden');
    document.getElementById('step-installing')?.classList.remove('hidden');

    const progressFill = document.getElementById('progress-fill')!;
    const progressFile = document.getElementById('progress-file')!;

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
  });

  document.getElementById('btn-uninstall')?.addEventListener('click', async () => {
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
  });

  document.getElementById('btn-finish')?.addEventListener('click', async () => {
    await InstallerApi.launchInstalledApp(`${installPath}\\${EXECUTABLE_NAME}`);
    await InstallerApi.exitInstaller();
  });
}

init();
