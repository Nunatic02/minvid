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
| `-f, --fps <n>` | Target framerate | original (interactive defaults to 15) |
| `-a, --audio-bitrate <br>` | Re-encode audio to AAC at given bitrate (e.g. `96k`, `128k`) | copy (interactive defaults to AAC 96k) |
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

In interactive mode, framerate defaults to 15 fps and audio defaults to AAC 96k (recommended for compression). In CLI mode, both default to keeping the original — pass `--fps` and `--audio-bitrate` to override.

## FFmpeg commands under the hood

Below are the ffmpeg commands each preset generates. Flags like `--fps`, `--audio-bitrate`, and `--scale` inject additional filters.

### quality (H.265)

```
ffmpeg -hide_banner -nostdin -i input.mp4 \
  -c:v libx265        # Video codec: H.265 (HEVC) — best compression ratio
  -preset slow         # Encoding speed: slower = smaller file, better quality
  -crf 25              # Constant Rate Factor: 0 = lossless, 51 = worst. 25 is a good balance
  -tune animation      # Optimizes for flat areas and sharp edges (great for screen recordings)
  -c:a copy            # Audio: copy original stream without re-encoding
  -map_metadata 0      # Preserve metadata (title, date, etc.) from the input
  -movflags +faststart # Move MP4 index to the start of the file for faster streaming/playback
  -y output.mp4
```

### h264 (H.264)

```
ffmpeg -hide_banner -nostdin -i input.mp4 \
  -c:v libx264        # Video codec: H.264 (AVC) — widely compatible
  -preset slow         # Slower encoding for better compression
  -crf 25              # Quality level: 25 gives good size/quality tradeoff
  -tune animation      # Optimize for screen recordings and animation content
  -c:a copy            # Copy audio as-is
  -map_metadata 0      # Preserve original metadata
  -movflags +faststart # Optimize for web streaming
  -y output.mp4
```

### fast (H.264)

```
ffmpeg -hide_banner -nostdin -i input.mp4 \
  -c:v libx264        # Video codec: H.264
  -preset veryfast     # Much faster encoding, trades some compression efficiency
  -crf 30              # Higher CRF = smaller files, slightly lower quality
  -tune animation      # Still tuned for screen recording content
  -c:a copy            # Copy audio as-is
  -map_metadata 0      # Preserve metadata
  -movflags +faststart # Optimize for streaming
  -y output.mp4
```

### ultrafast (H.264)

```
ffmpeg -hide_banner -nostdin -i input.mp4 \
  -c:v libx264        # Video codec: H.264
  -preset ultrafast    # Fastest possible encoding — largest files but near-instant
  -crf 30              # Higher CRF for speed, still acceptable quality
  -tune animation      # Screen recording optimization
  -c:a copy            # Copy audio as-is
  -map_metadata 0      # Preserve metadata
  -movflags +faststart # Optimize for streaming
  -y output.mp4
```

### av1 (SVT-AV1)

```
ffmpeg -hide_banner -nostdin -i input.mp4 \
  -c:v libsvtav1       # Video codec: AV1 via SVT-AV1 — next-gen, best quality per bit
  -crf 51              # AV1 CRF scale differs from H.264/5; 51 is a reasonable default
  -preset 7            # SVT-AV1 preset (0=slowest/best, 13=fastest). 7 balances speed/quality
  -pix_fmt yuv420p     # Pixel format: standard 4:2:0 chroma subsampling for compatibility
  -c:a copy            # Copy audio as-is
  -map_metadata 0      # Preserve metadata
  -y output.webm
```

### Optional flags

When you pass `--fps` or `--audio-bitrate`, minvid injects additional parameters:

```
-vf fps=15             # Reduce framerate to 15 fps (fewer frames = smaller file)
-c:a aac -b:a 96k     # Re-encode audio to AAC at 96 kbps (replaces -c:a copy)
-vf scale=-2:720       # Downscale to 720p height, auto-calculate width (from --scale 720p)
-vf scale=trunc(iw*0.5/2)*2:trunc(ih*0.5/2)*2  # Scale to 50% (from --scale 50%)
```

Multiple video filters are chained: e.g. `--fps 15 --scale 720p` produces `-vf fps=15,scale=-2:720`.

## Supported formats

**Input:** `.mp4`, `.mov`, `.mkv`, `.avi`, `.webm`, `.m4v`, `.ts`, `.flv`
**Output:** `.mp4` (H.264/H.265) or `.webm` (AV1)

## License

MIT
