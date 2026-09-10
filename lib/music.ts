import { falMediaUrl, MAX_MUSIC_VIDEO_BYTES } from './music-plan';

export type MusicTask = {
  video: Blob;
  videoUrl?: string;
  requestId?: string;
  audioUrl?: string;
  output?: Blob;
};

async function jsonResponse(response: Response) {
  const data = (await response.json()) as {
    error?: string;
    upload_url?: string;
    file_url?: string;
    multipart?: boolean;
    request_id?: string;
    status?: string;
    audio_url?: string;
  };
  if (!response.ok) throw new Error(data.error || 'Music request failed.');
  return data;
}

// Keep the job on the edit so retries poll the same paid request.
export async function generateMusic(
  task: MusicTask,
  key: string,
  report: (message: string) => void,
  checkpoint: () => Promise<unknown> = async () => {},
): Promise<string> {
  if (task.audioUrl) return task.audioUrl;
  if (!task.video.size || task.video.size > MAX_MUSIC_VIDEO_BYTES)
    throw new Error('Music supports finished videos up to 150 MB.');
  const headers = { 'Content-Type': 'application/json', 'X-Fal-Key': key };
  if (!task.videoUrl) {
    report('Uploading your finished edit for music…');
    const upload = await jsonResponse(
      await fetch('/api/music/upload', {
        method: 'POST',
        headers,
        body: JSON.stringify({ size: task.video.size }),
        signal: AbortSignal.timeout(60000),
      }),
    );
    if (!upload.upload_url) throw new Error('Missing music upload URL.');
    const uploadUrl = new URL(upload.upload_url);
    if (uploadUrl.protocol !== 'https:')
      throw new Error('Invalid music upload URL.');
    if (upload.multipart) {
      const parts: { partNumber: number; etag: string }[] = [];
      const chunkSize = 10 * 1024 * 1024;
      for (let offset = 0; offset < task.video.size; offset += chunkSize) {
        const part = parts.length + 1;
        const response = await fetch(
          `${uploadUrl.origin}${uploadUrl.pathname}/${part}${uploadUrl.search}`,
          {
            method: 'PUT',
            body: task.video.slice(offset, offset + chunkSize),
            signal: AbortSignal.timeout(120000),
          },
        );
        if (!response.ok)
          throw new Error('Could not upload the finished video for music.');
        const result = (await response.json()) as { etag?: string };
        if (typeof result.etag !== 'string')
          throw new Error('Could not verify the music upload.');
        parts.push({ partNumber: part, etag: result.etag });
      }
      const response = await fetch(
        `${uploadUrl.origin}${uploadUrl.pathname}/complete${uploadUrl.search}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parts }),
          signal: AbortSignal.timeout(60000),
        },
      );
      if (!response.ok) throw new Error('Could not finish the music upload.');
    } else {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4' },
        body: task.video,
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok)
        throw new Error('Could not upload the finished video for music.');
    }
    task.videoUrl = falMediaUrl(upload.file_url);
    await checkpoint();
  }
  if (!task.requestId) {
    report('Starting music for your finished edit…');
    const job = await jsonResponse(
      await fetch('/api/music', {
        method: 'POST',
        headers,
        body: JSON.stringify({ video_url: task.videoUrl }),
        signal: AbortSignal.timeout(60000),
      }),
    );
    if (typeof job.request_id !== 'string')
      throw new Error('Music request ID was missing.');
    task.requestId = job.request_id;
    await checkpoint();
  }
  const requestId = task.requestId;
  if (!requestId) throw new Error('Music request ID was missing.');
  const started = Date.now();
  while (Date.now() - started < 600000) {
    const state = await jsonResponse(
      await fetch(`/api/music/${encodeURIComponent(requestId)}`, {
        headers: { 'X-Fal-Key': key },
        signal: AbortSignal.timeout(60000),
      }),
    );
    if (state.audio_url) {
      task.audioUrl = falMediaUrl(state.audio_url);
      await checkpoint();
      return task.audioUrl;
    }
    if (state.status !== 'IN_QUEUE' && state.status !== 'IN_PROGRESS')
      throw new Error(
        'Music generation did not complete. Check your fal dashboard.',
      );
    report(
      state.status === 'IN_QUEUE'
        ? 'Music queued on fal…'
        : 'Generating music for your finished edit…',
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(
    'Music is taking longer than expected. Retry to check the same request.',
  );
}
