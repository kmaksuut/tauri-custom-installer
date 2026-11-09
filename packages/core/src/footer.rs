use std::fs::{self, File};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::Path;
use sha2::{Digest, Sha256};
use crate::models::AppManifest;

/// 16-byte magic footer signature for single-file TCI SFX executables
pub const TCI_FOOTER_MAGIC: [u8; 16] = *b"TCI_SFX_V1\0\x01\xfe\x20\x26\0";
pub const TCI_FOOTER_SIZE: usize = 136;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TciFooter {
    pub runtime_size: u64,
    pub ui_offset: u64,
    pub ui_size: u64,
    pub payload_offset: u64,
    pub payload_size: u64,
    pub manifest_offset: u64,
    pub manifest_size: u64,
    pub payload_sha256: [u8; 32],
    pub ui_sha256: [u8; 32],
}

impl TciFooter {
    pub fn to_bytes(&self) -> [u8; TCI_FOOTER_SIZE] {
        let mut buf = [0u8; TCI_FOOTER_SIZE];
        buf[0..8].copy_from_slice(&self.runtime_size.to_le_bytes());
        buf[8..16].copy_from_slice(&self.ui_offset.to_le_bytes());
        buf[16..24].copy_from_slice(&self.ui_size.to_le_bytes());
        buf[24..32].copy_from_slice(&self.payload_offset.to_le_bytes());
        buf[32..40].copy_from_slice(&self.payload_size.to_le_bytes());
        buf[40..48].copy_from_slice(&self.manifest_offset.to_le_bytes());
        buf[48..56].copy_from_slice(&self.manifest_size.to_le_bytes());
        buf[56..88].copy_from_slice(&self.payload_sha256);
        buf[88..120].copy_from_slice(&self.ui_sha256);
        buf[120..136].copy_from_slice(&TCI_FOOTER_MAGIC);
        buf
    }

    pub fn from_bytes(buf: &[u8]) -> Option<Self> {
        if buf.len() < TCI_FOOTER_SIZE {
            return None;
        }
        let slice = &buf[buf.len() - TCI_FOOTER_SIZE..];
        if slice[120..136] != TCI_FOOTER_MAGIC {
            return None;
        }
        let runtime_size = u64::from_le_bytes(slice[0..8].try_into().ok()?);
        let ui_offset = u64::from_le_bytes(slice[8..16].try_into().ok()?);
        let ui_size = u64::from_le_bytes(slice[16..24].try_into().ok()?);
        let payload_offset = u64::from_le_bytes(slice[24..32].try_into().ok()?);
        let payload_size = u64::from_le_bytes(slice[32..40].try_into().ok()?);
        let manifest_offset = u64::from_le_bytes(slice[40..48].try_into().ok()?);
        let manifest_size = u64::from_le_bytes(slice[48..56].try_into().ok()?);
        let mut payload_sha256 = [0u8; 32];
        payload_sha256.copy_from_slice(&slice[56..88]);
        let mut ui_sha256 = [0u8; 32];
        ui_sha256.copy_from_slice(&slice[88..120]);

        Some(Self {
            runtime_size,
            ui_offset,
            ui_size,
            payload_offset,
            payload_size,
            manifest_offset,
            manifest_size,
            payload_sha256,
            ui_sha256,
        })
    }
}

/// Reads the `TciFooter` from an executable path.
/// Supports both unsigned binaries (footer at EOF) and Authenticode-signed binaries
/// (where the Windows certificate table is appended after the footer).
pub fn read_footer_from_path(exe_path: &Path) -> Option<TciFooter> {
    let mut file = File::open(exe_path).ok()?;
    let file_len = file.metadata().ok()?.len();
    if file_len < TCI_FOOTER_SIZE as u64 {
        return None;
    }

    // 1. Fast path: check exact EOF
    let mut eof_buf = [0u8; TCI_FOOTER_SIZE];
    file.seek(SeekFrom::End(-(TCI_FOOTER_SIZE as i64))).ok()?;
    file.read_exact(&mut eof_buf).ok()?;
    if let Some(footer) = TciFooter::from_bytes(&eof_buf) {
        if validate_footer_bounds(&footer, file_len) {
            return Some(footer);
        }
    }

    // 2. Authenticode-signed path: scan backwards up to 128 KB from EOF for TCI_FOOTER_MAGIC
    let scan_window = file_len.min(131072) as usize;
    let mut tail = vec![0u8; scan_window];
    file.seek(SeekFrom::End(-(scan_window as i64))).ok()?;
    file.read_exact(&mut tail).ok()?;

    if scan_window >= TCI_FOOTER_SIZE {
        for end in (TCI_FOOTER_SIZE..=scan_window).rev() {
            if tail[end - 16..end] == TCI_FOOTER_MAGIC {
                let candidate = &tail[end - TCI_FOOTER_SIZE..end];
                if let Some(footer) = TciFooter::from_bytes(candidate) {
                    if validate_footer_bounds(&footer, file_len) {
                        return Some(footer);
                    }
                }
            }
        }
    }

    None
}

