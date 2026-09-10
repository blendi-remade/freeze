import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import createCore from '@ffmpeg/core';

const dir = resolve('test-results/music');
mkdirSync(dir, { recursive: true });
// Exercise actual route/client modules in Node with only the Workers binding stubbed.
for (const [path, name] of [
  ['lib/music-plan.ts', 'music-plan'],
  ['lib/fal-server.ts', 'fal-server'],
  ['lib/music.ts', 'music'],
  ['lib/music-export.ts', 'music-export'],
  ['scripts/local-music.ts', 'local-music'],
  ['app/api/music/upload/route.ts', 'upload-route'],
  ['app/api/music/route.ts', 'music-route'],
  ['app/api/music/[id]/route.ts', 'status-route'],
]) {
  let code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  code = code
    .replace(
      /from ['"](?:@\/lib\/|\.\/|\.\.\/lib\/)(music-plan|fal-server)['"]/g,
      "from './$1.mjs'",
    )
    .replace(/from ['"]cloudflare:workers['"]/g, "from './test-env.mjs'");
  writeFileSync(`${dir}/${name}.mjs`, code);
}
writeFileSync(
  `${dir}/test-env.mjs`,
  "export const env = { FAL_KEY: 'fixture-key' };",
);
const load = (name) => import(pathToFileURL(`${dir}/${name}.mjs`).href);
const { musicMixArgs, falMediaUrl } = await load('music-plan');
const { generateMusic } = await load('music');
const { layerMusic } = await load('music-export');
const uploadRoute = await load('upload-route');
const musicRoute = await load('music-route');
const statusRoute = await load('status-route');
const { localMusic } = await load('local-music');
let middleware;
localMusic().configureServer({
  middlewares: {
    use(fn) {
      middleware = fn;
    },
  },
});
const run = (args) =>
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
const probe = (file) =>
  JSON.parse(
    execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file],
      { encoding: 'utf8' },
    ),
  );
const hash = (file) =>
  run([
    '-i',
    file,
    '-map',
    '0:v:0',
    '-c',
    'copy',
    '-f',
    'hash',
    '-',
  ]).toString();
run([
  '-f',
  'lavfi',
  '-i',
  'testsrc2=size=160x90:rate=30:duration=3',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:duration=3',
  '-c:v',
  'libx264',
  '-c:a',
  'aac',
  `${dir}/video.mp4`,
]);
run(['-i', `${dir}/video.mp4`, '-c:v', 'copy', '-an', `${dir}/silent.mp4`]);
for (const duration of [1, 5])
  run([
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=880:duration=${duration}`,
    '-c:a',
    'aac',
    `${dir}/track-${duration}.m4a`,
  ]);
for (const audio of [true, false]) {
  for (const duration of [1, 5]) {
    const input = `${dir}/${audio ? 'video' : 'silent'}.mp4`;
    const output = `${dir}/native-${audio}-${duration}.mp4`;
    run(musicMixArgs(3, audio, input, `${dir}/track-${duration}.m4a`, output));
    const info = probe(output);
    assert.ok(Math.abs(Number(info.format.duration) - 3) < 0.05);
    assert.ok(
      Math.abs(
        Number(info.streams.find((s) => s.codec_type === 'audio').duration) - 3,
      ) < 0.05,
    );
    assert.equal(
      hash(output),
      hash(input),
      'Music must not alter picture frames',
    );
    const pcm = run([
      '-i',
      output,
      '-t',
      '0.5',
      '-vn',
      '-ac',
      '1',
      '-ar',
      '48000',
      '-f',
      'f32le',
      '-',
    ]);
    const amplitude = (frequency) => {
      let real = 0,
        imaginary = 0;
      const count = pcm.length / 4;
      for (let i = 0; i < count; i++) {
        const sample = pcm.readFloatLE(i * 4),
          angle = (2 * Math.PI * frequency * i) / 48000;
        real += sample * Math.cos(angle);
        imaginary += sample * Math.sin(angle);
      }
      return (2 * Math.hypot(real, imaginary)) / count;
    };
    assert.ok(amplitude(880) > 0.03, 'Generated music must be audible');
    if (audio)
      assert.ok(amplitude(440) > 0.05, 'Existing audio must remain audible');
  }
}
console.log(
  'PASS native music: short/long soundtracks, original/silent audio, unchanged picture, full duration',
);

const finalVideo = new Blob([readFileSync(`${dir}/video.mp4`)], {
  type: 'video/mp4',
});
const videoUrl = 'https://v3.fal.media/files/finished.mp4';
const audioUrl = 'https://v3.fal.media/files/music.m4a';
let submitCount = 0,
  uploadCount = 0,
  uploadFinished = false,
  failStatus = true;
const apiRequest = (url, init) => new Request(`http://localhost${url}`, init);
async function localRequest(form) {
  const request = new Request('http://localhost/api/local-music', {
    method: 'POST',
    body: form,
  });
  const bytes = new Uint8Array(await request.arrayBuffer());
  const req = {
    method: 'POST',
    url: '/api/local-music',
    headers: {
      host: 'localhost',
      'content-type': request.headers.get('content-type'),
    },
    async *[Symbol.asyncIterator]() {
      yield bytes;
    },
  };
  let body;
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(value) {
      body = value;
    },
  };
  await middleware(req, res, () =>
    assert.fail('Unexpected middleware fallthrough'),
  );
  return new Response(body, { status: res.statusCode, headers: res.headers });
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (value, init) => {
  const url =
    typeof value === 'string'
      ? value
      : value instanceof URL
        ? value.href
        : value.url;
  if (url === '/api/music/upload')
    return uploadRoute.POST(apiRequest(url, init));
  if (url === '/api/music') return musicRoute.POST(apiRequest(url, init));
  if (url.startsWith('/api/music/'))
    return statusRoute.GET(apiRequest(url, init), {
      params: Promise.resolve({ id: url.split('/').at(-1) }),
    });
  if (url.startsWith('https://rest.fal.ai/')) {
    assert.equal(init.headers.Authorization, 'Key fixture-key');
    assert.equal(JSON.parse(init.body).content_type, 'video/mp4');
    uploadCount++;
    return Response.json({
      upload_url: 'https://v3.fal.media/upload/fixture',
      file_url: videoUrl,
    });
  }
  if (url === 'https://v3.fal.media/upload/fixture') {
    assert.equal(init.method, 'PUT');
    assert.equal(
      init.body,
      finalVideo,
      'Upload the finished edit Blob, not the source clip',
    );
    assert.equal(
      init.headers.Authorization,
      undefined,
      'Do not forward fal key to storage',
    );
    uploadFinished = true;
    return new Response(null, { status: 200 });
  }
  if (url === 'https://queue.fal.run/sonilo/v1.1/video-to-music') {
    assert.ok(uploadFinished);
    assert.deepEqual(JSON.parse(init.body), {
      video_url: videoUrl,
      num_samples: 1,
    });
    submitCount++;
    return Response.json({ request_id: 'music-fixture-12345' });
  }
  if (url.endsWith('/music-fixture-12345/status')) {
    if (failStatus)
      return Response.json(
        { detail: 'Temporary status failure' },
        { status: 503 },
      );
    return Response.json({ status: 'COMPLETED' });
  }
  if (url.endsWith('/music-fixture-12345'))
    return Response.json({ audio: { url: audioUrl } });
  if (url === '/api/local-config') return Response.json({ nativeExport: true });
  if (url === '/api/local-music') return localRequest(init.body);
  if (url === audioUrl) return new Response(readFileSync(`${dir}/track-5.m4a`));
  assert.fail(`Unexpected fetch: ${url}`);
};
const task = { video: finalVideo };
await assert.rejects(
  () => generateMusic(task, '', () => {}),
  /Temporary status failure/,
);
assert.equal(task.requestId, 'music-fixture-12345');
failStatus = false;
assert.equal(await generateMusic(task, '', () => {}), audioUrl);
assert.equal(await generateMusic(task, '', () => {}), audioUrl);
assert.equal(submitCount, 1, 'Retry must reuse the paid request');
assert.equal(uploadCount, 1, 'Retry must reuse the finished-video upload');
const mixed = await layerMusic(task.video, task.audioUrl, () => {});
writeFileSync(
  `${dir}/through-middleware.mp4`,
  new Uint8Array(await mixed.arrayBuffer()),
);
assert.equal(hash(`${dir}/through-middleware.mp4`), hash(`${dir}/video.mp4`));
for (const url of [
  'http://v3.fal.media/a',
  'https://example.com/a',
  'https://fal.media.evil.test/a',
])
  assert.throws(() => falMediaUrl(url));
const badSubmit = await musicRoute.POST(
  apiRequest('/api/music', {
    method: 'POST',
    body: JSON.stringify({ video_url: 'https://example.com/private' }),
  }),
);
assert.equal(badSubmit.status, 400);
assert.equal(submitCount, 1);
const crossOrigin = await uploadRoute.POST(
  apiRequest('/api/music/upload', {
    method: 'POST',
    headers: { origin: 'https://other.test' },
    body: JSON.stringify({ size: 10 }),
  }),
);
assert.equal(crossOrigin.status, 400);
console.log(
  'PASS full music flow: finished edit upload → Sonilo → retry same job → native soundtrack mix; input/origin validation',
);

// Multipart upload stays out of the Worker body/memory and never forwards the key.
const large = new Blob(
  Array(91).fill(new Blob([new Uint8Array(1024 * 1024)])),
  { type: 'video/mp4' },
);
let totalBytes = 0,
  parts = 0;
globalThis.fetch = async (value, init) => {
  const url =
    typeof value === 'string'
      ? value
      : value instanceof URL
        ? value.href
        : value.url;
  if (url === '/api/music/upload')
    return Response.json({
      multipart: true,
      upload_url: 'https://v3.fal.media/parts?token=fixture',
      file_url: videoUrl,
    });
  if (/\/parts\/\d+\?/.test(url)) {
    parts++;
    totalBytes += init.body.size;
    assert.equal(init.headers, undefined);
    return Response.json({ etag: `part-${parts}` });
  }
  if (url.includes('/complete?')) {
    assert.equal(JSON.parse(init.body).parts.length, 10);
    return new Response(null);
  }
  if (url === '/api/music')
    return Response.json({ request_id: 'music-fixture-12345' });
  if (url.startsWith('/api/music/'))
    return Response.json({ audio_url: audioUrl });
  assert.fail(url);
};
await generateMusic({ video: large }, '', () => {});
assert.equal(totalBytes, large.size);
assert.equal(parts, 10);
globalThis.fetch = originalFetch;
console.log(
  'PASS multipart music uploads: full payload, ordered parts, completion',
);

globalThis.self = { location: { href: import.meta.url } };
const core = await createCore({
  wasmBinary: readFileSync(
    'node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm',
  ),
});
for (const audio of [true, false]) {
  for (const duration of [1, 5]) {
    const input = `${dir}/${audio ? 'video' : 'silent'}.mp4`;
    core.FS.writeFile('video.mp4', new Uint8Array(readFileSync(input)));
    core.FS.writeFile(
      'music.m4a',
      new Uint8Array(readFileSync(`${dir}/track-${duration}.m4a`)),
    );
    core.exec(...musicMixArgs(3, audio));
    assert.equal(core.ret, 0);
    core.reset();
    const output = `${dir}/wasm-${audio}-${duration}.mp4`;
    writeFileSync(output, core.FS.readFile('with-music.mp4'));
    assert.ok(Math.abs(Number(probe(output).format.duration) - 3) < 0.05);
    assert.equal(hash(output), hash(input));
  }
}
console.log(
  'PASS shipped WebAssembly music mixer: original/silent audio, short/long music, unchanged video',
);
