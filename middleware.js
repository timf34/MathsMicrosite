import { next } from '@vercel/functions';
import { PASSWORD_PROTECTION_ENABLED, SITE_PASSWORD } from './deployment-settings.js';

// Protect every path, including static pages, assets and the signatures API.
export const config = { matcher: '/:path*' };

export function checkPassword(request, enabled = PASSWORD_PROTECTION_ENABLED) {
  if (!enabled) return null;
  const authorization = request.headers.get('authorization') || '';
  try {
    if (/^Basic /i.test(authorization)) {
      const credentials = atob(authorization.slice(6));
      const separator = credentials.indexOf(':');
      if (separator >= 0 && credentials.slice(separator + 1) === SITE_PASSWORD) return null;
    }
  } catch { /* Malformed credentials remain locked out. */ }
  return new Response('This site is temporarily password protected. Enter any username and the campaign password.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Save Maths preview", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export default function middleware(request) {
  return checkPassword(request) || next();
}
