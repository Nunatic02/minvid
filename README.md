<div align="center">

# 📹 minvid

**Drag-and-drop video compression CLI.**

> Compress videos from the terminal. Drop files in, get smaller files out.

<a href="https://asciinema.org/a/916891"><img src="https://asciinema.org/a/916891.svg" alt="minvid demo" width="720" /></a>

</div>

## Features

- **Drag & drop** — drop files right into your terminal
- **90%+ compression** — screen recordings go from 800 MB to under 50 MB
- **5 presets** — from ultrafast to maximum quality (H.264, H.265, AV1)
- **Resolution scaling** — downscale by percentage or target height (720p, 1080p)
- **Batch processing** — compress entire folders with parallel jobs
- **Smart thumbnails** — auto-extracts a representative frame to avoid black thumbnails
- **Preserves cover art** — re-attaches existing cover art after compression
- **100% local** — powered by ffmpeg, nothing leaves your machine

## Why

I kept digging through my notes for an old ffmpeg script every time I needed to compress a screen recording. The worst part was always dealing with the input and output paths — getting them right, changing them for each file — just enough friction to make it annoying.

So I built minvid: drag and drop a video into your terminal, pick a preset, and get a compressed file back. I've carefully tuned and tested the ffmpeg parameters, and in my testing it typically shrinks raw screen recordings by ~90% without any obvious quality loss.

## Install

```bash
brew tap Nunatic02/minvid && brew install minvid
# or
npm install -g @nunatic02/minvid
```

Then run `minvid`.

## Usage

Running `minvid` with no arguments launches interactive mode. Pass files directly for CLI mode.

```bash
minvid                              # Interactive drag-and-drop
minvid lecture.mp4                  # Compress with quality preset
minvid -p fast *.mp4                # Fast preset, all mp4s
minvid -r 50% lecture.mp4           # Downscale to 50%
minvid -r 720p lecture.mp4          # Downscale to 720p
minvid -j 4 ~/recordings/          # Batch with 4 parallel jobs
minvid -s lecture.mp4               # Save to compressed/ subfolder
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `-p, --preset <name>` | Compression preset (see below) | `quality` |
| `-r, --scale <value>` | Resize: percentage (`50%`) or height (`1080p`, `720p`) | original |
| `-o, --output <name>` | Custom output filename (without extension) | `<name>_min` |
| `-s, --subfolder` | Save to `compressed/` subfolder | `_min` suffix |
| `-j, --jobs <n>` | Parallel jobs for batch processing | auto |
| `--no-thumbnail` | Skip thumbnail embedding | enabled |

## Presets

| Preset | Codec | Speed | Best for |
|--------|-------|-------|----------|
| **quality** | H.265 slow crf25 | ~1.1x | Maximum compression, archival |
| **h264** | H.264 slow crf25 | ~2-3x | Good compression + broad compatibility |
| **fast** | H.264 veryfast crf30 | ~3-4x | Quick results, good enough quality |
| **ultrafast** | H.264 ultrafast crf30 | ~8-9x | Fastest, larger files |
| **av1** | SVT-AV1 crf51 | slowest | Best quality-per-bit |

All presets reduce framerate to 15fps and re-encode audio to AAC 96kbps.

## Supported formats

**Input:** `.mp4`, `.mov`, `.mkv`, `.avi`, `.webm`, `.m4v`, `.ts`, `.flv`
**Output:** `.mp4` (H.264/H.265) or `.webm` (AV1)

## License

MIT
