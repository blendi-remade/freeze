import { hasServerKey, json } from '@/lib/fal-server';

export const dynamic = 'force-dynamic';

export function GET() {
  return json({ configured: hasServerKey() });
}
