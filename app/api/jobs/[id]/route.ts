import { falFetch, getKey, json, QUEUE } from '@/lib/fal-server';
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const key = getKey(request),
      { id } = await context.params;
    if (!/^[a-zA-Z0-9-]{10,100}$/.test(id))
      return json({ error: 'Invalid request ID.' }, 400);
    const status = await falFetch(`${QUEUE}/requests/${id}/status`, key);
    if (status.status === 'COMPLETED')
      return json(await falFetch(`${QUEUE}/requests/${id}`, key));
    return json({
      status: status.status,
      queue_position: status.queue_position,
    });
  } catch (e) {
    return json(
      {
        error:
          e instanceof Error ? e.message : 'Could not read generation status.',
      },
      400,
    );
  }
}
