import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';

export interface CleanOptions {
  all?: boolean;
  dryRun?: boolean;
}

function getPathSizeBytes(target: string): number {
  try {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) return 0;
    if (!stat.isDirectory()) return stat.size;
    let total = 0;
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      total += getPathSizeBytes(path.join(target, entry.name));
    }
    return total;
  } catch {
    return 0;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function runClean(options: CleanOptions = {}): void {
  const cwd = process.cwd();
  const baseTargets = [
    path.join('installer', '.payload_staging'),
    path.join('installer', 'src-tauri', 'payload'),
    path.join('installer', 'src-tauri', 'gen'),
    path.join('installer', 'dist'),
    '.tci',
  ];

  const allTargets = options.all
    ? [
        ...baseTargets,
        path.join('installer', 'src-tauri', 'target'),
        path.join('installer', 'node_modules'),
      ]
    : baseTargets;

  console.log(
    pc.cyan(
      `\n🧹 Cleaning temporary installer artifacts in ${cwd}${options.all ? ' (--all)' : ''}...\n`
    )
  );

  let removedCount = 0;
  let reclaimedBytes = 0;

  for (const rel of allTargets) {
    const abs = path.join(cwd, rel);
    if (!fs.existsSync(abs)) continue;

    try {
      const stat = fs.lstatSync(abs);
      if (stat.isSymbolicLink()) {
        console.log(pc.yellow(`  ⚠️  Skipped symlink: ${rel}`));
        continue;
      }
      const size = getPathSizeBytes(abs);
      reclaimedBytes += size;
      removedCount++;

      if (options.dryRun) {
        console.log(pc.gray(`  [dry-run] Would remove ${rel} (${formatBytes(size)})`));
      } else {
        fs.rmSync(abs, { recursive: true, force: true });
        console.log(pc.green(`  ✔ Removed ${rel} (${formatBytes(size)})`));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(pc.yellow(`  ⚠️  Could not remove ${rel}: ${msg}`));
    }
  }

  if (removedCount === 0) {
    console.log(pc.green(`✔ Workspace is already clean.`));
  } else if (options.dryRun) {
    console.log(
      pc.cyan(`\nWould clean ${removedCount} item(s) (~${formatBytes(reclaimedBytes)}).\n`)
    );
  } else {
    console.log(
      pc.green(`\n✔ Cleaned ${removedCount} item(s), reclaimed ${formatBytes(reclaimedBytes)}.\n`)
    );
  }
}
