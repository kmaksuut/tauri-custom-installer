<script lang="ts">
  import { onMount } from 'svelte';
  import { InstallerApi, type InstallProgress } from '@tauri-custom-installer/client';

  const appName = 'Svelte Application';
  const appId = 'com.example.svelteapp';
  const appVersion = '1.0.0';
  const publisher = 'Svelte Developer';
  const executableName = 'svelte-app.exe';

  let step = $state<'welcome' | 'installing' | 'completed'>('welcome');
  let installPath = $state('');
  let createDesktop = $state(true);
  let createStartMenu = $state(true);
  let progress = $state<InstallProgress>({
    stage: 'idle',
    current_file: '',
    files_completed: 0,
    total_files: 0,
    bytes_extracted: 0,
    total_bytes: 0,
    percent: 0,
  });

  onMount(async () => {
    const info = await InstallerApi.getSystemInfo(appName, appId);
    installPath = info.default_install_path;
  });

  async function handleInstall() {
    step = 'installing';
    await InstallerApi.startInstallation(
      {
        app_name: appName,
        app_id: appId,
        app_version: appVersion,
        publisher,
        executable_name: executableName,
        install_dir: installPath,
        create_desktop_shortcut: createDesktop,
        create_start_menu_shortcut: createStartMenu,
        auto_launch_on_startup: false,
        launch_after_install: true,
      },
      (p) => {
        progress = p;
      }
    );
    step = 'completed';
  }

  async function handleFinish() {
    await InstallerApi.launchInstalledApp(`${installPath}\\${executableName}`);
    await InstallerApi.exitInstaller();
  }
</script>

<div class="window">
  <div class="titlebar" data-tauri-drag-region>
    <div class="title">
      <span class="dot"></span>
      <span>{appName} Setup</span>
    </div>
    <button class="close-btn" onclick={() => InstallerApi.exitInstaller()}>✕</button>
  </div>

  <div class="content">
    {#if step === 'welcome'}
      <div>
        <h1>{appName}</h1>
        <p class="subtitle">Built with modern Svelte 5 and Tauri v2.</p>

        <div class="options">
          <label class="check-label">
            <input type="checkbox" bind:checked={createDesktop} />
            <span>Create Desktop shortcut</span>
          </label>
          <label class="check-label">
            <input type="checkbox" bind:checked={createStartMenu} />
            <span>Create Start Menu shortcut</span>
          </label>
        </div>
      </div>

      <div class="actions">
        <button class="primary-btn" onclick={handleInstall}>Install Now</button>
      </div>
    {:else if step === 'installing'}
      <div class="center-content">
        <h2>Installing {appName}...</h2>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {progress.percent}%"></div>
        </div>
        <p class="file-name">{progress.current_file || 'Unpacking archive...'}</p>
      </div>
    {:else if step === 'completed'}
      <div class="center-content">
        <h2>Installation Successful!</h2>
        <p class="subtitle">{appName} is ready to run on your PC.</p>
        <button class="primary-btn" onclick={handleFinish}>Finish</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .window {
    width: 680px;
    height: 450px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 16px;
    color: #f8fafc;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .titlebar {
    height: 40px;
    background: rgba(15, 23, 42, 0.9);
    border-bottom: 1px solid #1e293b;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ff3e00;
  }
  .close-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 14px;
  }
  .close-btn:hover {
    color: #f87171;
  }
  .content {
    flex: 1;
    padding: 24px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .center-content {
    margin: auto 0;
  }
  h1 {
    font-size: 22px;
    margin: 0;
  }
  h2 {
    font-size: 18px;
    margin: 0 0 10px 0;
  }
  .subtitle {
    font-size: 13px;
    color: #94a3b8;
    margin: 6px 0 20px 0;
  }
  .options {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 20px;
  }
  .check-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #cbd5e1;
    cursor: pointer;
  }
  .progress-bar {
    width: 100%;
    height: 12px;
    background: #1e293b;
    border-radius: 999px;
    overflow: hidden;
    margin: 16px 0 8px 0;
  }
  .progress-fill {
    height: 100%;
    background: #ff3e00;
    transition: width 0.3s ease;
  }
  .file-name {
    font-size: 11px;
    font-family: monospace;
    color: #64748b;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    border-top: 1px solid #1e293b;
    padding-top: 16px;
  }
  .primary-btn {
    background: #ff3e00;
    color: #ffffff;
    border: none;
    padding: 10px 20px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  .primary-btn:hover {
    background: #ff5722;
  }
</style>
