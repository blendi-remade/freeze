import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { buildEditPlan } from '../lib/edit-plan.ts';
import createCore from '@ffmpeg/core';

mkdirSync('test-results', { recursive: true });
function run(args) {
  return execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    ...args,
  ]);
}
run([
  '-f',
  'lavfi',
  '-i',
  'testsrc2=size=160x90:rate=30:duration=2',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:duration=2',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  'test-results/source.mp4',
]);
run([
  '-f',
  'lavfi',
  '-i',
  'testsrc2=size=160x90:rate=30:duration=5',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  'test-results/camera.mp4',
]);
for (const [name, time, audio] of [
  ['middle', 1, true],
  ['start', 0, false],
  ['end', 1.95, true],
]) {
  const args = [
    '-i',
    'test-results/source.mp4',
    '-i',
    'test-results/camera.mp4',
    '-filter_complex',
    buildEditPlan(160, 90, time, 5, 2, audio, false),
    '-map',
    '[v]',
  ];
  if (audio) args.push('-map', '[a]', '-c:a', 'aac');
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    `test-results/${name}.mp4`,
  );
  run(args);
  const probe = JSON.parse(
    execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_streams',
        '-show_format',
        '-of',
        'json',
        `test-results/${name}.mp4`,
      ],
      { encoding: 'utf8' },
    ),
  );
  assert.ok(
    Math.abs(Number(probe.format.duration) - 7) < 0.12,
    `${name}: unexpected duration ${probe.format.duration}`,
  );
  assert.equal(
    probe.streams.some((s) => s.codec_type === 'audio'),
    audio,
  );
  assert.equal(probe.streams[0].width, 160);
  assert.equal(probe.streams[0].height, 90);
  console.log(
    `PASS ${name}: source prefix + full 5s generated clip + source tail, dimensions, audio presence`,
  );
}
// Exercise the actual shipped WebAssembly codec and filters, independently of browser UI.
globalThis.self = { location: { href: import.meta.url } };
const core = await createCore({
  wasmBinary: readFileSync(
    'node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm',
  ),
});
core.FS.writeFile(
  'source',
  new Uint8Array(readFileSync('test-results/source.mp4')),
);
core.FS.writeFile(
  'camera.mp4',
  new Uint8Array(readFileSync('test-results/camera.mp4')),
);
core.ffprobe(
  '-v',
  'error',
  '-show_streams',
  '-of',
  'json',
  'source',
  '-o',
  'probe.json',
);
core.reset();
const streams = JSON.parse(
  core.FS.readFile('probe.json', { encoding: 'utf8' }),
).streams;
assert.ok(streams.some((s) => s.codec_type === 'audio'));
core.exec(
  '-i',
  'source',
  '-i',
  'camera.mp4',
  '-filter_complex',
  buildEditPlan(160, 90, 1, 5, 2, true, false),
  '-map',
  '[v]',
  '-map',
  '[a]',
  '-c:v',
  'libx264',
  '-preset',
  'ultrafast',
  '-c:a',
  'aac',
  '-y',
  'output.mp4',
);
assert.equal(core.ret, 0);
assert.ok(core.FS.readFile('output.mp4').length > 1000);
console.log(
  'PASS shipped WebAssembly core: ffprobe, prefix trim, concat, H.264/AAC export',
);
