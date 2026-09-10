import { json } from '@/lib/fal-server';
export async function GET(request: Request) {
  try {
    const url = new URL(new URL(request.url).searchParams.get('url') || '');
    if (
      url.protocol !== 'https:' ||
      url.port ||
      url.username ||
      url.password ||
      !(url.hostname === 'fal.media' || url.hostname.endsWith('.fal.media'))
    )
      return json({ error: 'Only fal media URLs are supported.' }, 400);
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok)
      return json({ error: 'Camera move could not be downloaded.' }, 502);
    return new Response(response.body, {
      headers: {
        'Content-Type': response.headers.get('content-type') || 'video/mp4',
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return json({ error: 'Could not retrieve this camera move.' }, 400);
  }
}
