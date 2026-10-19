#!/usr/bin/env bash
# ==============================================================================
# Arka Restaurant Software - One-Click Iran-Optimized Installer & Manager
# Networked Central Server & Multi-Terminal Live Sync Architecture
# Compatible with National Internet (Net Melli) & Local Mirrors / Caching Proxies
# Repository: https://github.com/ebaz7/restaurant-poor.git
# ==============================================================================

APP_NAME="arka-restaurant"
INSTALL_DIR="/opt/arka-restaurant"
REPO_URL="https://github.com/ebaz7/restaurant-poor.git"

print_banner() {
    clear
    echo "================================================================"
    echo "   Arka Restaurant Management Software - Linux Installer & Manager"
    echo "   Networked Central Server, Multi-Terminal Live Sync & SSL"
    echo "================================================================"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo "[!] Please run this script with root privileges (sudo bash)."
        exit 1
    fi
}

ensure_swap() {
    if [ "$(swapon --show | wc -l)" -eq 0 ]; then
        echo "[i] Configuring 2GB swap file for low-memory VPS stability..."
        fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 2>/dev/null || true
        chmod 600 /swapfile 2>/dev/null || true
        mkswap /swapfile 2>/dev/null || true
        swapon /swapfile 2>/dev/null || true
    fi
}

setup_iran_mirrors() {
    echo "[i] Configuring domestic registry mirrors (Net Melli & ArvanCloud)..."
    mkdir -p /etc/docker
    cat <<EOF > /etc/docker/daemon.json
{
  "registry-mirrors": [
    "https://docker.arvancloud.ir",
    "https://mirror.gcr.io"
  ]
}
EOF
    systemctl restart docker 2>/dev/null || true
}

create_server_script() {
    mkdir -p "$INSTALL_DIR/data"
    cat <<'EOF' > "$INSTALL_DIR/server.cjs"
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

function sendBotMessageNode(token, chatId, caption, fileName, backupJson, hostDomain) {
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

const PORT = Number(process.env.PORT) || 3000;
const DIST_DIR = path.join(__dirname, 'dist');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'central_db.json');
const LICENSE_FILE = path.join(DATA_DIR, 'server_license.json');
const os = require('os');
const crypto = require('crypto');

const MASTER_SECRET_SALT = 'ARKA_POS_OFFLINE_SECRET_SALT_2026_x987654321_REST_SYS';
const MASTER_EMERGENCY_KEY = 'ARKA-9999-MASTER-OVERRIDE-KEY';

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
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

let currentRev = 1;
let lastRawResetRev = 0;
try {
  if (fs.existsSync(DB_FILE)) {
    const stat = fs.statSync(DB_FILE);
    currentRev = Math.floor(stat.mtimeMs / 1000);
  }
} catch (e) {}

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
  '.exe': 'application/vnd.microsoft.portable-executable',
  '.msi': 'application/x-msi',
  '.zip': 'application/zip',
  '.bat': 'application/x-msdos-program',
};

const server = http.createServer((req, res) => {
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
        } catch (e) {}
      }
      res.end(JSON.stringify({ ok: false, rev: currentRev, data: null }));
      return;
    }

    if (parsedUrl.pathname === '/api/db/sync' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const clientRev = Number(payload.clientRevision) || 0;

          function hasDbData(obj) {
            if (!obj || typeof obj !== 'object') return false;
            const c = Array.isArray(obj.categories) ? obj.categories.length : 0;
            const m = Array.isArray(obj.menuItems) ? obj.menuItems.length : 0;
            const o = Array.isArray(obj.orders) ? obj.orders.length : 0;
            const s = Array.isArray(obj.settings) ? obj.settings.length : 0;
            return (c + m + o + s) > 0;
          }

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
                const backupDir = path.join(DATA_DIR, 'backups');
                if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
                fs.writeFileSync(path.join(backupDir, 'central_db_autobackup.json'), JSON.stringify(existingData, null, 2), 'utf8');
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

    if (req.method === 'POST' && parsedUrl.pathname === '/api/send-bot-backup') {
      let body = '';
      req.on('data', (chunk) => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          const { token, chatId, caption, fileName, backupJson, platform } = payload;
          const hostDomain = platform === 'bale' ? 'https://tapi.bale.ai' : 'https://api.telegram.org';

          if (!token || !chatId || !backupJson) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: 'توکن، چت‌آیدی یا دیتای بکاپ ارسال نشده است.' }));
            return;
          }

          const result = await sendBotMessageNode(token, chatId, caption, fileName, backupJson, hostDomain);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/sync-backup') {
      let body = '';
      req.on('data', (chunk) => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          if (payload.backupJson) {
            fs.writeFileSync(path.join(DATA_DIR, 'latest_db_backup.json'), payload.backupJson, 'utf8');
            if (!fs.existsSync(DB_FILE)) {
              fs.writeFileSync(DB_FILE, payload.backupJson, 'utf8');
            }
          }
          if (payload.settings) {
            const s = payload.settings;
            const envLines = [
              `RESTAURANT_NAME="${String(s.restaurantName || 'Arka').replace(/"/g, '')}"`,
              `BALE_BOT_TOKEN="${String(s.baleBotToken || '').trim()}"`,
              `BALE_CHAT_ID="${String(s.baleChatId || '').trim()}"`,
              `TELEGRAM_BOT_TOKEN="${String(s.telegramBotToken || '').trim()}"`,
              `TELEGRAM_CHAT_ID="${String(s.telegramChatId || '').trim()}"`,
            ];
            fs.writeFileSync(path.join(DATA_DIR, 'bot_config.env'), envLines.join('\n') + '\n', 'utf8');
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false }));
        }
      });
      return;
    }

    // Static Assets & Anti-Cache Headers for HTML & Service Workers
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

      // Enforce zero cache for HTML and Service Worker scripts so updates apply immediately
      if (ext === '.html' || safePath.includes('sw.js') || safePath.includes('registerSW')) {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
        });
      } else {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000',
        });
      }
      res.end(content);
    });
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server Error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Arka Restaurant Central Server running on http://0.0.0.0:${PORT}`);
});
EOF
}

