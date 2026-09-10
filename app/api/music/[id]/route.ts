import { falFetch, getKey, json } from '@/lib/fal-server';
import { falMediaUrl, MUSIC_QUEUE } from '@/lib/music-plan';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const key = getKey(request);
    const { id } = await context.params;
    if (!/^[a-zA-Z0-9-]{10,100}$/.test(id))
      return json({ error: 'Invalid music request ID.' }, 400);
    const status = await falFetch(`${MUSIC_QUEUE}/requests/${id}/status`, key);
    if (status.status === 'COMPLETED') {
      const result = await falFetch(`${MUSIC_QUEUE}/requests/${id}`, key);
      return json({
        status: 'COMPLETED',
        audio_url: falMediaUrl(result.audio?.url),
      });
    }
    return json({ status: status.status });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not check music generation.',
      },
      400,
    );
  }
}
