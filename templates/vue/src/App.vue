<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  InstallerApi,
  type InstallProgress,
  type PathValidation,
} from '@tauri-custom-installer/client';
import installerConfig from './installer.config.json';

const appName = ref(installerConfig.appName);
const appId = ref(installerConfig.appId);
const appVersion = ref(installerConfig.appVersion);
const publisher = ref(installerConfig.publisher);
const executableName = ref(installerConfig.executableName);
const requiredBytes = ref(installerConfig.requiredBytes || 50 * 1024 * 1024);

const step = ref<
  'welcome' | 'running_warning' | 'installing' | 'completed' | 'error' | 'uninstall'
>('welcome');
const action = ref('install');
const installPath = ref('');
const createDesktop = ref(true);
const createStartMenu = ref(true);
const autoLaunch = ref(false);
const launchAfter = ref(true);
const purgeUserData = ref(false);
const errorMessage = ref('');
const validation = ref<PathValidation | null>(null);
const progress = ref<InstallProgress>({
  stage: 'idle',
  current_file: '',
  files_completed: 0,
  total_files: 0,
  bytes_extracted: 0,
  total_bytes: 0,
  percent: 0,
});

onMounted(async () => {
  try {
    const info = await InstallerApi.getSystemInfo(
      appName.value,
      appId.value,
      requiredBytes.value
    );
    if (info.manifest) {
      appName.value = info.manifest.appName;
      appId.value = info.manifest.appId;
      appVersion.value = info.manifest.version;
      publisher.value = info.manifest.publisher;
      executableName.value = info.manifest.executableName;
      requiredBytes.value = info.manifest.uncompressedSizeBytes || requiredBytes.value;
    }
    installPath.value = info.default_install_path;
    action.value = info.action || 'install';
    if (info.is_uninstall_mode) {
      step.value = 'uninstall';
    }
    validation.value = await InstallerApi.validateInstallPath(
      installPath.value,
      requiredBytes.value
    );
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : String(e);
    step.value = 'error';
  }
});

async function handlePathChange(newPath: string) {
  installPath.value = newPath;
  validation.value = await InstallerApi.validateInstallPath(newPath, requiredBytes.value);
}

async function handleBrowse() {
  const selected = await InstallerApi.selectFolder(installPath.value, appName.value);
  if (selected) {
    await handlePathChange(selected);
  }
}

async function startInstallFlow() {
  try {
    const running = await InstallerApi.checkRunning(executableName.value, installPath.value);
    if (running.is_running) {
      step.value = 'running_warning';
      return;
    }
    await performInstall();
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : String(e);
    step.value = 'error';
  }
}

async function closeRunningAndInstall() {
  try {
    await InstallerApi.killRunning([], executableName.value, installPath.value);
    await performInstall();
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : String(e);
    step.value = 'error';
  }
}

async function performInstall() {
  step.value = 'installing';
  errorMessage.value = '';
  try {
    await InstallerApi.startInstallation(
      {
        app_name: appName.value,
        app_id: appId.value,
        app_version: appVersion.value,
        publisher: publisher.value,
        executable_name: executableName.value,
        install_dir: installPath.value,
        create_desktop_shortcut: createDesktop.value,
        create_start_menu_shortcut: createStartMenu.value,
        auto_launch_on_startup: autoLaunch.value,
        launch_after_install: launchAfter.value,
      },
      (p) => {
        progress.value = p;
      }
    );
    step.value = 'completed';
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : String(e);
    step.value = 'error';
  }
}

async function handleCancel() {
  await InstallerApi.cancelInstallation();
}

async function handleUninstall() {
  try {
    await InstallerApi.startUninstallation(
      {
        app_id: appId.value,
        install_dir: installPath.value,
        purge_user_data: purgeUserData.value,
      },
      appName.value,
      executableName.value,
      () => {}
    );
    await InstallerApi.exitInstaller();
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : String(e);
    step.value = 'error';
  }
}

async function handleFinish() {
  if (launchAfter.value) {
    await InstallerApi.launchInstalledApp(`${installPath.value}\\${executableName.value}`);
  }
  await InstallerApi.exitInstaller();
}
</script>

