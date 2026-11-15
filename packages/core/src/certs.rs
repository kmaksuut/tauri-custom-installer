use std::fs;
use std::path::Path;
use sha2::{Digest, Sha256};
use crate::extractor::sanitize_archive_entry_path;
use crate::registry::is_dry_run;
use crate::uninstaller::is_reparse_point;

const ALLOWED_STORES: [&str; 4] = ["Root", "TrustedPublisher", "CA", "My"];

/// Normalizes and validates the Windows certificate store name against the allow-list.
pub fn normalize_allowed_store(store: &str) -> Result<&'static str, String> {
    let trimmed = store.trim();
    for &allowed in &ALLOWED_STORES {
        if trimmed.eq_ignore_ascii_case(allowed) {
            return Ok(allowed);
        }
    }
    Err(format!(
        "SECURITY: Unsupported certificate store '{}'. Allowed stores: Root, TrustedPublisher, CA, My.",
        store
    ))
}

fn decode_base64_clean(input: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity((input.len() * 3) / 4);
    let mut buf: u32 = 0;
    let mut bits: u8 = 0;

    for b in input.bytes() {
        if b.is_ascii_whitespace() {
            continue;
        }
        if b == b'=' {
            break;
        }
        let val: u32 = match b {
            b'A'..=b'Z' => (b - b'A') as u32,
            b'a'..=b'z' => (b - b'a' + 26) as u32,
            b'0'..=b'9' => (b - b'0' + 52) as u32,
            b'+' => 62,
            b'/' => 63,
            _ => return Err("INVALID_CERT: Illegal character in PEM certificate body.".to_string()),
        };
        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push(((buf >> bits) & 0xFF) as u8);
        }
    }

    Ok(out)
}

/// Parses an X.509 certificate in either PEM (`-----BEGIN CERTIFICATE-----`) or ASN.1 DER format.
pub fn parse_certificate_bytes(raw: &[u8]) -> Result<Vec<u8>, String> {
    let stripped = raw.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(raw);
    let trimmed_start = stripped
        .iter()
        .position(|b| !b.is_ascii_whitespace())
        .map(|idx| &stripped[idx..])
        .unwrap_or(&[]);

    if trimmed_start.starts_with(b"-----BEGIN CERTIFICATE-----") {
        let text = std::str::from_utf8(trimmed_start)
            .map_err(|_| "INVALID_CERT: PEM certificate is not valid UTF-8.".to_string())?;
        let begin_marker = "-----BEGIN CERTIFICATE-----";
        let end_marker = "-----END CERTIFICATE-----";
        let start_idx = text
            .find(begin_marker)
            .ok_or_else(|| "INVALID_CERT: Missing PEM BEGIN marker.".to_string())?
            + begin_marker.len();
        let end_idx = text[start_idx..]
            .find(end_marker)
            .ok_or_else(|| "INVALID_CERT: Missing PEM END marker.".to_string())?
            + start_idx;
        let der = decode_base64_clean(&text[start_idx..end_idx])?;
        if der.len() < 32 || der[0] != 0x30 {
            return Err("INVALID_CERT: Decoded PEM payload is not a valid ASN.1 DER X.509 certificate.".to_string());
        }
        return Ok(der);
    }

    if raw.len() < 32 || raw[0] != 0x30 {
        return Err("INVALID_CERT: Expected valid X.509 DER SEQUENCE or PEM certificate.".to_string());
    }

    Ok(raw.to_vec())
}

/// Computes lowercase SHA-256 hex digest over DER-encoded certificate bytes.
pub fn compute_cert_sha256_hex(der_bytes: &[u8]) -> String {
    let digest = Sha256::digest(der_bytes);
    let mut hex = String::with_capacity(64);
    for byte in digest {
        hex.push_str(&format!("{:02x}", byte));
    }
    hex
}

/// Verifies that the certificate's SHA-256 digest matches the expected pinned thumbprint.
pub fn verify_cert_thumbprint(der_bytes: &[u8], expected_hex: &str) -> Result<(), String> {
    let normalized_expected: String = expected_hex
        .chars()
        .filter(|c| !c.is_ascii_whitespace() && *c != ':')
        .map(|c| c.to_ascii_lowercase())
        .collect();

    if normalized_expected.len() != 64 || !normalized_expected.chars().all(|c| c.is_ascii_hexdigit())
    {
        return Err(
            "INVALID_THUMBPRINT: Expected a 64-character SHA-256 hex thumbprint for certificate pinning."
                .to_string(),
        );
    }

    let actual = compute_cert_sha256_hex(der_bytes);
    if actual != normalized_expected {
        return Err(format!(
            "SECURITY: Certificate SHA-256 thumbprint mismatch (expected {}, got {}).",
            normalized_expected, actual
        ));
    }
    Ok(())
}

