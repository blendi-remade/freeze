import { mkdir, copyFile, readFile, writeFile, rm, cp } from 'node:fs/promises';
await mkdir('public/ffmpeg', { recursive: true });
// Serve the client and module worker unchanged. Bundlers cannot resolve the
// worker's runtime import of the selected ffmpeg-core URL.
await cp('node_modules/@ffmpeg/ffmpeg/dist/esm', 'public/ffmpeg/client', {
  recursive: true,
  filter: (path) => !path.endsWith('.ts') && !path.endsWith('.map'),
});
await copyFile('licenses/FFmpeg-GPLv2.txt', 'public/ffmpeg/COPYING.txt');
await copyFile(
  'node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js',
  'public/ffmpeg/ffmpeg-core.js',
);
// Keep the engine in two cacheable assets, reassembled in the browser.
const wasm = await readFile(
  'node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm',
);
const middle = Math.ceil(wasm.length / 2);
await writeFile('public/ffmpeg/core.part1', wasm.subarray(0, middle));
await writeFile('public/ffmpeg/core.part2', wasm.subarray(middle));
await rm('public/ffmpeg/ffmpeg-core.wasm', { force: true });
