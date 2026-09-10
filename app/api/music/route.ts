import { falFetch, getKey, json } from '@/lib/fal-server';
import { falMediaUrl, MUSIC_MODEL } from '@/lib/music-plan';

export async function POST(request: Request) {
  try {
    const key = getKey(request);
    const raw = await request.text();
    if (raw.length > 4096)
      return json({ error: 'Invalid music request.' }, 400);
    const videoUrl = falMediaUrl(JSON.parse(raw).video_url);
    const result = await falFetch(`https://queue.fal.run/${MUSIC_MODEL}`, key, {
      method: 'POST',
      body: JSON.stringify({ video_url: videoUrl, num_samples: 1 }),
    });
    if (!result.request_id)
      throw new Error('fal did not return a music request ID.');
    return json({ request_id: result.request_id });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not start music generation.',
      },
      400,
    );
  }
}
