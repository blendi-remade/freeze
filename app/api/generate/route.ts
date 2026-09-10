import { falFetch, getKey, json, QUEUE } from '@/lib/fal-server';
export async function POST(request: Request) {
  try {
    const key = getKey(request);
    if (Number(request.headers.get('content-length') || 0) > 8000000)
      return json({ error: 'The selected frame is too large.' }, 413);
    const raw = await request.text();
    if (raw.length > 8000000)
      return json({ error: 'The selected frame is too large.' }, 413);
    const input = JSON.parse(raw);
    if (
      typeof input.image_url !== 'string' ||
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(input.image_url)
    )
      return json({ error: 'A JPEG frame is required.' }, 400);
    if (
      !['480P', '768P', '1080P'].includes(input.resolution) ||
      input.duration !== 5
    )
      return json({ error: 'Invalid render settings.' }, 400);
    if (
      !Array.isArray(input.camera_trajectory) ||
      input.camera_trajectory.length < 2 ||
      input.camera_trajectory.length > 12 ||
      input.camera_trajectory.some(
        (p: Record<string, number>) =>
          !['time', 'azimuth', 'elevation', 'distance'].every((k) =>
            Number.isFinite(p[k]),
          ) ||
          p.time < 0 ||
          p.time > 1 ||
          Math.abs(p.azimuth) > 360 ||
          Math.abs(p.elevation) > 90 ||
          p.distance <= 0,
      )
    )
      return json({ error: 'Invalid camera path.' }, 400);
    const safeInput = {
      image_url: input.image_url,
      resolution: input.resolution,
      duration: 5,
      camera_trajectory: input.camera_trajectory,
      prompt: String(input.prompt || '').slice(0, 2000),
      prompt_expansion_mode: 'balanced',
      enable_safety_checker: true,
    };
    const result = await falFetch(`${QUEUE}/multi-angle/image-to-video`, key, {
      method: 'POST',
      body: JSON.stringify(safeInput),
    });
    return json({ request_id: result.request_id });
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : 'Could not start generation.' },
      400,
    );
  }
}
