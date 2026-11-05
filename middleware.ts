import { NextResponse, type NextRequest } from 'next/server';

/**
 * Protects the owner dashboard and agent controls with HTTP basic auth
 * when ADMIN_PASSWORD is set (always set it in production).
 */
export function middleware(req: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return NextResponse.next();
  const header = req.headers.get('authorization') ?? '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [, pass] = atob(encoded).split(':');
    if (pass === password) return NextResponse.next();
  }
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="admin"' },
  });
}

export const config = {
  matcher: ['/admin/:path*', '/api/agents/:path*', '/api/state', '/api/candidates/:path*', '/api/orders/:path*', '/api/dev/:path*'],
};
