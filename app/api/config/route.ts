import { hasServerKey, json } from '@/lib/fal-server';

export function GET() {
  return json({ configured: hasServerKey() });
}
