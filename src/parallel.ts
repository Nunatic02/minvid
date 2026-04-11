import os from "node:os";
import path from "node:path";
import type { Preset } from "./presets.js";
import { compressFile, type CompressionResult } from "./compress.js";
import type { ProgressUpdate } from "./ffmpeg.js";

export interface ParallelEvent {
  type: "start" | "progress" | "done" | "error";
  file: string;
  index: number;
  total: number;
  progress?: ProgressUpdate;
  result?: CompressionResult;
  error?: Error;
}

/**
 * Get a sensible default concurrency.
 * Cap at 4 since ffmpeg is CPU-heavy per process.
 */
export function defaultConcurrency(): number {
  return Math.max(1, Math.min(os.cpus().length - 1, 4));
}

/**
 * Compress multiple files with concurrency control.
 * Calls onEvent for each status change so the UI can update.
 */
export async function compressAll(
  files: string[],
  preset: Preset,
  subfolder: boolean,
  thumbnail: boolean,
  concurrency: number,
  onEvent: (event: ParallelEvent) => void,
  customName?: string,
  scale?: string,
): Promise<CompressionResult[]> {
  const results: CompressionResult[] = [];
  const total = files.length;
  let nextIndex = 0;

  async function processOne(index: number): Promise<void> {
    const file = files[index];
    const basename = path.basename(file);

    onEvent({ type: "start", file: basename, index, total });

    try {
      const result = await compressFile({
        inputPath: file,
        preset,
        subfolder,
        thumbnail,
        scale,
        customName,
        onProgress: (progress) => {
          onEvent({ type: "progress", file: basename, index, total, progress });
        },
      });
      results.push(result);
      onEvent({ type: "done", file: basename, index, total, result });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      onEvent({ type: "error", file: basename, index, total, error });
    }
  }

  // Simple job pool
  const workers: Promise<void>[] = [];

  for (let i = 0; i < Math.min(concurrency, total); i++) {
    workers.push(
      (async () => {
        while (nextIndex < total) {
          const idx = nextIndex++;
          await processOne(idx);
        }
      })(),
    );
  }

  await Promise.all(workers);
  return results;
}
