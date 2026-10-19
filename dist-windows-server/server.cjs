const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const DIST_DIR = path.join(__dirname, 'dist');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'central_db.json');
const LICENSE_FILE = path.join(DATA_DIR, 'server_license.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const MASTER_SECRET_SALT = 'ARKA_POS_OFFLINE_SECRET_SALT_2026_x987654321_REST_SYS';
const MASTER_EMERGENCY_KEY = 'ARKA-9999-MASTER-OVERRIDE-KEY';

// Ensure data and backup directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function fnvFallbackHex(str) {
  let hash1 = 2166136261;
  let hash2 = 30503041;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash1 ^= char;
    hash1 = Math.imul(hash1, 16777619);
    hash2 ^= char;
    hash2 = Math.imul(hash2, 16777619);
  }
  const h1Hex = (hash1 >>> 0).toString(16).padStart(8, '0');
  const h2Hex = (hash2 >>> 0).toString(16).padStart(8, '0');
  return h1Hex + h2Hex + h1Hex + h2Hex;
}

function isKeyValidForCode(userKey, sysCode) {
  if (!userKey || !sysCode) return { valid: false, isEmergency: false };
  const cleanKey = String(userKey).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanEmergency = MASTER_EMERGENCY_KEY.replace(/[^A-Z0-9]/g, '');
  if (cleanKey === cleanEmergency) {
    return { valid: true, isEmergency: true };
  }
  const cleanCode = String(sysCode).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const combined = `${cleanCode}_${MASTER_SECRET_SALT}`;
  const shaHash = crypto.createHash('sha256').update(combined, 'utf8').digest('hex').substring(0, 16).toUpperCase();
  const fnvHash = fnvFallbackHex(combined).substring(0, 16).toUpperCase();
  if (cleanKey === shaHash || cleanKey === fnvHash) {
    return { valid: true, isEmergency: false };
  }
  return { valid: false, isEmergency: false };
}

