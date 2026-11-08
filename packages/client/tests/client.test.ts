import { describe, expect, it } from 'bun:test';
import { MockInstallerDriver } from '../src/mock';

describe('MockInstallerDriver', () => {
  it('returns valid system info', () => {
    const info = MockInstallerDriver.getSystemInfo('AwesomeApp', 'com.awesome.app', 1024);
    expect(info.default_install_path).toContain('AwesomeApp');
    expect(info.available_space_bytes).toBeGreaterThan(0);
    expect(info.is_already_installed).toBe(false);
  });

  it('validates install path correctly', () => {
    const val = MockInstallerDriver.validateInstallPath('C:\\Test', 1024);
    expect(val.is_valid).toBe(true);
    expect(val.is_writable).toBe(true);
    expect(val.has_enough_space).toBe(true);
    expect(val.error_message).toBeNull();
  });

  it('simulates installation with progress events', async () => {
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
});
