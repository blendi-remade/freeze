import { FFmpeg } from '@ffmpeg/ffmpeg';
import { falMediaUrl, musicMixArgs } from './music-plan';

export async function layerMusic(
  video: Blob,
  audioUrl: string,
  report: (message: string) => void,
): Promise<Blob> {
  falMediaUrl(audioUrl);
  const local = await fetch('/api/local-config')
    .then(
      async (response) =>
        response.ok &&
        ((await response.json()) as { nativeExport?: boolean }).nativeExport,
    )
    .catch(() => false);
  report('Layering music onto your finished video…');
  if (local) {
    const form = new FormData();
    form.set('video', video, 'freeze-edit.mp4');
    form.set('audioUrl', audioUrl);
    const response = await fetch('/api/local-music', {
      method: 'POST',
      body: form,
    });
    if (!response.ok)
      throw new Error(
        ((await response.json()) as { error?: string }).error ||
          'Could not add the music track.',
      );
    return response.blob();
  }
  const ff = new FFmpeg();
  let wasmUrl = '';
  try {
    const parts = await Promise.all(
      [1, 2].map(async (n) => {
        const response = await fetch(`/ffmpeg/core.part${n}`);
        if (!response.ok)
          throw new Error('Could not load the music editing engine.');
        return response.blob();
      }),
    );
    wasmUrl = URL.createObjectURL(
      new Blob(parts, { type: 'application/wasm' }),
    );
    await ff.load({
      coreURL: new URL('/ffmpeg/ffmpeg-core.js', location.origin).href,
      wasmURL: wasmUrl,
    });
    const response = await fetch(
      `/api/media?url=${encodeURIComponent(audioUrl)}`,
    );
    if (!response.ok)
      throw new Error('Could not download the generated music.');
    await ff.writeFile('video.mp4', new Uint8Array(await video.arrayBuffer()));
    await ff.writeFile(
      'music.m4a',
      new Uint8Array(await response.arrayBuffer()),
    );
    await ff.ffprobe([
      '-v',
      'error',
      '-show_streams',
      '-show_format',
      '-of',
      'json',
      'video.mp4',
      '-o',
      'video.json',
    ]);
    const probe = JSON.parse(
      new TextDecoder().decode((await ff.readFile('video.json')) as Uint8Array),
    );
    const duration = Number(probe.format?.duration);
    const audio = probe.streams?.some(
      (stream: { codec_type: string }) => stream.codec_type === 'audio',
    );
    if ((await ff.exec(musicMixArgs(duration, Boolean(audio)))) !== 0)
      throw new Error(
        'Could not layer music. Your video without music is still available.',
      );
    const result = (await ff.readFile('with-music.mp4')) as Uint8Array;
    return new Blob([new Uint8Array(result)], { type: 'video/mp4' });
  } finally {
    ff.terminate();
    if (wasmUrl) URL.revokeObjectURL(wasmUrl);
  }
}
