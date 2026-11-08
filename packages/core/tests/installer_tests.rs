use std::io::{Cursor, Write};
use tauri_custom_installer_core::disk::validate_path;
use tauri_custom_installer_core::extractor::extract_payload;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

#[test]
fn test_path_validation_empty() {
    let res = validate_path("", 1024);
    assert!(!res.is_valid);
    assert!(res.error_message.is_some());
}

#[test]
fn test_path_validation_temp() {
    let temp = std::env::temp_dir();
    let res = validate_path(&temp.to_string_lossy(), 1024);
    assert!(res.is_writable);
    assert!(res.has_enough_space);
    assert!(res.is_valid);
}

#[test]
fn test_archive_extraction_and_progress() {
    let temp_dir = std::env::temp_dir().join(format!("tci_test_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&temp_dir);

    // Build in-memory zip
    let mut zip_buffer = Vec::new();
    {
        let mut zip = ZipWriter::new(Cursor::new(&mut zip_buffer));
        let options = SimpleFileOptions::default();

        zip.start_file("hello.txt", options).unwrap();
        zip.write_all(b"Hello world from custom installer!").unwrap();

        zip.start_file("sub/nested.txt", options).unwrap();
        zip.write_all(b"Nested file contents").unwrap();

        zip.finish().unwrap();
    }

    let mut progress_count = 0;
    let extracted_bytes = extract_payload(
        Cursor::new(zip_buffer),
        &temp_dir,
        |prog| {
            progress_count += 1;
            assert!(prog.percent >= 0.0 && prog.percent <= 100.0);
        },
    ).expect("Extraction failed");

    assert!(extracted_bytes > 0);
    assert!(progress_count > 0);
    assert!(temp_dir.join("hello.txt").exists());
    assert!(temp_dir.join("sub/nested.txt").exists());

    let content = std::fs::read_to_string(temp_dir.join("hello.txt")).unwrap();
    assert_eq!(content, "Hello world from custom installer!");

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_registry_lifecycle() {
    use tauri_custom_installer_core::models::InstallOptions;
    use tauri_custom_installer_core::registry::{
        check_existing_installation, register_uninstall_entry, remove_uninstall_entry,
    };

    let test_app_id = "com.test.tci.integration.test.999";
    let test_app_name = "TCI Integration Test App";

    // Clean before starting
    let _ = remove_uninstall_entry(test_app_id, test_app_name);
    assert!(check_existing_installation(test_app_id).is_none());

    // Register
    let options = InstallOptions {
        app_name: test_app_name.to_string(),
        app_id: test_app_id.to_string(),
        app_version: "2.4.0".to_string(),
        publisher: "Integration Tester".to_string(),
        executable_name: "test-app.exe".to_string(),
        install_dir: r"C:\Temp\TCI_Test".to_string(),
        create_desktop_shortcut: false,
        create_start_menu_shortcut: false,
        auto_launch_on_startup: false,
        launch_after_install: false,
    };

    register_uninstall_entry(&options, 10 * 1024 * 1024).expect("Failed to register");

    #[cfg(target_os = "windows")]
    {
        let existing = check_existing_installation(test_app_id).expect("Entry should exist");
        assert_eq!(existing.version, "2.4.0");
        assert_eq!(existing.install_path, r"C:\Temp\TCI_Test");
    }

    // Cleanup
    remove_uninstall_entry(test_app_id, test_app_name).expect("Failed to remove");
    assert!(check_existing_installation(test_app_id).is_none());
}

#[test]
fn test_shortcut_creation_in_temp() {
    use tauri_custom_installer_core::shortcuts::create_shortcut;

    let temp_dir = std::env::temp_dir().join(format!("tci_lnk_test_{}", std::process::id()));
    let _ = std::fs::create_dir_all(&temp_dir);

    let dummy_exe = temp_dir.join("dummy.exe");
    std::fs::write(&dummy_exe, b"MZ").unwrap();

    let lnk_path = temp_dir.join("TestShortcut.lnk");
    create_shortcut(&dummy_exe, &lnk_path, "Test Shortcut Description", &temp_dir)
        .expect("Shortcut creation should succeed");

    #[cfg(target_os = "windows")]
    {
        assert!(lnk_path.exists(), "Shortcut .lnk file should exist on Windows");
    }

    let _ = std::fs::remove_dir_all(&temp_dir);
}