fn validate_footer_bounds(footer: &TciFooter, file_len: u64) -> bool {
    footer.runtime_size <= file_len
        && footer.ui_offset.saturating_add(footer.ui_size) <= file_len
        && footer.payload_offset.saturating_add(footer.payload_size) <= file_len
        && footer.manifest_offset.saturating_add(footer.manifest_size) <= file_len
}

pub fn read_footer_from_current_exe() -> Option<TciFooter> {
    let exe = std::env::current_exe().ok()?;
    read_footer_from_path(&exe)
}

/// Reads the appended `AppManifest` from the given executable if a footer exists.
pub fn read_appended_manifest(exe_path: &Path) -> Option<AppManifest> {
    let footer = read_footer_from_path(exe_path)?;
    if footer.manifest_size == 0 || footer.manifest_size > 10 * 1024 * 1024 {
        return None;
    }
    let mut file = File::open(exe_path).ok()?;
    file.seek(SeekFrom::Start(footer.manifest_offset)).ok()?;
    let mut buf = vec![0u8; footer.manifest_size as usize];
    file.read_exact(&mut buf).ok()?;
    serde_json::from_slice(&buf).ok()
}

/// Reads the appended `ui.zip` bytes from the current executable if present, verifying SHA-256.
pub fn read_appended_ui_zip(exe_path: &Path) -> Result<Option<Vec<u8>>, String> {
    let footer = match read_footer_from_path(exe_path) {
        Some(f) if f.ui_size > 0 => f,
        _ => return Ok(None),
    };
    if footer.ui_size > 100 * 1024 * 1024 {
        return Err("CORRUPTED: Appended UI archive exceeds maximum allowed size.".to_string());
    }
    let mut file = File::open(exe_path).map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(footer.ui_offset))
        .map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; footer.ui_size as usize];
    file.read_exact(&mut buf).map_err(|e| e.to_string())?;

    if footer.ui_sha256 != [0u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(&buf);
        let digest: [u8; 32] = hasher.finalize().into();
        if digest != footer.ui_sha256 {
            return Err("CORRUPTED: UI bundle SHA-256 verification failed.".to_string());
        }
    }

    Ok(Some(buf))
}

/// A zero-copy bounded `Read + Seek` window over a section of a file on disk.
/// Allows streaming multi-gigabyte payloads directly from the setup executable
/// with constant O(1) memory usage.
pub struct SectionReader {
    file: File,
    start: u64,
    len: u64,
    pos: u64,
}

impl SectionReader {
    pub fn open(path: &Path, start: u64, len: u64) -> io::Result<Self> {
        let mut file = File::open(path)?;
        file.seek(SeekFrom::Start(start))?;
        Ok(Self {
            file,
            start,
            len,
            pos: 0,
        })
    }

    pub fn len(&self) -> u64 {
        self.len
    }

    pub fn is_empty(&self) -> bool {
        self.len == 0
    }
}

impl Read for SectionReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let remaining = self.len.saturating_sub(self.pos);
        if remaining == 0 {
            return Ok(0);
        }
        let max_read = (buf.len() as u64).min(remaining) as usize;
        let n = self.file.read(&mut buf[..max_read])?;
        self.pos += n as u64;
        Ok(n)
    }
}

