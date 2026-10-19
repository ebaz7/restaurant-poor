import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { defineConfig, Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function sendBotMessageNode(token: string, chatId: string, caption: string, fileName: string, backupJson: string, hostDomain: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const host = hostDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

    let bodyHead = '';
    bodyHead += `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`;
    bodyHead += `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`;
    bodyHead += `--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${fileName}"\r\nContent-Type: application/json\r\n\r\n`;

    const bodyTail = `\r\n--${boundary}--\r\n`;
    const fileBuf = Buffer.from(backupJson, 'utf8');
    const contentLength = Buffer.byteLength(bodyHead) + fileBuf.length + Buffer.byteLength(bodyTail);

    const req = https.request(
      {
        hostname: host,
        port: 443,
        path: `/bot${token}/sendDocument`,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': contentLength,
        },
      },
      (res) => {
        let resData = '';
        res.on('data', (chunk) => { resData += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(resData || '{}');
            if (parsed.ok) {
              resolve({ ok: true });
            } else {
              let errText = parsed.description || `کد ${res.statusCode}`;
              if (errText.includes('chat not found') || errText.includes('blocked') || errText.includes('deactivated')) {
                errText = `کاربر/ادمین با شناسه چت (${chatId}) هنوز ربات را استارت نکرده است. لطفاً در بله به ربات پیام دهید و دکمه /start را بزنید.`;
              }
              resolve({ ok: false, error: errText });
            }
          } catch {
            resolve({ ok: false, error: `پاسخ نامعتبر از سرور (کد ${res.statusCode})` });
          }
        });
      }
    );

    req.on('error', (e) => {
      resolve({ ok: false, error: `خطای شبکه‌ای: ${e.message}` });
    });

    req.write(bodyHead);
    req.write(fileBuf);
    req.write(bodyTail);
    req.end();
  });
}

function centralServerDbPlugin(): Plugin {
  const dataDir = path.resolve(__dirname, 'data');
  const dbFile = path.join(dataDir, 'central_db.json');
  let currentRev = 1;
  let lastRawResetRev = 0;

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
          res.end(JSON.stringify({ ok: true, rev: currentRev, lastRawResetRev, lastModified: new Date().toISOString() }));
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
              const clientRev = Number(payload.clientRevision) || 0;

              // Helper to check if a DB object contains any actual data records
              const hasData = (obj: any) => {
                if (!obj || typeof obj !== 'object') return false;
                const c = Array.isArray(obj.categories) ? obj.categories.length : 0;
                const m = Array.isArray(obj.menuItems) ? obj.menuItems.length : 0;
                const o = Array.isArray(obj.orders) ? obj.orders.length : 0;
                const s = Array.isArray(obj.settings) ? obj.settings.length : 0;
                return (c + m + o + s) > 0;
              };

              let existingData: any = null;
              if (fs.existsSync(dbFile)) {
                try {
                  existingData = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
                } catch {}
              }

              const serverHasData = hasData(existingData);
              const clientHasData = hasData(payload.data);

              // SAFEGUARD: If server already has data and incoming client push is empty, REJECT!
              if (serverHasData && !clientHasData) {
                res.statusCode = 409;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({
                  ok: false,
                  isOutdated: true,
                  rev: currentRev,
                  error: 'دیتابیس سرور دارای اطلاعات موجود است و کلاینت خالی مجاز به پاک کردن آن نیست.'
                }));
                return;
              }

              // REJECT STALE PUSH: If client is behind a Raw Reset or server revision, do NOT overwrite!
              if (lastRawResetRev > 0 && clientRev < lastRawResetRev) {
                res.statusCode = 409;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({
                  ok: false,
                  isOutdated: true,
                  rev: currentRev,
                  error: 'اطلاعات این کلاینت قدیمی است و سرور خام یا بروزرسانی شده است.'
                }));
                return;
              }

              if (payload.data && clientHasData) {
                if (serverHasData) {
                  try {
                    const backupDir = path.join(dataDir, 'backups');
                    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
                    fs.writeFileSync(path.join(backupDir, 'central_db_autobackup.json'), JSON.stringify(existingData, null, 2), 'utf8');
                  } catch {}
                }
                const tmpFile = dbFile + '.tmp';
                fs.writeFileSync(tmpFile, JSON.stringify(payload.data, null, 2), 'utf8');
                fs.renameSync(tmpFile, dbFile);
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

        if (url.pathname === '/api/db/raw-reset' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c.toString()));
          req.on('end', () => {
            try {
              const payload = JSON.parse(body || '{}');
              if (payload.data) {
                const jsonContent = JSON.stringify(payload.data, null, 2);
                fs.writeFileSync(dbFile, jsonContent, 'utf8');
                try {
                  fs.writeFileSync(path.join(dataDir, 'latest_db_backup.json'), jsonContent, 'utf8');
                } catch {
                  // ignore
                }
              }
              currentRev += 1000;
              lastRawResetRev = currentRev;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ ok: true, rev: currentRev }));
            } catch (err: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: err?.message }));
            }
          });
          return;
        }

        if (url.pathname === '/api/send-bot-backup' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c.toString()));
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body || '{}');
              const { token, chatId, caption, fileName, backupJson, platform } = payload;
              const hostDomain = platform === 'bale' ? 'https://tapi.bale.ai' : 'https://api.telegram.org';

              if (!token || !chatId || !backupJson) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'توکن، چت‌آیدی یا دیتای بکاپ ارسال نشده است.' }));
                return;
              }

              const result = await sendBotMessageNode(token, chatId, caption, fileName, backupJson, hostDomain);
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify(result));
            } catch (err: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: err?.message || 'خطا در ارسال بکاپ' }));
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
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    build: {
      // Target Chrome 105+ so Windows 7 (Chrome 109) and all modern browsers render CSS & JS cleanly
      target: ['es2020', 'chrome105', 'edge105', 'safari15'],
      cssTarget: ['chrome105', 'edge105', 'safari15'],
    },
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
