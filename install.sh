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

get_active_port() {
    if [ -f "/etc/nginx/sites-available/arka-restaurant.conf" ]; then
        local NP
        NP=$(grep -m1 "proxy_pass" /etc/nginx/sites-available/arka-restaurant.conf 2>/dev/null | grep -oP ':\K[0-9]+' | head -n1)
        if [ -n "$NP" ] && [[ "$NP" =~ ^[0-9]+$ ]]; then
            echo "$NP"
            return 0
        fi
    fi
    if [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
        local DP
        DP=$(grep -m1 "PORT=" "$INSTALL_DIR/docker-compose.yml" 2>/dev/null | cut -d= -f2 | tr -d ' "\r\n')
        if [ -n "$DP" ] && [[ "$DP" =~ ^[0-9]+$ ]]; then
            echo "$DP"
            return 0
        fi
    fi
    if [ -f "/opt/arka-backup/server_port.conf" ]; then
        local P
        P=$(tr -d ' \r\n' < "/opt/arka-backup/server_port.conf" 2>/dev/null)
        if [ -n "$P" ] && [[ "$P" =~ ^[0-9]+$ ]]; then
            echo "$P"
            return 0
        fi
    fi
    if [ -f "$INSTALL_DIR/data/server_port.conf" ]; then
        local P
        P=$(tr -d ' \r\n' < "$INSTALL_DIR/data/server_port.conf" 2>/dev/null)
        if [ -n "$P" ] && [[ "$P" =~ ^[0-9]+$ ]]; then
            echo "$P"
            return 0
        fi
    fi
    if [ -f "/etc/systemd/system/arka-restaurant.service" ]; then
        local P
        P=$(grep -i "Environment=PORT=" /etc/systemd/system/arka-restaurant.service 2>/dev/null | cut -d= -f3 | tr -d ' \r\n')
        if [ -n "$P" ] && [[ "$P" =~ ^[0-9]+$ ]]; then
            echo "$P"
            return 0
        fi
    fi
    if [ -n "${PORT:-}" ] && [[ "$PORT" =~ ^[0-9]+$ ]]; then
        echo "$PORT"
        return 0
    fi
    echo "80"
}

get_public_port() {
    if [ -f "/etc/nginx/sites-enabled/arka-restaurant.conf" ] || [ -f "/etc/nginx/sites-available/arka-restaurant.conf" ]; then
        echo "80"
        return 0
    fi
    if [ -f "$INSTALL_DIR/data/public_port.conf" ]; then
        local PP
        PP=$(tr -d ' \r\n' < "$INSTALL_DIR/data/public_port.conf" 2>/dev/null)
        if [ -n "$PP" ] && [[ "$PP" =~ ^[0-9]+$ ]]; then
            echo "$PP"
            return 0
        fi
    fi
    get_active_port
}

get_public_port_display() {
    local PUB_PORT
    PUB_PORT=$(get_public_port)
    if [ -f "/etc/nginx/sites-enabled/arka-restaurant.conf" ] || [ -f "/etc/nginx/sites-available/arka-restaurant.conf" ] || [ "$PUB_PORT" = "80" ]; then
        echo "80 (HTTP) / 443 (HTTPS)"
    else
        echo "${PUB_PORT}"
    fi
}

save_active_port() {
    local TARGET_PORT="$1"
    mkdir -p "$INSTALL_DIR/data" /opt/arka-backup
    if [ -n "$TARGET_PORT" ] && [[ "$TARGET_PORT" =~ ^[0-9]+$ ]]; then
        echo "$TARGET_PORT" > "$INSTALL_DIR/data/server_port.conf"
        echo "$TARGET_PORT" > "/opt/arka-backup/server_port.conf"
        chmod 666 "$INSTALL_DIR/data/server_port.conf" 2>/dev/null || true
    fi
    if [ -f "/etc/nginx/sites-enabled/arka-restaurant.conf" ] || [ -f "/etc/nginx/sites-available/arka-restaurant.conf" ] || [ "$TARGET_PORT" = "80" ]; then
        echo "80" > "$INSTALL_DIR/data/public_port.conf"
        echo "80" > "/opt/arka-backup/public_port.conf"
        chmod 666 "$INSTALL_DIR/data/public_port.conf" 2>/dev/null || true
    elif [ -n "$TARGET_PORT" ] && [[ "$TARGET_PORT" =~ ^[0-9]+$ ]]; then
        echo "$TARGET_PORT" > "$INSTALL_DIR/data/public_port.conf"
        echo "$TARGET_PORT" > "/opt/arka-backup/public_port.conf"
        chmod 666 "$INSTALL_DIR/data/public_port.conf" 2>/dev/null || true
    fi
    local HOST_IPS
    HOST_IPS=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^172\.' | grep -v '^127\.' | tr '\n' ' ' | xargs)
    if [ -z "$HOST_IPS" ]; then
        HOST_IPS=$(hostname -I 2>/dev/null | awk '{print $1}')
    fi
    if [ -n "$HOST_IPS" ]; then
        echo "$HOST_IPS" > "$INSTALL_DIR/data/server_host_ip.conf"
        chmod 666 "$INSTALL_DIR/data/server_host_ip.conf" 2>/dev/null || true
    fi
    local HOST_NAME
    HOST_NAME=$(hostname 2>/dev/null || echo "linux-server")
    echo "$HOST_NAME" > "$INSTALL_DIR/data/server_hostname.conf"
}

save_active_domain() {
    local TARGET_DOMAIN="$1"
    if [ -n "$TARGET_DOMAIN" ]; then
        mkdir -p "$INSTALL_DIR/data" /opt/arka-backup
        echo "$TARGET_DOMAIN" > "$INSTALL_DIR/data/server_domain.conf"
        echo "$TARGET_DOMAIN" > "/opt/arka-backup/server_domain.conf"
        chmod 666 "$INSTALL_DIR/data/server_domain.conf" 2>/dev/null || true
    fi
}

print_banner() {
    clear
    local SERVER_IP
    SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    local PUB_PORT
    PUB_PORT=$(get_public_port 2>/dev/null || echo "80")
    echo "================================================================"
    echo "   Arka Restaurant Management Software - Linux Installer & Manager"
    echo "   Networked Central Server, Multi-Terminal Live Sync & SSL"
    if [ -n "$SERVER_IP" ]; then
        if [ "$PUB_PORT" = "80" ] || [ "$PUB_PORT" = "443" ]; then
            echo "   Active Server URL: http://${SERVER_IP} (Port 80 / 443)"
        else
            echo "   Active Server URL: http://${SERVER_IP}:${PUB_PORT}"
        fi
    fi
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
    mkdir -p "$INSTALL_DIR/data" "$INSTALL_DIR/data/backups"
    # If the repository already contains the full v3 server.cjs with sanitizeCentralDbOnStartup, keep it!
    if [ -f "$INSTALL_DIR/server.cjs" ] && grep -q "sanitizeCentralDbOnStartup" "$INSTALL_DIR/server.cjs"; then
        echo "[v] Authoritative server.cjs verified in $INSTALL_DIR/server.cjs"
        return 0
    fi
    cat <<'EOF' > "$INSTALL_DIR/server.cjs"
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const DIST_DIR = path.join(__dirname, 'dist');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'central_db.json');
const LICENSE_FILE = path.join(DATA_DIR, 'server_license.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const ALL_SYNC_TABLES = [
  'settings',
  'categories',
  'menuItems',
  'customers',
  'orders',
  'accounts',
  'bankAccounts',
  'persons',
  'journalVouchers',
  'cheques',
  'rawMaterials',
  'inventoryTransactions',
  'productionRecipes',
  'kitchenProductions',
  'cashClosures',
  'appUsers',
];

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

function detectPort() {
  if (process.env.PORT && !isNaN(Number(process.env.PORT)) && Number(process.env.PORT) > 0) {
    return Number(process.env.PORT);
  }
  try {
    const confFile = path.join(DATA_DIR, 'server_port.conf');
    if (fs.existsSync(confFile)) {
      const p = parseInt(fs.readFileSync(confFile, 'utf8').trim(), 10);
      if (!isNaN(p) && p > 0) return p;
    }
  } catch (e) {}
  return os.platform() === 'linux' ? 3000 : 4040;
}

const PORT = detectPort();
try {
  const confFile = path.join(DATA_DIR, 'server_port.conf');
  if (process.env.PORT || !fs.existsSync(confFile)) {
    fs.writeFileSync(confFile, String(PORT), 'utf8');
  }
} catch (e) {}

function detectPublicPort(req) {
  if (PORT === 80 || PORT === 443) return PORT;
  try {
    const pubPortFile = path.join(DATA_DIR, 'public_port.conf');
    if (fs.existsSync(pubPortFile)) {
      const pp = parseInt(fs.readFileSync(pubPortFile, 'utf8').trim(), 10);
      if (!isNaN(pp) && pp > 0) return pp;
    }
  } catch (e) {}
  try {
    if (
      os.platform() === 'linux' &&
      (fs.existsSync('/etc/nginx/sites-enabled/arka-restaurant.conf') ||
        fs.existsSync('/etc/nginx/sites-available/arka-restaurant.conf'))
    ) {
      return 80;
    }
  } catch (e) {}
  if (req && req.headers) {
    if (req.headers['x-forwarded-proto'] || req.headers['x-real-ip']) return 80;
    if (req.headers.host && !String(req.headers.host).includes(':')) return 80;
  }
  return PORT;
}

function getSavedDomain() {
  if (process.env.SERVER_DOMAIN && process.env.SERVER_DOMAIN.trim()) return process.env.SERVER_DOMAIN.trim();
  try {
    const domainFile = path.join(DATA_DIR, 'server_domain.conf');
    if (fs.existsSync(domainFile)) return fs.readFileSync(domainFile, 'utf8').trim();
  } catch (e) {}
  return '';
}

function getEffectiveHostname() {
  if (process.env.HOST_HOSTNAME && process.env.HOST_HOSTNAME.trim()) return process.env.HOST_HOSTNAME.trim();
  try {
    const hostFile = path.join(DATA_DIR, 'server_hostname.conf');
    if (fs.existsSync(hostFile)) {
      const h = fs.readFileSync(hostFile, 'utf8').trim();
      if (h) return h;
    }
  } catch (e) {}
  return os.hostname();
}

function getLocalIpAddresses() {
  const hostConfiguredIps = [];
  if (process.env.HOST_IP && process.env.HOST_IP.trim()) {
    process.env.HOST_IP.trim().split(/[\s,]+/).forEach((ip) => {
      if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) hostConfiguredIps.push(ip);
    });
  }
  try {
    const hostIpFile = path.join(DATA_DIR, 'server_host_ip.conf');
    if (fs.existsSync(hostIpFile)) {
      fs.readFileSync(hostIpFile, 'utf8').trim().split(/[\s,]+/).forEach((ip) => {
        if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip) && !hostConfiguredIps.includes(ip)) hostConfiguredIps.push(ip);
      });
    }
  } catch (e) {}

  const interfaces = os.networkInterfaces();
  const physicalIps = [];
  const virtualIps = [];
  for (const name of Object.keys(interfaces)) {
    const isVirtual = /virtual|vmware|vbox|docker|br-|veth|loopback|tap|hyper-v|vethernet|tailscale|zerotier|wsl/i.test(name);
    const ifaceList = interfaces[name];
    if (!ifaceList) continue;
    for (const iface of ifaceList) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const isDockerBridge = /^172\.(1[7-9]|2\d|3[0-1])\./.test(iface.address);
        if (isVirtual || isDockerBridge) virtualIps.push(iface.address);
        else physicalIps.push(iface.address);
      }
    }
  }
  const combined = [...hostConfiguredIps, ...physicalIps];
  if (combined.length === 0) combined.push(...virtualIps);
  return Array.from(new Set(combined));
}