<template>
  <div class="window" role="main">
    <div class="titlebar" data-tauri-drag-region>
      <div class="title" data-tauri-drag-region>
        <span class="dot"></span>
        <span>{{ appName }} {{ step === 'uninstall' ? 'Uninstaller' : 'Setup' }}</span>
      </div>
      <div class="win-controls">
        <button
          class="win-btn"
          aria-label="Minimize"
          @click="InstallerApi.minimizeInstaller()"
        >
          ─
        </button>
        <button
          class="win-btn close"
          aria-label="Close"
          @click="InstallerApi.exitInstaller()"
        >
          ✕
        </button>
      </div>
    </div>

    <div class="content">
      <div v-if="step === 'welcome'">
        <h1>
          {{ appName }}
          <span class="badge">v{{ appVersion }}</span>
          <span v-if="action === 'upgrade'" class="badge">Upgrade</span>
          <span v-else-if="action === 'repair'" class="badge">Repair</span>
        </h1>
        <p class="subtitle">Published by {{ publisher }}</p>

        <label class="field-label" for="vue-install-path">Installation Directory</label>
        <div class="path-row">
          <input
            id="vue-install-path"
            class="path-input"
            type="text"
            :value="installPath"
            @input="(e) => handlePathChange((e.target as HTMLInputElement).value)"
          />
          <button class="secondary-btn" @click="handleBrowse">Browse...</button>
        </div>

        <p v-if="validation && !validation.is_valid" class="validation-err" role="alert">
          {{ validation.error_message }}
        </p>
        <p v-else-if="validation" class="space-info">
          Available Disk Space: {{ (validation.available_bytes / (1024 * 1024 * 1024)).toFixed(1) }} GB
        </p>

        <div class="options">
          <label class="check-label">
            <input type="checkbox" v-model="createDesktop" />
            <span>Create Desktop shortcut</span>
          </label>
          <label class="check-label">
            <input type="checkbox" v-model="createStartMenu" />
            <span>Create Start Menu shortcut</span>
          </label>
          <label class="check-label">
            <input type="checkbox" v-model="autoLaunch" />
            <span>Start automatically with Windows</span>
          </label>
        </div>
      </div>

      <div v-if="step === 'welcome'" class="actions">
        <button
          class="primary-btn"
          :disabled="validation !== null && !validation.is_valid"
          @click="startInstallFlow"
        >
          {{ action === 'upgrade' ? 'Upgrade Now' : action === 'repair' ? 'Repair' : 'Install Now' }}
        </button>
      </div>

      <div v-else-if="step === 'running_warning'" class="center-content" role="alert">
        <h2>{{ appName }} is Currently Running</h2>
        <p class="subtitle">Please close running instances before continuing installation.</p>
        <div class="btn-row">
          <button class="secondary-btn" @click="step = 'welcome'">Back</button>
          <button class="primary-btn" @click="closeRunningAndInstall">
            Close App & Continue
          </button>
        </div>
      </div>

      <div v-else-if="step === 'installing'" class="center-content" aria-live="polite">
        <h2>Installing {{ appName }}... ({{ Math.round(progress.percent) }}%)</h2>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progress.percent + '%' }"></div>
        </div>
        <p class="file-name">{{ progress.current_file || 'Unpacking archive...' }}</p>
        <div class="actions">
          <button class="secondary-btn" @click="handleCancel">Cancel</button>
        </div>
      </div>

      <div v-else-if="step === 'completed'" class="center-content">
        <h2>Installation Successful!</h2>
        <p class="subtitle">{{ appName }} is ready to run on your PC.</p>
        <label class="check-label" style="margin-bottom: 16px;">
          <input type="checkbox" v-model="launchAfter" />
          <span>Launch {{ appName }} now</span>
        </label>
        <button class="primary-btn" @click="handleFinish">Finish</button>
      </div>

      <div v-else-if="step === 'error'" class="center-content" role="alert">
        <h2>Setup Encountered an Issue</h2>
        <p class="validation-err">{{ errorMessage }}</p>
        <button class="secondary-btn" @click="step = 'welcome'">Back to Setup</button>
      </div>

      <div v-else-if="step === 'uninstall'" class="center-content">
        <h2>Uninstall {{ appName }}?</h2>
        <p class="subtitle">This will remove {{ appName }} from {{ installPath }}.</p>
        <label class="check-label" style="margin-bottom: 18px;">
          <input type="checkbox" v-model="purgeUserData" />
          <span>Delete application settings and WebView2 cache files</span>
        </label>
        <button class="primary-btn" @click="handleUninstall">Confirm Uninstall</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
  background: #42b883;
}
.badge {
  font-size: 11px;
  background: rgba(66, 184, 131, 0.15);
  color: #42b883;
  padding: 2px 8px;
  border-radius: 999px;
  margin-left: 6px;
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
  background: #42b883;
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
  background: #42b883;
  color: #022c22;
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
  background: #34d399;
}
</style>
