<script lang="ts">
  import { onMount } from 'svelte';
  import {
    InstallerApi,
    type InstallProgress,
    type PathValidation,
  } from '@tauri-custom-installer/client';
  import installerConfig from './installer.config.json';

  let appName = $state(installerConfig.appName);
  let appId = $state(installerConfig.appId);
  let appVersion = $state(installerConfig.appVersion);
  let publisher = $state(installerConfig.publisher);
  let executableName = $state(installerConfig.executableName);
  let requiredBytes = $state(installerConfig.requiredBytes || 50 * 1024 * 1024);

  let step = $state<
    'welcome' | 'running_warning' | 'installing' | 'completed' | 'error' | 'uninstall'
  >('welcome');
  let action = $state('install');
  let installPath = $state('');
  let createDesktop = $state(true);
  let createStartMenu = $state(true);
  let autoLaunch = $state(false);
  let launchAfter = $state(true);
  let purgeUserData = $state(false);
  let errorMessage = $state('');
  let validation = $state<PathValidation | null>(null);
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
    try {
      const info = await InstallerApi.getSystemInfo(appName, appId, requiredBytes);
      if (info.manifest) {
        appName = info.manifest.appName;
        appId = info.manifest.appId;
        appVersion = info.manifest.version;
        publisher = info.manifest.publisher;
        executableName = info.manifest.executableName;
        requiredBytes = info.manifest.uncompressedSizeBytes || requiredBytes;
      }
      installPath = info.default_install_path;
      action = info.action || 'install';
      if (info.is_uninstall_mode) {
        step = 'uninstall';
      }
      validation = await InstallerApi.validateInstallPath(installPath, requiredBytes);
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : String(e);
      step = 'error';
    }
  });

  async function handlePathChange(newPath: string) {
    installPath = newPath;
    validation = await InstallerApi.validateInstallPath(newPath, requiredBytes);
  }

  async function handleBrowse() {
    const selected = await InstallerApi.selectFolder(installPath, appName);
    if (selected) {
      await handlePathChange(selected);
    }
  }

  async function startInstallFlow() {
    try {
      const running = await InstallerApi.checkRunning(executableName, installPath);
      if (running.is_running) {
        step = 'running_warning';
        return;
      }
      await performInstall();
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : String(e);
      step = 'error';
    }
  }

  async function closeRunningAndInstall() {
    try {
      await InstallerApi.killRunning([], executableName, installPath);
      await performInstall();
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : String(e);
      step = 'error';
    }
  }

  async function performInstall() {
    step = 'installing';
    errorMessage = '';
    try {
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
          auto_launch_on_startup: autoLaunch,
          launch_after_install: launchAfter,
        },
        (p) => {
          progress = p;
        }
      );
      step = 'completed';
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : String(e);
      step = 'error';
    }
  }

  async function handleCancel() {
    await InstallerApi.cancelInstallation();
  }

  async function handleUninstall() {
    try {
      await InstallerApi.startUninstallation(
        {
          app_id: appId,
          install_dir: installPath,
          purge_user_data: purgeUserData,
        },
        appName,
        executableName,
        () => {}
      );
      await InstallerApi.exitInstaller();
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : String(e);
      step = 'error';
    }
  }

  async function handleFinish() {
    if (launchAfter) {
      await InstallerApi.launchInstalledApp(`${installPath}\\${executableName}`);
    }
    await InstallerApi.exitInstaller();
  }
</script>

