use std::io::{Cursor, Write};
use std::path::Path;
use sha2::{Digest, Sha256};
use tauri_custom_installer_core::disk::{
    is_dangerous_install_path, normalize_selected_folder, validate_path,
};
use tauri_custom_installer_core::extractor::{
    cleanup_stale_upgrade_files, extract_payload, extract_payload_detailed,
    sanitize_archive_entry_path,
};
use tauri_custom_installer_core::certs::{
    compute_cert_sha256_hex, install_certificate_file, normalize_allowed_store,
    parse_certificate_bytes, verify_cert_thumbprint,
};
use tauri_custom_installer_core::footer::{
    read_appended_manifest, read_appended_ui_zip, read_footer_from_path, transform_armor_bytes,
    verify_section_sha256, write_stripped_uninstaller, SectionReader, TciFooter,
    ARMOR_SECTION_MANIFEST, ARMOR_SECTION_UI,
};
use tauri_custom_installer_core::models::AppManifest;
use tauri_custom_installer_core::models::{InstallManifest, InstallOptions, InstalledFileEntry};
use tauri_custom_installer_core:: parse_cli_args_from;
use tauri_custom_installer_core::uninstaller::remove_installed_files_from_dir;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

#[test]
fn test_path_validation_empty_and_dangerous_deny_list() {
    let res = validate_path("", 1024);
    assert!(!res.is_valid);
    assert!(res.error_message.is_some());

    // Drive root must be rejected
    assert!(is_dangerous_install_path(Path::new(r"C:\")).is_some());
    // Windows directory must be rejected
    assert!(is_dangerous_install_path(Path::new(r"C:\Windows")).is_some());
    assert!(is_dangerous_install_path(Path::new(r"C:\Windows\System32")).is_some());
    // Relative / traversal path must be rejected
    assert!(is_dangerous_install_path(Path::new(r"C:\Program Files\..\Windows")).is_some());

    // %TEMP% root itself is rejected, while a subfolder inside %TEMP% is allowed
    let temp_root = std::env::temp_dir();
    assert!(is_dangerous_install_path(&temp_root).is_some());

    let valid_sub = temp_root.join("TciValidSubfolder");
    let res_sub = validate_path(&valid_sub.to_string_lossy(), 1024);
    assert!(res_sub.is_writable);
    assert!(res_sub.has_enough_space);
    assert!(res_sub.is_valid);
}

#[test]
fn test_normalize_selected_folder_appends_app_name_for_non_empty_dir() {
    let temp_dir = std::env::temp_dir().join(format!("tci_norm_test_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&temp_dir);
    std::fs::create_dir_all(&temp_dir).unwrap();

    // Empty folder -> kept as-is
    let norm_empty = normalize_selected_folder(&temp_dir, "MyApp");
    assert_eq!(norm_empty, temp_dir);

    // Non-empty folder -> appends `\MyApp`
    std::fs::write(temp_dir.join("existing_user_file.txt"), b"important").unwrap();
    let norm_non_empty = normalize_selected_folder(&temp_dir, "MyApp");
    assert_eq!(norm_non_empty, temp_dir.join("MyApp"));

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_archive_entry_path_sanitization() {
    assert!(sanitize_archive_entry_path("../evil.dll").is_none());
    assert!(sanitize_archive_entry_path("sub/../../evil.dll").is_none());
    assert!(sanitize_archive_entry_path("/etc/passwd").is_none());
    assert!(sanitize_archive_entry_path("C:\\Windows\\cmd.exe").is_none());
    assert!(sanitize_archive_entry_path("file.txt:zone.identifier").is_none());
    assert!(sanitize_archive_entry_path("CON.txt").is_none());
    assert!(sanitize_archive_entry_path("sub/NUL").is_none());
    assert_eq!(
        sanitize_archive_entry_path("bin/app.exe")
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/"),
        "bin/app.exe"
    );
}

#[test]
fn test_zip_archive_extraction_and_progress() {
    let temp_dir = std::env::temp_dir().join(format!("tci_zip_test_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&temp_dir);

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
    let extracted_bytes = extract_payload(Cursor::new(zip_buffer), &temp_dir, |prog| {
        progress_count += 1;
        assert!(prog.percent >= 0.0 && prog.percent <= 100.0);
    })
    .expect("Extraction failed");

    assert!(extracted_bytes > 0);
    assert!(progress_count > 0);
    assert!(temp_dir.join("hello.txt").exists());
    assert!(temp_dir.join("sub/nested.txt").exists());

    let content = std::fs::read_to_string(temp_dir.join("hello.txt")).unwrap();
    assert_eq!(content, "Hello world from custom installer!");

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_tar_zst_extraction_and_manifest_cleanup_preserves_user_files() {
    let temp_dir = std::env::temp_dir().join(format!("tci_zst_test_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&temp_dir);
    std::fs::create_dir_all(&temp_dir).unwrap();

    // Place a pre-existing unrelated user file in the folder
    let unrelated_file = temp_dir.join("user_unrelated_document.txt");
    std::fs::write(&unrelated_file, b"Do not delete me on uninstall!").unwrap();

    // Build in-memory tar.zst archive
    let mut tar_bytes = Vec::new();
    {
        let mut builder = tar::Builder::new(&mut tar_bytes);
        let data = b"Zstd compressed binary payload";
        let mut header = tar::Header::new_gnu();
        header.set_size(data.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        builder
            .append_data(&mut header, "bin/my-app.exe", &data[..])
            .unwrap();
        builder.finish().unwrap();
    }
    let zst_bytes = zstd::stream::encode_all(Cursor::new(tar_bytes), 3).unwrap();

    let report = extract_payload_detailed(Cursor::new(zst_bytes), &temp_dir, None, |_| {})
        .expect("tar.zst extraction should succeed");

    assert_eq!(report.files.len(), 1);
    assert_eq!(report.files[0].relative_path, "bin/my-app.exe");
    assert!(temp_dir.join("bin/my-app.exe").exists());

    // Now test manifest-based uninstall: must delete `bin/my-app.exe` and `bin`,
    // while keeping `user_unrelated_document.txt` intact!
    let manifest = InstallManifest {
        app_id: "com.test.zst".into(),
        app_name: "ZstTest".into(),
        version: "1.0.0".into(),
        publisher: "Tester".into(),
        executable_name: "bin/my-app.exe".into(),
        install_dir: temp_dir.to_string_lossy().into(),
        install_scope: "perUser".into(),
        installed_at: "0".into(),
        files: report.files.clone(),
        directories: report.directories.clone(),
        shortcuts_created: vec![],
        url_schemes_registered: vec![],
        file_associations_registered: vec![],
        added_to_path: false,
        selected_components: vec![],
        create_desktop_shortcut: false,
        create_start_menu_shortcut: false,
        auto_launch_on_startup: false,
    };

    remove_installed_files_from_dir(&temp_dir, Some(&manifest), "bin/my-app.exe");

    assert!(!temp_dir.join("bin/my-app.exe").exists(), "Installed file should be removed");
    assert!(!temp_dir.join("bin").exists(), "Empty installed subdir should be removed");
    assert!(
        unrelated_file.exists(),
        "Pre-existing unrelated user file MUST be preserved!"
    );

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_upgrade_stale_file_cleanup() {
    let temp_dir = std::env::temp_dir().join(format!("tci_upg_test_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&temp_dir);
    std::fs::create_dir_all(&temp_dir).unwrap();

    std::fs::write(temp_dir.join("old_plugin.dll"), b"old").unwrap();
    std::fs::write(temp_dir.join("app.exe"), b"v2").unwrap();

    let old_manifest = InstallManifest {
        app_id: "com.test.upg".into(),
        app_name: "UpgTest".into(),
        version: "1.0.0".into(),
        publisher: "Tester".into(),
        executable_name: "app.exe".into(),
        install_dir: temp_dir.to_string_lossy().into(),
        install_scope: "perUser".into(),
        installed_at: "0".into(),
        files: vec![
            InstalledFileEntry {
                relative_path: "app.exe".into(),
                size: 2,
                sha256: String::new(),
            },
            InstalledFileEntry {
                relative_path: "old_plugin.dll".into(),
                size: 3,
                sha256: String::new(),
            },
        ],
        directories: vec![],
        shortcuts_created: vec![],
        url_schemes_registered: vec![],
        file_associations_registered: vec![],
        added_to_path: false,
        selected_components: vec![],
        create_desktop_shortcut: false,
        create_start_menu_shortcut: false,
        auto_launch_on_startup: false,
    };

    let new_files = vec![InstalledFileEntry {
        relative_path: "app.exe".into(),
        size: 2,
        sha256: String::new(),
    }];

    cleanup_stale_upgrade_files(&temp_dir, &old_manifest, &new_files);

    assert!(!temp_dir.join("old_plugin.dll").exists());
    assert!(temp_dir.join("app.exe").exists());

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_footer_and_authenticode_scan_and_sha256() {
    let temp_file = std::env::temp_dir().join(format!("tci_sfx_test_{}.exe", std::process::id()));
    let payload = b"payload_content_bytes_for_sfx_test";
    let mut hasher = Sha256::new();
    hasher.update(payload);
    let payload_sha: [u8; 32] = hasher.finalize().into();

    let footer = TciFooter {
        runtime_size: 4,
        ui_offset: 4,
        ui_size: 2,
        payload_offset: 6,
        payload_size: payload.len() as u64,
        manifest_offset: 6 + payload.len() as u64,
        manifest_size: 2,
        payload_sha256: payload_sha,
        ui_sha256: [0u8; 32],
        is_v2_armored: false,
    };

    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"MZ\x90\x00"); // 4-byte fake runtime
    bytes.extend_from_slice(b"UI"); // 2-byte fake UI
    bytes.extend_from_slice(payload);
    bytes.extend_from_slice(b"{}"); // 2-byte manifest
    bytes.extend_from_slice(&footer.to_bytes());
    // Simulate trailing Authenticode signature table appended after the footer
    bytes.extend_from_slice(&[0x30, 0x82, 0x01, 0x00, 0xAA, 0xBB, 0xCC, 0xDD]);

    std::fs::write(&temp_file, &bytes).unwrap();

    let parsed = read_footer_from_path(&temp_file).expect("Should find footer before Authenticode signature");
    assert_eq!(parsed, footer);

    let mut section =
        SectionReader::open(&temp_file, parsed.payload_offset, parsed.payload_size).unwrap();
    verify_section_sha256(&mut section, &parsed.payload_sha256)
        .expect("SHA-256 verification should pass");

    let mut bad_sha = parsed.payload_sha256;
    bad_sha[0] ^= 0xFF;
    assert!(verify_section_sha256(&mut section, &bad_sha).is_err());

    let _ = std::fs::remove_file(&temp_file);
}

#[test]
fn test_cli_args_parsing_nsis_compatible() {
    let args = vec![
        "Setup.exe".to_string(),
        "/S".to_string(),
        "/UPDATE".to_string(),
        "/R".to_string(),
        "/D=C:\\Program Files\\My Custom App".to_string(),
    ];
    let parsed = parse_cli_args_from(&args);
    assert!(parsed.is_silent);
    assert!(parsed.is_update);
    assert!(parsed.relaunch_after);
    assert_eq!(
        parsed.custom_install_dir.unwrap(),
        Path::new("C:\\Program Files\\My Custom App")
    );

    // Also test unquoted spaces in `/D=` when split across argv tokens
    let args_unquoted = vec![
        "Setup.exe".to_string(),
        "/S".to_string(),
        "/D=C:\\Custom".to_string(),
        "Folder".to_string(),
        "With".to_string(),
        "Spaces".to_string(),
    ];
    let parsed2 = parse_cli_args_from(&args_unquoted);
    assert_eq!(
        parsed2.custom_install_dir.unwrap(),
        Path::new("C:\\Custom Folder With Spaces")
    );
}

#[test]
fn test_registry_lifecycle() {
    use tauri_custom_installer_core::registry::{
        check_existing_installation, register_uninstall_entry, remove_uninstall_entry,
    };

    let test_app_id = "com.test.tci.integration.test.999";
    let test_app_name = "TCI Integration Test App";

    let _ = remove_uninstall_entry(test_app_id, test_app_name);
    assert!(check_existing_installation(test_app_id).is_none());

    let options = InstallOptions {
        app_name: test_app_name.to_string(),
        app_id: test_app_id.to_string(),
        app_version: "2.4.0".to_string(),
        publisher: "Integration Tester".to_string(),
        executable_name: "test-app.exe".to_string(),
        install_dir: r"C:\Temp\TCI_Test".to_string(),
        install_scope: Some("perUser".to_string()),
        create_desktop_shortcut: true,
        create_start_menu_shortcut: false,
        auto_launch_on_startup: false,
        launch_after_install: false,
        add_to_path: None,
        selected_components: None,
        onboarding_data: None,
    };

    register_uninstall_entry(&options, 10 * 1024 * 1024).expect("Failed to register");

    #[cfg(target_os = "windows")]
    {
        let existing = check_existing_installation(test_app_id).expect("Entry should exist");
        assert_eq!(existing.version, "2.4.0");
        assert_eq!(existing.install_path, r"C:\Temp\TCI_Test");
        assert_eq!(existing.desktop_shortcut, Some(true));
        assert_eq!(existing.start_menu_shortcut, Some(false));
    }

    remove_uninstall_entry(test_app_id, test_app_name).expect("Failed to remove");
    assert!(check_existing_installation(test_app_id).is_none());
}

#[test]
fn test_com_shortcut_creation_with_aumid() {
    use tauri_custom_installer_core::shortcuts::create_shortcut_with_aumid;

    let temp_dir = std::env::temp_dir().join(format!("tci_lnk_test_{}", std::process::id()));
    let _ = std::fs::create_dir_all(&temp_dir);

    let dummy_exe = temp_dir.join("dummy.exe");
    std::fs::write(&dummy_exe, b"MZ").unwrap();

    let lnk_path = temp_dir.join("TestShortcut.lnk");
    create_shortcut_with_aumid(
        &dummy_exe,
        &lnk_path,
        "Test Shortcut Description",
        &temp_dir,
        Some("com.test.tci.aumid"),
    )
    .expect("Win32 COM Shortcut creation with AUMID should succeed");

    #[cfg(target_os = "windows")]
    {
        assert!(lnk_path.exists(), "Shortcut .lnk file should exist on Windows");
        let meta = std::fs::metadata(&lnk_path).unwrap();
        assert!(meta.len() > 64, "Shortcut .lnk file should have valid binary header");
    }

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_legacy_install_manifest_backward_compat_and_stale_cleanup() {
    use tauri_custom_installer_core::extractor::cleanup_stale_upgrade_files;
    use tauri_custom_installer_core::models::{InstallManifest, InstalledFileEntry};

    let legacy_json = r#"{
        "app_id": "com.legacy.app",
        "app_name": "LegacyApp",
        "version": "0.1.0",
        "publisher": "Legacy Publisher",
        "executable_name": "LegacyApp.exe",
        "install_dir": "C:\\Program Files\\LegacyApp",
        "install_scope": "perUser",
        "installed_at": "1700000000",
        "files": [
            { "relative_path": "old_dir/stale.dll", "size": 12 }
        ]
    }"#;

    let mut legacy_manifest: InstallManifest =
        serde_json::from_str(legacy_json).expect("v0.1.0 manifest JSON should deserialize");
    assert_eq!(legacy_manifest.app_id, "com.legacy.app");
    assert_eq!(legacy_manifest.files.len(), 1);
    assert_eq!(legacy_manifest.files[0].sha256, "");
    assert!(legacy_manifest.directories.is_empty());
    assert!(!legacy_manifest.added_to_path);

    let temp_dir = std::env::temp_dir().join(format!("tci_test_stale_cleanup_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&temp_dir);
    std::fs::create_dir_all(temp_dir.join("old_dir/nested")).unwrap();
    std::fs::create_dir_all(temp_dir.join("kept_dir")).unwrap();
    std::fs::write(temp_dir.join("old_dir/nested/old.dll"), b"old").unwrap();
    std::fs::write(temp_dir.join("kept_dir/keep.bin"), b"keep").unwrap();

    legacy_manifest.files = vec![
        InstalledFileEntry {
            relative_path: "old_dir/nested/old.dll".to_string(),
            size: 3,
            sha256: String::new(),
        },
        InstalledFileEntry {
            relative_path: "kept_dir/keep.bin".to_string(),
            size: 4,
            sha256: String::new(),
        },
    ];
    legacy_manifest.directories = vec![
        "old_dir".to_string(),
        "old_dir/nested".to_string(),
        "kept_dir".to_string(),
    ];

    let new_files = vec![InstalledFileEntry {
        relative_path: "kept_dir/keep.bin".to_string(),
        size: 4,
        sha256: String::new(),
    }];

    cleanup_stale_upgrade_files(&temp_dir, &legacy_manifest, &new_files);

    assert!(!temp_dir.join("old_dir/nested/old.dll").exists());
    assert!(!temp_dir.join("old_dir/nested").exists());
    assert!(!temp_dir.join("old_dir").exists());
    assert!(temp_dir.join("kept_dir/keep.bin").exists());

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_sfx_v2_armor_roundtrip_and_authenticode_coexistence() {
    let temp_dir = std::env::temp_dir().join("tci_core_test_sfx_v2_armor");
    let _ = std::fs::remove_dir_all(&temp_dir);
    std::fs::create_dir_all(&temp_dir).unwrap();

    let stub = b"MZ_STUB_RUNTIME_BYTES_0123456789ABCDEF";
    let ui_plain = b"PK\x03\x04MOCK_UI_ARCHIVE_PLAINTEXT_SECRET_MARKER";
    let payload = b"ZSTD_MOCK_PAYLOAD_DATA_1234567890";
    let manifest_json = serde_json::json!({
        "appName": "ArmoredSecretApp",
        "appId": "com.example.armored",
        "version": "2.4.0",
        "publisher": "TCI Test Publisher",
        "executableName": "armored.exe"
    })
    .to_string();

    let _: AppManifest = serde_json::from_str(&manifest_json).unwrap();
    let payload_sha256: [u8; 32] = Sha256::digest(payload).into();
    let ui_sha256: [u8; 32] = Sha256::digest(ui_plain).into();
    let runtime_size = stub.len() as u64;

    let mut ui_armored = ui_plain.to_vec();
    transform_armor_bytes(
        &mut ui_armored,
        &payload_sha256,
        &ui_sha256,
        runtime_size,
        ARMOR_SECTION_UI,
    );

    let mut manifest_armored = manifest_json.as_bytes().to_vec();
    transform_armor_bytes(
        &mut manifest_armored,
        &payload_sha256,
        &ui_sha256,
        runtime_size,
        ARMOR_SECTION_MANIFEST,
    );

    let ui_offset = runtime_size;
    let payload_offset = ui_offset + ui_armored.len() as u64;
    let manifest_offset = payload_offset + payload.len() as u64;

    let footer = TciFooter {
        runtime_size,
        ui_offset,
        ui_size: ui_armored.len() as u64,
        payload_offset,
        payload_size: payload.len() as u64,
        manifest_offset,
        manifest_size: manifest_armored.len() as u64,
        payload_sha256,
        ui_sha256,
        is_v2_armored: true,
    };

    let signed_sfx_path = temp_dir.join("ArmoredSetup-signed.exe");
    {
        let mut f = std::fs::File::create(&signed_sfx_path).unwrap();
        f.write_all(stub).unwrap();
        f.write_all(&ui_armored).unwrap();
        f.write_all(payload).unwrap();
        f.write_all(&manifest_armored).unwrap();
        f.write_all(&footer.to_bytes()).unwrap();
        // Simulate an appended Authenticode PKCS#7 WIN_CERTIFICATE trailer
        f.write_all(&[0x30u8, 0x82, 0x01, 0x00].repeat(16)).unwrap();
    }

    let raw_signed = std::fs::read(&signed_sfx_path).unwrap();
    assert!(!raw_signed
        .windows(b"ArmoredSecretApp".len())
        .any(|w| w == b"ArmoredSecretApp"));
    assert!(!raw_signed
        .windows(b"MOCK_UI_ARCHIVE_PLAINTEXT".len())
        .any(|w| w == b"MOCK_UI_ARCHIVE_PLAINTEXT"));

    let parsed_footer = read_footer_from_path(&signed_sfx_path).expect("V2 footer with trailer");
    assert!(parsed_footer.is_v2_armored);
    assert_eq!(parsed_footer.payload_size, payload.len() as u64);

    let parsed_manifest = read_appended_manifest(&signed_sfx_path).expect("decrypted manifest");
    assert_eq!(parsed_manifest.app_name, "ArmoredSecretApp");
    assert_eq!(parsed_manifest.app_id, "com.example.armored");
    assert_eq!(parsed_manifest.version, "2.4.0");

    let decrypted_ui = read_appended_ui_zip(&signed_sfx_path)
        .unwrap()
        .expect("decrypted ui.zip");
    assert_eq!(decrypted_ui.as_slice(), ui_plain);

    let uninstaller_path = temp_dir.join("uninstall.exe");
    write_stripped_uninstaller(&signed_sfx_path, &uninstaller_path).unwrap();

    let uninstall_footer =
        read_footer_from_path(&uninstaller_path).expect("re-armored uninstaller footer");
    assert!(uninstall_footer.is_v2_armored);
    assert_eq!(uninstall_footer.payload_size, 0);
    assert_eq!(uninstall_footer.payload_sha256, [0u8; 32]);

    let uninstall_manifest =
        read_appended_manifest(&uninstaller_path).expect("re-armored uninstaller manifest");
    assert_eq!(uninstall_manifest.app_name, "ArmoredSecretApp");

    let uninstall_ui = read_appended_ui_zip(&uninstaller_path)
        .unwrap()
        .expect("re-armored uninstaller ui.zip");
    assert_eq!(uninstall_ui.as_slice(), ui_plain);

    let raw_uninstall = std::fs::read(&uninstaller_path).unwrap();
    assert!(!raw_uninstall
        .windows(b"ArmoredSecretApp".len())
        .any(|w| w == b"ArmoredSecretApp"));

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_certificate_parsing_thumbprint_pinning_and_dry_run_install() {
    assert_eq!(normalize_allowed_store("root").unwrap(), "Root");
    assert_eq!(
        normalize_allowed_store("TrustedPublisher").unwrap(),
        "TrustedPublisher"
    );
    assert_eq!(normalize_allowed_store("ca").unwrap(), "CA");
    assert_eq!(normalize_allowed_store("MY").unwrap(), "My");
    assert!(normalize_allowed_store("Disallowed").is_err());
    assert!(normalize_allowed_store("../Root").is_err());

    assert!(parse_certificate_bytes(b"short").is_err());

    // 36-byte ASN.1 DER SEQUENCE pattern [0x30, 0x22, 0x02] x 12 -> Base64 "MCIC" x 12
    let expected_der: Vec<u8> = [0x30u8, 0x22u8, 0x02u8].repeat(12);
    let parsed_der = parse_certificate_bytes(&expected_der).unwrap();
    assert_eq!(parsed_der, expected_der);

    let pem_body = "MCIC".repeat(12);
    let pem = format!(
        "\u{feff}-----BEGIN CERTIFICATE-----\r\n{}\r\n-----END CERTIFICATE-----\r\n",
        pem_body
    );
    let parsed_pem = parse_certificate_bytes(pem.as_bytes()).unwrap();
    assert_eq!(parsed_pem, expected_der);

    let actual_hex = compute_cert_sha256_hex(&expected_der);
    assert_eq!(actual_hex.len(), 64);

    let colon_upper = actual_hex
        .as_bytes()
        .chunks(2)
        .map(|pair| std::str::from_utf8(pair).unwrap().to_ascii_uppercase())
        .collect::<Vec<_>>()
        .join(":");
    assert!(verify_cert_thumbprint(&expected_der, &colon_upper).is_ok());
    assert!(verify_cert_thumbprint(&expected_der, "not-a-thumbprint").is_err());
    assert!(verify_cert_thumbprint(&expected_der, &"00".repeat(32)).is_err());

    let temp_dir = std::env::temp_dir().join("tci_core_test_certs");
    let _ = std::fs::remove_dir_all(&temp_dir);
    let certs_dir = temp_dir.join("certs");
    std::fs::create_dir_all(&certs_dir).unwrap();
    std::fs::write(certs_dir.join("root-ca.cer"), pem.as_bytes()).unwrap();

    assert!(
        install_certificate_file(&temp_dir, "../escape.cer", "Root", "currentUser", None).is_err()
    );
    assert!(
        install_certificate_file(&temp_dir, "certs/missing.cer", "Root", "currentUser", None)
            .is_err()
    );
    assert!(install_certificate_file(
        &temp_dir,
        "certs/root-ca.cer",
        "AuthRoot",
        "currentUser",
        None
    )
    .is_err());
    assert!(install_certificate_file(
        &temp_dir,
        "certs/root-ca.cer",
        "TrustedPublisher",
        "currentUser",
        Some(&"ff".repeat(32))
    )
    .is_err());

    let prev_dry_run = std::env::var_os("TCI_DRY_RUN");
    std::env::set_var("TCI_DRY_RUN", "1");
    let res = install_certificate_file(
        &temp_dir,
        "certs/root-ca.cer",
        "TrustedPublisher",
        "currentUser",
        Some(&actual_hex),
    );
    match prev_dry_run {
        Some(v) => std::env::set_var("TCI_DRY_RUN", v),
        None => std::env::remove_var("TCI_DRY_RUN"),
    }
    assert!(res.is_ok(), "Expected dry-run cert install to succeed: {:?}", res);

    let _ = std::fs::remove_dir_all(&temp_dir);
}
