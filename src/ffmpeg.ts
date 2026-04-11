import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const execFileAsync = promisify(execFile);

export interface ProgressUpdate {
  percentage: number;
  speed: string;
  currentTime: number;
  totalDuration: number;
}

/**
 * Check if ffmpeg and ffprobe are available on the system.
 */
export async function checkFfmpeg(): Promise<boolean> {
  try {
    await runQuiet("ffmpeg", ["-version"]);
    await runQuiet("ffprobe", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

function runQuiet(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: "ignore" });
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

/**
 * Get video resolution (width × height) using ffprobe.
 */
export async function getResolution(filePath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_streams",
      "-select_streams", "v:0",
      filePath,
    ]);

    let stdout = "";
    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.on("error", (err) => reject(new Error(`ffprobe failed: ${err.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited with code ${code}`));
      try {
        const json = JSON.parse(stdout);
        const stream = json.streams?.[0];
        if (!stream?.width || !stream?.height) {
          return reject(new Error("Could not parse resolution from ffprobe output"));
        }
        resolve({ width: stream.width, height: stream.height });
      } catch (e) {
        reject(new Error(`Failed to parse ffprobe JSON: ${e}`));
      }
    });
  });
}

/**
 * Get video duration in seconds using ffprobe.
 */
export async function getDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      filePath,
    ]);

    let stdout = "";
    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.on("error", (err) => reject(new Error(`ffprobe failed: ${err.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`ffprobe exited with code ${code}`));
      }
      try {
        const json = JSON.parse(stdout);
        const duration = parseFloat(json.format.duration);
        if (isNaN(duration)) {
          return reject(new Error("Could not parse duration from ffprobe output"));
        }
        resolve(duration);
      } catch (e) {
        reject(new Error(`Failed to parse ffprobe JSON: ${e}`));
      }
    });
  });
}

export interface MediaInfo {
  fps: number | null;
  audioCodec: string | null;
  audioBitrate: string | null;
}

/**
 * Probe video for framerate and audio stream info.
 */
export async function getMediaInfo(filePath: string): Promise<MediaInfo> {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_streams",
      filePath,
    ]);

    let stdout = "";
    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.on("error", () => resolve({ fps: null, audioCodec: null, audioBitrate: null }));
    proc.on("close", (code) => {
      if (code !== 0) return resolve({ fps: null, audioCodec: null, audioBitrate: null });
      try {
        const json = JSON.parse(stdout);
        const streams: any[] = json.streams ?? [];

        const video = streams.find((s: any) => s.codec_type === "video" && s.disposition?.attached_pic !== 1);
        const audio = streams.find((s: any) => s.codec_type === "audio");

        let fps: number | null = null;
        if (video?.r_frame_rate) {
          const [num, den] = video.r_frame_rate.split("/").map(Number);
          if (den && den > 0) fps = Math.round((num / den) * 100) / 100;
        }

        let audioCodec: string | null = audio?.codec_name ?? null;
        let audioBitrate: string | null = null;
        const bps = parseInt(audio?.bit_rate, 10);
        if (!isNaN(bps)) {
          audioBitrate = `${Math.round(bps / 1000)}k`;
        }

        resolve({ fps, audioCodec, audioBitrate });
      } catch {
        resolve({ fps: null, audioCodec: null, audioBitrate: null });
      }
    });
  });
}

/**
 * Spawn an ffmpeg process and yield progress updates.
 * The args must include `-progress pipe:1` for this to work.
 */
export function spawnFfmpeg(
  args: string[],
  totalDurationSec: number,
  onProgress: (update: ProgressUpdate) => void,
): { process: ChildProcess; done: Promise<void> } {
  const proc = spawn("ffmpeg", args);
  const totalDurationUs = totalDurationSec * 1_000_000;

  let buffer = "";
  let stderrOutput = "";

  proc.stdout?.on("data", (data: Buffer) => {
    buffer += data.toString();

    // ffmpeg -progress outputs key=value lines, blocks separated by "progress=continue/end"
    const lines = buffer.split("\n");
    // Keep the last potentially incomplete line
    buffer = lines.pop() ?? "";

    const fields: Record<string, string> = {};
    for (const line of lines) {
      const eqIndex = line.indexOf("=");
      if (eqIndex > 0) {
        fields[line.slice(0, eqIndex).trim()] = line.slice(eqIndex + 1).trim();
      }
    }

    const outTimeUs = parseInt(fields["out_time_us"] ?? "0", 10);
    const speed = fields["speed"] ?? "0x";

    if (outTimeUs > 0 && totalDurationUs > 0) {
      const pct = Math.min(100, (outTimeUs / totalDurationUs) * 100);
      onProgress({
        percentage: pct,
        speed,
        currentTime: outTimeUs / 1_000_000,
        totalDuration: totalDurationSec,
      });
    }
  });

  proc.stderr?.on("data", (data: Buffer) => {
    stderrOutput += data.toString();
  });

  const done = new Promise<void>((resolve, reject) => {
    proc.on("error", (err) => reject(new Error(`ffmpeg failed to start: ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}\n${stderrOutput}`));
      }
    });
  });

  return { process: proc, done };
}

/**
 * Detect if the input video has an attached cover art stream.
 * Returns the stream index if found, null otherwise.
 */
export async function getCoverArtIndex(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_streams",
      filePath,
    ]);
    const json = JSON.parse(stdout);
    for (const stream of json.streams ?? []) {
      if (stream.disposition?.attached_pic === 1) {
        return stream.index as number;
      }
    }
  } catch { /* ignore probe errors */ }
  return null;
}

/**
 * Extract cover art from a video to a temp file.
 * Returns the temp file path, or null if extraction fails.
 */
export async function extractCoverArt(filePath: string, streamIndex: number): Promise<string | null> {
  const tempFile = path.join(os.tmpdir(), `minvid-cover-${Date.now()}.jpg`);
  try {
    await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-loglevel", "error",
      "-i", filePath,
      "-map", `0:${streamIndex}`,
      "-c", "copy",
      "-frames:v", "1",
      "-y",
      tempFile,
    ]);
    if (fs.existsSync(tempFile)) return tempFile;
  } catch { /* ignore */ }
  return null;
}

/**
 * Extract a representative thumbnail frame from the source video using
 * ffmpeg's thumbnail filter (picks the most representative frame from
 * batches of N frames). Avoids black fade-in/fade-out frames.
 * Returns the temp file path, or null if extraction fails.
 */
export async function extractThumbnail(filePath: string): Promise<string | null> {
  const tempFile = path.join(os.tmpdir(), `minvid-thumb-${Date.now()}.jpg`);
  try {
    await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-loglevel", "error",
      "-i", filePath,
      "-vf", "thumbnail=300",
      "-frames:v", "1",
      "-q:v", "2",
      "-y",
      tempFile,
    ]);
    if (fs.existsSync(tempFile)) return tempFile;
  } catch { /* ignore */ }
  return null;
}

/**
 * Re-attach cover art to an encoded video.
 * Replaces the file in-place (via temp rename).
 */
export async function attachCoverArt(videoPath: string, coverPath: string): Promise<void> {
  const tempOut = videoPath.replace(/(\.\w+)$/, ".mux$1");
  try {
    await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-loglevel", "error",
      "-i", videoPath,
      "-i", coverPath,
      "-map", "0",
      "-map", "1:0",
      "-c", "copy",
      "-disposition:v:1", "attached_pic",
      "-movflags", "+faststart",
      "-y",
      tempOut,
    ]);
    // Replace original with muxed version
    fs.renameSync(tempOut, videoPath);
  } catch {
    // Clean up temp on failure, keep the encoded video without cover
    try { fs.unlinkSync(tempOut); } catch { /* ignore */ }
  }
}