function hasDbData(obj) {
  if (!obj || typeof obj !== 'object') return false;
  let totalCount = 0;
  for (const t of ALL_SYNC_TABLES) {
    if (Array.isArray(obj[t])) totalCount += obj[t].length;
  }
  const hasDel = obj.deletedRecordsV3 && typeof obj.deletedRecordsV3 === 'object' && Object.keys(obj.deletedRecordsV3).length > 0;
  return totalCount > 0 || Boolean(hasDel);
}

function getItemTimestampMs(item) {
  if (!item || typeof item !== 'object') return 1;
  if (item._updatedAtMs && Number.isFinite(Number(item._updatedAtMs)) && Number(item._updatedAtMs) > 0) return Number(item._updatedAtMs);
  for (const f of ['updatedAt', 'createdAt', 'closedAt', 'date', 'issueDate', 'employmentStartDate']) {
    if (item[f]) {
      const t = new Date(item[f]).getTime();
      if (Number.isFinite(t) && t > 0) return t;
    }
  }
  return 1;
}

function getCanonicalKey(tableName, item) {
  if (!item || typeof item !== 'object') return '';
  const effId = item.id !== undefined && item.id !== null ? item.id : '';
  switch (tableName) {
    case 'settings': return 'settings_singleton';
    case 'orders': return String(item.invoiceNumber !== undefined && item.invoiceNumber !== null ? item.invoiceNumber : effId || '');
    case 'journalVouchers': return String(item.voucherNumber !== undefined && item.voucherNumber !== null ? item.voucherNumber : effId || '');
    case 'customers': return String(item.phone || effId || '');
    case 'cashClosures': return String(item.dateLabel || item.closedAt || effId || '');
    case 'kitchenProductions': return String(item.batchNumber || effId || '');
    case 'categories':
    case 'menuItems': return String(effId || item.name || '');
    case 'bankAccounts': return String(effId || (item.bankName ? `${item.bankName}_${item.cardNumber || ''}` : ''));
    case 'persons': return String(effId || (item.name ? `${item.name}_${item.role || ''}` : ''));
    case 'cheques': return String(item.chequeNumber || effId || '');
    case 'rawMaterials': return String(effId || item.name || '');
    case 'productionRecipes': return String(item.menuItemId || effId || '');
    case 'inventoryTransactions': return String(effId || `${item.materialId || ''}_${item.date || ''}_${item.type || ''}`);
    case 'appUsers': return String(item.username || effId || '');
    case 'accounts': return String(item.code || effId || '');
    default: return String(effId || item.code || item.name || '');
  }
}