<div class="window" role="main">
  <div class="titlebar" data-tauri-drag-region>
    <div class="title" data-tauri-drag-region>
      <span class="dot"></span>
      <span>{appName} {step === 'uninstall' ? 'Uninstaller' : 'Setup'}</span>
    </div>
    <div class="win-controls">
      <button
        class="win-btn"
        aria-label="Minimize"
        onclick={() => InstallerApi.minimizeInstaller()}
      >
        ─
      </button>
      <button
        class="win-btn close"
        aria-label="Close"
        onclick={() => InstallerApi.exitInstaller()}
      >
        ✕
      </button>
    </div>
  </div>

  <div class="content">
    {#if step === 'welcome'}
      <div>
        <h1>
          {appName}
          <span class="badge">v{appVersion}</span>
          {#if action === 'upgrade'}
            <span class="badge upgrade">Upgrade</span>
          {:else if action === 'repair'}
            <span class="badge">Repair</span>
          {/if}
        </h1>
        <p class="subtitle">Published by {publisher}</p>

        <label class="field-label" for="svelte-install-path">Installation Directory</label>
        <div class="path-row">
          <input
            id="svelte-install-path"
            class="path-input"
            type="text"
            value={installPath}
            oninput={(e) => handlePathChange((e.target as HTMLInputElement).value)}
          />
          <button class="secondary-btn" onclick={handleBrowse}>Browse...</button>
        </div>

        {#if validation && !validation.is_valid}
          <p class="validation-err" role="alert">{validation.error_message}</p>
        {:else if validation}
          <p class="space-info">
            Available Disk Space: {(validation.available_bytes / (1024 * 1024 * 1024)).toFixed(1)} GB
          </p>
        {/if}

        <div class="options">
          <label class="check-label">
            <input type="checkbox" bind:checked={createDesktop} />
            <span>Create Desktop shortcut</span>
          </label>
          <label class="check-label">
            <input type="checkbox" bind:checked={createStartMenu} />
            <span>Create Start Menu shortcut</span>
          </label>
          <label class="check-label">
            <input type="checkbox" bind:checked={autoLaunch} />
            <span>Start automatically with Windows</span>
          </label>
        </div>
      </div>

      <div class="actions">
        <button
          class="primary-btn"
          disabled={validation !== null && !validation.is_valid}
          onclick={startInstallFlow}
        >
          {action === 'upgrade' ? 'Upgrade Now' : action === 'repair' ? 'Repair' : 'Install Now'}
        </button>
      </div>
    {:else if step === 'running_warning'}
      <div class="center-content" role="alert">
        <h2>{appName} is Currently Running</h2>
        <p class="subtitle">Please close running instances before continuing installation.</p>
        <div class="btn-row">
          <button class="secondary-btn" onclick={() => (step = 'welcome')}>Back</button>
          <button class="primary-btn" onclick={closeRunningAndInstall}>
            Close App & Continue
          </button>
        </div>
      </div>
    {:else if step === 'installing'}
      <div class="center-content" aria-live="polite">
        <h2>Installing {appName}... ({Math.round(progress.percent)}%)</h2>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {progress.percent}%"></div>
        </div>
        <p class="file-name">{progress.current_file || 'Unpacking archive...'}</p>
        <div class="actions">
          <button class="secondary-btn" onclick={handleCancel}>Cancel</button>
        </div>
      </div>
    {:else if step === 'completed'}
      <div class="center-content">
        <h2>Installation Successful!</h2>
        <p class="subtitle">{appName} is ready to run on your PC.</p>
        <label class="check-label" style="margin-bottom: 16px;">
          <input type="checkbox" bind:checked={launchAfter} />
          <span>Launch {appName} now</span>
        </label>
        <button class="primary-btn" onclick={handleFinish}>Finish</button>
      </div>
    {:else if step === 'error'}
      <div class="center-content" role="alert">
        <h2>Setup Encountered an Issue</h2>
        <p class="validation-err">{errorMessage}</p>
        <button class="secondary-btn" onclick={() => (step = 'welcome')}>Back to Setup</button>
      </div>
    {:else if step === 'uninstall'}
      <div class="center-content">
        <h2>Uninstall {appName}?</h2>
        <p class="subtitle">This will remove {appName} from {installPath}.</p>
        <label class="check-label" style="margin-bottom: 18px;">
          <input type="checkbox" bind:checked={purgeUserData} />
          <span>Delete application settings and WebView2 cache files</span>
        </label>
        <button class="primary-btn" onclick={handleUninstall}>Confirm Uninstall</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .window {
    width: 100vw;
    height: 100vh;
    max-width: 680px;
    max-height: 450px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 16px;
    color: #f8fafc;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-sizing: border-box;
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
  .badge {
    font-size: 11px;
    background: rgba(255, 62, 0, 0.15);
    color: #ff6b35;
    padding: 2px 8px;
    border-radius: 999px;
    margin-left: 6px;
  }
  .badge.upgrade {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
  }
  .win-controls {
    display: flex;
    gap: 6px;
  }
  .win-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 13px;
    padding: 4px 8px;
    border-radius: 6px;
  }
  .win-btn:hover {
    background: #1e293b;
    color: #f8fafc;
  }
  .win-btn.close:hover {
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
    margin: 6px 0 14px 0;
  }
  .field-label {
    display: block;
    font-size: 11px;
    color: #94a3b8;
    margin-bottom: 6px;
  }
  .path-row {
    display: flex;
    gap: 8px;
    margin-bottom: 6px;
  }
  .path-input {
    flex: 1;
    background: #1e293b;
    border: 1px solid #334155;
    color: #f8fafc;
    padding: 8px 12px;
    border-radius: 8px;
    font-family: monospace;
    font-size: 12px;
  }
  .validation-err {
    font-size: 12px;
    color: #f87171;
    margin: 4px 0 12px 0;
  }
  .space-info {
    font-size: 11px;
    color: #64748b;
    margin: 4px 0 12px 0;
  }
  .secondary-btn {
    background: #1e293b;
    border: 1px solid #334155;
    color: #e2e8f0;
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 12px;
    cursor: pointer;
  }
  .options {
    display: flex;
    flex-direction: column;
    gap: 8px;
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
    transition: width 0.2s ease;
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
    padding-top: 14px;
  }
  .btn-row {
    display: flex;
    gap: 10px;
    margin-top: 16px;
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
  .primary-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .primary-btn:hover:not(:disabled) {
    background: #ff5722;
  }
</style>
