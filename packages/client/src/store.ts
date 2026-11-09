import { InstallerApi, parseStructuredError } from './api';
import { getTranslations, isRtlLocale, resolveLocale, type InstallerTranslations } from './i18n';
import { MockInstallerDriver } from './mock';
import type {
  AppManifest,
  InstallAction,
  InstallerConfig,
  InstallerStep,
  InstallProgress,
  PathValidation,
  RunningProcessInfo,
  SimulationScenario,
  StructuredError,
  SystemInfo,
  UninstallProgress,
  UninstallStep,
} from './types';

export interface InstallerStoreState {
  step: InstallerStep;
  uninstallStep: UninstallStep;
  isLoading: boolean;
  isUninstallMode: boolean;
  action: InstallAction;
  manifest: AppManifest;
  systemInfo: SystemInfo | null;
  installPath: string;
  installScope: 'perUser' | 'perMachine';
  createDesktopShortcut: boolean;
  createStartMenuShortcut: boolean;
  autoLaunchOnStartup: boolean;
  launchAfterInstall: boolean;
  addToPath: boolean;
  purgeUserData: boolean;
  licenseAccepted: boolean;
  validation: PathValidation | null;
  progress: InstallProgress;
  uninstallProgress: UninstallProgress;
  runningProcesses: RunningProcessInfo;
  errorMessage: string | null;
  structuredError: StructuredError | null;
  locale: string;
  isRtl: boolean;
  t: InstallerTranslations;
}

export interface InstallerStore {
  getState(): InstallerStoreState;
  subscribe(listener: (state: InstallerStoreState) => void): () => void;
  init(): Promise<void>;
  setStep(step: InstallerStep): void;
  setUninstallStep(step: UninstallStep): void;
  setInstallPath(path: string): Promise<void>;
  browseInstallPath(): Promise<void>;
  setInstallScope(scope: 'perUser' | 'perMachine'): Promise<void>;
  setCreateDesktopShortcut(val: boolean): void;
  setCreateStartMenuShortcut(val: boolean): void;
  setAutoLaunchOnStartup(val: boolean): void;
  setLaunchAfterInstall(val: boolean): void;
  setAddToPath(val: boolean): void;
  setPurgeUserData(val: boolean): void;
  setLicenseAccepted(val: boolean): void;
  setScenario(scenario: SimulationScenario): Promise<void>;
  startInstall(): Promise<void>;
  cancelInstall(): Promise<void>;
  terminateRunningAndInstall(): Promise<void>;
  startUninstall(): Promise<void>;
  terminateRunningAndUninstall(): Promise<void>;
  launchApp(): Promise<void>;
  openUrl(url: string): Promise<void>;
  minimize(): Promise<void>;
  exit(): Promise<void>;
}