const LEGACY_DEMO_BANK_CARDS = new Set(['6104-3378-9012-3456', '6219-8610-4455-6677', '6037-9975-1122-3344']);
const LEGACY_DEMO_BANK_IBANS = new Set(['IR450120000000004589123456', 'IR820560082180008210987654', 'IR110170000000109988776001']);
const LEGACY_DEMO_BANK_NAMES = new Set(['بانک ملت (کارتخوان ۱)', 'بانک سامان (کارتخوان ۲)', 'بانک ملی (حساب چک و جاری)']);

function isLegacyDemoBank(item) {
  if (!item || typeof item !== 'object') return false;
  const card = item.cardNumber ? String(item.cardNumber).trim() : '';
  const iban = item.iban ? String(item.iban).trim() : '';
  const name = item.bankName ? String(item.bankName).trim() : '';
  return (card && LEGACY_DEMO_BANK_CARDS.has(card)) || (iban && LEGACY_DEMO_BANK_IBANS.has(iban)) || (name && LEGACY_DEMO_BANK_NAMES.has(name));
}

function isRecordDeletedInMap(tableName, item, canonicalKey, deletedMap) {
  if (tableName === 'bankAccounts' && isLegacyDemoBank(item)) return true;
  const tableDel = deletedMap && deletedMap[tableName];
  if (!tableDel || typeof tableDel !== 'object') return false;
  let maxDelTs = 0;
  if (canonicalKey && tableDel[canonicalKey]) maxDelTs = Math.max(maxDelTs, Number(tableDel[canonicalKey]) || 0);
  if (item && typeof item === 'object') {
    if (item.id !== undefined && item.id !== null) {
      maxDelTs = Math.max(maxDelTs, Number(tableDel['id:' + item.id]) || 0, tableName !== 'orders' && tableName !== 'journalVouchers' ? (Number(tableDel[String(item.id)]) || 0) : 0);
    }
    if (item.invoiceNumber !== undefined && item.invoiceNumber !== null) maxDelTs = Math.max(maxDelTs, Number(tableDel[String(item.invoiceNumber)]) || 0);
    if (item.voucherNumber !== undefined && item.voucherNumber !== null) maxDelTs = Math.max(maxDelTs, Number(tableDel[String(item.voucherNumber)]) || 0);
    if (item.phone) maxDelTs = Math.max(maxDelTs, Number(tableDel[String(item.phone)]) || 0);
    if (item.name) maxDelTs = Math.max(maxDelTs, Number(tableDel['name:' + item.name]) || 0);
    if (item.bankName) maxDelTs = Math.max(maxDelTs, Number(tableDel['bank:' + item.bankName]) || 0);
    if (item.username) maxDelTs = Math.max(maxDelTs, Number(tableDel[String(item.username)]) || 0);
  }
  if (maxDelTs <= 0) return false;
  return maxDelTs >= getItemTimestampMs(item);
}

