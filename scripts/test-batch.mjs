import assert from 'node:assert/strict';
import { runCameraBatch } from '../lib/batch.ts';
const jobs = Array.from({ length: 8 }, (_, id) => ({
  id,
  frame: 'same-frame',
  speed: 2,
  trim: true,
}));
const states = new Map();
let generating = 0,
  encoding = 0,
  maxGenerating = 0,
  maxEncoding = 0;
const pause = () => new Promise((resolve) => setTimeout(resolve, 5));
await runCameraBatch(jobs, {
  generate: async (job) => {
    maxGenerating = Math.max(maxGenerating, ++generating);
    await pause();
    generating--;
    if (job.id === 1) throw new Error('Generation failed');
    return `camera-${job.id}`;
  },
  assemble: async (job, url) => {
    assert.equal(job.frame, 'same-frame');
    assert.equal(job.speed, 2);
    assert.equal(job.trim, true);
    assert.equal(url, `camera-${job.id}`);
    maxEncoding = Math.max(maxEncoding, ++encoding);
    await pause();
    encoding--;
    if (job.id === 3) throw new Error('Export failed');
    return `output-${job.id}`;
  },
  update: (job, patch) =>
    states.set(job.id, { ...states.get(job.id), ...patch }),
});
assert.equal(maxGenerating, 3);
assert.equal(maxEncoding, 1);
assert.equal(states.get(1).status, 'error');
assert.equal(states.get(3).status, 'error');
assert.equal(
  states.get(3).cameraUrl,
  'camera-3',
  'Failed export retains camera URL for a free retry',
);
for (const job of jobs.filter((job) => ![1, 3].includes(job.id))) {
  assert.equal(states.get(job.id).status, 'ready');
  assert.equal(states.get(job.id).outputUrl, `output-${job.id}`);
}
const controller = new AbortController();
controller.abort();
await runCameraBatch(jobs, {
  signal: controller.signal,
  generate: () => assert.fail('Cancelled batch must not submit'),
  assemble: () => assert.fail(),
  update: () => assert.fail(),
});
console.log(
  'PASS batch: three concurrent generations, one encoder, independent failures, retained retry URLs, shared settings, cancellation',
);
