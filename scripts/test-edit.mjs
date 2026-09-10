import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { buildEditPlan, getCameraEditDuration } from '../lib/edit-plan.ts';
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
  'color=c=blue:size=176x90:rate=30:duration=4',
  '-f',
  'lavfi',
  '-i',
  'color=c=red:size=176x90:rate=30:duration=1',
  '-filter_complex',
  '[0:v][1:v]concat=n=2:v=1:a=0[v]',
  '-map',
  '[v]',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  'test-results/camera.mp4',
]);
// The discarded red tail catches accidentally trimming the beginning instead.
run([
  '-i',
  'test-results/camera.mp4',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=880:duration=5',
  '-c:v',
  'copy',
  '-c:a',
  'aac',
  '-shortest',
  'test-results/camera-audio.mp4',
]);
run([
  '-i',
  'test-results/camera.mp4',
  '-t',
  '0.3',
  '-c:v',
  'copy',
  'test-results/camera-short.mp4',
]);
function probe(file) {
  return JSON.parse(
    execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file],
      { encoding: 'utf8' },
    ),
  );
}
function verifyOutput(file, expectedDuration, audio) {
  const data = probe(file);
  assert.ok(
    Math.abs(Number(data.format.duration) - expectedDuration) < 0.12,
    `${file}: unexpected duration ${data.format.duration}`,
  );
  assert.equal(
    data.streams.some((s) => s.codec_type === 'audio'),
    audio,
  );
  const video = data.streams.find((s) => s.codec_type === 'video');
  assert.equal(video.width, 160);
  assert.equal(video.height, 90);
  for (const stream of data.streams) {
    assert.ok(
      Math.abs(Number(stream.duration) - expectedDuration) < 0.12,
      `${file}: ${stream.codec_type} did not end at the trimmed duration`,
    );
  }
}
for (const [name, time, sourceAudio, cameraAudio, cameraSeconds] of [
  ['middle', 1, true, false, 5],
  ['start', 0, false, false, 5],
  ['end', 1.95, true, false, 5],
  ['no-source-tail', 2, true, false, 5],
  ['both-audio', 1, true, true, 5],
  ['camera-audio-only', 1, false, true, 5],
  ['short-camera', 1, false, false, 0.3],
]) {
  const camera =
    cameraSeconds < 0.5
      ? 'camera-short'
      : cameraAudio
        ? 'camera-audio'
        : 'camera';
  const audio = sourceAudio || cameraAudio;
  const args = [
    '-i',
    'test-results/source.mp4',
    '-i',
    `test-results/${camera}.mp4`,
    '-filter_complex',
    buildEditPlan(160, 90, time, cameraSeconds, 2, sourceAudio, cameraAudio),
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
  const expectedDuration = cameraSeconds < 0.5 ? 2 + 1 / 30 : 6;
  verifyOutput(`test-results/${name}.mp4`, expectedDuration, audio);
  if (cameraSeconds === 5) {
    const rgb = run([
      '-ss',
      String(time + 3.8),
      '-i',
      `test-results/${name}.mp4`,
      '-frames:v',
      '1',
      '-vf',
      'scale=1:1',
      '-pix_fmt',
      'rgb24',
      '-f',
      'rawvideo',
      'pipe:1',
    ]);
    assert.ok(
      rgb[2] > 200 && rgb[0] < 30,
      `${name}: the camera tail was retained or the beginning was trimmed`,
    );
  }
  console.log(
    `PASS ${name}: shortened video/audio, original timeline, dimensions, end trim`,
  );
}
assert.equal(getCameraEditDuration(6), 5);
assert.equal(getCameraEditDuration(0.01), 0.01);
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
const wasmOutput = core.FS.readFile('output.mp4');
assert.ok(wasmOutput.length > 1000);
writeFileSync('test-results/wasm-output.mp4', wasmOutput);
verifyOutput('test-results/wasm-output.mp4', 6, true);
console.log(
  'PASS shipped WebAssembly core: 1s end trim, video/audio duration, H.264/AAC export',
);

function frame(file, time) {
  return run([
    '-ss',
    String(time),
    '-i',
    file,
    '-frames:v',
    '1',
    '-pix_fmt',
    'rgb24',
    '-f',
    'rawvideo',
    'pipe:1',
  ]);
}
for (const file of ['middle.mp4', 'wasm-output.mp4']) {
  for (const [label, time] of [
    ['entry', 1],
    ['exit', 4.9666667],
  ]) {
    const actual = frame(`test-results/${file}`, time);
    assert.equal(actual.length, 160 * 90 * 3);
    for (let i = 0; i < actual.length; i += 3) {
      assert.ok(
        actual[i] < 30 && actual[i + 2] > 200,
        `${file}: ${label} contains a transition blend instead of the AI frame`,
      );
    }
    console.log(`PASS ${file} ${label}: direct cut with no transition blend`);
  }
  const anchor = frame('test-results/source.mp4', 1);
  const resumed = frame(`test-results/${file}`, 5);
  assert.equal(resumed.length, anchor.length);
  const meanError =
    resumed.reduce(
      (sum, value, index) => sum + Math.abs(value - anchor[index]),
      0,
    ) / resumed.length;
  assert.ok(
    meanError < 8,
    `${file}: original footage did not resume at the selected frame`,
  );
  console.log(
    `PASS ${file}: original footage resumes intact after trimmed AI clip`,
  );
}