function mergeDatabaseObjects(existing, incoming) {
  if (!existing || typeof existing !== 'object') return incoming || {};
  if (!incoming || typeof incoming !== 'object') return existing || {};
  const result = { ...existing };
  delete result.deletedRecords;
  const nowTs = Date.now();
  const mergedDeleted = {};
  for (const src of [existing.deletedRecordsV3, incoming.deletedRecordsV3]) {
    if (!src || typeof src !== 'object') continue;
    for (const [table, keyMap] of Object.entries(src)) {
      if (!keyMap || typeof keyMap !== 'object') continue;
      if (!mergedDeleted[table]) mergedDeleted[table] = {};
      for (const [k, ts] of Object.entries(keyMap)) {
        const numTs = Number(ts) || 0;
        if (numTs > (mergedDeleted[table][k] || 0)) mergedDeleted[table][k] = numTs;
      }
    }
  }
  result.deletedRecordsV3 = mergedDeleted;

  const mergeTable = (tableName, sortFn) => {
    const map = new Map();
    if (Array.isArray(existing[tableName])) {
      for (const item of existing[tableName]) {
        if (!item) continue;
        const k = getCanonicalKey(tableName, item);
        if (k && !isRecordDeletedInMap(tableName, item, k, mergedDeleted)) {
          map.set(k, item._updatedAtMs ? item : { ...item, _updatedAtMs: getItemTimestampMs(item) || nowTs });
        }
      }
    }
    if (Array.isArray(incoming[tableName])) {
      for (const item of incoming[tableName]) {
        if (!item) continue;
        const k = getCanonicalKey(tableName, item);
        if (!k) continue;
        if (isRecordDeletedInMap(tableName, item, k, mergedDeleted)) {
          map.delete(k);
          continue;
        }
        const prev = map.get(k);
        if (prev) {
          const prevTs = getItemTimestampMs(prev);
          const incTs = getItemTimestampMs(item);
          if (incTs >= prevTs) map.set(k, { ...prev, ...item, _updatedAtMs: Math.max(incTs, prevTs, 1) });
        } else {
          map.set(k, item._updatedAtMs ? item : { ...item, _updatedAtMs: getItemTimestampMs(item) || nowTs });
        }
      }
    }
    const arr = Array.from(map.values());
    if (sortFn) arr.sort(sortFn);
    result[tableName] = arr;
  };

  mergeTable('orders', (a, b) => (Number(a.invoiceNumber) || 0) - (Number(b.invoiceNumber) || 0));
  mergeTable('customers');
  mergeTable('journalVouchers', (a, b) => (Number(a.voucherNumber) || 0) - (Number(b.voucherNumber) || 0));
  mergeTable('inventoryTransactions');
  mergeTable('kitchenProductions');
  mergeTable('cashClosures');
  mergeTable('categories');
  mergeTable('menuItems');
  mergeTable('bankAccounts');
  mergeTable('persons');
  mergeTable('cheques');
  mergeTable('rawMaterials');
  mergeTable('productionRecipes');
  mergeTable('accounts');
  mergeTable('appUsers');

  if (Array.isArray(incoming.settings) && incoming.settings.length > 0) result.settings = incoming.settings;
  else if (Array.isArray(existing.settings)) result.settings = existing.settings;

  result.version = incoming.version || existing.version || 8;
  result.exportedAt = new Date().toISOString();
  return result;
}