setup_official_ssl() {
    local DOMAIN="$1"
    local PORT="${2:-3000}"

    if [ -z "$DOMAIN" ]; then
        read -p "[-] Enter your domain name (e.g. foodmix.ir): " DOMAIN
    fi
    DOMAIN=$(echo "$DOMAIN" | tr '[:upper:]' '[:lower:]' | xargs)

    if [ -z "$DOMAIN" ]; then
        echo "[!] Domain cannot be empty."
        return 1
    fi

    echo "[+] Starting Official Let's Encrypt SSL Setup for ${DOMAIN}..."
    apt-get update -y
    apt-get install -y nginx certbot python3-certbot-nginx dnsutils ufw || true

    # Stop conflicting servers holding port 80
    systemctl stop apache2 2>/dev/null || true
    systemctl disable apache2 2>/dev/null || true

    # Open firewall ports
    if command -v ufw &> /dev/null; then
        ufw allow 80/tcp 2>/dev/null || true
        ufw allow 443/tcp 2>/dev/null || true
        ufw allow "${PORT}/tcp" 2>/dev/null || true
    fi

    # Verify DNS resolution
    local SERVER_IP
    SERVER_IP=$(hostname -I | awk '{print $1}')
    local RESOLVED_IP
    RESOLVED_IP=$(getent hosts "${DOMAIN}" | awk '{print $1}' | head -n1)

    echo "[i] Server Public IP: $SERVER_IP"
    echo "[i] Domain Resolved IP: ${RESOLVED_IP:-Not resolved (NXDOMAIN)}"

    if [ -z "$RESOLVED_IP" ]; then
        echo "----------------------------------------------------------------"
        echo "[!] هشدار مهم DNS / WARNING: Domain '${DOMAIN}' has NO active DNS A-record!"
        echo "[i] علت: برای دامنه‌های ir. باید در پنل ایرنیک (nic.ir) یا کلودفلر/آروان، رکورد A ست شود."
        echo "[i] IP سرور شما: ${SERVER_IP}"
        echo "[i] راهنما: در پنل مدیریت دامنه، رکورد A برای @ و www را به ${SERVER_IP} متصل کنید."
        echo "[v] دسترسی فوری بدون نیاز به دامنه:"
        echo "    شما هم‌اکنون می‌توانید مستقیماً از طریق آی‌پی سرور بدون دامنه وارد برنامه شوید:"
        echo "    >>> http://${SERVER_IP} <<<"
        echo "----------------------------------------------------------------"
    fi

    # Prepare standard Nginx HTTP proxy first so certbot webroot/nginx plugin can verify challenge
    cat <<EOF > /etc/nginx/sites-available/arka-restaurant.conf
server {
    listen 80 default_server;
    server_name _ ${DOMAIN} www.${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
    mkdir -p /var/www/html
    ln -sf /etc/nginx/sites-available/arka-restaurant.conf /etc/nginx/sites-enabled/arka-restaurant.conf
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
    nginx -t && systemctl enable --now nginx && systemctl reload nginx || systemctl restart nginx || true

    echo "[i] Requesting official certificate from Let's Encrypt for ${DOMAIN} & www.${DOMAIN}..."
    local CERT_SUCCESS=0

    # If certificate already exists on server disk
    if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
        echo "[v] Active Let's Encrypt certificate found at /etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
        CERT_SUCCESS=1
    else
        # Try webroot challenge first (non-disruptive)
        if certbot certonly --webroot -w /var/www/html -d "${DOMAIN}" -d "www.${DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email --expand; then
            CERT_SUCCESS=1
        elif certbot certonly --webroot -w /var/www/html -d "${DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email --expand; then
            CERT_SUCCESS=1
        else
            echo "[!] Webroot challenge failed. Attempting standalone challenge..."
            systemctl stop nginx || true
            if certbot certonly --standalone -d "${DOMAIN}" -d "www.${DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email --expand || certbot certonly --standalone -d "${DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email --expand; then
                CERT_SUCCESS=1
            fi
            systemctl start nginx || true
        fi
    fi

    if [ "$CERT_SUCCESS" -eq 1 ] && [ -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
        local CERT_FILE="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
        local KEY_FILE="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"

        # Remove default conflicting site configs
        rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-available/default 2>/dev/null || true

        # Ensure internal app port is not 80 or 443
        local APP_TARGET_PORT="$PORT"
        if [ "$APP_TARGET_PORT" == "80" ] || [ "$APP_TARGET_PORT" == "443" ]; then
            APP_TARGET_PORT="3000"
        fi

        cat <<EOF > /etc/nginx/sites-available/arka-restaurant.conf
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _ ${DOMAIN} www.${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name _ ${DOMAIN} www.${DOMAIN};

    ssl_certificate ${CERT_FILE};
    ssl_certificate_key ${KEY_FILE};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://127.0.0.1:${APP_TARGET_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
        ln -sf /etc/nginx/sites-available/arka-restaurant.conf /etc/nginx/sites-enabled/arka-restaurant.conf
        nginx -t && systemctl reload nginx || systemctl restart nginx
        echo "================================================================"
        echo "[v] SUCCESS! Official Let's Encrypt SSL is ACTIVE for https://${DOMAIN}"
        echo "[v] Trusted Green Lock is now active in Chrome, Android and all browsers!"
        echo "================================================================"
        return 0
    else
        echo "================================================================"
        echo "[!] Let's Encrypt could not verify ${DOMAIN}."
        echo "[i] Common causes:"
        echo "    1. The domain DNS A-record is not pointing to this server IP ($SERVER_IP)."
        echo "    2. Port 80 is blocked by your VPS provider or firewall."
        echo "    3. If using Cloudflare or ArvanCloud CDN, set SSL Mode to 'Full' or use self-signed mode."
        echo "================================================================"
        return 1
    fi
}

configure_ssl_and_nginx() {
    local DOMAIN="$1"
    local PORT="$2"
    local SSL_MODE="$3"
    local SERVER_IP="$4"

    if [ "$SSL_MODE" == "letsencrypt" ]; then
        setup_official_ssl "$DOMAIN" "$PORT"
        return $?
    fi

    # Fallback to local / CDN self-signed SSL
    echo "[i] Configuring Internal / CDN SSL for $DOMAIN..."
    apt-get install -y nginx openssl || true
    systemctl stop apache2 2>/dev/null || true
    systemctl disable apache2 2>/dev/null || true

    local SSL_DIR="/etc/nginx/ssl"
    mkdir -p "$SSL_DIR"
    local CERT_FILE="$SSL_DIR/${DOMAIN}.crt"
    local KEY_FILE="$SSL_DIR/${DOMAIN}.key"

    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout "$KEY_FILE" \
        -out "$CERT_FILE" \
        -subj "/C=IR/ST=Tehran/L=Tehran/O=ArkaRestaurant/CN=${DOMAIN}" \
        -addext "subjectAltName=DNS:${DOMAIN},DNS:www.${DOMAIN},IP:${SERVER_IP}" 2>/dev/null || \
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout "$KEY_FILE" \
        -out "$CERT_FILE" \
        -subj "/C=IR/ST=Tehran/L=Tehran/O=ArkaRestaurant/CN=${DOMAIN}"

    chmod 600 "$KEY_FILE"
    chmod 644 "$CERT_FILE"

    cat <<EOF > /etc/nginx/sites-available/arka-restaurant.conf
server {
    listen 80 default_server;
    server_name _ ${DOMAIN} www.${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}

server {
    listen 443 ssl default_server;
    server_name _ ${DOMAIN} www.${DOMAIN};

    ssl_certificate ${CERT_FILE};
    ssl_certificate_key ${KEY_FILE};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
    ln -sf /etc/nginx/sites-available/arka-restaurant.conf /etc/nginx/sites-enabled/arka-restaurant.conf
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
    nginx -t && systemctl enable --now nginx && systemctl reload nginx || systemctl restart nginx || true
    echo "[v] Internal SSL active for $DOMAIN"
}

send_backup_to_bots() {
    local ARCHIVE_FILE="$1"
    local TRIGGER_REASON="${2:-Manual Backup}"
    local BOT_ENV_FILE="$INSTALL_DIR/data/bot_config.env"
    local FALLBACK_ENV_FILE="/opt/arka-backup/bot_config.env"

    BALE_BOT_TOKEN=""
    BALE_CHAT_ID=""
    TELEGRAM_BOT_TOKEN=""
    TELEGRAM_CHAT_ID=""
    RESTAURANT_NAME="Arka Restaurant"

    if [ -f "$BOT_ENV_FILE" ]; then
        # shellcheck disable=SC1090
        source "$BOT_ENV_FILE" 2>/dev/null || true
        mkdir -p /opt/arka-backup
        cp -f "$BOT_ENV_FILE" "$FALLBACK_ENV_FILE" 2>/dev/null || true
    elif [ -f "$FALLBACK_ENV_FILE" ]; then
        # shellcheck disable=SC1090
        source "$FALLBACK_ENV_FILE" 2>/dev/null || true
    fi

    local CAPTION="Arka Restaurant Backup | Store: ${RESTAURANT_NAME} | Trigger: ${TRIGGER_REASON} | Date: $(date '+%Y-%m-%d %H:%M:%S')"
    local DB_JSON_FILE="$INSTALL_DIR/data/central_db.json"
    if [ ! -f "$DB_JSON_FILE" ]; then
        DB_JSON_FILE="$INSTALL_DIR/data/latest_db_backup.json"
    fi
    local SENT_ANY=0

    if [ -n "$BALE_BOT_TOKEN" ] && [ -n "$BALE_CHAT_ID" ]; then
        echo "[i] Sending backup to Bale Bot (Chat ID: $BALE_CHAT_ID)..."
        if [ -f "$DB_JSON_FILE" ]; then
            curl -s -X POST "https://tapi.bale.ai/bot${BALE_BOT_TOKEN}/sendDocument" \
                -F "chat_id=${BALE_CHAT_ID}" \
                -F "caption=${CAPTION} (Database JSON)" \
                -F "document=@${DB_JSON_FILE}" >/dev/null 2>&1 || true
        fi
        if [ -f "$ARCHIVE_FILE" ]; then
            if curl -s -f -X POST "https://tapi.bale.ai/bot${BALE_BOT_TOKEN}/sendDocument" \
                -F "chat_id=${BALE_CHAT_ID}" \
                -F "caption=${CAPTION} (Full Archive)" \
                -F "document=@${ARCHIVE_FILE}" >/dev/null 2>&1; then
                echo "[v] Backup successfully delivered to Bale Bot!"
                SENT_ANY=1
            fi
        fi
    fi

    if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
        echo "[i] Sending backup to Telegram Bot (Chat ID: $TELEGRAM_CHAT_ID)..."
        if [ -f "$DB_JSON_FILE" ]; then
            curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument" \
                -F "chat_id=${TELEGRAM_CHAT_ID}" \
                -F "caption=${CAPTION} (Database JSON)" \
                -F "document=@${DB_JSON_FILE}" >/dev/null 2>&1 || true
        fi
        if [ -f "$ARCHIVE_FILE" ]; then
            if curl -s -f -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument" \
                -F "chat_id=${TELEGRAM_CHAT_ID}" \
                -F "caption=${CAPTION} (Full Archive)" \
                -F "document=@${ARCHIVE_FILE}" >/dev/null 2>&1; then
                echo "[v] Backup successfully delivered to Telegram Bot!"
                SENT_ANY=1
            fi
        fi
    fi

    if [ "$SENT_ANY" -eq 0 ] && [ -z "$BALE_BOT_TOKEN" ] && [ -z "$TELEGRAM_BOT_TOKEN" ]; then
        echo "[i] No Bale or Telegram Bot configured yet. Skipping bot delivery."
    fi
}

configure_bots_cli() {
    print_banner
    echo "[+] Configure Bale & Telegram Auto-Backup Bots (Pre-Update & Scheduled)"
    mkdir -p "$INSTALL_DIR/data" /opt/arka-backup
    local BOT_ENV_FILE="$INSTALL_DIR/data/bot_config.env"
    if [ -f "$BOT_ENV_FILE" ]; then
        # shellcheck disable=SC1090
        source "$BOT_ENV_FILE" 2>/dev/null || true
    fi

    read -p "[-] Enter Bale Bot Token (current: ${BALE_BOT_TOKEN:-none}): " NEW_BALE_TOKEN
    BALE_BOT_TOKEN=${NEW_BALE_TOKEN:-$BALE_BOT_TOKEN}
    read -p "[-] Enter Bale Chat ID (current: ${BALE_CHAT_ID:-none}): " NEW_BALE_CHAT
    BALE_CHAT_ID=${NEW_BALE_CHAT:-$BALE_CHAT_ID}

    read -p "[-] Enter Telegram Bot Token (current: ${TELEGRAM_BOT_TOKEN:-none}): " NEW_TG_TOKEN
    TELEGRAM_BOT_TOKEN=${NEW_TG_TOKEN:-$TELEGRAM_BOT_TOKEN}
    read -p "[-] Enter Telegram Chat ID (current: ${TELEGRAM_CHAT_ID:-none}): " NEW_TG_CHAT
    TELEGRAM_CHAT_ID=${NEW_TG_CHAT:-$TELEGRAM_CHAT_ID}

    cat <<EOF > "$BOT_ENV_FILE"
RESTAURANT_NAME="${RESTAURANT_NAME:-Arka Restaurant}"
BALE_BOT_TOKEN="${BALE_BOT_TOKEN}"
BALE_CHAT_ID="${BALE_CHAT_ID}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID}"
EOF
    cp -f "$BOT_ENV_FILE" /opt/arka-backup/bot_config.env 2>/dev/null || true
    echo "[v] Bot configuration saved! Backups will automatically be sent to configured bots before every update."
}

show_network_sync_status() {
    print_banner
    echo "[+] Central Server & Network Terminal Sync Status"
    local SERVER_IP
    SERVER_IP=$(hostname -I | awk '{print $1}')
    local DB_FILE="$INSTALL_DIR/data/central_db.json"

    echo "----------------------------------------------------------------"
    echo "[v] Central Server IP:          $SERVER_IP"
    echo "[v] Service Status:             $(systemctl is-active arka-restaurant 2>/dev/null || docker ps -f name=arka-restaurant --format '{{.Status}}')"
    if [ -f "$DB_FILE" ]; then
        local SIZE
        SIZE=$(du -h "$DB_FILE" | awk '{print $1}')
        local ORDERS_COUNT
        ORDERS_COUNT=$(grep -o '"invoiceNumber"' "$DB_FILE" | wc -l)
        echo "[v] Central Database:           Active ($SIZE, ~${ORDERS_COUNT} orders)"
        echo "[v] Database File:              $DB_FILE"
    else
        echo "[!] Central Database:           Waiting for first client sync"
    fi
    echo "----------------------------------------------------------------"
    echo "Client Connection URLs for LAN Terminals & Mobile Waiters:"
    echo "1. Any PC / Laptop on LAN:      http://${SERVER_IP}:3000"
    echo "2. Cashier 2 / Mobile Devices:  http://${SERVER_IP}:3000"
    if [ -f "/etc/nginx/sites-available/arka-restaurant.conf" ]; then
        local DOMAIN
        DOMAIN=$(grep -m1 "server_name" /etc/nginx/sites-available/arka-restaurant.conf | awk '{print $2}' | tr -d ';')
        if [ -n "$DOMAIN" ]; then
            echo "3. Public Domain URL:           https://${DOMAIN}"
        fi
    fi
    echo "================================================================"
}

install_app() {
    print_banner
    echo "[+] Starting Arka installation process..."

    ensure_swap

    apt-get update -y
    apt-get install -y curl git ca-certificates openssl lsof dnsutils ufw || true

    if [ -f "./package.json" ] && [ "$(pwd)" != "$INSTALL_DIR" ]; then
        echo "[v] Project files found in current directory. Copying to $INSTALL_DIR..."
        mkdir -p "$INSTALL_DIR"
        cp -rf ./* "$INSTALL_DIR"/ 2>/dev/null || true
    elif [ -d "$INSTALL_DIR/.git" ]; then
        echo "[i] Existing installation found in $INSTALL_DIR. Pulling latest updates..."
        cd "$INSTALL_DIR" || exit 1
        git fetch --all && git reset --hard origin/main || true
    else
        echo "[i] Cloning source code from GitHub..."
        rm -rf "$INSTALL_DIR"
        git clone "$REPO_URL" "$INSTALL_DIR" || {
            echo "[!] Failed to clone repository. Please upload project files to $INSTALL_DIR and run again."
            exit 1
        }
    fi

    cd "$INSTALL_DIR" || exit 1

    read -p "[-] Enter desired port for running the app (default 3000): " PORT
    PORT=${PORT:-3000}

    read -p "[-] Do you want to configure Domain & SSL? (y/n, default y): " USE_SSL
    USE_SSL=${USE_SSL:-y}

    DOMAIN=""
    SSL_MODE="letsencrypt"

    if [[ "$USE_SSL" =~ ^[Yy]$ ]]; then
        read -p "[-] Enter your domain name (e.g. foodmix.ir): " DOMAIN
        DOMAIN=$(echo "$DOMAIN" | tr '[:upper:]' '[:lower:]' | xargs)
        echo ""
        echo "Select SSL Certificate Mode:"
        echo "1) Official Free Let's Encrypt SSL (Trusted Green Lock in Chrome/Mobile - RECOMMENDED)"
        echo "2) Internal / Iran CDN SSL (Self-signed fallback)"
        read -p "[-] Choose option (1 or 2, default 1): " SSL_CHOICE
        SSL_CHOICE=${SSL_CHOICE:-1}
        if [ "$SSL_CHOICE" == "2" ]; then
            SSL_MODE="iran_local"
        else
            SSL_MODE="letsencrypt"
        fi
    fi

    setup_iran_mirrors

    echo "[i] Installing Docker & Docker Compose..."
    if ! command -v docker &> /dev/null; then
        apt-get install -y docker.io || true
    fi
    systemctl enable --now docker 2>/dev/null || true

    if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
        apt-get install -y docker-compose-v2 || apt-get install -y docker-compose || true
    fi

    echo "[i] Creating zero-dependency production server script with Central DB Sync..."
    create_server_script

    # Ensure production frontend bundle exists
    if [ ! -f "$INSTALL_DIR/dist/index.html" ]; then
        echo "[i] Building production frontend bundle (this may take 1-2 minutes)..."
        apt-get install -y nodejs npm || true
        export ELECTRON_SKIP_BINARY_DOWNLOAD=1
        npm config set registry https://registry.npmmirror.com
        npm install --no-audit --no-fund && npm run build || true
    else
        echo "[v] Pre-built production bundle (dist/index.html) ready!"
    fi

    # Free target port if occupied by old process
    systemctl stop arka-restaurant 2>/dev/null || true
    docker rm -f arka-restaurant 2>/dev/null || true

    echo "[i] Starting Arka container on port $PORT..."
    cat <<EOF > "$INSTALL_DIR/docker-compose.yml"
services:
  arka-app:
    image: node:20-alpine
    container_name: arka-restaurant
    working_dir: /app
    restart: always
    environment:
      - PORT=3000
    ports:
      - "0.0.0.0:${PORT}:3000"
    command: node server.cjs
    volumes:
      - .:/app
EOF

    STARTED=0
    if command -v docker &> /dev/null; then
        if docker compose up -d 2>/dev/null || docker-compose up -d 2>/dev/null; then
            STARTED=1
        fi
    fi

    # Fallback to systemd + host Node.js if Docker failed
    if [ "$STARTED" -eq 0 ]; then
        echo "[i] Configuring native systemd service for Arka..."
        apt-get install -y nodejs || true
        cat <<EOF > /etc/systemd/system/arka-restaurant.service
[Unit]
Description=Arka Restaurant Management Software
After=network.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
Environment=PORT=${PORT}
ExecStart=/usr/bin/node ${INSTALL_DIR}/server.cjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
        systemctl daemon-reload
        systemctl enable --now arka-restaurant
    fi

    SERVER_IP=$(hostname -I | awk '{print $1}')

    # Configure Domain & SSL if requested
    if [ -n "$DOMAIN" ]; then
        configure_ssl_and_nginx "$DOMAIN" "$PORT" "$SSL_MODE" "$SERVER_IP"
    fi

    # Open firewall ports if UFW is active
    if command -v ufw &> /dev/null; then
        ufw allow "${PORT}/tcp" 2>/dev/null || true
        ufw allow 80/tcp 2>/dev/null || true
        ufw allow 443/tcp 2>/dev/null || true
    fi

    echo "[i] Verifying server health on port $PORT..."
    sleep 2
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}" || echo "000")

    echo "================================================================"
    if [ "$HTTP_STATUS" == "200" ]; then
        echo "[v] SUCCESS! Arka Restaurant is UP and responding (HTTP 200 OK)!"
    else
        echo "[!] Service started (HTTP status: $HTTP_STATUS). Check 'docker logs arka-restaurant'."
    fi
    echo "----------------------------------------------------------------"
    echo "[v] Direct IP URL:     http://${SERVER_IP}:${PORT}"
    if [ -n "$DOMAIN" ]; then
        echo "[v] Domain HTTP URL:   http://${DOMAIN}"
        echo "[v] Domain HTTPS URL:  https://${DOMAIN}"
    fi
    echo "================================================================"
}

backup_app() {
    local TRIGGER_REASON="${1:-Manual Backup}"
    echo "[+] Creating backup of application data and configuration ($TRIGGER_REASON)..."
    BACKUP_DIR="/opt/arka-backup"
    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    local ARCHIVE_FILE="$BACKUP_DIR/arka_backup_$TIMESTAMP.tar.gz"
    
    if [ -d "$INSTALL_DIR" ]; then
        tar --exclude="node_modules" --exclude=".git" -czf "$ARCHIVE_FILE" -C "$INSTALL_DIR" .
        if [ -f "$INSTALL_DIR/data/central_db.json" ]; then
            cp -f "$INSTALL_DIR/data/central_db.json" "$BACKUP_DIR/arka_db_$TIMESTAMP.json" 2>/dev/null || true
        fi
        echo "[v] Local backup created at: $ARCHIVE_FILE"
        send_backup_to_bots "$ARCHIVE_FILE" "$TRIGGER_REASON"
    else
        echo "[!] Installation directory not found."
    fi
}

update_app() {
    print_banner
    echo "[+] Starting Safe Update Process for Arka Restaurant..."
    if [ -d "$INSTALL_DIR" ]; then
        echo "[+] Step 1/4: Creating automatic pre-update backup & sending to Bale/Telegram bots..."
        backup_app "Automatic Pre-Update Backup"

        # Preserve data folder before git reset
        mkdir -p /tmp/arka_data_preserve
        if [ -d "$INSTALL_DIR/data" ]; then
            cp -rf "$INSTALL_DIR/data/"* /tmp/arka_data_preserve/ 2>/dev/null || true
        fi

        echo "[+] Step 2/4: Fetching latest software version from repository..."
        cd "$INSTALL_DIR" || exit 1
        if command -v git &> /dev/null && [ -d ".git" ]; then
            git fetch --all && git reset --hard origin/main
        fi

        mkdir -p "$INSTALL_DIR/data"
        cp -rf /tmp/arka_data_preserve/* "$INSTALL_DIR/data/" 2>/dev/null || true
        rm -rf /tmp/arka_data_preserve

        # Safety Fallback: If central_db.json was lost or empty, restore latest json from /opt/arka-backup/
        if [ ! -s "$INSTALL_DIR/data/central_db.json" ]; then
            LATEST_JSON=$(ls -t /opt/arka-backup/arka_db_*.json 2>/dev/null | head -n1)
            if [ -n "$LATEST_JSON" ] && [ -s "$LATEST_JSON" ]; then
                echo "[v] Restoring central database from backup archive: $LATEST_JSON"
                cp -f "$LATEST_JSON" "$INSTALL_DIR/data/central_db.json" 2>/dev/null || true
            fi
        fi

        chmod -R 777 "$INSTALL_DIR/data" 2>/dev/null || true

        echo "[+] Step 3/4: Updating production server script & building bundle..."
        create_server_script

        ensure_swap
        if [ -f "$INSTALL_DIR/package.json" ]; then
            apt-get install -y nodejs npm || true
            export ELECTRON_SKIP_BINARY_DOWNLOAD=1
            npm config set registry https://registry.npmmirror.com
            npm install --no-audit --no-fund && npm run build || true
        fi

        echo "[+] Step 4/4: Restarting services..."
        docker compose restart 2>/dev/null || docker-compose restart 2>/dev/null || systemctl restart arka-restaurant 2>/dev/null || true

        echo "================================================================"
        echo "[v] Update completed successfully!"
        echo "[v] Pre-update backup saved & sent to configured bots."
        echo "[i] Tip: In your browser, press Ctrl+F5 (or clear cache in mobile) to load the new version immediately."
        echo "================================================================"
    else
        echo "[!] Software is not installed."
    fi
}

remove_app() {
    print_banner
    echo "[!] Warning: This will stop and remove all application containers and files."
    read -p "[-] Are you sure you want to uninstall? (y/n): " CONFIRM
    if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
        systemctl stop arka-restaurant 2>/dev/null || true
        systemctl disable arka-restaurant 2>/dev/null || true
        rm -f /etc/systemd/system/arka-restaurant.service /etc/nginx/sites-enabled/arka-restaurant.conf /etc/nginx/sites-available/arka-restaurant.conf 2>/dev/null || true
        systemctl reload nginx 2>/dev/null || true
        if [ -d "$INSTALL_DIR" ]; then
            cd "$INSTALL_DIR" || true
            docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true
            docker rm -f arka-restaurant 2>/dev/null || true
            rm -rf "$INSTALL_DIR"
        fi
        echo "[v] Software successfully removed."
    else
        echo "[i] Uninstallation cancelled."
    fi
}

build_tauri_windows_on_linux() {
    print_banner
    echo "================================================================"
    echo "   Build Windows Tauri Installer (.exe) on Linux (Cross-Compile)"
    echo "   ساخت فایل نصبی ویندوز تائوری (.exe) مستقیماً داخل لینوکس"
    echo "================================================================"

    ensure_swap

    # Determine project directory
    local WORK_DIR="$INSTALL_DIR"
    if [ -f "./package.json" ] && [ -d "./src-tauri" ]; then
        WORK_DIR="$(pwd)"
    elif [ ! -d "$INSTALL_DIR/src-tauri" ]; then
        echo "[i] Preparing project source code in $INSTALL_DIR..."
        apt-get update -y
        apt-get install -y git curl ca-certificates || true
        rm -rf "$INSTALL_DIR"
        git clone "$REPO_URL" "$INSTALL_DIR" || {
            echo "[!] Failed to clone repository from $REPO_URL."
            return 1
        }
        WORK_DIR="$INSTALL_DIR"
    fi

    cd "$WORK_DIR" || return 1
    echo "[+] Working directory: $WORK_DIR"

    echo "[+] Step 1/5: Installing Linux Cross-Compilation Toolchain (NSIS, Clang/LLD, MinGW-w64)..."
    apt-get update -y
    apt-get install -y \
        curl wget git zip unzip tar xz-utils ca-certificates \
        build-essential pkg-config libssl-dev \
        clang llvm lld nsis mingw-w64 || true

    # Ensure Node.js 18+ & npm are installed
    if ! command -v node &> /dev/null || [ "$(node -v | tr -d 'v' | cut -d. -f1)" -lt 18 ]; then
        echo "[i] Installing Node.js 20 LTS..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>/dev/null || true
        apt-get install -y nodejs npm || true
    fi

    echo "[+] Step 2/5: Installing Rust & Cargo Toolchain..."
    export PATH="$HOME/.cargo/bin:$PATH"
    if [ -f "$HOME/.cargo/env" ]; then
        # shellcheck disable=SC1091
        source "$HOME/.cargo/env" 2>/dev/null || true
    fi

    if ! command -v rustup &> /dev/null || ! command -v cargo &> /dev/null; then
        echo "[i] Installing rustup and stable Rust compiler..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
        export PATH="$HOME/.cargo/bin:$PATH"
        if [ -f "$HOME/.cargo/env" ]; then
            # shellcheck disable=SC1091
            source "$HOME/.cargo/env" 2>/dev/null || true
        fi
    fi

    echo "[+] Step 3/5: Adding Windows Targets & Installing cargo-xwin..."
    rustup target add x86_64-pc-windows-msvc || true
    rustup target add x86_64-pc-windows-gnu || true

    if ! command -v cargo-xwin &> /dev/null; then
        echo "[i] Installing cargo-xwin (trying fast prebuilt binary first)..."
        local ARCH
        ARCH=$(uname -m)
        if [ "$ARCH" = "x86_64" ]; then
            local XWIN_URL="https://github.com/rust-cross/cargo-xwin/releases/latest/download/cargo-xwin-v0.18.4.x86_64-unknown-linux-musl.tar.gz"
            local LATEST_URL
            LATEST_URL=$(curl -s https://api.github.com/repos/rust-cross/cargo-xwin/releases/latest | grep "browser_download_url.*x86_64-unknown-linux-musl.tar.gz" | head -n1 | cut -d '"' -f 4)
            if [ -n "$LATEST_URL" ]; then
                XWIN_URL="$LATEST_URL"
            fi
            mkdir -p "$HOME/.cargo/bin"
            if curl -fL "$XWIN_URL" -o /tmp/cargo-xwin.tar.gz 2>/dev/null; then
                tar -xzf /tmp/cargo-xwin.tar.gz -C "$HOME/.cargo/bin" 2>/dev/null || true
                chmod +x "$HOME/.cargo/bin/cargo-xwin" 2>/dev/null || true
                rm -f /tmp/cargo-xwin.tar.gz
            fi
        fi

        if ! command -v cargo-xwin &> /dev/null; then
            echo "[i] Compiling cargo-xwin via cargo install..."
            cargo install --locked cargo-xwin || true
        fi
    fi

    echo "[+] Step 4/5: Installing Frontend Dependencies & Building Web Bundle..."
    export ELECTRON_SKIP_BINARY_DOWNLOAD=1
    npm config set registry https://registry.npmmirror.com 2>/dev/null || true
    npm install --no-audit --no-fund
    node fix-ico.cjs 2>/dev/null || true
    npx @tauri-apps/cli icon src/assets/images/arka_logo.png 2>/dev/null || true
    npm run build

    echo "[+] Step 5/5: Cross-Compiling Windows Tauri Installer (.exe) on Linux..."
    local BUILD_SUCCESS=0
    local TARGET_USED=""

    if command -v cargo-xwin &> /dev/null; then
        echo "[i] Building with cargo-xwin (target: x86_64-pc-windows-msvc, bundle: nsis)..."
        if npx @tauri-apps/cli build --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis; then
            BUILD_SUCCESS=1
            TARGET_USED="x86_64-pc-windows-msvc"
        fi
    fi

    if [ "$BUILD_SUCCESS" -eq 0 ]; then
        echo "[i] Fallback: Building with MinGW-w64 (target: x86_64-pc-windows-gnu, bundle: nsis)..."
        if npx @tauri-apps/cli build --target x86_64-pc-windows-gnu --bundles nsis; then
            BUILD_SUCCESS=1
            TARGET_USED="x86_64-pc-windows-gnu"
        fi
    fi

    if [ "$BUILD_SUCCESS" -eq 0 ]; then
        echo "================================================================"
        echo "[!] خطا در ساخت خروجی ویندوز تائوری در لینوکس."
        echo "[i] لطفاً اتصال اینترنت سرور و نصب بودن پکیج‌های nsis و clang/lld را بررسی کنید."
        echo "================================================================"
        return 1
    fi

    local OUT_DIR="$WORK_DIR/windows-tauri-output"
    mkdir -p "$OUT_DIR" "$WORK_DIR/dist"

    local SETUP_EXE
    SETUP_EXE=$(find "$WORK_DIR/src-tauri/target/$TARGET_USED/release/bundle/nsis" -maxdepth 1 -name "*-setup.exe" 2>/dev/null | head -n1)
    local PORTABLE_EXE="$WORK_DIR/src-tauri/target/$TARGET_USED/release/arka-pos.exe"
    if [ ! -f "$PORTABLE_EXE" ]; then
        PORTABLE_EXE=$(find "$WORK_DIR/src-tauri/target/$TARGET_USED/release" -maxdepth 1 -iname "*.exe" 2>/dev/null | head -n1)
    fi

    if [ -n "$SETUP_EXE" ] && [ -f "$SETUP_EXE" ]; then
        cp -f "$SETUP_EXE" "$OUT_DIR/Arka-POS-Windows-Setup.exe"
        cp -f "$SETUP_EXE" "$WORK_DIR/dist/Arka-POS-Windows-Setup.exe"
    fi

    if [ -n "$PORTABLE_EXE" ] && [ -f "$PORTABLE_EXE" ]; then
        cp -f "$PORTABLE_EXE" "$OUT_DIR/Arka-POS-Portable.exe"
        cp -f "$PORTABLE_EXE" "$WORK_DIR/dist/Arka-POS-Portable.exe"
    fi

    if [ -f "$WORK_DIR/cleanup-old-tauri-installation.bat" ]; then
        cp -f "$WORK_DIR/cleanup-old-tauri-installation.bat" "$OUT_DIR/cleanup-old-tauri-installation.bat"
        cp -f "$WORK_DIR/cleanup-old-tauri-installation.bat" "$WORK_DIR/dist/cleanup-old-tauri-installation.bat"
    fi

    local ZIP_PATH="$OUT_DIR/Arka-Tauri-Windows.zip"
    if command -v zip &> /dev/null; then
        (cd "$OUT_DIR" && zip -9 -r "$ZIP_PATH" ./* >/dev/null 2>&1) || true
        cp -f "$ZIP_PATH" "$WORK_DIR/dist/Arka-Tauri-Windows.zip" 2>/dev/null || true
    fi

    local SERVER_IP
    SERVER_IP=$(hostname -I | awk '{print $1}')

    echo "================================================================"
    echo "[v] SUCCESS! خروجی نصبی ویندوز تائوری با موفقیت در لینوکس ساخته شد!"
    echo "----------------------------------------------------------------"
    echo "[+] پوشه فایل‌های خروجی روی سرور لینوکس:"
    echo "    $OUT_DIR"
    if [ -f "$OUT_DIR/Arka-POS-Windows-Setup.exe" ]; then
        echo "    1. فایل نصبی ویندوز (Setup Installer): $OUT_DIR/Arka-POS-Windows-Setup.exe"
    fi
    if [ -f "$OUT_DIR/Arka-POS-Portable.exe" ]; then
        echo "    2. فایل پرتابل بدون نصب (Portable EXE): $OUT_DIR/Arka-POS-Portable.exe"
    fi
    if [ -f "$ZIP_PATH" ]; then
        echo "    3. پکیج کامل فشرده (ZIP):              $ZIP_PATH"
    fi
    echo "----------------------------------------------------------------"
    echo "[+] لینک دانلود مستقیم از طریق مرورگر (اگر سرور روی پورت 3000 فعال است):"
    echo "    >>> http://${SERVER_IP}:3000/Arka-POS-Windows-Setup.exe <<<"
    echo "    >>> http://${SERVER_IP}:3000/Arka-Tauri-Windows.zip <<<"
    echo "================================================================"

    # Also offer sending to configured Telegram / Bale bots if available
    if [ -f "$ZIP_PATH" ]; then
        send_backup_to_bots "$ZIP_PATH" "Windows Tauri Installer Build (.exe)"
    fi
    return 0
}

main_menu() {
    check_root
    if [ "${1:-}" == "--build-tauri-win" ]; then
        build_tauri_windows_on_linux
        exit $?
    fi
    while true; do
        print_banner
        echo "1) Install & Setup (Port, Domain, SSL & Iran Mirrors)"
        echo "2) Create Backup & Send to Bale/Telegram Bots"
        echo "3) Update System (Auto-Backup to Bots + Full Update)"
        echo "4) Uninstall / Remove"
        echo "5) Configure Bale & Telegram Bot Tokens (CLI)"
        echo "6) Setup / Fix Official SSL Certificate (Let's Encrypt / Certbot)"
        echo "7) View Network Terminal & Central Database Status"
        echo "8) Build Windows Tauri Installer (.exe) on Linux (ساخت نصبی ویندوز تائوری در لینوکس)"
        echo "0) Exit"
        echo "================================================================"
        read -p "[-] Select an option (0-8): " CHOICE

        case "$CHOICE" in
            1)
                install_app
                read -p "[-] Press Enter to return to menu..."
                ;;
            2)
                print_banner
                backup_app "Manual CLI Backup"
                read -p "[-] Press Enter to return to menu..."
                ;;
            3)
                update_app
                read -p "[-] Press Enter to return to menu..."
                ;;
            4)
                remove_app
                read -p "[-] Press Enter to return to menu..."
                ;;
            5)
                configure_bots_cli
                read -p "[-] Press Enter to return to menu..."
                ;;
            6)
                print_banner
                setup_official_ssl
                read -p "[-] Press Enter to return to menu..."
                ;;
            7)
                show_network_sync_status
                read -p "[-] Press Enter to return to menu..."
                ;;
            8)
                build_tauri_windows_on_linux
                read -p "[-] Press Enter to return to menu..."
                ;;
            0)
                echo "Exiting. Goodbye!"
                exit 0
                ;;
            *)
                echo "Invalid option. Please enter a number between 0 and 8."
                sleep 2
                ;;
        esac
    done
}

main_menu "$@"
