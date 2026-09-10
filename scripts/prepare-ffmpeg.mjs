import { mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
await mkdir('public/ffmpeg', { recursive: true });
await copyFile('licenses/FFmpeg-GPLv2.txt', 'public/ffmpeg/COPYING.txt');
await copyFile(
  'node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js',
  'public/ffmpeg/ffmpeg-core.js',
);
// Cloudflare static assets have a per-file size cap. Reassemble two pieces in the browser.
const wasm = await readFile(
  'node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm',
);
const middle = Math.ceil(wasm.length / 2);
await writeFile('public/ffmpeg/core.part1', wasm.subarray(0, middle));
await writeFile('public/ffmpeg/core.part2', wasm.subarray(middle));
await rm('public/ffmpeg/ffmpeg-core.wasm', { force: true });