(function sanitizeCentralDbOnStartup() {
  if (!fs.existsSync(DB_FILE)) return;
  try {
    const currentDb = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!currentDb || typeof currentDb !== 'object') return;
    let modified = false;
    const nowTs = Date.now();
    if (currentDb.deletedRecords) {
      delete currentDb.deletedRecords;
      modified = true;
    }
    if (Array.isArray(currentDb.bankAccounts)) {
      const filteredBanks = [];
      if (!currentDb.deletedRecordsV3 || typeof currentDb.deletedRecordsV3 !== 'object') currentDb.deletedRecordsV3 = {};
      if (!currentDb.deletedRecordsV3.bankAccounts) currentDb.deletedRecordsV3.bankAccounts = {};
      for (const b of currentDb.bankAccounts) {
        if (isLegacyDemoBank(b)) {
          modified = true;
          if (b.id !== undefined && b.id !== null) {
            currentDb.deletedRecordsV3.bankAccounts[String(b.id)] = nowTs;
            currentDb.deletedRecordsV3.bankAccounts['id:' + b.id] = nowTs;
          }
          if (b.bankName) currentDb.deletedRecordsV3.bankAccounts['bank:' + b.bankName] = nowTs;
        } else {
          filteredBanks.push(b);
        }
      }
      if (filteredBanks.length !== currentDb.bankAccounts.length) currentDb.bankAccounts = filteredBanks;
    }
    for (const table of ALL_SYNC_TABLES) {
      if (Array.isArray(currentDb[table])) {
        for (const rec of currentDb[table]) {
          if (rec && typeof rec === 'object' && !rec._updatedAtMs) {
            rec._updatedAtMs = nowTs;
            modified = true;
          }
        }
      }
    }
    if (modified) fs.writeFileSync(DB_FILE, JSON.stringify(currentDb, null, 2), 'utf8');
  } catch (e) {}
})();

