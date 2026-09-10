import { falFetch, getKey, json } from '@/lib/fal-server';
import { falMediaUrl, MAX_MUSIC_VIDEO_BYTES } from '@/lib/music-plan';

export async function POST(request: Request) {
  try {
    const key = getKey(request);
    const raw = await request.text();
    if (raw.length > 1024)
      return json({ error: 'Invalid upload request.' }, 400);
    const { size } = JSON.parse(raw);
    if (
      !Number.isSafeInteger(size) ||
      size <= 0 ||
      size > MAX_MUSIC_VIDEO_BYTES
    )
      return json(
        { error: 'Music supports finished videos up to 150 MB.' },
        400,
      );
    const multipart = size > 90 * 1024 * 1024;
    const result = await falFetch(
      `https://rest.fal.ai/storage/upload/${multipart ? 'initiate-multipart' : 'initiate'}?storage_type=fal-cdn-v3`,
      key,
      {
        method: 'POST',
        body: JSON.stringify({
          content_type: 'video/mp4',
          file_name: 'freeze-edit.mp4',
        }),
      },
    );
    const fileUrl = falMediaUrl(result.file_url);
    const uploadUrl = new URL(result.upload_url || '');
    if (
      uploadUrl.protocol !== 'https:' ||
      uploadUrl.username ||
      uploadUrl.password
    )
      throw new Error('fal returned an invalid upload URL.');
    return json({ file_url: fileUrl, upload_url: uploadUrl.href, multipart });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not prepare music upload.',
      },
      400,
    );
  }
}
