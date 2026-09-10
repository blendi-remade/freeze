export const MUSIC_MODEL = 'sonilo/v1.1/video-to-music';
export const MUSIC_QUEUE = 'https://queue.fal.run/sonilo/v1.1';
export const MAX_MUSIC_VIDEO_BYTES = 150 * 1024 * 1024;

export function falMediaUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Missing fal media URL.');
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password ||
    !(url.hostname === 'fal.media' || url.hostname.endsWith('.fal.media'))
  )
    throw new Error('Expected a fal media URL.');
  return url.href;
}

export function musicMixArgs(
  duration: number,
  hasOriginalAudio: boolean,
  video = 'video.mp4',
  music = 'music.m4a',
  output = 'with-music.mp4',
) {
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error('Could not read the finished video duration.');
  const normalize = `asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${duration}`;
  const graph = hasOriginalAudio
    ? `[0:a]${normalize}[original];[1:a]${normalize}[track];[original][track]amix=inputs=2:duration=first:weights='1 0.5':normalize=0,alimiter=limit=0.95:level=0,atrim=duration=${duration}[a]`
    : `[1:a]${normalize}[a]`;
  // Copy the edited picture exactly; only the soundtrack is encoded again.
  return [
    '-i',
    video,
    '-i',
    music,
    '-filter_complex',
    graph,
    '-map',
    '0:v:0',
    '-map',
    '[a]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-t',
    String(duration),
    '-movflags',
    '+faststart',
    '-y',
    output,
  ];
}
