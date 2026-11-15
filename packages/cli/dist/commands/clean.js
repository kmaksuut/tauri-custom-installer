"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runClean = runClean;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const picocolors_1 = __importDefault(require("picocolors"));
function getPathSizeBytes(target) {
    try {
        const stat = node_fs_1.default.lstatSync(target);
        if (stat.isSymbolicLink())
            return 0;
        if (!stat.isDirectory())
            return stat.size;
        let total = 0;
        for (const entry of node_fs_1.default.readdirSync(target, { withFileTypes: true })) {
            total += getPathSizeBytes(node_path_1.default.join(target, entry.name));
        }
        return total;
    }
    catch {
        return 0;
    }
}
function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
function runClean(options = {}) {
    const cwd = process.cwd();
    const baseTargets = [
        node_path_1.default.join('installer', '.payload_staging'),
        node_path_1.default.join('installer', 'src-tauri', 'payload'),
        node_path_1.default.join('installer', 'src-tauri', 'gen'),
        node_path_1.default.join('installer', 'dist'),
        '.tci',
    ];
    const allTargets = options.all
        ? [
            ...baseTargets,
            node_path_1.default.join('installer', 'src-tauri', 'target'),
            node_path_1.default.join('installer', 'node_modules'),
        ]
        : baseTargets;
    console.log(picocolors_1.default.cyan(`\n🧹 Cleaning temporary installer artifacts in ${cwd}${options.all ? ' (--all)' : ''}...\n`));
    let removedCount = 0;
    let reclaimedBytes = 0;
    for (const rel of allTargets) {
        const abs = node_path_1.default.join(cwd, rel);
        if (!node_fs_1.default.existsSync(abs))
            continue;
        try {
            const stat = node_fs_1.default.lstatSync(abs);
            if (stat.isSymbolicLink()) {
                console.log(picocolors_1.default.yellow(`  ⚠️  Skipped symlink: ${rel}`));
                continue;
            }
            const size = getPathSizeBytes(abs);
            reclaimedBytes += size;
            removedCount++;
            if (options.dryRun) {
                console.log(picocolors_1.default.gray(`  [dry-run] Would remove ${rel} (${formatBytes(size)})`));
            }
            else {
                node_fs_1.default.rmSync(abs, { recursive: true, force: true });
                console.log(picocolors_1.default.green(`  ✔ Removed ${rel} (${formatBytes(size)})`));
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(picocolors_1.default.yellow(`  ⚠️  Could not remove ${rel}: ${msg}`));
        }
    }
    if (removedCount === 0) {
        console.log(picocolors_1.default.green(`✔ Workspace is already clean.`));
    }
    else if (options.dryRun) {
        console.log(picocolors_1.default.cyan(`\nWould clean ${removedCount} item(s) (~${formatBytes(reclaimedBytes)}).\n`));
    }
    else {
        console.log(picocolors_1.default.green(`\n✔ Cleaned ${removedCount} item(s), reclaimed ${formatBytes(reclaimedBytes)}.\n`));
    }
}
