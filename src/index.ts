#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { PRESETS, PRESET_NAMES, type Preset } from "./presets.js";
import { parseDragDropInput, isVideoFile, scanDirectory, formatSize, formatTime } from "./paths.js";
import { checkFfmpeg } from "./ffmpeg.js";
import { compressFile, type CompressionResult } from "./compress.js";
import { compressAll, defaultConcurrency } from "./parallel.js";

const VERSION = "0.1.0";

const HELP = `
${pc.bold("minvid")} — drag-and-drop video compression CLI

${pc.dim("Usage:")}
  minvid                              Interactive mode
  minvid [options] <files|folders...>  Direct mode

${pc.dim("Options:")}
  -p, --preset <name>   Preset: quality, h264, fast, ultrafast, av1 (default: quality)
  -o, --output <name>   Output file name without extension (default: <name>_min)
  -s, --subfolder       Save to compressed/ subfolder (default: _min suffix)
  -j, --jobs <n>        Parallel jobs (default: auto)
  --no-thumbnail        Don't embed thumbnail in output
  -h, --help            Show this help
  -v, --version         Show version

${pc.dim("Presets:")}
  quality     H.265 slow crf25     Best compression, ~1.1x speed
  h264        H.264 slow crf25    High quality + small size, ~2-3x speed
  fast        H.264 veryfast crf30 Good balance, ~3-4x speed
  ultrafast   H.264 ultrafast crf30 Fastest, ~8-9x speed
  av1         SVT-AV1 crf51        Best quality/bit, slowest

${pc.dim("Examples:")}
  minvid                                   # Interactive drag-and-drop
  minvid lecture.mp4                       # Compress with quality preset
  minvid -p fast *.mp4                     # Fast preset, all mp4s
  minvid -o lecture_compressed lecture.mp4  # Custom output name
  minvid -p av1 -s -j 2 video1.mp4        # AV1, subfolder, 2 parallel
`;

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      preset: { type: "string", short: "p", default: "quality" },
      output: { type: "string", short: "o" },
      subfolder: { type: "boolean", short: "s", default: false },
      jobs: { type: "string", short: "j" },
      "no-thumbnail": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (values.version) {
    console.log(`minvid v${VERSION}`);
    process.exit(0);
  }

  // Check ffmpeg
  const hasFFmpeg = await checkFfmpeg();
  if (!hasFFmpeg) {
    console.error(pc.red("Error: ffmpeg/ffprobe not found."));
    console.error(pc.dim("Install with: brew install ffmpeg"));
    process.exit(1);
  }

  if (positionals.length > 0) {
    await directMode(positionals, values);
  } else {
    await interactiveMode();
  }
}

// ── Direct mode (CLI args) ─────────────────────────────────────────

async function directMode(
  positionals: string[],
  values: { preset?: string; output?: string; subfolder?: boolean; jobs?: string; "no-thumbnail"?: boolean },
) {
  const presetName = values.preset ?? "quality";
  if (!PRESET_NAMES.includes(presetName)) {
    console.error(pc.red(`Unknown preset: ${presetName}`));
    console.error(pc.dim(`Available: ${PRESET_NAMES.join(", ")}`));
    process.exit(1);
  }

  const preset = PRESETS[presetName];
  const subfolder = values.subfolder ?? false;
  const thumbnail = !(values["no-thumbnail"] ?? false);
  const customName = values.output;
  const jobs = values.jobs ? parseInt(values.jobs, 10) : defaultConcurrency();

  // Resolve files (expand directories into their video files)
  const files = positionals
    .map((f) => path.resolve(f))
    .filter((f) => {
      if (!fs.existsSync(f)) {
        console.error(pc.yellow(`Skipping: ${f} (not found)`));
        return false;
      }
      return true;
    })
    .flatMap((f) => {
      if (fs.statSync(f).isDirectory()) {
        const vids = scanDirectory(f);
        if (vids.length === 0) {
          console.error(pc.yellow(`Skipping: ${f} (no video files in directory)`));
        }
        return vids;
      }
      if (!isVideoFile(f)) {
        console.error(pc.yellow(`Skipping: ${f} (not a video file)`));
        return [];
      }
      return [f];
    });

  if (files.length === 0) {
    console.error(pc.red("No valid video files provided."));
    process.exit(1);
  }

  p.intro(pc.bgCyan(pc.black(" minvid ")));

  const results = await runCompression(files, preset, subfolder, thumbnail, files.length > 1 ? jobs : 1, customName);
  showResults(results);

  p.outro(pc.green("Done!"));
}

