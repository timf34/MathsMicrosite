import { next } from '@vercel/functions';
import { PASSWORD_PROTECTION_ENABLED, SITE_PASSWORD } from './deployment-settings.js';

export const config = { matcher: '/:path*' };
const cookieName = '__Host-campaign-preview';
const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };
async function accessToken() {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('campaign-preview:' + SITE_PASSWORD));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
function passwordPage(error = false) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Save Maths — Preview</title><style>body{margin:0;background:#fafbf8;color:#222;font-family:Arial,sans-serif;min-height:100dvh;display:grid;place-items:center}main{width:min(340px,calc(100% - 48px));padding:48px 0}h1{font:400 36px Georgia,serif}p{line-height:1.5;color:#555}label{display:block;margin:28px 0 10px}input,button{box-sizing:border-box;width:100%;font:inherit;padding:12px}input{background:transparent;border:0;border-bottom:1px solid #777;border-radius:0}button{margin-top:24px;background:#111;color:white;border:0;border-radius:24px;cursor:pointer}.error{color:#9b2525}</style></head><body><main><h1>Save Maths</h1><p>Enter the password to preview the site.</p><form method="post" action="/__unlock"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus>${error ? '<p class="error" role="alert">Incorrect password. Please try again.</p>' : ''}<button type="submit">Enter</button></form></main></body></html>`, {
    status: 401, headers: { ...privateHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  });
}
export async function checkPassword(request, enabled = PASSWORD_PROTECTION_ENABLED) {
  if (!enabled) return null;
  const url = new URL(request.url);
  const token = await accessToken();
  if (url.pathname === '/__unlock' && request.method === 'POST') {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return new Response('Invalid origin', { status: 403, headers: privateHeaders });
    let password;
    try { password = (await request.formData()).get('password'); } catch { return passwordPage(true); }
    if (password !== SITE_PASSWORD) return passwordPage(true);
    return new Response(null, { status: 303, headers: {
      ...privateHeaders, Location: '/',
      'Set-Cookie': `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
    } });
  }
  const cookies = (request.headers.get('cookie') || '').split(';').map(part => part.trim());
  if (cookies.includes(`${cookieName}=${token}`)) return null;
  if (url.pathname.startsWith('/api/')) return new Response(JSON.stringify({ error: 'Please unlock the site before continuing.' }), { status: 401, headers: { ...privateHeaders, 'Content-Type': 'application/json' } });
  return passwordPage();
}
export default async function middleware(request) {
  return await checkPassword(request) || next();
}
