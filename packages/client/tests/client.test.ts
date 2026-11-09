import { beforeEach, describe, expect, it } from 'bun:test';
import {
  createInstallerStore,
  getTranslations,
  isRtlLocale,
  MockInstallerDriver,
  resolveLocale,
} from '../src/index';

describe('Client SDK & Reactive Store', () => {
  beforeEach(() => {
    MockInstallerDriver.setScenario('success');
    MockInstallerDriver.setStepDelay(1);
  });

  it('returns valid system info and authoritative manifest in mock mode', () => {
    const info = MockInstallerDriver.getSystemInfo('AwesomeApp', 'com.awesome.app', 1024);
    expect(info.default_install_path).toContain('AwesomeApp');
    expect(info.available_space_bytes).toBeGreaterThan(0);
    expect(info.is_already_installed).toBe(false);
    expect(info.manifest?.appName).toBe('AwesomeApp');
    expect(info.action).toBe('install');
  });

  it('validates install path and rejects protected system directories', () => {
    const valid = MockInstallerDriver.validateInstallPath('C:\\Users\\Dev\\AppData\\Local\\MyApp', 1024);
    expect(valid.is_valid).toBe(true);
    expect(valid.is_writable).toBe(true);
    expect(valid.has_enough_space).toBe(true);
    expect(valid.error_message).toBeNull();

    const invalidRoot = MockInstallerDriver.validateInstallPath('C:\\Windows', 1024);
    expect(invalidRoot.is_valid).toBe(false);
    expect(invalidRoot.error_code).toBe('INVALID_PATH');
  });

  it('simulates installation with speed_bps and eta_seconds', async () => {
    const progressEvents: number[] = [];
    await MockInstallerDriver.simulateInstallation(
      {
        app_name: 'TestApp',
        app_id: 'com.test.app',
        app_version: '1.0.0',
        publisher: 'TestCorp',
        executable_name: 'test.exe',
        install_dir: 'C:\\Test',
        create_desktop_shortcut: true,
        create_start_menu_shortcut: true,
        auto_launch_on_startup: false,
        launch_after_install: true,
      },
      (prog) => {
        progressEvents.push(prog.percent);
      }
    );

    expect(progressEvents.length).toBeGreaterThan(5);
    expect(progressEvents[progressEvents.length - 1]).toBe(100);
  });

  it('drives full store state machine including scenarios (upgrade, app_running, corrupted)', async () => {
    const store = createInstallerStore({ appName: 'StudioPro', appId: 'com.studio.pro' });
    await store.init();

    expect(store.getState().isLoading).toBe(false);
    expect(store.getState().manifest.appName).toBe('StudioPro');
    expect(store.getState().action).toBe('install');

    // Switch to upgrade scenario
    await store.setScenario('already_installed_upgrade');
    expect(store.getState().action).toBe('upgrade');
    expect(store.getState().systemInfo?.existing_version).toBe('1.0.0');

    // Switch to app_running scenario -> should pause on running_warning
    await store.setScenario('app_running');
    await store.startInstall();
    expect(store.getState().step).toBe('running_warning');
    expect(store.getState().runningProcesses.is_running).toBe(true);

    // Terminate running processes and complete installation
    await store.terminateRunningAndInstall();
    expect(store.getState().step).toBe('completed');

    // Switch to corrupted_payload scenario -> should transition to error with CORRUPTED code
    await store.setScenario('corrupted_payload');
    await store.startInstall();
    expect(store.getState().step).toBe('error');
    expect(store.getState().structuredError?.code).toBe('CORRUPTED');
  });

  it('supports localization and RTL detection', () => {
    expect(resolveLocale('tr-TR')).toBe('tr');
    expect(getTranslations('tr-TR').installNowButton).toBe('Şimdi Kur');
    expect(isRtlLocale('ar-SA')).toBe(true);
    expect(isRtlLocale('en-US')).toBe(false);
  });
});