impl Seek for SectionReader {
    fn seek(&mut self, style: SeekFrom) -> io::Result<u64> {
        let new_pos: i128 = match style {
            SeekFrom::Start(n) => n as i128,
            SeekFrom::End(n) => self.len as i128 + n as i128,
            SeekFrom::Current(n) => self.pos as i128 + n as i128,
        };
        if new_pos < 0 || new_pos > self.len as i128 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Seek out of bounds of SectionReader",
            ));
        }
        self.pos = new_pos as u64;
        self.file.seek(SeekFrom::Start(self.start + self.pos))?;
        Ok(self.pos)
    }
}

/// Verifies the SHA-256 checksum of a `SectionReader` in streaming 64 KB chunks.
pub fn verify_section_sha256(reader: &mut SectionReader, expected: &[u8; 32]) -> Result<(), String> {
    if *expected == [0u8; 32] {
        return Ok(());
    }
    reader
        .seek(SeekFrom::Start(0))
        .map_err(|e| format!("Failed to seek payload for verification: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = reader
            .read(&mut buf)
            .map_err(|e| format!("Failed reading payload for verification: {}", e))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let actual: [u8; 32] = hasher.finalize().into();
    reader
        .seek(SeekFrom::Start(0))
        .map_err(|e| format!("Failed to rewind payload after verification: {}", e))?;

    if actual != *expected {
        return Err(
            "CORRUPTED: Installer payload integrity check (SHA-256) failed. Please re-download the installer."
                .to_string(),
        );
    }
    Ok(())
}

/// Writes `<install_dir>\uninstall.exe` WITHOUT copying the embedded payload.
/// If the current executable uses the appended footer layout, it copies only:
/// `[runtime_exe (runtime_size bytes)][ui.zip][manifest.json][footer (payload_size = 0)]`.
/// This reduces `uninstall.exe` size from hundreds of megabytes to just the ~2.5 MB runtime + UI!
pub fn write_stripped_uninstaller(current_exe: &Path, uninstaller_dest: &Path) -> Result<(), String> {
    if let Some(footer) = read_footer_from_path(current_exe) {
        if footer.runtime_size > 0 {
            let mut src = File::open(current_exe).map_err(|e| e.to_string())?;
            let mut out = File::create(uninstaller_dest).map_err(|e| e.to_string())?;

            // 1. Copy runtime stub
            let mut runtime_reader = SectionReader::open(current_exe, 0, footer.runtime_size)
                .map_err(|e| e.to_string())?;
            io::copy(&mut runtime_reader, &mut out).map_err(|e| e.to_string())?;
            let mut offset = footer.runtime_size;

            // 2. Copy UI archive so uninstall.exe keeps the custom UI
            let ui_offset = offset;
            if footer.ui_size > 0 {
                src.seek(SeekFrom::Start(footer.ui_offset))
                    .map_err(|e| e.to_string())?;
                let mut ui_reader = (&mut src).take(footer.ui_size);
                io::copy(&mut ui_reader, &mut out).map_err(|e| e.to_string())?;
                offset += footer.ui_size;
            }

            // 3. Omit payload (payload_size = 0)
            let payload_offset = offset;

            // 4. Copy manifest.json
            let manifest_offset = offset;
            if footer.manifest_size > 0 {
                src.seek(SeekFrom::Start(footer.manifest_offset))
                    .map_err(|e| e.to_string())?;
                let mut manifest_reader = (&mut src).take(footer.manifest_size);
                io::copy(&mut manifest_reader, &mut out).map_err(|e| e.to_string())?;
            }

            // 5. Write updated footer with payload_size = 0
            let new_footer = TciFooter {
                runtime_size: footer.runtime_size,
                ui_offset,
                ui_size: footer.ui_size,
                payload_offset,
                payload_size: 0,
                manifest_offset,
                manifest_size: footer.manifest_size,
                payload_sha256: [0u8; 32],
                ui_sha256: footer.ui_sha256,
            };
            out.write_all(&new_footer.to_bytes())
                .map_err(|e| e.to_string())?;
            out.flush().map_err(|e| e.to_string())?;
            return Ok(());
        }
    }

    // Fallback when no footer is present
    fs::copy(current_exe, uninstaller_dest)
        .map(|_| ())
        .map_err(|e| format!("Failed to write uninstaller executable: {}", e))
}