fn has_reparse_between(root: &Path, target: &Path) -> bool {
    let mut curr = Some(target);
    while let Some(p) = curr {
        if p.exists() && is_reparse_point(p) {
            return true;
        }
        if p == root {
            break;
        }
        curr = p.parent();
    }
    false
}

/// Installs a bundled X.509 certificate (`.cer` / `.crt`, DER or PEM) into the Windows certificate store
/// using native Win32 CryptoAPI (`CertOpenStore` + `CertAddEncodedCertificateToStore`) without shelling out.
pub fn install_certificate_file(
    install_dir: &Path,
    relative_path: &str,
    store_name: &str,
    scope: &str,
    expected_sha256: Option<&str>,
) -> Result<(), String> {
    if is_reparse_point(install_dir) {
        return Err("SECURITY: Refusing certificate installation inside a symlink/junction directory.".to_string());
    }

    let clean_rel = sanitize_archive_entry_path(relative_path).ok_or_else(|| {
        format!(
            "SECURITY: Invalid certificate relative path '{}'.",
            relative_path
        )
    })?;
    let cert_path = install_dir.join(&clean_rel);
    if !cert_path.exists() || !cert_path.is_file() {
        return Err(format!(
            "CERTIFICATE_NOT_FOUND: Certificate file '{}' does not exist in install directory.",
            clean_rel.display()
        ));
    }
    if has_reparse_between(install_dir, &cert_path) {
        return Err("SECURITY: Certificate path traverses a symlink/reparse point.".to_string());
    }

    let canonical_store = normalize_allowed_store(store_name)?;
    let raw = fs::read(&cert_path)
        .map_err(|e| format!("Failed reading certificate file {:?}: {}", cert_path, e))?;
    let der = parse_certificate_bytes(&raw)?;

    if let Some(expected) = expected_sha256 {
        let trimmed = expected.trim();
        if !trimmed.is_empty() {
            verify_cert_thumbprint(&der, trimmed)?;
        }
    }

    if is_dry_run() {
        return Ok(());
    }

    install_der_to_windows_store(&der, canonical_store, scope)
}

#[cfg(target_os = "windows")]
fn install_der_to_windows_store(der: &[u8], store_name: &str, scope: &str) -> Result<(), String> {
    use windows_sys::Win32::Foundation::GetLastError;
    use windows_sys::Win32::Security::Cryptography::{
        CertAddEncodedCertificateToStore, CertCloseStore, CertOpenStore,
        CERT_STORE_ADD_REPLACE_EXISTING, CERT_STORE_OPEN_EXISTING_FLAG, CERT_STORE_PROV_SYSTEM_W,
        CERT_SYSTEM_STORE_CURRENT_USER_ID, CERT_SYSTEM_STORE_LOCAL_MACHINE_ID,
        CERT_SYSTEM_STORE_LOCATION_SHIFT, PKCS_7_ASN_ENCODING, X509_ASN_ENCODING,
    };

    let wide_store: Vec<u16> = store_name.encode_utf16().chain(std::iter::once(0)).collect();
    let location_id = if scope.eq_ignore_ascii_case("localMachine")
        || scope.eq_ignore_ascii_case("perMachine")
        || scope.eq_ignore_ascii_case("machine")
    {
        CERT_SYSTEM_STORE_LOCAL_MACHINE_ID
    } else {
        CERT_SYSTEM_STORE_CURRENT_USER_ID
    };

    let flags = (location_id << CERT_SYSTEM_STORE_LOCATION_SHIFT) | CERT_STORE_OPEN_EXISTING_FLAG;
    let encoding = X509_ASN_ENCODING | PKCS_7_ASN_ENCODING;

    unsafe {
        let h_store = CertOpenStore(
            CERT_STORE_PROV_SYSTEM_W,
            encoding,
            0,
            flags,
            wide_store.as_ptr() as *const core::ffi::c_void,
        );
        if h_store.is_null() {
            let err = GetLastError();
            return Err(format!(
                "WIN32_CERT_ERROR: Failed to open certificate store '{}' (scope '{}', Win32 error {}).",
                store_name, scope, err
            ));
        }

        let ok = CertAddEncodedCertificateToStore(
            h_store,
            encoding,
            der.as_ptr(),
            der.len() as u32,
            CERT_STORE_ADD_REPLACE_EXISTING,
            std::ptr::null_mut(),
        );
        let err = if ok == 0 { GetLastError() } else { 0 };
        CertCloseStore(h_store, 0);

        if ok == 0 {
            return Err(format!(
                "WIN32_CERT_ERROR: Failed to add certificate to store '{}' (Win32 error {}).",
                store_name, err
            ));
        }
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn install_der_to_windows_store(_der: &[u8], _store_name: &str, _scope: &str) -> Result<(), String> {
    Ok(())
}
