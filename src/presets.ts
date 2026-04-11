export interface Preset {
  name: string;
  label: string;
  hint: string;
  ext: string;
  /** Recommended fps for this preset (shown as "optimized" option in interactive mode) */
  recommendedFps: number;
  /** Recommended audio bitrate for this preset (shown as "optimized" option) */
  recommendedAudioBitrate: string;
  buildArgs: (input: string, output: string) => string[];
}

const COMMON_PRE = ["-hide_banner", "-nostdin"] as const;

const MP4_POST = (output: string) =>
  ["-map_metadata", "0", "-movflags", "+faststart", "-progress", "pipe:1", "-loglevel", "error", "-y", output] as const;

const WEBM_POST = (output: string) =>
  ["-map_metadata", "0", "-progress", "pipe:1", "-loglevel", "error", "-y", output] as const;

export const PRESETS: Record<string, Preset> = {
  h264: {
    name: "h264",
    label: "H.264 Quality",
    hint: "High quality + small size, ~2-3x speed",
    ext: ".mp4",
    recommendedFps: 15,
    recommendedAudioBitrate: "96k",
    buildArgs: (input, output) => [
      ...COMMON_PRE,
      "-i", input,
      "-c:v", "libx264",
      "-preset", "slow",
      "-crf", "25",
      "-tune", "animation",
      "-c:a", "copy",
      ...MP4_POST(output),
    ],
  },

  quality: {
    name: "quality",
    label: "Quality (H.265)",
    hint: "Best compression, ~1.1x speed",
    ext: ".mp4",
    recommendedFps: 15,
    recommendedAudioBitrate: "96k",
    buildArgs: (input, output) => [
      ...COMMON_PRE,
      "-i", input,
      "-c:v", "libx265",
      "-preset", "slow",
      "-crf", "25",
      "-tune", "animation",
      "-c:a", "copy",
      ...MP4_POST(output),
    ],
  },

  fast: {
    name: "fast",
    label: "Fast (H.264)",
    hint: "Good balance, ~3-4x speed",
    ext: ".mp4",
    recommendedFps: 15,
    recommendedAudioBitrate: "96k",
    buildArgs: (input, output) => [
      ...COMMON_PRE,
      "-i", input,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "30",
      "-tune", "animation",
      "-c:a", "copy",
      ...MP4_POST(output),
    ],
  },

  ultrafast: {
    name: "ultrafast",
    label: "Ultrafast (H.264)",
    hint: "Fastest, larger files, ~8-9x speed",
    ext: ".mp4",
    recommendedFps: 15,
    recommendedAudioBitrate: "96k",
    buildArgs: (input, output) => [
      ...COMMON_PRE,
      "-i", input,
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "30",
      "-tune", "animation",
      "-c:a", "copy",
      ...MP4_POST(output),
    ],
  },

  av1: {
    name: "av1",
    label: "AV1 (SVT-AV1)",
    hint: "Best quality-per-bit, slowest",
    ext: ".webm",
    recommendedFps: 15,
    recommendedAudioBitrate: "96k",
    buildArgs: (input, output) => [
      ...COMMON_PRE,
      "-i", input,
      "-c:v", "libsvtav1",
      "-crf", "51",
      "-preset", "7",
      "-pix_fmt", "yuv420p",
      "-c:a", "copy",
      ...WEBM_POST(output),
    ],
  },
};

export const PRESET_NAMES = Object.keys(PRESETS);
