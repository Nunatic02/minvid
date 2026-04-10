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
  onProgress: (update: ProgressUpdate) => void;
}

/**
 * Compress a single video file.
 */
export async function compressFile(opts: CompressOptions): Promise<CompressionResult> {
  const { inputPath, preset, subfolder, thumbnail, onProgress } = opts;

  const outputPath = generateOutputPath(inputPath, preset.ext, subfolder);
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
