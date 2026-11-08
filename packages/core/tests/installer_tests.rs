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
