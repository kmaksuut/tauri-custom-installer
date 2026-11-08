import archiver from 'archiver';
import fs from 'node:fs';
import path from 'node:path';

export async function createPayloadArchive(sourceDir: string, outputFile: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const parentDir = path.dirname(outputFile);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const output = fs.createWriteStream(outputFile);
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Maximum compression
    });

    output.on('close', () => {
      resolve(archive.pointer());
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}