export function createInstallerStore(config: InstallerConfig = {}): InstallerStore {
  if (config.scenario) {
    MockInstallerDriver.setScenario(config.scenario);
  }

  const defaultManifest: AppManifest = {
    appName: config.appName ?? 'Tauri Application',
    appId: config.appId ?? 'com.tauri.app',
    version: config.appVersion ?? '1.0.0',
    publisher: config.publisher ?? 'Application Publisher',
    executableName: config.executableName ?? 'app.exe',
    installMode: 'perUser',
    defaultInstallDir: null,
    allowDowngrade: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    startMenuFolder: null,
    autostart: 'ask',
    runAfterInstall: true,
    licenseText: null,
    uncompressedSizeBytes: config.requiredBytes ?? 50 * 1024 * 1024,
    compressedSizeBytes: 0,
    fileCount: 0,
    payloadSha256: null,
    payloadFormat: 'tar.zst',
    urlSchemes: [],
    fileAssociations: [],
    components: [],
    aboutUrl: null,
    helpUrl: null,
    updateUrl: null,
    addToPath: false,
  };

  let state: InstallerStoreState = {
    step: 'welcome',
    uninstallStep: 'confirm',
    isLoading: true,
    isUninstallMode:
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('mode') === 'uninstall',
    action: 'install',
    manifest: defaultManifest,
    systemInfo: null,
    installPath: '',
    installScope: 'perUser',
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    autoLaunchOnStartup: false,
    launchAfterInstall: true,
    addToPath: false,
    purgeUserData: false,
    licenseAccepted: false,
    validation: null,
    progress: {
      stage: 'idle',
      current_file: '',
      files_completed: 0,
      total_files: 0,
      bytes_extracted: 0,
      total_bytes: 0,
      speed_bps: 0,
      eta_seconds: 0,
      percent: 0,
    },
    uninstallProgress: {
      stage: 'idle',
      percent: 0,
      message: '',
    },
    runningProcesses: {
      is_running: false,
      process_ids: [],
      process_names: [],
    },
    errorMessage: null,
    structuredError: null,
    locale: resolveLocale('en'),
    isRtl: false,
    t: getTranslations('en'),
  };

  const listeners = new Set<(s: InstallerStoreState) => void>();

  function setState(patch: Partial<InstallerStoreState>) {
    state = { ...state, ...patch };
    for (const listener of listeners) {
      listener(state);
    }
  }

  async function init(): Promise<void> {
    setState({ isLoading: true, errorMessage: null, structuredError: null });
    try {
      const info = await InstallerApi.getSystemInfo(
        config.appName,
        config.appId,
        config.requiredBytes
      );
      const resolvedManifest: AppManifest = info.manifest
        ? {
            ...defaultManifest,
            ...info.manifest,
            appName: config.appName ?? info.manifest.appName,
            appId: config.appId ?? info.manifest.appId,
            version: config.appVersion ?? info.manifest.version,
            publisher: config.publisher ?? info.manifest.publisher,
            executableName: config.executableName ?? info.manifest.executableName,
          }
        : defaultManifest;

      const reqBytes =
        info.required_space_bytes ??
        resolvedManifest.uncompressedSizeBytes ??
        config.requiredBytes ??
        50 * 1024 * 1024;

      const val = await InstallerApi.validateInstallPath(info.default_install_path, reqBytes);
      const locale = resolveLocale(info.locale);

      setState({
        systemInfo: info,
        manifest: resolvedManifest,
        installPath: info.default_install_path,
        isUninstallMode: Boolean(info.is_uninstall_mode) || state.isUninstallMode,
        action: (info.action as InstallAction) || 'install',
        createDesktopShortcut: resolvedManifest.createDesktopShortcut ?? true,
        createStartMenuShortcut: resolvedManifest.createStartMenuShortcut ?? true,
        autoLaunchOnStartup: resolvedManifest.autostart === 'always',
        launchAfterInstall: resolvedManifest.runAfterInstall ?? true,
        addToPath: resolvedManifest.addToPath ?? false,
        validation: val,
        locale,
        isRtl: isRtlLocale(locale),
        t: getTranslations(locale),
        isLoading: false,
      });

      if (info.is_passive_mode && !info.is_uninstall_mode) {
        void performInstallation();
      }
    } catch (err: unknown) {
      const parsed = parseStructuredError(err);
      setState({
        errorMessage: parsed.message,
        structuredError: parsed,
        step: 'error',
        isLoading: false,
      });
    }
  }

  async function setInstallPath(path: string): Promise<void> {
    setState({ installPath: path });
    const reqBytes =
      state.systemInfo?.required_space_bytes ??
      state.manifest.uncompressedSizeBytes ??
      config.requiredBytes ??
      50 * 1024 * 1024;
    const val = await InstallerApi.validateInstallPath(path, reqBytes);
    setState({ validation: val });
  }

  async function browseInstallPath(): Promise<void> {
    try {
      const selected = await InstallerApi.selectFolder(state.installPath, state.manifest.appName);
      if (selected) {
        await setInstallPath(selected);
      }
    } catch (err: unknown) {
      const parsed = parseStructuredError(err);
      setState({ errorMessage: parsed.message, structuredError: parsed });
    }
  }

  async function setInstallScope(scope: 'perUser' | 'perMachine'): Promise<void> {
    setState({ installScope: scope });
    if (scope === 'perMachine' && state.systemInfo?.program_files_path) {
      await setInstallPath(state.systemInfo.program_files_path);
    } else if (scope === 'perUser' && state.systemInfo?.default_install_path) {
      await setInstallPath(state.systemInfo.default_install_path);
    }
  }

  async function performInstallation(): Promise<void> {
    setState({ step: 'installing', errorMessage: null, structuredError: null });

    try {
      await InstallerApi.startInstallation(
        {
          app_name: state.manifest.appName,
          app_id: state.manifest.appId,
          app_version: state.manifest.version,
          publisher: state.manifest.publisher,
          executable_name: state.manifest.executableName,
          install_dir: state.installPath,
          install_scope: state.installScope,
          create_desktop_shortcut: state.createDesktopShortcut,
          create_start_menu_shortcut: state.createStartMenuShortcut,
          auto_launch_on_startup: state.autoLaunchOnStartup,
          launch_after_install: state.launchAfterInstall,
          add_to_path: state.addToPath,
        },
        (prog) => {
          setState({ progress: prog });
        }
      );

      setState({ step: 'completed' });
    } catch (err: unknown) {
      const parsed = parseStructuredError(err);
      setState({
        errorMessage: parsed.message,
        structuredError: parsed,
        step: parsed.code === 'CANCELLED' ? 'cancelled' : 'error',
      });
    }
  }

  async function startInstall(): Promise<void> {
    try {
      const running = await InstallerApi.checkRunning(
        state.manifest.executableName,
        state.installPath
      );
      if (running.is_running) {
        setState({ runningProcesses: running, step: 'running_warning' });
        return;
      }
      await performInstallation();
    } catch (err: unknown) {
      const parsed = parseStructuredError(err);
      setState({
        errorMessage: parsed.message,
        structuredError: parsed,
        step: 'error',
      });
    }
  }

  async function cancelInstall(): Promise<void> {
    await InstallerApi.cancelInstallation();
  }

  async function terminateRunningAndInstall(): Promise<void> {
    try {
      await InstallerApi.killRunning(
        state.runningProcesses.process_ids,
        state.manifest.executableName,
        state.installPath
      );
      await performInstallation();
    } catch (err: unknown) {
      const parsed = parseStructuredError(err);
      setState({
        errorMessage: parsed.message,
        structuredError: parsed,
        step: 'error',
      });
    }
  }

  async function performUninstall(): Promise<void> {
    setState({ uninstallStep: 'uninstalling', errorMessage: null, structuredError: null });
    try {
      await InstallerApi.startUninstallation(
        {
          app_id: state.manifest.appId,
          install_dir:
            state.systemInfo?.existing_install_path ||
            state.installPath ||
            state.systemInfo?.default_install_path ||
            '',
          purge_user_data: state.purgeUserData,
        },
        state.manifest.appName,
        state.manifest.executableName,
        (prog) => {
          setState({ uninstallProgress: prog });
        }
      );
      setState({ uninstallStep: 'completed' });
    } catch (err: unknown) {
      const parsed = parseStructuredError(err);
      setState({
        errorMessage: parsed.message,
        structuredError: parsed,
        uninstallStep: 'error',
      });
    }
  }

  async function startUninstall(): Promise<void> {
    try {
      const running = await InstallerApi.checkRunning(
        state.manifest.executableName,
        state.systemInfo?.existing_install_path ?? state.installPath
      );
      if (running.is_running) {
        setState({ runningProcesses: running, uninstallStep: 'running_warning' });
        return;
      }
      await performUninstall();
    } catch (err: unknown) {
      const parsed = parseStructuredError(err);
      setState({
        errorMessage: parsed.message,
        structuredError: parsed,
        uninstallStep: 'error',
      });
    }
  }

  async function terminateRunningAndUninstall(): Promise<void> {
    try {
      await InstallerApi.killRunning(
        state.runningProcesses.process_ids,
        state.manifest.executableName,
        state.systemInfo?.existing_install_path ?? state.installPath
      );
      await performUninstall();
    } catch (err: unknown) {
      const parsed = parseStructuredError(err);
      setState({
        errorMessage: parsed.message,
        structuredError: parsed,
        uninstallStep: 'error',
      });
    }
  }

  async function launchApp(): Promise<void> {
    const cleanDir = state.installPath.replace(/[\\/]+$/, '');
    const fullExePath = `${cleanDir}\\${state.manifest.executableName}`;
    await InstallerApi.launchInstalledApp(fullExePath);
    await InstallerApi.exitInstaller();
  }

  async function openUrl(url: string): Promise<void> {
    await InstallerApi.openExternalUrl(url);
  }

  async function minimize(): Promise<void> {
    await InstallerApi.minimizeInstaller();
  }

  async function exit(): Promise<void> {
    if (state.step === 'installing') {
      await InstallerApi.cancelInstallation();
    }
    await InstallerApi.exitInstaller();
  }

  async function setScenario(scenario: SimulationScenario): Promise<void> {
    MockInstallerDriver.setScenario(scenario);
    await init();
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    init,
    setStep: (step) => setState({ step }),
    setUninstallStep: (uninstallStep) => setState({ uninstallStep }),
    setInstallPath,
    browseInstallPath,
    setInstallScope,
    setCreateDesktopShortcut: (createDesktopShortcut) => setState({ createDesktopShortcut }),
    setCreateStartMenuShortcut: (createStartMenuShortcut) => setState({ createStartMenuShortcut }),
    setAutoLaunchOnStartup: (autoLaunchOnStartup) => setState({ autoLaunchOnStartup }),
    setLaunchAfterInstall: (launchAfterInstall) => setState({ launchAfterInstall }),
    setAddToPath: (addToPath) => setState({ addToPath }),
    setPurgeUserData: (purgeUserData) => setState({ purgeUserData }),
    setLicenseAccepted: (licenseAccepted) => setState({ licenseAccepted }),
    setScenario,
    startInstall,
    cancelInstall,
    terminateRunningAndInstall,
    startUninstall,
    terminateRunningAndUninstall,
    launchApp,
    openUrl,
    minimize,
    exit,
  };
}
