import fs from "node:fs";
import type { Preset } from "./presets.js";
import { getDuration, spawnFfmpeg, getCoverArtIndex, extractCoverArt, extractThumbnail, attachCoverArt, type ProgressUpdate } from "./ffmpeg.js";
import { generateOutputPath } from "./paths.js";

export interface CompressionResult {
  inputPath: string;
  outputPath: string;
  inputSize: number;
  outputSize: number;
  durationMs: number;
  preset: string;
}

export interface CompressOptions {
  inputPath: string;
  preset: Preset;
  subfolder: boolean;
  thumbnail: boolean;
  scale?: string;
  customName?: string;
  onProgress: (update: ProgressUpdate) => void;
}

/**
 * Build an ffmpeg scale filter string from user input.
 * Accepts "50%" (percentage) or "1080p" / "720p" (height-based).
 */
function buildScaleFilter(scale: string): string {
  const percentMatch = scale.match(/^(\d+)%$/);
  if (percentMatch) {
    const factor = parseInt(percentMatch[1]) / 100;
    return `scale=trunc(iw*${factor}/2)*2:trunc(ih*${factor}/2)*2`;
  }
  const pMatch = scale.match(/^(\d+)p$/);
  if (pMatch) {
    return `scale=-2:${pMatch[1]}`;
  }
  return `scale=${scale}`;
}

/**
 * Compress a single video file.
 */
export async function compressFile(opts: CompressOptions): Promise<CompressionResult> {
  const { inputPath, preset, subfolder, thumbnail, customName, onProgress } = opts;

  const outputPath = generateOutputPath(inputPath, preset.ext, subfolder, customName);
  const inputSize = fs.statSync(inputPath).size;

  // Detect and extract cover art before encoding
  const coverIndex = await getCoverArtIndex(inputPath);
  let coverTempFile: string | null = null;
  if (coverIndex !== null) {
    coverTempFile = await extractCoverArt(inputPath, coverIndex);
  } else if (thumbnail) {
    coverTempFile = await extractThumbnail(inputPath);
  }

  const totalDuration = await getDuration(inputPath);
  const args = preset.buildArgs(inputPath, outputPath);

  // Inject scale filter if requested
  if (opts.scale) {
    const scaleFilter = buildScaleFilter(opts.scale);
    const vfIdx = args.indexOf("-vf");
    if (vfIdx >= 0) {
      args[vfIdx + 1] = args[vfIdx + 1] + "," + scaleFilter;
    }
  }

  const startTime = Date.now();
  const { process: ffmpegProc, done } = spawnFfmpeg(args, totalDuration, onProgress);

  // Handle Ctrl+C: kill ffmpeg and clean up partial file
  const cleanup = () => {
    ffmpegProc.kill("SIGTERM");
    try {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch { /* ignore cleanup errors */ }
    try {
      if (coverTempFile && fs.existsSync(coverTempFile)) fs.unlinkSync(coverTempFile);
    } catch { /* ignore */ }
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  try {
    await done;
  } catch (err) {
    try {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch { /* ignore */ }
    throw err;
  } finally {
    process.removeListener("SIGINT", cleanup);
    process.removeListener("SIGTERM", cleanup);
  }

  // Re-attach cover art if we extracted one
  if (coverTempFile) {
    await attachCoverArt(outputPath, coverTempFile);
    try { fs.unlinkSync(coverTempFile); } catch { /* ignore */ }
  }

  const durationMs = Date.now() - startTime;
  const outputSize = fs.statSync(outputPath).size;

  return {
    inputPath,
    outputPath,
    inputSize,
    outputSize,
    durationMs,
    preset: preset.name,
  };
}
