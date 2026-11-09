<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { InstallerApi, type InstallProgress } from '@tauri-custom-installer/client';
import installerConfig from './installer.config.json';

const appName = installerConfig.appName;
const appId = installerConfig.appId;
const appVersion = installerConfig.appVersion;
const publisher = installerConfig.publisher;
const executableName = installerConfig.executableName;

const step = ref<'welcome' | 'installing' | 'completed' | 'uninstall'>('welcome');
const installPath = ref('');
const createDesktop = ref(true);
const createStartMenu = ref(true);
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
  const info = await InstallerApi.getSystemInfo(appName, appId, installerConfig.requiredBytes);
  installPath.value = info.default_install_path;
  if (info.is_uninstall_mode) {
    step.value = 'uninstall';
  }
});

async function handleBrowse() {
  const selected = await InstallerApi.selectFolder(installPath.value);
  if (selected) {
    installPath.value = selected;
  }
}

async function handleInstall() {
  step.value = 'installing';
  await InstallerApi.startInstallation(
    {
      app_name: appName,
      app_id: appId,
      app_version: appVersion,
      publisher,
      executable_name: executableName,
      install_dir: installPath.value,
      create_desktop_shortcut: createDesktop.value,
      create_start_menu_shortcut: createStartMenu.value,
      auto_launch_on_startup: false,
      launch_after_install: true,
    },
    (p) => {
      progress.value = p;
    }
  );
  step.value = 'completed';
}

async function handleUninstall() {
  await InstallerApi.startUninstallation(
    {
      app_id: appId,
      install_dir: installPath.value,
      purge_user_data: false,
    },
    appName,
    executableName,
    () => {}
  );
  await InstallerApi.exitInstaller();
}

async function handleFinish() {
  await InstallerApi.launchInstalledApp(`${installPath.value}\\${executableName}`);
  await InstallerApi.exitInstaller();
}
</script>

<template>
  <div class="window">
    <div class="titlebar" data-tauri-drag-region>
      <div class="title">
        <span class="dot"></span>
        <span>{{ appName }} Setup</span>
      </div>
      <button class="close-btn" @click="InstallerApi.exitInstaller()">✕</button>
    </div>

    <div class="content">
      <div v-if="step === 'welcome'">
        <h1>{{ appName }} <span class="badge">v{{ appVersion }}</span></h1>
        <p class="subtitle">Published by {{ publisher }}</p>

        <div class="path-row">
          <input class="path-input" type="text" v-model="installPath" />
          <button class="secondary-btn" @click="handleBrowse">Browse...</button>
        </div>

        <div class="options">
          <label class="check-label">
            <input type="checkbox" v-model="createDesktop" />
            <span>Create Desktop shortcut</span>
          </label>
          <label class="check-label">
            <input type="checkbox" v-model="createStartMenu" />
            <span>Create Start Menu shortcut</span>
          </label>
        </div>
      </div>

      <div v-if="step === 'welcome'" class="actions">
        <button class="primary-btn" @click="handleInstall">Install Now</button>
      </div>

      <div v-else-if="step === 'installing'" class="center-content">
        <h2>Installing {{ appName }}...</h2>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progress.percent + '%' }"></div>
        </div>
        <p class="file-name">{{ progress.current_file || 'Unpacking archive...' }}</p>
      </div>

      <div v-else-if="step === 'completed'" class="center-content">
        <h2>Installation Successful!</h2>
        <p class="subtitle">{{ appName }} is ready to run on your PC.</p>
        <button class="primary-btn" @click="handleFinish">Finish & Launch</button>
      </div>

      <div v-else-if="step === 'uninstall'" class="center-content">
        <h2>Uninstall {{ appName }}?</h2>
        <p class="subtitle">This will remove {{ appName }} from {{ installPath }}.</p>
        <button class="primary-btn" @click="handleUninstall">Confirm Uninstall</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
  background: #42b883;
}
.badge {
  font-size: 12px;
  background: rgba(66, 184, 131, 0.15);
  color: #42b883;
  padding: 2px 8px;
  border-radius: 999px;
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
  margin: 6px 0 16px 0;
}
.path-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
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
  gap: 10px;
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
  background: #42b883;
  color: #022c22;
  border: none;
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.primary-btn:hover {
  background: #34d399;
}
</style>
