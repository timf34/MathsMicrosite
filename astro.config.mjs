// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import signatureHandler from './api/signatures.js';

// https://astro.build/config
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || "https://www.savemaths.ie",
  redirects: {
    '/OpenLetter': '/',
    '/Maths curriculum': 'https://thefitzwilliam.com/leaving-cert-maths',
    '/explainer': 'https://thefitzwilliam.com/leaving-cert-maths',
  },
  vite: {
    plugins: [{
      name: 'local-signature-api',
      configureServer(server) {
        const env = loadEnv(server.config.mode, process.cwd(), 'GOOGLE_');
        for (const [key, value] of Object.entries(env)) process.env[key] ??= value;
        server.middlewares.use('/api/signatures', (req, res) => {
          signatureHandler(req, res).catch(() => {
            res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ error: 'Signing is temporarily unavailable.' }));
          });
        });
      },
    }],
  },
});
