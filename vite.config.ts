import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { defineConfig, Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function centralServerDbPlugin(): Plugin {
  const dataDir = path.resolve(__dirname, 'data');
  const dbFile = path.join(dataDir, 'central_db.json');
  let currentRev = 1;

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  return {
    name: 'central-server-db-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ? new URL(req.url, 'http://localhost:3000') : new URL('http://localhost:3000');

        if (url.pathname === '/api/db/version' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-store');
          res.end(JSON.stringify({ ok: true, rev: currentRev, lastModified: new Date().toISOString() }));
          return;
        }

        if (url.pathname === '/api/db/state' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-store');
          if (fs.existsSync(dbFile)) {
            try {
              const content = fs.readFileSync(dbFile, 'utf8');
              res.end(JSON.stringify({ ok: true, rev: currentRev, data: JSON.parse(content) }));
              return;
            } catch {
              // ignore
            }
          }
          res.end(JSON.stringify({ ok: false, rev: currentRev, data: null }));
          return;
        }

        if (url.pathname === '/api/db/sync' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c.toString()));
          req.on('end', () => {
            try {
              const payload = JSON.parse(body || '{}');
              if (payload.data) {
                fs.writeFileSync(dbFile, JSON.stringify(payload.data, null, 2), 'utf8');
                currentRev += 1;
              }
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ ok: true, rev: currentRev }));
            } catch (err: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: err?.message }));
            }
          });
          return;
        }

        if (url.pathname === '/api/sync-backup' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c.toString()));
          req.on('end', () => {
            try {
              const payload = JSON.parse(body || '{}');
              if (payload.backupJson) {
                fs.writeFileSync(path.join(dataDir, 'latest_db_backup.json'), payload.backupJson, 'utf8');
              }
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ ok: true }));
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    base: '/',
    plugins: [
      react(),
      tailwindcss(),
      centralServerDbPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['apple-touch-icon.png', 'icon.svg', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
        manifest: {
          id: '/',
          name: 'سامانه مدیریت رستوران و حسابداری آرکا (Arka System)',
          short_name: 'آرکا سیستم',
          description: 'نرم‌افزار جامع صندوق فروش، سلف سرویس، آشپزخانه، انبار و حسابداری دوبل رستوران',
          theme_color: '#2563eb',
          background_color: '#f8fafc',
          display: 'standalone',
          orientation: 'any',
          dir: 'rtl',
          lang: 'fa',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
