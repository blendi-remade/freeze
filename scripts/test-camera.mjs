import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import createCore from '@ffmpeg/core';
import { PRESETS, makeInput } from '../lib/recipe.ts';
import { buildEditPlan } from '../lib/edit-plan.ts';

// Check every UI recipe against the relay's input bounds and closed camera poses.
for (const preset of PRESETS) {
  const input = makeInput('data:image/jpeg;base64,AA==', preset.id, '768P');
  const path = input.camera_trajectory;
  assert.ok([5, 6].includes(input.duration));
  assert.ok(input.prompt.length <= 2000);
  assert.ok(path.length >= 2 && path.length <= 12);
  assert.deepEqual(path[0], { time: 0, azimuth: 0, elevation: 0, distance: 1 });
  assert.equal(path.at(-1).time, 1);
  for (let i = 0; i < path.length; i++) {
    const frame = path[i];
    assert.ok(Object.values(frame).every(Number.isFinite));
    assert.ok(frame.time >= 0 && frame.time <= 1);
    assert.ok(
      Math.abs(frame.azimuth) <= 360 && Math.abs(frame.elevation) <= 90,
    );
    assert.ok(frame.distance > 0);
    if (i) assert.ok(frame.time > path[i - 1].time);
  }
  const last = path.at(-1);
  const closed =
    Math.abs(last.azimuth % 360) === 0 &&
    last.elevation === 0 &&
    last.distance === 1;
  assert.equal(closed, preset.returnsToStart, preset.name);
  if (preset.returnsToStart) {
    const { time: _ignoredEnd, ...end } = last;
    const { time: _ignoredHold, ...hold } = path.at(-2);
    assert.deepEqual(
      end,
      hold,
      `${preset.name}: final pose held through last frame`,
    );
  }
}
for (const [id, direction] of [
  ['orbit', 1],
  ['orbit-left', -1],
]) {
  const path = makeInput('', id, '768P').camera_trajectory;
  assert.equal(path.at(-1).azimuth, direction * 360);
  for (let i = 1; i < path.length; i++) {
    const travel = direction * (path[i].azimuth - path[i - 1].azimuth);
    assert.ok(
      travel >= 0 && travel <= 45,
      'Full turns must not reverse or skip corners',
    );
  }
}
console.log(
  `PASS all ${PRESETS.length} presets: valid payloads, ${PRESETS.filter(p => p.returnsToStart).length} return paths, signed full turns and final holds`,
);

