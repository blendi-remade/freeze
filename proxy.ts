import { NextRequest, NextResponse } from 'next/server';
import { hasWorkspaceAccess } from './lib/access';

export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === 'development') return NextResponse.next();
    return new NextResponse('Workspace access is not configured.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  if (hasWorkspaceAccess(request.headers.get('authorization'), password))
    return NextResponse.next();
  return new NextResponse('Sign in to the private Freeze workspace.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Freeze workspace", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  });
}

// Protect the editor and every API route, including direct generation requests.
// Only the public app bundles, artwork and FFmpeg engine are exempt.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.svg|images/|ffmpeg/).*)'],
};
