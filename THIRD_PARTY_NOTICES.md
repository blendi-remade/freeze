# Third-party components

Freeze's application license does not replace dependency licenses.

- `@ffmpeg/ffmpeg` 0.12.15 and `@ffmpeg/util` 0.12.2: MIT. Source: https://github.com/ffmpegwasm/ffmpeg.wasm
- `@ffmpeg/core` 0.12.10: GPL-2.0-or-later. Source and build instructions: https://github.com/ffmpegwasm/ffmpeg.wasm/tree/n0.12.10 and https://github.com/ffmpegwasm/ffmpeg.wasm/tree/main/packages/core . The core includes FFmpeg and enabled codec libraries, with their corresponding licenses. The package is installed unmodified and copied/split into generated public runtime assets; splitting does not modify its binary contents.
- FFmpeg source and legal information: https://ffmpeg.org/legal.html
- React, Vinext, the Sites starter, Base UI, Shadcn, Lucide and other packages retain their respective licenses; see installed package metadata and source distributions.

When distributing the runtime, provide the applicable license text and corresponding source as required by its license. The repository does not check in generated runtime binaries; `npm ci` retrieves them and the postinstall script prepares delivery assets.