// Decode actual exports: the final generated frame must stay blue right up to
// the hard cut to red source footage. This catches the removed exit dissolve.
globalThis.self = { location: { href: import.meta.url } };
const core = await createCore({
  wasmBinary: readFileSync(
    'node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm',
  ),
});
function run(...args) {
  core.exec('-hide_banner', '-loglevel', 'error', '-y', ...args);
  assert.equal(core.ret, 0);
  core.reset();
}
run(
  '-f',
  'lavfi',
  '-i',
  'color=c=red:s=64x48:r=30:d=2',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  'source.mp4',
);
run(
  '-f',
  'lavfi',
  '-i',
  'color=c=blue:s=64x48:r=30:d=1',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  'camera.mp4',
);
for (const speed of [1, 1.25, 1.5, 1.75, 2]) {
  for (const at of [0, 1, 2]) {
    run(
      '-i',
      'source.mp4',
      '-i',
      'camera.mp4',
      '-filter_complex',
      buildEditPlan(64, 48, at, 1, 2, false, false, speed),
      '-map',
      '[v]',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '18',
      'out.mp4',
    );
    run('-i', 'out.mp4', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'out.rgb');
    const pixels = core.FS.readFile('out.rgb');
    const frameBytes = 64 * 48 * 3;
    assert.equal(
      pixels.length / frameBytes,
      60 + Math.round(30 / speed),
      `Original stays 2 seconds; only the AI insert accelerates at ${speed}×`,
    );
    const cameraEnd = at * 30 + Math.round(30 / speed);
    const pixelAt = (frame) =>
      pixels.subarray(frame * frameBytes, frame * frameBytes + 3);
    for (let frame = at * 30; frame < cameraEnd; frame++) {
      const [r, g, b] = pixelAt(frame);
      assert.ok(
        b > 230 && r < 20 && g < 20,
        `Generated frame ${frame} must remain blue, with no exit blend`,
      );
    }
    if (cameraEnd < pixels.length / frameBytes) {
      const [r, g, b] = pixelAt(cameraEnd);
      assert.ok(
        r > 230 && g < 20 && b < 20,
        'Source must resume with an immediate red frame',
      );
    }
  }
}
console.log(
  'PASS shipped WebAssembly encoder: all five speeds at start/middle/end, unchanged source duration and direct cuts',
);
for (const speed of [0, 0.5, 2.01, NaN, Infinity]) {
  assert.throws(() => buildEditPlan(64, 48, 1, 1, 2, false, false, speed));
}
// Exercise retimed camera audio as well as inserted silence for a silent camera.
run(
  '-f',
  'lavfi',
  '-i',
  'color=c=blue:s=64x48:r=30:d=1',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:duration=1:sample_rate=48000',
  '-c:v',
  'libx264',
  '-c:a',
  'aac',
  'camera-audio.mp4',
);
for (const speed of [1, 1.25, 1.5, 1.75, 2]) {
  for (const cameraAudio of [false, true]) {
    run(
      '-i',
      'camera-audio.mp4',
      '-i',
      'camera-audio.mp4',
      '-filter_complex',
      buildEditPlan(64, 48, 0.5, 1, 1, true, cameraAudio, speed),
      '-map',
      '[v]',
      '-map',
      '[a]',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      'audio-out.mp4',
    );
    run(
      '-i',
      'audio-out.mp4',
      '-vn',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-f',
      's16le',
      'audio.raw',
    );
    const seconds = core.FS.readFile('audio.raw').length / (48000 * 2 * 2);
    assert.ok(
      Math.abs(seconds - (1 + 1 / speed)) < 0.08,
      `Audio stays aligned at ${speed}×, cameraAudio=${cameraAudio}: ${seconds}s`,
    );
  }
}
console.log(
  'PASS all speeds: camera audio and silence stay aligned; invalid speeds rejected',
);
// Distinct final second proves trimming removes the tail, rather than the start.
run('-f', 'lavfi', '-i', 'color=c=blue:s=64x48:r=30:d=1',
  '-f', 'lavfi', '-i', 'color=c=yellow:s=64x48:r=30:d=1',
  '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2:sample_rate=48000',
  '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]',
  '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-c:a', 'aac', 'trim-camera.mp4');
for (const speed of [1, 1.25, 1.5, 1.75, 2]) {
  run('-i', 'source.mp4', '-i', 'trim-camera.mp4',
    '-filter_complex', buildEditPlan(64, 48, 1, 2, 2, false, true, speed, true),
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-c:a', 'aac', 'trim-out.mp4');
  run('-i', 'trim-out.mp4', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'trim.rgb');
  const pixels = core.FS.readFile('trim.rgb');
  const frameBytes = 64 * 48 * 3;
  const cameraFrames = Math.round(30 / speed);
  assert.equal(pixels.length / frameBytes, 60 + cameraFrames);
  for (let frame = 0; frame < 60 + cameraFrames; frame++) {
    const [r, g, b] = pixels.subarray(frame * frameBytes, frame * frameBytes + 3);
    assert.ok(frame >= 30 && frame < 30 + cameraFrames
      ? b > 230 && r < 20 && g < 20
      : r > 230 && g < 20 && b < 20, 'Only the blue first second remains, with red original on either side');
  }
  run('-i', 'trim-out.mp4', '-vn', '-ar', '48000', '-ac', '2', '-f', 's16le', 'trim.raw');
  const seconds = core.FS.readFile('trim.raw').length / (48000 * 2 * 2);
  assert.ok(Math.abs(seconds - (2 + 1 / speed)) < 0.08);
}
console.log('PASS optional last-second trim at every speed: correct frames removed, original preserved, audio aligned');