let currentRev = 1;
let lastRawResetRev = 0;
try {
  if (fs.existsSync(DB_FILE)) {
    const stat = fs.statSync(DB_FILE);
    currentRev = Math.max(1, Math.floor(stat.mtimeMs / 1000));
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, X-Requested-With, Access-Control-Request-Private-Network');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (parsedUrl.pathname === '/api/db/version' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
      res.end(JSON.stringify({ ok: true, rev: currentRev, lastRawResetRev, serverTimeMs: Date.now(), lastModified: new Date().toISOString() }));
      return;
    }

    if (parsedUrl.pathname === '/api/db/state' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
      if (fs.existsSync(DB_FILE)) {
        try {
          const content = fs.readFileSync(DB_FILE, 'utf8');
          res.end(JSON.stringify({ ok: true, rev: currentRev, serverTimeMs: Date.now(), data: JSON.parse(content) }));
          return;
        } catch (e) {}
      }
      res.end(JSON.stringify({ ok: false, rev: currentRev, serverTimeMs: Date.now(), data: null }));
      return;
    }

    if (parsedUrl.pathname === '/api/network/info' && req.method === 'GET') {
      const localIps = getLocalIpAddresses();
      const customDomain = getSavedDomain();
      const activePort = detectPort();
      const publicPort = detectPublicPort(req);
      const portSuffix = publicPort === 80 || publicPort === 443 ? '' : `:${publicPort}`;
      let domainUrl = customDomain ? (customDomain.startsWith('http') ? customDomain : `https://${customDomain}`) : '';
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache, no-store' });
      res.end(JSON.stringify({
        ok: true,
        hostname: getEffectiveHostname(),
        platform: os.platform(),
        isLinuxServer: os.platform() === 'linux',
        port: publicPort,
        internalPort: activePort,
        publicPort,
        localIps,
        customDomain,
        domainUrl,
        primaryUrl: localIps.length > 0 ? `http://${localIps[0]}${portSuffix}` : `http://localhost${portSuffix}`,
        serverTime: new Date().toISOString(),
        serverTimeMs: Date.now(),
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
          const forceOverwrite = Boolean(payload.forceOverwrite);
          let existingData = null;
          if (fs.existsSync(DB_FILE)) {
            try { existingData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) {}
          }
          const serverHasData = hasDbData(existingData);
          const clientHasData = hasDbData(payload.data);

          if (serverHasData && !clientHasData && !forceOverwrite) {
            res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, isOutdated: true, rev: currentRev, serverTimeMs: Date.now() }));
            return;
          }

          let finalDataToSave = payload.data;
          let wasMerged = false;
          if (payload.data && (clientHasData || forceOverwrite)) {
            if (serverHasData && existingData) {
              try {
                fs.writeFileSync(path.join(BACKUP_DIR, 'central_db_autobackup.json'), JSON.stringify(existingData, null, 2), 'utf8');
              } catch (e) {}
              if (!forceOverwrite) {
                finalDataToSave = mergeDatabaseObjects(existingData, payload.data);
                wasMerged = true;
              } else {
                finalDataToSave = { ...payload.data, deletedRecordsV3: payload.data.deletedRecordsV3 || {} };
                delete finalDataToSave.deletedRecords;
              }
            }
            const tmpFile = DB_FILE + '.tmp';
            fs.writeFileSync(tmpFile, JSON.stringify(finalDataToSave, null, 2), 'utf8');
            fs.renameSync(tmpFile, DB_FILE);
            currentRev += forceOverwrite ? 100 : 1;
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, rev: currentRev, serverTimeMs: Date.now(), merged: wasMerged, data: wasMerged ? finalDataToSave : undefined }));
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
            const cleanData = { ...payload.data, deletedRecordsV3: {} };
            delete cleanData.deletedRecords;
            const jsonContent = JSON.stringify(cleanData, null, 2);
            fs.writeFileSync(DB_FILE, jsonContent, 'utf8');
            try { fs.writeFileSync(path.join(DATA_DIR, 'latest_db_backup.json'), jsonContent, 'utf8'); } catch (e) {}
          }
          currentRev += 1000;
          lastRawResetRev = currentRev;
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, rev: currentRev, serverTimeMs: Date.now() }));
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
            if (payload.overwriteCentral || !fs.existsSync(DB_FILE)) {
              try {
                const parsedBackup = JSON.parse(payload.backupJson);
                const nowTs = Date.now();
                delete parsedBackup.deletedRecords;
                parsedBackup.deletedRecordsV3 = {};
                for (const t of ALL_SYNC_TABLES) {
                  if (Array.isArray(parsedBackup[t])) {
                    parsedBackup[t] = parsedBackup[t].map((r) => (r && typeof r === 'object' ? { ...r, _updatedAtMs: nowTs } : r));
                  }
                }
                const cleanJson = JSON.stringify(parsedBackup, null, 2);
                fs.writeFileSync(DB_FILE, cleanJson, 'utf8');
                fs.writeFileSync(path.join(DATA_DIR, 'latest_db_backup.json'), cleanJson, 'utf8');
                currentRev += 1000;
              } catch (e) {
                fs.writeFileSync(DB_FILE, payload.backupJson, 'utf8');
                currentRev += 1000;
              }
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, rev: currentRev }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false }));
        }
      });
      return;
    }

    let safePath = path.normalize(decodeURIComponent(parsedUrl.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (safePath === '/' || safePath === '\\') safePath = '/index.html';
    let filePath = path.join(DIST_DIR, safePath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(DIST_DIR, 'index.html');
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    fs.readFile(filePath, (err, content) => {
      if (err) { res.writeHead(500); res.end('Internal Server Error'); return; }
      if (ext === '.html' || safePath.includes('sw.js') || safePath.includes('registerSW')) {
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0' });
      } else {
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000' });
      }
      res.end(content);
    });
  } catch (e) {
    res.writeHead(500); res.end('Server Error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Arka Restaurant Central Server running on http://0.0.0.0:${PORT}`);
});
EOF
}

setup_official_ssl() {
    local DOMAIN="$1"
    local DETECTED_PORT
    DETECTED_PORT=$(get_active_port)
    local PORT="${2:-$DETECTED_PORT}"

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
    client_max_body_size 100M;

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
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
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
            APP_TARGET_PORT="$(get_active_port)"
        fi

        cat <<EOF > /etc/nginx/sites-available/arka-restaurant.conf
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _ ${DOMAIN} www.${DOMAIN};
    client_max_body_size 100M;

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
    client_max_body_size 100M;

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
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
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
    client_max_body_size 100M;

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
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}

server {
    listen 443 ssl default_server;
    server_name _ ${DOMAIN} www.${DOMAIN};
    client_max_body_size 100M;

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
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
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
    local PUBLIC_PORT
    PUBLIC_PORT=$(get_public_port)
    local PUBLIC_PORT_DISPLAY
    PUBLIC_PORT_DISPLAY=$(get_public_port_display)
    local DB_FILE="$INSTALL_DIR/data/central_db.json"

    echo "----------------------------------------------------------------"
    echo "[v] Central Server IP:          $SERVER_IP"
    echo "[v] Active Server Port:         $PUBLIC_PORT_DISPLAY"
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
    if [ "$PUBLIC_PORT" = "80" ] || [ "$PUBLIC_PORT" = "443" ]; then
        echo "1. Any PC / Laptop on LAN:      http://${SERVER_IP}"
        echo "2. Cashier 2 / Mobile Devices:  http://${SERVER_IP}"
    else
        echo "1. Any PC / Laptop on LAN:      http://${SERVER_IP}:${PUBLIC_PORT}"
        echo "2. Cashier 2 / Mobile Devices:  http://${SERVER_IP}:${PUBLIC_PORT}"
    fi
    if [ -f "/etc/nginx/sites-available/arka-restaurant.conf" ]; then
        local DOMAIN
        DOMAIN=$(grep -m1 "server_name" /etc/nginx/sites-available/arka-restaurant.conf | awk '{print $2}' | tr -d ';')
        if [ "$DOMAIN" = "_" ]; then
            DOMAIN=$(grep -m1 "server_name" /etc/nginx/sites-available/arka-restaurant.conf | awk '{print $3}' | tr -d ';')
        fi
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

    local DETECTED_PORT
    DETECTED_PORT=$(get_active_port)

    read -p "[-] Enter desired port for running the app (default ${DETECTED_PORT}): " PORT
    PORT=${PORT:-$DETECTED_PORT}
    save_active_port "$PORT"

    read -p "[-] Do you want to configure Domain & SSL? (y/n, default y): " USE_SSL
    USE_SSL=${USE_SSL:-y}

    DOMAIN=""
    SSL_MODE="letsencrypt"

    if [[ "$USE_SSL" =~ ^[Yy]$ ]]; then
        read -p "[-] Enter your domain name (e.g. foodmix.ir): " DOMAIN
        DOMAIN=$(echo "$DOMAIN" | tr '[:upper:]' '[:lower:]' | xargs)
        if [ -n "$DOMAIN" ]; then
            save_active_domain "$DOMAIN"
        fi
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

    SERVER_IP=$(hostname -I | awk '{print $1}')
    HOST_NAME=$(hostname 2>/dev/null || echo "linux-server")

    echo "[i] Starting Arka container on port $PORT..."
    cat <<EOF > "$INSTALL_DIR/docker-compose.yml"
services:
  arka-app:
    image: node:20-alpine
    container_name: arka-restaurant
    working_dir: /app
    restart: always
    environment:
      - PORT=${PORT}
      - HOST_IP=${SERVER_IP}
      - HOST_HOSTNAME=${HOST_NAME}
    ports:
      - "0.0.0.0:${PORT}:${PORT}"
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
Environment=HOST_IP=${SERVER_IP}
Environment=HOST_HOSTNAME=${HOST_NAME}
ExecStart=/usr/bin/node ${INSTALL_DIR}/server.cjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
        systemctl daemon-reload
        systemctl enable --now arka-restaurant
    fi

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

update_app_post_pull() {
    local ACTIVE_PORT
    ACTIVE_PORT=$(get_active_port)
    local PUBLIC_PORT_DISPLAY
    PUBLIC_PORT_DISPLAY=$(get_public_port_display)

    # Ensure server port and public port configuration is preserved
    save_active_port "$ACTIVE_PORT"

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

    local SERVER_IP
    SERVER_IP=$(hostname -I | awk '{print $1}')
    local HOST_NAME
    HOST_NAME=$(hostname 2>/dev/null || echo "linux-server")

    echo "[+] Step 4/4: Restarting services on active port ${PUBLIC_PORT_DISPLAY}..."
    # Ensure Nginx allows up to 100MB sync payloads (fixes HTTP 413 on large databases)
    if [ -f "/etc/nginx/sites-available/arka-restaurant.conf" ]; then
        if ! grep -q "client_max_body_size" /etc/nginx/sites-available/arka-restaurant.conf; then
            sed -i '/server_name/a \    client_max_body_size 100M;' /etc/nginx/sites-available/arka-restaurant.conf 2>/dev/null || true
        fi
        nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
    fi

    if [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
        cat <<EOF > "$INSTALL_DIR/docker-compose.yml"
services:
  arka-app:
    image: node:20-alpine
    container_name: arka-restaurant
    working_dir: /app
    restart: always
    environment:
      - PORT=${ACTIVE_PORT}
      - HOST_IP=${SERVER_IP}
      - HOST_HOSTNAME=${HOST_NAME}
    ports:
      - "0.0.0.0:${ACTIVE_PORT}:${ACTIVE_PORT}"
    command: node server.cjs
    volumes:
      - .:/app
EOF
    fi

    # Restart BOTH systemd service (if present) and Docker container (if present) without short-circuiting!
    if [ -f "/etc/systemd/system/arka-restaurant.service" ] || systemctl list-unit-files 2>/dev/null | grep -q "arka-restaurant.service"; then
        systemctl daemon-reload 2>/dev/null || true
        systemctl restart arka-restaurant 2>/dev/null || true
    fi
    if command -v docker &> /dev/null && docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "arka-restaurant"; then
        docker compose up -d --force-recreate 2>/dev/null || docker-compose up -d --force-recreate 2>/dev/null || docker restart arka-restaurant 2>/dev/null || true
    fi

    echo "================================================================"
    echo "[v] Update completed successfully on port ${PUBLIC_PORT_DISPLAY}!"
    echo "[v] Pre-update backup saved & sent to configured bots."
    echo "[i] Tip: In your browser, press Ctrl+F5 (or clear cache in mobile) to load the new version immediately."
    echo "================================================================"
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

        chmod +x "$INSTALL_DIR/install.sh" 2>/dev/null || true
        if [ -f "/root/install.sh" ]; then
            cp -f "$INSTALL_DIR/install.sh" "/root/install.sh" 2>/dev/null || true
            chmod +x "/root/install.sh" 2>/dev/null || true
        fi
        if [ -f "/usr/local/bin/arka" ]; then
            cp -f "$INSTALL_DIR/install.sh" "/usr/local/bin/arka" 2>/dev/null || true
            chmod +x "/usr/local/bin/arka" 2>/dev/null || true
        fi

        # Re-execute the newly fetched install.sh so all new update logic & port 80 display take effect immediately!
        if [ "${ARKA_REEXEC_UPDATE:-0}" != "1" ] && [ -f "$INSTALL_DIR/install.sh" ]; then
            export ARKA_REEXEC_UPDATE=1
            exec bash "$INSTALL_DIR/install.sh" --post-pull-update
        fi

        update_app_post_pull
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
    local NUM_CORES
    NUM_CORES=$(nproc 2>/dev/null || echo 2)
    export CARGO_BUILD_JOBS="$NUM_CORES"
    echo "[i] نکته: کامپایل کریت‌های سیستمی ویندوز (بخش ۲۵۰ به بعد نظیر windows v0.62) روی سرور لینوکس بین ۳ تا ۷ دقیقه طول می‌کشد؛ پروسس در حال پردازش است، لطفاً منتظر بمانید..."
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
    local PUBLIC_PORT
    PUBLIC_PORT=$(get_public_port)
    local PORT_SUFFIX=":${PUBLIC_PORT}"
    if [ "$PUBLIC_PORT" = "80" ] || [ "$PUBLIC_PORT" = "443" ]; then
        PORT_SUFFIX=""
    fi
    echo "----------------------------------------------------------------"
    echo "[+] لینک دانلود مستقیم از طریق مرورگر (پورت فعال سرور: ${PUBLIC_PORT}):"
    echo "    >>> http://${SERVER_IP}${PORT_SUFFIX}/Arka-POS-Windows-Setup.exe <<<"
    echo "    >>> http://${SERVER_IP}${PORT_SUFFIX}/Arka-Tauri-Windows.zip <<<"
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
    if [ "${1:-}" == "--post-pull-update" ]; then
        cd "$INSTALL_DIR" 2>/dev/null || true
        update_app_post_pull
        export ARKA_REEXEC_UPDATE=0
        read -p "[-] Press Enter to return to menu..."
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
