"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTarBuffer = buildTarBuffer;
exports.createPayloadArchive = createPayloadArchive;
exports.createPayloadArchiveDetailed = createPayloadArchiveDetailed;
exports.createZipArchive = createZipArchive;
const archiver_1 = __importDefault(require("archiver"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_zlib_1 = __importDefault(require("node:zlib"));
function collectFilesSorted(rootDir, currentDir = rootDir, out = []) {
    if (!node_fs_1.default.existsSync(currentDir))
        return out;
    const entries = node_fs_1.default
        .readdirSync(currentDir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
        const fullPath = node_path_1.default.join(currentDir, entry.name);
        if (entry.isDirectory()) {
            collectFilesSorted(rootDir, fullPath, out);
        }
        else if (entry.isFile()) {
            const relPath = node_path_1.default.relative(rootDir, fullPath).replace(/\\/g, '/');
            const size = node_fs_1.default.statSync(fullPath).size;
            out.push({ relPath, fullPath, size });
        }
    }
    return out;
}
function createUstarHeader(relPath, size) {
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
function buildTarBuffer(sourceDir) {
    const files = collectFilesSorted(sourceDir);
    const chunks = [];
    let uncompressedBytes = 0;
    for (const file of files) {
        const content = node_fs_1.default.readFileSync(file.fullPath);
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
async function createPayloadArchive(sourceDir, outputFile, preferZstd = true) {
    const res = await createPayloadArchiveDetailed(sourceDir, outputFile, preferZstd);
    return res.compressedBytes;
}
async function createPayloadArchiveDetailed(sourceDir, outputFile, preferZstd = true) {
    const parentDir = node_path_1.default.dirname(outputFile);
    if (!node_fs_1.default.existsSync(parentDir)) {
        node_fs_1.default.mkdirSync(parentDir, { recursive: true });
    }
    const zstdCompressSync = node_zlib_1.default.zstdCompressSync;
    if (preferZstd && typeof zstdCompressSync === 'function') {
        const { tarBuffer, fileCount, uncompressedBytes } = buildTarBuffer(sourceDir);
        const compressed = zstdCompressSync(tarBuffer);
        node_fs_1.default.writeFileSync(outputFile, compressed);
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
function createZipArchive(sourceDir, outputFile) {
    return new Promise((resolve, reject) => {
        const parentDir = node_path_1.default.dirname(outputFile);
        if (!node_fs_1.default.existsSync(parentDir)) {
            node_fs_1.default.mkdirSync(parentDir, { recursive: true });
        }
        const output = node_fs_1.default.createWriteStream(outputFile);
        const archive = (0, archiver_1.default)('zip', {
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