function getOrCreateServerLicenseRecord() {
  let record = null;
  if (fs.existsSync(LICENSE_FILE)) {
    try {
      record = JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8'));
    } catch (e) {}
  }

  // Also check if central_db.json already has a valid centralLicenseInfo
  if ((!record || !record.isActivated) && fs.existsSync(DB_FILE)) {
    try {
      const dbData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      const firstSetting = Array.isArray(dbData?.settings) ? dbData.settings[0] : null;
      if (firstSetting?.centralLicenseInfo?.isActivated && firstSetting.centralLicenseInfo.licenseKey) {
        const cli = firstSetting.centralLicenseInfo;
        const check = isKeyValidForCode(cli.licenseKey, cli.systemCode);
        if (check.valid) {
          record = {
            systemCode: cli.systemCode,
            licenseKey: cli.licenseKey,
            activatedAt: cli.activatedAt || new Date().toISOString(),
            isActivated: true,
            isEmergencyOverride: check.isEmergency,
          };
          try {
            fs.writeFileSync(LICENSE_FILE, JSON.stringify(record, null, 2), 'utf8');
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  if (record && record.systemCode) {
    if (record.licenseKey) {
      const check = isKeyValidForCode(record.licenseKey, record.systemCode);
      record.isActivated = check.valid;
      record.isEmergencyOverride = check.isEmergency;
    } else {
      record.isActivated = false;
    }
    return record;
  }

  // Generate deterministic Central Server System Code
  const cpuModel = (os.cpus() && os.cpus()[0] && os.cpus()[0].model) || 'CPU';
  const rawHw = `ARKA_CENTRAL_SRV_${os.hostname()}_${os.platform()}_${os.arch()}_${cpuModel}`;
  const hash = crypto.createHash('sha256').update(rawHw, 'utf8').digest('hex').toUpperCase();
  const systemCode = `ARKA-${hash.substring(0, 4)}-${hash.substring(4, 8)}-${hash.substring(8, 12)}`;

  const initialRecord = {
    systemCode,
    isActivated: false,
    licenseKey: '',
    activatedAt: null,
  };
  try {
    fs.writeFileSync(LICENSE_FILE, JSON.stringify(initialRecord, null, 2), 'utf8');
  } catch (e) {}
  return initialRecord;
}

// Auto-seed central_db.json from backup if missing
if (!fs.existsSync(DB_FILE)) {
  const seedBackup = path.join(DATA_DIR, 'latest_db_backup.json');
  if (fs.existsSync(seedBackup)) {
    try {
      fs.copyFileSync(seedBackup, DB_FILE);
      console.log('[+] Initialized central_db.json from latest_db_backup.json');
    } catch (e) {
      console.warn('[-] Could not seed database:', e.message);
    }
  }
}

let currentRev = 1;
let lastRawResetRev = 0;

try {
  if (fs.existsSync(DB_FILE)) {
    const stat = fs.statSync(DB_FILE);
    currentRev = Math.max(1, Math.floor(stat.mtimeMs / 1000));
  }
} catch (e) {
  // ignore
}

// Get all non-internal IPv4 addresses for LAN sharing
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    const ifaceList = interfaces[name];
    if (!ifaceList) continue;
    for (const iface of ifaceList) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

function hasDbData(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const c = Array.isArray(obj.categories) ? obj.categories.length : 0;
  const m = Array.isArray(obj.menuItems) ? obj.menuItems.length : 0;
  const o = Array.isArray(obj.orders) ? obj.orders.length : 0;
  const s = Array.isArray(obj.settings) ? obj.settings.length : 0;
  return (c + m + o + s) > 0;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const server = http.createServer((req, res) => {
  // Set standard CORS headers for LAN clients & Tauri Desktop App
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    // Central Server License Status (Single activation for the entire LAN)
    if (parsedUrl.pathname === '/api/license/status' && req.method === 'GET') {
      const record = getOrCreateServerLicenseRecord();
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(JSON.stringify({
        ok: true,
        isActivated: Boolean(record.isActivated),
        systemCode: record.systemCode,
        licenseKey: record.isActivated ? record.licenseKey : undefined,
        activatedAt: record.activatedAt || undefined,
        isEmergencyOverride: Boolean(record.isEmergencyOverride),
        serverHostname: os.hostname(),
      }));
      return;
    }

    if (parsedUrl.pathname === '/api/license/activate' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const userKey = String(payload.licenseKey || '').trim().toUpperCase();
          const clientSystemCode = String(payload.clientSystemCode || '').trim().toUpperCase();
          const record = getOrCreateServerLicenseRecord();

          let targetCode = record.systemCode;
          let check = isKeyValidForCode(userKey, record.systemCode);

          // Also accept if the user generated the key for the clientSystemCode displayed on their screen
          if (!check.valid && clientSystemCode) {
            const clientCheck = isKeyValidForCode(userKey, clientSystemCode);
            if (clientCheck.valid) {
              check = clientCheck;
              targetCode = clientSystemCode;
            }
          }

          if (!check.valid) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              ok: false,
              message: 'کد فعال‌سازی وارد شده معتبر نمی‌باشد.',
            }));
            return;
          }

          const updatedRecord = {
            systemCode: targetCode,
            licenseKey: userKey,
            activatedAt: new Date().toISOString(),
            isActivated: true,
            isEmergencyOverride: check.isEmergency,
          };

          fs.writeFileSync(LICENSE_FILE, JSON.stringify(updatedRecord, null, 2), 'utf8');

          // Also persist in central_db.json settings so DB sync carries it too
          if (fs.existsSync(DB_FILE)) {
            try {
              const dbData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
              if (Array.isArray(dbData?.settings) && dbData.settings.length > 0) {
                dbData.settings[0].centralLicenseInfo = updatedRecord;
                fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2), 'utf8');
                currentRev += 1;
              }
            } catch (e) {}
          }

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            ok: true,
            ...updatedRecord,
            message: 'لایسنس روی سرور مرکزی فعال شد و تمامی کلاینت‌های شبکه به صورت خودکار فعال گردیدند.',
          }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, message: err.message }));
        }
      });
      return;
    }

    // Central Server REST API for Multi-Terminal Network Sync
    if (parsedUrl.pathname === '/api/db/version' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(JSON.stringify({
        ok: true,
        rev: currentRev,
        lastRawResetRev,
        lastModified: new Date().toISOString(),
      }));
      return;
    }

    if (parsedUrl.pathname === '/api/db/state' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      if (fs.existsSync(DB_FILE)) {
        try {
          const content = fs.readFileSync(DB_FILE, 'utf8');
          res.end(JSON.stringify({ ok: true, rev: currentRev, data: JSON.parse(content) }));
          return;
        } catch (e) {
          // ignore error
        }
      }
      res.end(JSON.stringify({ ok: false, rev: currentRev, data: null }));
      return;
    }

    if (parsedUrl.pathname === '/api/network/info' && req.method === 'GET') {
      const localIps = getLocalIpAddresses();
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store',
      });
      res.end(JSON.stringify({
        ok: true,
        hostname: os.hostname(),
        platform: os.platform(),
        port: PORT,
        localIps,
        primaryUrl: localIps.length > 0 ? `http://${localIps[0]}:${PORT}` : `http://localhost:${PORT}`,
        serverTime: new Date().toISOString(),
        rev: currentRev,
      }));
      return;
    }

    if (parsedUrl.pathname === '/api/db/sync' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const clientRev = Number(payload.clientRevision) || 0;

          let existingData = null;
          if (fs.existsSync(DB_FILE)) {
            try {
              existingData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            } catch (e) {}
          }

          const serverHasData = hasDbData(existingData);
          const clientHasData = hasDbData(payload.data);

          // SAFEGUARD: If server has existing data and incoming push is empty, REJECT!
          if (serverHasData && !clientHasData) {
            res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
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
            res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
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
                fs.writeFileSync(
                  path.join(BACKUP_DIR, 'central_db_autobackup.json'),
                  JSON.stringify(existingData, null, 2),
                  'utf8'
                );
              } catch (e) {}
            }
            const tmpFile = DB_FILE + '.tmp';
            fs.writeFileSync(tmpFile, JSON.stringify(payload.data, null, 2), 'utf8');
            fs.renameSync(tmpFile, DB_FILE);
            currentRev += 1;
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, rev: currentRev }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    if (parsedUrl.pathname === '/api/db/raw-reset' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          if (payload.data) {
            const jsonContent = JSON.stringify(payload.data, null, 2);
            fs.writeFileSync(DB_FILE, jsonContent, 'utf8');
            try {
              fs.writeFileSync(path.join(DATA_DIR, 'latest_db_backup.json'), jsonContent, 'utf8');
            } catch (e) {}
          }
          currentRev += 1000;
          lastRawResetRev = currentRev;
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, rev: currentRev }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    // Static file serving
    let safePath = path.normalize(decodeURIComponent(parsedUrl.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (safePath === '/' || safePath === '\\') {
      safePath = '/index.html';
    }

    let filePath = path.join(DIST_DIR, safePath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Internal Server Error');
        return;
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': ext === '.html' ? 'no-cache, no-store, must-revalidate' : 'public, max-age=31536000',
      });
      res.end(content);
    });
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server Error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const localIps = getLocalIpAddresses();
  console.log('\n' + '═'.repeat(66));
  console.log('       سامانه جامع رستوران و کترینگ آرکا - سرور مرکزی');
  console.log('         ARKA RESTAURANT CENTRAL PRODUCTION SERVER');
  console.log('═'.repeat(66));
  console.log(`[✔] سرور مرکزی با موفقیت روی پورت ${PORT} آماده به کار شد.`);
  console.log(`[★] دسترسی روی همین رایانه:   http://localhost:${PORT}`);
  if (localIps.length > 0) {
    console.log('[★] آدرس‌های دسترسی شبکه محلی (LAN / Wi-Fi):');
    localIps.forEach((ip) => {
      console.log(`    👉 http://${ip}:${PORT}`);
    });
    console.log('\n[📱] تبلت‌ها، موبایل‌های گارسون، پنل آشپزخانه و وب‌اپلیکیشن (PWA)');
    console.log(`     می‌توانند با وارد کردن آدرس فوق در مرورگر به سرور وصل شوند.`);
  } else {
    console.log('[!] هیچ کارت شبکه فعال دارای IP محلی شناسایی نشد (فقط لوکال‌هاست فعال است).');
  }
  console.log('═'.repeat(66) + '\n');
});
