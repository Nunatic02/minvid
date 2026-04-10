import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const VIDEO_EXTENSIONS = new Set([
  ".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".ts", ".flv",
]);

/**
 * Parse drag-and-drop input from macOS terminal.
 * Handles:
 *  - Single-quoted paths (Terminal.app): '/path/to/my file.mp4'
 *  - Backslash-escaped spaces (iTerm2): /path/to/my\ file.mp4
 *  - Simple unquoted paths: /path/to/file.mp4
 */
export function parseDragDropInput(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  let paths: string[];

  // Check if input contains single-quoted paths
  const quotedMatches = trimmed.match(/'([^']+)'/g);
  if (quotedMatches && quotedMatches.length > 0) {
    paths = quotedMatches.map((m) => m.slice(1, -1));
  } else {
    // Parse backslash-escaped or simple paths
    paths = splitEscapedPaths(trimmed);
  }

  return paths
    .map((p) => resolvePath(p))
    .filter((p) => fs.existsSync(p))
    .flatMap((p) => expandPath(p));
}

/**
 * Split a string of paths where spaces may be escaped with backslashes.
 */
function splitEscapedPaths(input: string): string[] {
  const paths: string[] = [];
  let current = "";

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (ch === "\\" && i + 1 < input.length && input[i + 1] === " ") {
      // Escaped space — part of the filename
      current += " ";
      i++; // skip the space
    } else if (ch === " " && current.length > 0) {
      paths.push(current);
      current = "";
    } else if (ch !== " ") {
      current += ch;
    }
  }

  if (current.length > 0) {
    paths.push(current);
  }

  return paths;
}

/**
 * Resolve ~ and make path absolute.
 */
function resolvePath(filePath: string): string {
  let resolved = filePath;
  if (resolved.startsWith("~")) {
    resolved = resolved.replace(/^~/, os.homedir());
  }
  return path.resolve(resolved);
}

/**
 * If path is a directory, return all video files inside it (non-recursive).
 * If path is a video file, return it as-is.
 * Otherwise return empty.
 */
function expandPath(filePath: string): string[] {
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    return scanDirectory(filePath);
  }
  if (stat.isFile() && isVideoFile(filePath)) {
    return [filePath];
  }
  return [];
}

/**
 * Scan a directory for video files (non-recursive).
 */
export function scanDirectory(dirPath: string): string[] {
  return fs.readdirSync(dirPath)
    .map((name) => path.join(dirPath, name))
    .filter((f) => {
      try {
        return fs.statSync(f).isFile() && isVideoFile(f);
      } catch {
        return false;
      }
    })
    .sort();
}

/**
 * Check if a file has a known video extension.
 */
export function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

/**
 * Generate output path for a compressed video.
 *
 * subfolder mode: /dir/video.mp4 → /dir/compressed/video.mp4
 * suffix mode:    /dir/video.mp4 → /dir/video_min.mp4
 */
export function generateOutputPath(
  inputPath: string,
  outputExt: string,
  subfolder: boolean,
): string {
  const parsed = path.parse(inputPath);

  if (subfolder) {
    const outDir = path.join(parsed.dir, "compressed");
    fs.mkdirSync(outDir, { recursive: true });
    return dedup(path.join(outDir, parsed.name + outputExt));
  }

  return dedup(path.join(parsed.dir, parsed.name + "_min" + outputExt));
}

/**
 * If filePath already exists, append _1, _2, etc. before the extension.
 */
function dedup(filePath: string): string {
  if (!fs.existsSync(filePath)) return filePath;

  const parsed = path.parse(filePath);
  let i = 1;
  while (true) {
    const candidate = path.join(parsed.dir, `${parsed.name}_${i}${parsed.ext}`);
    if (!fs.existsSync(candidate)) return candidate;
    i++;
  }
}

/**
 * Format bytes to human-readable size.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Format seconds to human-readable time.
 */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}
