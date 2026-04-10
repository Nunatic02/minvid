# minvid

Compress videos from the terminal. Drop files in, get smaller files out.

Built with [ffmpeg](https://ffmpeg.org/) under the hood, with sensible defaults for screen recordings (low framerate, tuned for animation/text content, automatic thumbnail embedding).

```
$ minvid lecture.mp4

┌  minvid
│
◇  lecture.mp4  404.7 MB → 15.8 MB  -96%  2m 34s
│
└  Done!
```

## Install

**Prerequisites:** [Node.js](https://nodejs.org/) 18+ and [ffmpeg](https://ffmpeg.org/)

```bash
# Install ffmpeg (macOS)
brew install ffmpeg

# Install minvid
git clone https://github.com/Nunatic02/minvid.git
cd minvid
npm install
npm run build
npm link
```

## Usage

### Interactive mode

Just run `minvid` and follow the prompts — drag and drop files directly into the terminal:

```
$ minvid

┌  minvid — video compression for screen recordings
│
◆  Drop video files or folders here (drag & drop or paste paths):
│  ~/Videos/recording.mp4
│
◇  1 video file detected ──────────────╮
│                                       │
│    recording.mp4  847.2 MB            │
│                                       │
├───────────────────────────────────────╯
│
◇  Choose compression preset:  Quality (H.265)
◇  Save to compressed/ subfolder?  No
◇  Embed thumbnail in output?  Yes
│
◇  recording.mp4  847.2 MB → 31.4 MB  -96%  4m 12s
│
└  Done!
```

### Direct mode

```bash
# Compress with default preset (quality/H.265)
minvid lecture.mp4

# Choose a faster preset
minvid -p fast lecture.mp4

# Compress all videos in a folder
minvid ~/Desktop/recordings/

# Multiple files with parallel processing
minvid -j 4 *.mp4

# Save to a compressed/ subfolder instead of _min suffix
minvid -s lecture.mp4

# Skip thumbnail embedding
minvid --no-thumbnail lecture.mp4
```

### Options

| Flag | Description | Default |
|---|---|---|
| `-p, --preset <name>` | Compression preset (see below) | `quality` |
| `-s, --subfolder` | Save to `compressed/` subfolder | `_min` suffix |
| `-j, --jobs <n>` | Parallel jobs for batch processing | auto |
| `--no-thumbnail` | Don't embed thumbnail in output | enabled |
| `-h, --help` | Show help | |
| `-v, --version` | Show version | |

## Presets

| Preset | Codec | Speed | Best for |
|---|---|---|---|
| `quality` | H.265 slow crf25 | ~1.1x | Maximum compression, archival |
| `h264` | H.264 slow crf25 | ~2-3x | Good compression + broad compatibility |
| `fast` | H.264 veryfast crf30 | ~3-4x | Quick results, good enough quality |
| `ultrafast` | H.264 ultrafast crf30 | ~8-9x | Fastest, larger output |
| `av1` | SVT-AV1 crf51 | slowest | Best quality-per-bit |

All presets reduce framerate to 15fps (ideal for screen recordings and presentations) and re-encode audio to AAC 96kbps.

## Thumbnail embedding

Videos that start with a fade-from-black (common in screen recordings) often show a black thumbnail in file browsers and video players after compression. minvid fixes this by automatically extracting a representative frame from the source video using ffmpeg's `thumbnail` filter and embedding it as cover art in the output.

This is enabled by default. Use `--no-thumbnail` to skip it.

## Output

By default, output files are saved alongside the input with a `_min` suffix:

```
video.mp4 → video_min.mp4
```

With `-s` / subfolder mode:

```
video.mp4 → compressed/video.mp4
```

If the output file already exists, minvid appends `_1`, `_2`, etc. to avoid overwriting.

## Supported formats

**Input:** `.mp4`, `.mov`, `.mkv`, `.avi`, `.webm`, `.m4v`, `.ts`, `.flv`

**Output:** `.mp4` (H.264/H.265 presets) or `.webm` (AV1 preset)

## License

MIT
