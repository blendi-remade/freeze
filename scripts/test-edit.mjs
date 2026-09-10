import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { buildEditPlan, validateExportSpeed } from '../lib/edit-plan.ts';
import createCore from '@ffmpeg/core';

for (const speed of [0, 0.5, 3.01, NaN, Infinity, -Infinity]) {
  assert.throws(() => validateExportSpeed(speed), /between 1× and 3×/);
  assert.throws(
    () => buildEditPlan(160, 90, 1, 5, 2, true, true, speed),
    /between 1× and 3×/,
  );
}
assert.equal(
  buildEditPlan(160, 90, 1, 5, 2, true, false),
  buildEditPlan(160, 90, 1, 5, 2, true, false, 1),
);

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
  'testsrc2=size=176x90:rate=30:duration=5',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=880:duration=5',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  'test-results/camera.mp4',
]);
for (const clip of ['source', 'camera']) {
  run([
    '-i',
    `test-results/${clip}.mp4`,
    '-c:v',
    'copy',
    '-an',
    `test-results/${clip}-silent.mp4`,
  ]);
}
const cases = [];
for (const speed of [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3]) {
  for (const [position, time] of [
    ['middle', 1],
    ['start', 0],
    ['end', 2],
  ]) {
    for (const [sourceAudio, cameraAudio] of [
      [true, false],
      [false, true],
      [true, true],
      [false, false],
    ]) {
      cases.push({
        name: `${position}-${speed}x-${sourceAudio}-${cameraAudio}`,
        time,
        speed,
        sourceAudio,
        cameraAudio,
      });
    }
  }
}
function checkProbe(probe, name, speed, audio) {
  const expected = 7 / speed;
  assert.ok(
    Math.abs(Number(probe.format.duration) - expected) < 0.12,
    `${name}: unexpected duration ${probe.format.duration}`,
  );
  const video = probe.streams.find((s) => s.codec_type === 'video');
  const sound = probe.streams.find((s) => s.codec_type === 'audio');
  assert.ok(
    Math.abs(Number(video.duration) - expected) < 0.12,
    `${name}: video duration`,
  );
  assert.equal(Boolean(sound), audio);
  if (sound) {
    assert.ok(
      Math.abs(Number(sound.duration) - expected) < 0.12,
      `${name}: audio duration`,
    );
    assert.equal(sound.codec_name, 'aac');
  }
  assert.equal(video.codec_name, 'h264');
  assert.equal(video.width, 160);
  assert.equal(video.height, 90);
  assert.equal(video.r_frame_rate, '30/1');
}
function checkTone(file, at, frequency) {
  const data = run([
    '-ss',
    String(at),
    '-i',
    file,
    '-t',
    '0.12',
    '-vn',
    '-ac',
    '1',
    '-ar',
    '48000',
    '-f',
    'f32le',
    'pipe:1',
  ]);
  let crossings = 0,
    energy = 0,
    previous = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    const sample = data.readFloatLE(offset);
    if (previous <= 0 && sample > 0) crossings++;
    energy += sample * sample;
    previous = sample;
  }
  const samples = data.length / 4;
  assert.ok(samples > 0);
  if (frequency) {
    assert.ok(
      Math.sqrt(energy / samples) > 0.02,
      `${file}: missing audio at ${at}`,
    );
    assert.ok(
      Math.abs((crossings * 48000) / samples - frequency) < 25,
      `${file}: changed pitch at ${at}`,
    );
  } else {
    assert.ok(
      Math.sqrt(energy / samples) < 0.005,
      `${file}: expected silence at ${at}`,
    );
  }
}
for (const { name, time, speed, sourceAudio, cameraAudio } of cases) {
  const audio = sourceAudio || cameraAudio;
  const args = [
    '-i',
    `test-results/source${sourceAudio ? '' : '-silent'}.mp4`,
    '-i',
    `test-results/camera${cameraAudio ? '' : '-silent'}.mp4`,
    '-filter_complex',
    buildEditPlan(160, 90, time, 5, 2, sourceAudio, cameraAudio, speed),
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
  checkProbe(probe, name, speed, audio);
  if (time === 1 && audio) {
    checkTone(`test-results/${name}.mp4`, 0.2 / speed, sourceAudio ? 440 : 0);
    checkTone(`test-results/${name}.mp4`, 3 / speed, cameraAudio ? 880 : 0);
    checkTone(`test-results/${name}.mp4`, 6.4 / speed, sourceAudio ? 440 : 0);
  }
}
console.log(
  `PASS ${cases.length} native exports: 1×–3×, insertion boundaries, frame rate, duration, audio sync and pitch`,
);
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
for (const speed of [1, 1.5, 3]) {
  for (const [sourceAudio, cameraAudio] of [
    [true, false],
    [false, true],
    [true, true],
    [false, false],
  ]) {
    core.exec(
      '-i',
      'source',
      '-i',
      'camera.mp4',
      '-filter_complex',
      buildEditPlan(160, 90, 1, 5, 2, sourceAudio, cameraAudio, speed),
      '-map',
      '[v]',
      ...(sourceAudio || cameraAudio ? ['-map', '[a]'] : []),
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
    core.reset();
    core.ffprobe(
      '-v',
      'error',
      '-show_streams',
      '-show_format',
      '-of',
      'json',
      'output.mp4',
      '-o',
      'output-probe.json',
    );
    core.reset();
    checkProbe(
      JSON.parse(core.FS.readFile('output-probe.json', { encoding: 'utf8' })),
      `wasm-${speed}x-${sourceAudio}-${cameraAudio}`,
      speed,
      sourceAudio || cameraAudio,
    );
  }
}
console.log(
  'PASS 12 shipped WebAssembly exports: speed, video/audio duration, silent segments, H.264/AAC',
);
