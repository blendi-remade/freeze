import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { buildEditPlan } from './edit-plan';

const exec = promisify(execFile);
export async function nativeExportAvailable() {
  if (process.env.NODE_ENV !== 'development' || process.env.VERCEL)
    return false;
  try {
    await exec('ffmpeg', ['-version']);
    await exec('ffprobe', ['-version']);
    return true;
  } catch {
    return false;
  }
}

export async function assembleNative(request: Request): Promise<Response> {
  if (process.env.NODE_ENV !== 'development' || process.env.VERCEL)
    return Response.json(
      { error: 'Native export is only available in local development.' },
      { status: 404 },
    );
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    return Response.json(
      { error: 'Cross-origin requests are not allowed.' },
      { status: 403 },
    );
  let dir: string | undefined;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Missing source video.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 155 * 1024 * 1024) {
        await reader.cancel();
        throw new Error('Video exceeds the local upload limit.');
      }
      chunks.push(value);
    }
    request = new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: Buffer.concat(chunks),
    });
    const form = await request.formData();
    const source = form.get('source');
    const at = Number(form.get('freezeAt'));
    const cameraSpeed = Number(form.get('cameraSpeed') ?? 1);
    const trimCameraEnd = form.get('trimCameraEnd') === 'true';
    if (!Number.isFinite(cameraSpeed) || cameraSpeed < 1 || cameraSpeed > 2)
      throw new Error('AI clip speed must be between 1× and 2×.');
    const cameraValue = form.get('cameraUrl');
    if (typeof cameraValue !== 'string')
      throw new Error('Missing generated clip URL.');
    const camera = new URL(cameraValue);
    if (!(source instanceof File) || !Number.isFinite(at) || at < 0)
      throw new Error('Invalid source or freeze timestamp.');
    if (
      camera.protocol !== 'https:' ||
      camera.port ||
      camera.username ||
      camera.password ||
      !camera.hostname.endsWith('.fal.media')
    )
      throw new Error('Expected a fal-generated video URL.');
    dir = await mkdtemp(join(tmpdir(), 'freeze-export-'));
    const sourcePath = join(dir, 'source'),
      cameraPath = join(dir, 'camera.mp4'),
      output = join(dir, 'finished.mp4');
    await writeFile(sourcePath, new Uint8Array(await source.arrayBuffer()));
    const remote = await fetch(camera, {
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
    });
    if (!remote.ok) throw new Error('Could not retrieve the generated clip.');
    await writeFile(cameraPath, new Uint8Array(await remote.arrayBuffer()));
    async function probe(file: string) {
      const { stdout } = await exec('ffprobe', [
        '-v',
        'error',
        '-show_streams',
        '-show_format',
        '-of',
        'json',
        file,
      ]);
      return JSON.parse(stdout);
    }
    const original = await probe(sourcePath),
      generated = await probe(cameraPath);
    const duration = Number(original.format.duration),
      cameraDuration = Number(generated.format.duration);
    if (
      !Number.isFinite(duration) ||
      !Number.isFinite(cameraDuration) ||
      at > duration ||
      duration > 60.5
    )
      throw new Error('Invalid clip duration or selected frame.');
    const video = generated.streams.find(
      (s: { codec_type: string }) => s.codec_type === 'video',
    );
    const width = Number(video?.width),
      height = Number(video?.height);
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width <= 0 ||
      height <= 0
    )
      throw new Error('Could not read generated video dimensions.');
    const audio = (p: typeof original) =>
      p.streams.some((s: { codec_type: string }) => s.codec_type === 'audio');
    const graph = buildEditPlan(
      width,
      height,
      at,
      cameraDuration,
      duration,
      audio(original),
      audio(generated),
      cameraSpeed,
      trimCameraEnd,
    );
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      sourcePath,
      '-i',
      cameraPath,
      '-filter_complex',
      graph,
      '-map',
      '[v]',
    ];
    if (audio(original) || audio(generated))
      args.push('-map', '[a]', '-c:a', 'aac', '-b:a', '192k');
    args.push(
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-y',
      output,
    );
    await exec('ffmpeg', args, {
      timeout: 300000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const finished = await probe(output);
    if (
      Math.abs(
        Number(finished.format.duration) -
          (duration + (cameraDuration - (trimCameraEnd ? 1 : 0)) / cameraSpeed),
      ) > 0.25
    )
      throw new Error(
        'The assembled duration did not match the full three-part edit.',
      );

    return new Response(new Uint8Array(await readFile(output)), {
      headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Local assembly failed.',
      },
      { status: 400 },
    );
  } finally {
    if (dir) {
      const target = resolve(dir);
      if (
        dirname(target) === resolve(tmpdir()) &&
        basename(target).startsWith('freeze-export-')
      )
        await rm(target, { recursive: true, force: true });
    }
  }
}
