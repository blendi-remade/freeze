import { createHash, timingSafeEqual } from 'node:crypto';

// Hash both sides to a fixed length before comparing; never log credentials.
export function hasWorkspaceAccess(header: string | null, password: string) {
  if (!password || !header?.startsWith('Basic ')) return false;
  const supplied = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(supplied), digest(`freeze:${password}`));
}
