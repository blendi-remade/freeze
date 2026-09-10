export const QUEUE = 'https://queue.fal.run/minimax/h3-max';
export function getKey(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    throw new Error('Cross-origin requests are not allowed.');
  const key = request.headers.get('x-fal-key')?.trim();
  if (!key || key.length > 512 || /[\r\n]/.test(key))
    throw new Error('Connect your fal API key first.');
  return key;
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
export async function falFetch(url: string, key: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(30000),
  });
  const data = (await response.json()) as {
    detail?: string;
    message?: string;
    request_id?: string;
    status?: string;
    queue_position?: number;
    video?: { url: string };
  };
  if (!response.ok) {
    const detail =
      typeof data.detail === 'string'
        ? data.detail
        : typeof data.message === 'string'
          ? data.message
          : `fal returned ${response.status}. Check your key, balance, and input.`;
    throw new Error(detail);
  }
  return data;
}