// ── Interactive mode ────────────────────────────────────────────────

async function interactiveMode() {
  p.intro(pc.bgCyan(pc.black(" minvid ")) + pc.dim(" — drag-and-drop video compression CLI"));

  // Step 1: File input
  const rawInput = await p.text({
    message: "Drop video files or folders here (drag & drop or paste paths):",
    placeholder: "Drag files or folders into this terminal window, then press Enter",
    validate(value: string | undefined) {
      if (!value?.trim()) return "Please provide at least one video file or folder.";
      const files = parseDragDropInput(value);
      if (files.length === 0) {
        return "No valid video files found. Supported: .mp4, .mov, .mkv, .avi, .webm, .m4v (files or folders)";
      }
    },
  });

  if (p.isCancel(rawInput)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const files = parseDragDropInput(rawInput);

  // Step 2: Show detected files
  const fileList = files
    .map((f) => {
      const size = fs.statSync(f).size;
      return `  ${pc.cyan(path.basename(f))}  ${pc.dim(formatSize(size))}`;
    })
    .join("\n");

  p.note(fileList, `${files.length} video file${files.length > 1 ? "s" : ""} detected`);

  // Step 3: Preset selection
  const presetChoice = await p.select({
    message: "Choose compression preset:",
    options: Object.values(PRESETS).map((pr) => ({
      value: pr.name,
      label: pr.label,
      hint: pr.hint,
    })),
    initialValue: "quality",
  });

  if (p.isCancel(presetChoice)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const preset = PRESETS[presetChoice];

  // Step 4: Output location
  const useSubfolder = await p.confirm({
    message: "Save to compressed/ subfolder?",
    initialValue: false,
  });

  if (p.isCancel(useSubfolder)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  // Step 4b: Output name
  let customName: string | undefined;
  if (files.length === 1) {
    const defaultName = path.parse(files[0]).name + "_min";
    const outputName = await p.text({
      message: "Output file name (without extension):",
      defaultValue: defaultName,
      placeholder: defaultName,
    });

    if (p.isCancel(outputName)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    const trimmed = outputName.trim();
    if (trimmed && trimmed !== defaultName) {
      customName = trimmed;
    }
  }

  // Step 5: Parallel (only for multiple files)
  let concurrency = 1;
  if (files.length > 1) {
    const parallel = await p.confirm({
      message: `Process ${files.length} files in parallel?`,
      initialValue: true,
    });

    if (p.isCancel(parallel)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    if (parallel) {
      concurrency = Math.min(files.length, defaultConcurrency());
    }
  }

  // Step 6: Thumbnail
  const useThumbnail = await p.confirm({
    message: "Embed thumbnail in output?",
    initialValue: true,
  });

  if (p.isCancel(useThumbnail)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  // Step 7: Compress
  const results = await runCompression(files, preset, useSubfolder, useThumbnail, concurrency, customName);

  // Step 8: Results
  showResults(results);

  p.outro(pc.green("Done!"));
}

// ── Compression runner ──────────────────────────────────────────────

async function runCompression(
  files: string[],
  preset: Preset,
  subfolder: boolean,
  thumbnail: boolean,
  concurrency: number,
  customName?: string,
): Promise<CompressionResult[]> {
  if (files.length === 1) {
    // Single file: show detailed progress
    const s = p.spinner();
    const basename = path.basename(files[0]);
    s.start(`Compressing ${basename}...`);

    try {
      const result = await compressFile({
        inputPath: files[0],
        preset,
        subfolder,
        thumbnail,
        customName,
        onProgress: (update) => {
          const pct = Math.round(update.percentage);
          s.message(
            `Compressing ${basename}  ${pc.cyan(`${pct}%`)}  ${pc.dim(`speed: ${update.speed}`)}`,
          );
        },
      });
      const ratio = ((1 - result.outputSize / result.inputSize) * 100).toFixed(0);
      s.stop(
        `${basename}  ${formatSize(result.inputSize)} → ${formatSize(result.outputSize)}  ${pc.green(`-${ratio}%`)}  ${pc.dim(formatTime(result.durationMs / 1000))}`,
      );
      return [result];
    } catch (err) {
      s.stop(pc.red(`Failed: ${basename}`));
      p.log.error(String(err));
      return [];
    }
  }

  // Multiple files
  const s = p.spinner();
  let completed = 0;
  const total = files.length;
  s.start(`Compressing 0/${total} files...`);

  const results = await compressAll(files, preset, subfolder, thumbnail, concurrency, (event) => {
    switch (event.type) {
      case "start":
        s.message(
          `Compressing ${completed}/${total} files  ${pc.dim(`→ ${event.file}`)}`,
        );
        break;
      case "progress":
        if (event.progress) {
          const pct = Math.round(event.progress.percentage);
          s.message(
            `Compressing ${completed}/${total} files  ${pc.dim(event.file)}  ${pc.cyan(`${pct}%`)}  ${pc.dim(event.progress.speed)}`,
          );
        }
        break;
      case "done":
        completed++;
        if (event.result) {
          const ratio = ((1 - event.result.outputSize / event.result.inputSize) * 100).toFixed(0);
          p.log.success(
            `${event.file}  ${formatSize(event.result.inputSize)} → ${formatSize(event.result.outputSize)}  ${pc.green(`-${ratio}%`)}`,
          );
        }
        s.message(`Compressing ${completed}/${total} files...`);
        break;
      case "error":
        completed++;
        p.log.error(`${event.file}: ${event.error?.message}`);
        s.message(`Compressing ${completed}/${total} files...`);
        break;
    }
  }, customName);

  s.stop(`Compressed ${results.length}/${total} files`);
  return results;
}

// ── Results display ─────────────────────────────────────────────────

function showResults(results: CompressionResult[]) {
  if (results.length === 0) return;

  const totalInput = results.reduce((sum, r) => sum + r.inputSize, 0);
  const totalOutput = results.reduce((sum, r) => sum + r.outputSize, 0);
  const totalSaved = totalInput - totalOutput;
  const totalRatio = ((totalSaved / totalInput) * 100).toFixed(0);
  const totalTime = results.reduce((sum, r) => sum + r.durationMs, 0);

  if (results.length > 1) {
    const lines = results.map((r) => {
      const ratio = ((1 - r.outputSize / r.inputSize) * 100).toFixed(0);
      const name = path.basename(r.inputPath);
      const padName = name.length > 30 ? name.slice(0, 27) + "..." : name;
      return `  ${padName.padEnd(32)} ${formatSize(r.inputSize).padStart(10)} → ${formatSize(r.outputSize).padStart(10)}  ${pc.green((`-${ratio}%`).padStart(6))}`;
    });

    lines.push(pc.dim("  " + "─".repeat(66)));
    lines.push(
      `  ${"Total".padEnd(32)} ${formatSize(totalInput).padStart(10)} → ${formatSize(totalOutput).padStart(10)}  ${pc.green((`-${totalRatio}%`).padStart(6))}`,
    );

    p.note(lines.join("\n"), "Results");
  }

  p.log.info(
    `Saved ${pc.bold(formatSize(totalSaved))} (${totalRatio}% reduction) in ${formatTime(totalTime / 1000)}`,
  );

  for (const r of results) {
    p.log.info(`Saved to: ${pc.cyan(r.outputPath)}`);
  }
}

main().catch((err) => {
  console.error(pc.red(err.message ?? err));
  process.exit(1);
});
