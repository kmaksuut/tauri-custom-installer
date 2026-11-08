import { InstallerApi } from '@tauri-custom-installer/client';

const APP_NAME = 'My Application';
const APP_ID = 'com.example.vanillaapp';
const APP_VERSION = '1.0.0';
const PUBLISHER = 'Independent Developer';
const EXECUTABLE_NAME = 'my-app.exe';

let installPath = '';

async function init() {
  const info = await InstallerApi.getSystemInfo(APP_NAME, APP_ID);
  installPath = info.default_install_path;

  document.getElementById('app-name')!.innerText = APP_NAME;
  document.getElementById('window-title')!.innerText = `${APP_NAME} Setup`;

  document.getElementById('btn-close')?.addEventListener('click', () => {
    InstallerApi.exitInstaller();
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

  document.getElementById('btn-finish')?.addEventListener('click', async () => {
    await InstallerApi.launchInstalledApp(`${installPath}\\${EXECUTABLE_NAME}`);
    await InstallerApi.exitInstaller();
  });
}

init();
