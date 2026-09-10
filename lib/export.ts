import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { readVideo } from './video';
import { buildEditPlan } from './edit-plan';

// Runs entirely in the browser. The full source video never reaches our server.
export async function assembleEdit(
  file: File,
  cameraUrl: string,
  freezeAt: number,
  rewind: boolean,
  report: (message: string) => void,
): Promise<Blob> {
  const ff = new FFmpeg();
  const sourceUrl = URL.createObjectURL(file);
  try {
    report('Loading the local editing engine (about 32 MB, once per export)');
    const pieces = await Promise.all(
      [1, 2].map(async (n) => {
        const response = await fetch(`/ffmpeg/core.part${n}`);
        if (!response.ok)
          throw new Error('The local editing engine could not be loaded.');
        return response.blob();
      }),
    );
    const wasmUrl = URL.createObjectURL(
      new Blob(pieces, { type: 'application/wasm' }),
    );
    try {
      await ff.load({
        coreURL: new URL('/ffmpeg/ffmpeg-core.js', location.origin).href,
        wasmURL: wasmUrl,
      });
    } finally {
      URL.revokeObjectURL(wasmUrl);
    }
    const metadata = await readVideo(sourceUrl);
    const ratio = Math.min(
      1,
      1280 / Math.max(metadata.videoWidth, metadata.videoHeight),
    );
    const width = Math.max(
        2,
        Math.round((metadata.videoWidth * ratio) / 2) * 2,
      ),
      height = Math.max(2, Math.round((metadata.videoHeight * ratio) / 2) * 2);
    const total = metadata.duration;
    metadata.removeAttribute('src');
    metadata.load();
    report('Preparing the source and camera move');
    const response = await fetch(
      `/api/media?url=${encodeURIComponent(cameraUrl)}`,
    );
    if (!response.ok)
      throw new Error(
        'Could not download the camera move for export. Try again.',
      );
    await ff.writeFile('source', await fetchFile(file));
    await ff.writeFile(
      'camera.mp4',
      new Uint8Array(await response.arrayBuffer()),
    );
    // This core may leave its return register at -1 even after a successful probe.
    // Validate the actual JSON output instead of treating that as a failure.
    await ff.ffprobe([
      '-v',
      'error',
      '-show_streams',
      '-of',
      'json',
      'source',
      '-o',
      'probe.json',
    ]);
    const probe = JSON.parse(
      new TextDecoder().decode((await ff.readFile('probe.json')) as Uint8Array),
    );
    if (!Array.isArray(probe.streams))
      throw new Error('Could not inspect the source clip.');
    const hasAudio = probe.streams.some(
      (s: { codec_type: string }) => s.codec_type === 'audio',
    );
    const graph = buildEditPlan(
      width,
      height,
      total,
      freezeAt,
      rewind,
      hasAudio,
    );
    report('Assembling your MP4 locally. Keep this tab open.');
    ff.on('progress', ({ progress }) => {
      if (progress > 0 && progress < 1)
        report(`Assembling your MP4 locally · ${Math.round(progress * 100)}%`);
    });
    const args = [
      '-i',
      'source',
      '-i',
      'camera.mp4',
      '-filter_complex',
      graph,
      '-map',
      '[v]',
    ];
    if (hasAudio) args.push('-map', '[a]', '-c:a', 'aac', '-b:a', '192k');
    args.push(
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-y',
      'freeze.mp4',
    );
    const code = await ff.exec(args);
    if (code !== 0)
      throw new Error(
        'The browser could not finish this edit. Try a shorter or smaller source clip.',
      );
    const data = (await ff.readFile('freeze.mp4')) as Uint8Array;
    return new Blob([new Uint8Array(data)], { type: 'video/mp4' });
  } finally {
    ff.terminate();
    URL.revokeObjectURL(sourceUrl);
  }
}
