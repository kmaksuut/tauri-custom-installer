import archiver from 'archiver';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export interface ArchiveResult {
  compressedBytes: number;
  format: 'tar.zst' | 'zip';
  fileCount: number;
  uncompressedBytes: number;
}

function collectFilesSorted(
  rootDir: string,
  currentDir: string = rootDir,
  out: Array<{ relPath: string; fullPath: string; size: number }> = []
): Array<{ relPath: string; fullPath: string; size: number }> {
  if (!fs.existsSync(currentDir)) return out;
  const entries = fs
    .readdirSync(currentDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      collectFilesSorted(rootDir, fullPath, out);
    } else if (entry.isFile()) {
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
      const size = fs.statSync(fullPath).size;
      out.push({ relPath, fullPath, size });
    }
  }
  return out;
}

function createUstarHeader(relPath: string, size: number): Buffer {
  const header = Buffer.alloc(512, 0);

  // Split path into prefix (155 bytes) and name (100 bytes) if > 100 chars
  let name = relPath;
  let prefix = '';
  if (Buffer.byteLength(relPath, 'utf8') > 100) {
    const slashIdx = relPath.lastIndexOf('/');
    if (slashIdx > 0) {
      prefix = relPath.slice(0, slashIdx);
      name = relPath.slice(slashIdx + 1);
    }
  }

  header.write(name.slice(0, 100), 0, 100, 'utf8');
  header.write('0000644\0', 100, 8, 'ascii'); // mode
  header.write('0000000\0', 108, 8, 'ascii'); // uid
  header.write('0000000\0', 116, 8, 'ascii'); // gid
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii'); // size
  header.write('00000000000\0', 136, 12, 'ascii'); // mtime = 0 for reproducible builds
  header.fill(0x20, 148, 156); // checksum placeholder (8 spaces)
  header.write('0', 156, 1, 'ascii'); // regular file
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  if (prefix) {
    header.write(prefix.slice(0, 155), 345, 155, 'utf8');
  }

  let chksum = 0;
  for (let i = 0; i < 512; i++) {
    chksum += header[i];
  }
  header.write(`${chksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return header;
}

export function buildTarBuffer(sourceDir: string): {
  tarBuffer: Buffer;
  fileCount: number;
  uncompressedBytes: number;
} {
  const files = collectFilesSorted(sourceDir);
  const chunks: Buffer[] = [];
  let uncompressedBytes = 0;

  for (const file of files) {
    const content = fs.readFileSync(file.fullPath);
    uncompressedBytes += content.length;
    chunks.push(createUstarHeader(file.relPath, content.length));
    chunks.push(content);
    const rem = content.length % 512;
    if (rem !== 0) {
      chunks.push(Buffer.alloc(512 - rem, 0));
    }
  }

  // End-of-archive marker (two 512-byte zero blocks)
  chunks.push(Buffer.alloc(1024, 0));

  return {
    tarBuffer: Buffer.concat(chunks),
    fileCount: files.length,
    uncompressedBytes,
  };
}

export async function createPayloadArchive(
  sourceDir: string,
  outputFile: string,
  preferZstd = true
): Promise<number> {
  const res = await createPayloadArchiveDetailed(sourceDir, outputFile, preferZstd);
  return res.compressedBytes;
}

export async function createPayloadArchiveDetailed(
  sourceDir: string,
  outputFile: string,
  preferZstd = true
): Promise<ArchiveResult> {
  const parentDir = path.dirname(outputFile);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  const zstdCompressSync = (
    zlib as unknown as {
      zstdCompressSync?: (buf: Buffer) => Buffer;
    }
  ).zstdCompressSync;

  if (preferZstd && typeof zstdCompressSync === 'function') {
    const { tarBuffer, fileCount, uncompressedBytes } = buildTarBuffer(sourceDir);
    const compressed = zstdCompressSync(tarBuffer);
    fs.writeFileSync(outputFile, compressed);
    return {
      compressedBytes: compressed.length,
      format: 'tar.zst',
      fileCount,
      uncompressedBytes,
    };
  }

  const files = collectFilesSorted(sourceDir);
  let uncompressedBytes = 0;
  for (const f of files) {
    uncompressedBytes += f.size;
  }

  const compressedBytes = await createZipArchive(sourceDir, outputFile);
  return {
    compressedBytes,
    format: 'zip',
    fileCount: files.length,
    uncompressedBytes,
  };
}

export function createZipArchive(sourceDir: string, outputFile: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const parentDir = path.dirname(outputFile);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const output = fs.createWriteStream(outputFile);
    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    output.on('close', () => {
      resolve(archive.pointer());
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    const files = collectFilesSorted(sourceDir);
    for (const f of files) {
      archive.file(f.fullPath, {
        name: f.relPath,
        date: new Date(0), // Deterministic timestamp for reproducible builds
      });
    }

    void archive.finalize();
  });
}
