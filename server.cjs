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

const MASTER_SECRET_SALT = 'ARKA_POS_OFFLINE_SECRET_SALT_2026_x987654321_REST_SYS';
const MASTER_EMERGENCY_KEY = 'ARKA-9999-MASTER-OVERRIDE-KEY';

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Resolves the primary default Windows backup directory:
 * e.g. %USERPROFILE%\Documents\Arka_POS_Backups (or Desktop\Arka_POS_Backups)
 */
function getDefaultUserBackupDir() {
  const homeDir = os.homedir ? os.homedir() : process.env.USERPROFILE || process.env.HOME || '';
  if (!homeDir) return BACKUP_DIR;
  const docsDir = path.join(homeDir, 'Documents');
  if (fs.existsSync(docsDir)) {
    const arkaDocs = path.join(docsDir, 'Arka_POS_Backups');
    try {
      if (!fs.existsSync(arkaDocs)) fs.mkdirSync(arkaDocs, { recursive: true });
      return arkaDocs;
    } catch {
      return BACKUP_DIR;
    }
  }
  return BACKUP_DIR;
}

let hasTriggeredExitBackup = false;

/**
 * Automatically creates timestamped backups in both default Windows Documents folder
 * and local data/backups directory, rotating older backups so disk never fills up.
 */
function triggerServerSideAutoBackup(reason = 'exit') {
  if (!fs.existsSync(DB_FILE)) return [];
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    repairExcessZeroInflationOnDataObject(parsed, Date.now());

    // Clean whitespace to save ~60% file size on disk
    const compactJson = JSON.stringify(parsed);
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `backup_arka_pos_${dateStr}.json`;

    const savedPaths = [];
    const targets = [BACKUP_DIR, getDefaultUserBackupDir()];
    const uniqueTargets = Array.from(new Set(targets)).filter(Boolean);

    for (const targetDir of uniqueTargets) {
      try {
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        const filePath = path.join(targetDir, fileName);
        fs.writeFileSync(filePath, compactJson, 'utf8');
        savedPaths.push(filePath);

        // Also save latest_close_backup.json
        fs.writeFileSync(path.join(targetDir, 'latest_close_backup.json'), compactJson, 'utf8');

        // Rotate: keep the last 30 backups in this folder
        const existingFiles = fs.readdirSync(targetDir)
          .filter((f) => f.startsWith('backup_arka_pos_') && f.endsWith('.json'))
          .map((f) => ({ name: f, path: path.join(targetDir, f), time: fs.statSync(path.join(targetDir, f)).mtimeMs }))
          .sort((a, b) => b.time - a.time);

        if (existingFiles.length > 30) {
          for (let i = 30; i < existingFiles.length; i++) {
            try {
              fs.unlinkSync(existingFiles[i].path);
            } catch {}
          }
        }
      } catch (e) {
        console.warn('[-] Backup write to directory error:', targetDir, e.message);
      }
    }
    console.log(`[✔] Auto-backup on ${reason} completed: ${savedPaths.join(' , ')}`);
    return savedPaths;
  } catch (err) {
    console.warn('[-] Auto-backup error:', err.message);
    return [];
  }
}

// Hook process exit events so server shutdown automatically saves backup to default folder
['SIGINT', 'SIGTERM', 'SIGHUP'].forEach((sig) => {
  process.on(sig, () => {
    if (!hasTriggeredExitBackup) {
      hasTriggeredExitBackup = true;
      triggerServerSideAutoBackup(sig);
    }
    process.exit(0);
  });
});

process.on('exit', () => {
  if (!hasTriggeredExitBackup) {
    hasTriggeredExitBackup = true;
    triggerServerSideAutoBackup('process_exit');
  }
});

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
  } catch (e) {
    // ignore
  }
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
    if (req.headers['x-forwarded-proto'] || req.headers['x-real-ip']) {
      return 80;
    }
    if (req.headers.host) {
      const h = String(req.headers.host);
      if (!h.includes(':')) return 80;
    }
  }
  return PORT;
}

function getSavedDomain() {
  if (process.env.SERVER_DOMAIN && process.env.SERVER_DOMAIN.trim()) {
    return process.env.SERVER_DOMAIN.trim();
  }
  try {
    const domainFile = path.join(DATA_DIR, 'server_domain.conf');
    if (fs.existsSync(domainFile)) {
      return fs.readFileSync(domainFile, 'utf8').trim();
    }
  } catch (e) {}
  return '';
}

function getEffectiveHostname() {
  if (process.env.HOST_HOSTNAME && process.env.HOST_HOSTNAME.trim()) {
    return process.env.HOST_HOSTNAME.trim();
  }
  try {
    const hostFile = path.join(DATA_DIR, 'server_hostname.conf');
    if (fs.existsSync(hostFile)) {
      const h = fs.readFileSync(hostFile, 'utf8').trim();
      if (h) return h;
    }
  } catch (e) {}
  return os.hostname();
}

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
  const rawHw = `ARKA_CENTRAL_SRV_${getEffectiveHostname()}_${os.platform()}_${os.arch()}_${cpuModel}`;
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

const LEGACY_DEMO_BANK_CARDS = new Set([
  '6104-3378-9012-3456',
  '6219-8610-4455-6677',
  '6037-9975-1122-3344',
]);
const LEGACY_DEMO_BANK_IBANS = new Set([
  'IR450120000000004589123456',
  'IR820560082180008210987654',
  'IR110170000000109988776001',
]);
const LEGACY_DEMO_BANK_NAMES = new Set([
  'بانک ملت (کارتخوان ۱)',
  'بانک سامان (کارتخوان ۲)',
  'بانک ملی (حساب چک و جاری)',
]);

function isLegacyDemoBank(item) {
  if (!item || typeof item !== 'object') return false;
  const card = item.cardNumber ? String(item.cardNumber).trim() : '';
  const iban = item.iban ? String(item.iban).trim() : '';
  const name = item.bankName ? String(item.bankName).trim() : '';
  return (
    (card && LEGACY_DEMO_BANK_CARDS.has(card)) ||
    (iban && LEGACY_DEMO_BANK_IBANS.has(iban)) ||
    (name && LEGACY_DEMO_BANK_NAMES.has(name))
  );
}

function deinflateMonetaryValue(rawVal, maxAllowed) {
  const num = Number(rawVal);
  if (rawVal === undefined || rawVal === null || !Number.isFinite(num) || num === 0) {
    return { value: 0, factor: 1 };
  }
  const sign = num < 0 ? -1 : 1;
  let absVal = Math.abs(num);
  if (maxAllowed <= 0 || absVal <= maxAllowed) {
    return { value: Math.round(num), factor: 1 };
  }
  let factor = 1;
  while (absVal > maxAllowed && factor < 1e27) {
    absVal = absVal / 10;
    factor *= 10;
  }
  let cleaned = Math.round(absVal);
  if (factor >= 1e9 && cleaned >= 10000) {
    cleaned = Math.round(absVal / 500) * 500;
  } else if (factor >= 10 && cleaned >= 1000 && cleaned % 100 !== 0) {
    cleaned = Math.round(absVal / 100) * 100;
  }
  return { value: sign * cleaned, factor };
}

function repairExcessZeroInflationOnDataObject(data, nowTimestampMs) {
  if (!data || typeof data !== 'object') return false;
  const firstSetting = Array.isArray(data.settings) && data.settings.length > 0 ? data.settings[0] : null;
  const unit = firstSetting && firstSetting.currencyUnit === 'rial' ? 'rial' : 'toman';
  const mult = unit === 'rial' ? 10 : 1;
  const nowTs = nowTimestampMs || Date.now();

  const MAX_SELF_SERVICE_UNIT = 3500000 * mult;
  const MAX_HALF_SERVICE_UNIT = 2000000 * mult;
  const MAX_BEVERAGE_UNIT = 450000 * mult;
  const MAX_MENU_FOOD_UNIT = 3000000 * mult;
  const MAX_RAW_MATERIAL_UNIT = 50000000 * mult;
  const isBeverageLabel = (name) =>
    Boolean(name && /(نوشابه|دوغ|آب|دلستر|ماءالشعیر|شربت|آبمیوه|کوکا|فانتا|اسپرایت|پپسی|سودا)/.test(String(name)));

  let modified = false;

  if (Array.isArray(data.settings)) {
    for (const s of data.settings) {
      if (!s || typeof s !== 'object') continue;
      let sChanged = false;
      if (typeof s.selfServicePricePerPerson === 'number' && s.selfServicePricePerPerson > MAX_SELF_SERVICE_UNIT) {
        const res = deinflateMonetaryValue(s.selfServicePricePerPerson, MAX_SELF_SERVICE_UNIT);
        if (res.factor > 1) { s.selfServicePricePerPerson = res.value; sChanged = true; }
      }
      for (const f of ['defaultSodaPrice', 'defaultDoughPrice', 'defaultWaterPrice', 'defaultDelsterPrice']) {
        if (typeof s[f] === 'number' && s[f] > MAX_BEVERAGE_UNIT) {
          const res = deinflateMonetaryValue(s[f], MAX_BEVERAGE_UNIT);
          if (res.factor > 1) { s[f] = res.value; sChanged = true; }
        }
      }
      if (Array.isArray(s.quickBeverages)) {
        for (const bev of s.quickBeverages) {
          if (bev && typeof bev.price === 'number' && bev.price > MAX_BEVERAGE_UNIT) {
            const res = deinflateMonetaryValue(bev.price, MAX_BEVERAGE_UNIT);
            if (res.factor > 1) { bev.price = res.value; sChanged = true; }
          }
        }
      }
      if (sChanged) {
        s._updatedAtMs = Math.max(nowTs, (Number(s._updatedAtMs) || 0) + 1000);
        modified = true;
      }
    }
  }

  if (Array.isArray(data.menuItems)) {
    for (const m of data.menuItems) {
      if (!m || typeof m !== 'object') continue;
      const ceiling = m.isQuickBeverage || isBeverageLabel(m.name) ? MAX_BEVERAGE_UNIT : MAX_MENU_FOOD_UNIT;
      if (typeof m.price === 'number' && m.price > ceiling) {
        const res = deinflateMonetaryValue(m.price, ceiling);
        if (res.factor > 1) {
          m.price = res.value;
          m._updatedAtMs = Math.max(nowTs, (Number(m._updatedAtMs) || 0) + 1000);
          modified = true;
        }
      }
    }
  }

  const orderFactorByInvoiceNum = new Map();
  const orderFactorById = new Map();

  if (Array.isArray(data.orders)) {
    for (const o of data.orders) {
      if (!o || typeof o !== 'object') continue;
      let orderFactor = 1;
      let orderItemChanged = false;

      let cleanSSUnitPrice = o.selfServiceUnitPrice !== undefined ? Number(o.selfServiceUnitPrice) || 0 : undefined;
      if (cleanSSUnitPrice !== undefined && cleanSSUnitPrice > MAX_SELF_SERVICE_UNIT) {
        const ssRes = deinflateMonetaryValue(cleanSSUnitPrice, MAX_SELF_SERVICE_UNIT);
        if (ssRes.factor > 1) {
          cleanSSUnitPrice = ssRes.value;
          orderFactor = Math.max(orderFactor, ssRes.factor);
          orderItemChanged = true;
        }
      }

      let itemsSubtotal = 0;
      let hasSelfServiceTicketInItems = false;

      if (Array.isArray(o.items)) {
        o.items = o.items.map((it) => {
          if (!it || typeof it !== 'object') return it;
          const rawPrice = Number(it.price) || 0;
          const qty = Math.max(0, Number(it.quantity) || 0);
          const isFullSS =
            it.menuItemId === -1 ||
            String(it.name || '').includes('تمام‌بها') ||
            (String(it.name || '').includes('ورودی') && !String(it.name || '').includes('نیم‌بها'));
          const isHalfSS = it.menuItemId === -2 || String(it.name || '').includes('نیم‌بها');

          const itemCeiling = isFullSS
            ? MAX_SELF_SERVICE_UNIT
            : isHalfSS
            ? MAX_HALF_SERVICE_UNIT
            : isBeverageLabel(it.name)
            ? MAX_BEVERAGE_UNIT
            : MAX_MENU_FOOD_UNIT;

          let cleanPrice = Math.round(rawPrice);
          if (cleanPrice > itemCeiling) {
            const itRes = deinflateMonetaryValue(cleanPrice, itemCeiling);
            if (itRes.factor > 1) {
              cleanPrice = itRes.value;
              orderFactor = Math.max(orderFactor, itRes.factor);
              orderItemChanged = true;
            }
          }

          if (isFullSS) {
            hasSelfServiceTicketInItems = true;
            if (cleanSSUnitPrice && cleanSSUnitPrice > 0 && cleanPrice > MAX_SELF_SERVICE_UNIT) {
              cleanPrice = cleanSSUnitPrice;
              orderItemChanged = true;
            }
          } else if (isHalfSS) {
            hasSelfServiceTicketInItems = true;
            if (cleanSSUnitPrice && cleanSSUnitPrice > 0 && cleanPrice > MAX_HALF_SERVICE_UNIT) {
              cleanPrice = Math.round(cleanSSUnitPrice / 2);
              orderItemChanged = true;
            }
          }

          itemsSubtotal += Math.round(cleanPrice * qty);
          return {
            ...it,
            price: cleanPrice,
            quantity: qty,
          };
        });
      }

      if (
        o.invoiceMode === 'self_service' &&
        !hasSelfServiceTicketInItems &&
        (Number(o.selfServiceGuests) || 0) > 0 &&
        (cleanSSUnitPrice || 0) > 0
      ) {
        const fullG = Math.max(0, Number(o.selfServiceGuests) || 0);
        const halfG = Math.max(0, Number(o.selfServiceHalfPriceGuests) || 0);
        const uPrice = cleanSSUnitPrice || 0;
        itemsSubtotal += Math.round(fullG * uPrice) + Math.round(halfG * Math.round(uPrice / 2));
      }

      const totalGuests = Math.max(1, (Number(o.selfServiceGuests) || 0) + (Number(o.selfServiceHalfPriceGuests) || 0));
      const maxReasonableOrderTotal = Math.max(250000000 * mult, totalGuests * MAX_SELF_SERVICE_UNIT * 3);
      const rawTotal = Number(o.total) || 0;
      const rawCard = Number(o.cardAmount) || 0;
      const rawCash = Number(o.cashAmount) || 0;

      const isTotalInflated =
        rawTotal > maxReasonableOrderTotal ||
        rawCard > maxReasonableOrderTotal ||
        rawCash > maxReasonableOrderTotal ||
        (itemsSubtotal > 0 && rawTotal > itemsSubtotal * 1.5) ||
        (rawTotal > 0 && rawCash + rawCard > rawTotal * 1.5);

      if (isTotalInflated || orderItemChanged || orderFactor > 1) {
        if (orderFactor === 1) {
          const totRes = deinflateMonetaryValue(Math.max(rawTotal, rawCard, rawCash), maxReasonableOrderTotal);
          orderFactor = Math.max(2, totRes.factor);
        }
        if (cleanSSUnitPrice !== undefined) o.selfServiceUnitPrice = cleanSSUnitPrice;
        const repairedSubtotal = itemsSubtotal > 0 ? itemsSubtotal : Math.round((Number(o.subtotal) || rawTotal) / orderFactor);
        o.subtotal = repairedSubtotal;

        let discountAmt = 0;
        if (o.discountType === 'percent' && (Number(o.discountValue) || 0) > 0) {
          const pct = Math.min(100, Math.max(0, Number(o.discountValue) || 0));
          discountAmt = Math.round((repairedSubtotal * pct) / 100);
        } else if (o.discountType === 'amount' && (Number(o.discountValue) || 0) > 0) {
          o.discountValue = Math.min(repairedSubtotal, Math.round((Number(o.discountValue) || 0) / orderFactor));
          discountAmt = o.discountValue;
        }

        const taxable = Math.max(0, repairedSubtotal - discountAmt);
        const repairedTax =
          o.taxEnabled && (Number(o.taxPercentage) || 0) > 0
            ? Math.round((taxable * Number(o.taxPercentage)) / 100)
            : 0;
        o.taxAmount = repairedTax;
        const repairedTotal = Math.max(0, taxable + repairedTax);
        o.total = repairedTotal;

        if (o.paymentMethod === 'cash') {
          o.cashAmount = repairedTotal;
          o.cardAmount = 0;
        } else if (o.paymentMethod === 'card') {
          o.cashAmount = 0;
          o.cardAmount = repairedTotal;
        } else if (o.paymentMethod === 'credit') {
          o.cashAmount = 0;
          o.cardAmount = 0;
        } else if (o.paymentMethod === 'split') {
          const scaledCash = Math.min(repairedTotal, Math.max(0, Math.round((Number(o.cashAmount) || 0) / orderFactor)));
          o.cashAmount = scaledCash;
          o.cardAmount = Math.max(0, repairedTotal - scaledCash);
        }

        // COGS repair
        let cleanCogs = Number(o.cogsAmount) || 0;
        if (cleanCogs > repairedTotal * 1.5 && repairedTotal > 0) {
          cleanCogs = deinflateMonetaryValue(cleanCogs, Math.round(repairedTotal * 0.9)).value;
          o.cogsAmount = cleanCogs > 0 && cleanCogs <= repairedTotal ? cleanCogs : Math.round(repairedTotal * 0.45);
        }

        o._updatedAtMs = Math.max(nowTs, (Number(o._updatedAtMs) || 0) + 1000);
        modified = true;
      }

      if (o.invoiceNumber !== undefined && o.invoiceNumber !== null) {
        orderFactorByInvoiceNum.set(Number(o.invoiceNumber), { factor: orderFactor, order: o });
      }
      if (o.id !== undefined && o.id !== null) {
        orderFactorById.set(Number(o.id), { factor: orderFactor, order: o });
      }
    }
  }

  const repairedBankIds = new Set();
  if (Array.isArray(data.journalVouchers)) {
    for (const v of data.journalVouchers) {
      if (!v || typeof v !== 'object' || !Array.isArray(v.lines)) continue;
      let matchedOrder = null;
      let orderFactor = 1;
      if (v.type === 'auto_sale' && !String(v.description || '').includes('تولید آشپزخانه')) {
        if (v.referenceId !== undefined && orderFactorByInvoiceNum.has(Number(v.referenceId))) {
          const entry = orderFactorByInvoiceNum.get(Number(v.referenceId));
          matchedOrder = entry.order;
          orderFactor = entry.factor;
        } else if (v.referenceId !== undefined && orderFactorById.has(Number(v.referenceId))) {
          const entry = orderFactorById.get(Number(v.referenceId));
          matchedOrder = entry.order;
          orderFactor = entry.factor;
        } else if (v.description) {
          const match = String(v.description).match(/#(\d+)/);
          if (match && orderFactorByInvoiceNum.has(Number(match[1]))) {
            const entry = orderFactorByInvoiceNum.get(Number(match[1]));
            matchedOrder = entry.order;
            orderFactor = entry.factor;
          }
        }
      }

      if (matchedOrder && matchedOrder.total > 0) {
        const settlementDebit = v.lines
          .filter((l) => ['101', '102', '103'].includes(String(l && l.accountCode)))
          .reduce((s, l) => s + (Number(l.debit) || 0), 0);

        if (orderFactor > 1 || settlementDebit > matchedOrder.total * 5) {
          const rebuiltLines = [];
          const invNum = matchedOrder.invoiceNumber || v.referenceId || '';
          const payMethod = matchedOrder.paymentMethod || 'card';

          if (payMethod === 'cash') {
            rebuiltLines.push({ accountCode: '101', accountName: 'صندوق نقدی رستوران', debit: matchedOrder.total, credit: 0, description: `دریافت نقدی فاکتور #${invNum}` });
          } else if (payMethod === 'credit') {
            rebuiltLines.push({ accountCode: '103', accountName: 'حساب‌های دریافتنی (مشتریان و نسیه)', personName: matchedOrder.customerName || matchedOrder.customerPhone || 'مشتری نسیه', debit: matchedOrder.total, credit: 0, description: `فروش نسیه فاکتور #${invNum}` });
          } else if (payMethod === 'split') {
            const csh = Number(matchedOrder.cashAmount) || 0;
            const crd = Number(matchedOrder.cardAmount) || Math.max(0, matchedOrder.total - csh);
            if (csh > 0) rebuiltLines.push({ accountCode: '101', accountName: 'صندوق نقدی رستوران', debit: csh, credit: 0, description: `بخش نقدی فاکتور #${invNum}` });
            if (crd > 0) rebuiltLines.push({ accountCode: '102', accountName: 'موجودی بانک‌ها و کارتخوان‌ها', debit: crd, credit: 0, description: `بخش کارتخوان (${matchedOrder.bankName || v.bankName || ''}) فاکتور #${invNum}` });
          } else {
            rebuiltLines.push({ accountCode: '102', accountName: 'موجودی بانک‌ها و کارتخوان‌ها', debit: matchedOrder.total, credit: 0, description: `دریافت کارتخوان (${matchedOrder.bankName || v.bankName || ''}) فاکتور #${invNum}` });
          }

          const subtotal = Number(matchedOrder.subtotal) || matchedOrder.total;
          const taxAmt = Number(matchedOrder.taxAmount) || 0;
          const discountAmt = Math.max(0, subtotal + taxAmt - matchedOrder.total);

          if (discountAmt > 0) {
            rebuiltLines.push({ accountCode: '403', accountName: 'تخفیفات نقدی فروش', debit: discountAmt, credit: 0, description: `تخفیف فاکتور #${invNum}` });
          }

          if (matchedOrder.invoiceMode === 'self_service') {
            const fullG = Math.max(0, Number(matchedOrder.selfServiceGuests) || 0);
            const halfG = Math.max(0, Number(matchedOrder.selfServiceHalfPriceGuests) || 0);
            const uPrice = Number(matchedOrder.selfServiceUnitPrice) || 0;
            const ssPortion = Math.min(subtotal, Math.round(fullG * uPrice) + Math.round(halfG * Math.round(uPrice / 2)));
            const extraPortion = Math.max(0, subtotal - ssPortion);
            if (ssPortion > 0) rebuiltLines.push({ accountCode: '402', accountName: 'درآمد فیش سلف سرویس و نوشابه', debit: 0, credit: ssPortion, description: `فیش سلف سرویس (${fullG + halfG} نفر) #${invNum}` });
            if (extraPortion > 0) rebuiltLines.push({ accountCode: '401', accountName: 'درآمد فروش غذا و منو', debit: 0, credit: extraPortion, description: `آیتم‌های اضافی فاکتور #${invNum}` });
            if (ssPortion === 0 && extraPortion === 0) rebuiltLines.push({ accountCode: '402', accountName: 'درآمد فیش سلف سرویس و نوشابه', debit: 0, credit: subtotal, description: `فیش سلف سرویس #${invNum}` });
          } else {
            rebuiltLines.push({ accountCode: '401', accountName: 'درآمد فروش غذا و منو', debit: 0, credit: subtotal, description: `فروش منو فاکتور #${invNum}` });
          }

          if (taxAmt > 0) {
            rebuiltLines.push({ accountCode: '203', accountName: 'مالیات بر ارزش افزوده پرداختنی', debit: 0, credit: taxAmt, description: `مالیات فاکتور #${invNum}` });
          }

          const cogs = Number(matchedOrder.cogsAmount) || 0;
          if (cogs > 0) {
            rebuiltLines.push({ accountCode: '501', accountName: 'بهای تمام شده غذای فروش رفته (مصرف مواد و تولید)', debit: cogs, credit: 0, description: `بهای تمام شده اتوماتیک فاکتور #${invNum}` });
            rebuiltLines.push({ accountCode: '105', accountName: 'موجودی مواد اولیه انبار', debit: 0, credit: cogs, description: `خروج مواد اولیه مصرفی فاکتور #${invNum}` });
          }

          v.lines = rebuiltLines;
          v.totalAmount = rebuiltLines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
          v._updatedAtMs = Math.max(nowTs, (Number(v._updatedAtMs) || 0) + 1000);
          if (v.bankId) repairedBankIds.add(Number(v.bankId));
          modified = true;
          continue;
        }
      }

      const MAX_VOUCHER_LINE = 500000000 * mult;
      let vFactor = 1;
      for (const l of v.lines) {
        const m = Math.max(Number(l && l.debit) || 0, Number(l && l.credit) || 0);
        if (m > MAX_VOUCHER_LINE) {
          vFactor = Math.max(vFactor, deinflateMonetaryValue(m, MAX_VOUCHER_LINE).factor);
        }
      }
      if (vFactor > 1) {
        v.lines = v.lines.map((l) => ({
          ...l,
          debit: Math.round((Number(l.debit) || 0) / vFactor),
          credit: Math.round((Number(l.credit) || 0) / vFactor),
        }));
        v.totalAmount = v.lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
        v._updatedAtMs = Math.max(nowTs, (Number(v._updatedAtMs) || 0) + 1000);
        if (v.bankId) repairedBankIds.add(Number(v.bankId));
        modified = true;
      }
    }
  }

  if (Array.isArray(data.bankAccounts)) {
    const MAX_BANK_BALANCE = 20000000000 * mult;
    for (const b of data.bankAccounts) {
      if (!b || typeof b !== 'object') continue;
      let bChanged = false;
      if (typeof b.initialBalance === 'number' && Math.abs(b.initialBalance) > MAX_BANK_BALANCE) {
        const res = deinflateMonetaryValue(b.initialBalance, MAX_BANK_BALANCE);
        if (res.factor > 1) { b.initialBalance = res.value; bChanged = true; }
      }
      const bId = b.id !== undefined ? Number(b.id) : undefined;
      const isBankAffected = bId !== undefined && repairedBankIds.has(bId);
      const isCurInflated = typeof b.currentBalance === 'number' && Math.abs(b.currentBalance) > MAX_BANK_BALANCE;
      if (isBankAffected || isCurInflated) {
        if (bId !== undefined && Array.isArray(data.journalVouchers)) {
          const matchingVouchers = data.journalVouchers.filter((v) => v && Number(v.bankId) === bId && Array.isArray(v.lines));
          if (matchingVouchers.length > 0) {
            let delta = 0;
            for (const v of matchingVouchers) {
              for (const line of v.lines) {
                if (String(line && line.accountCode) === '102') {
                  delta += (Number(line.debit) || 0) - (Number(line.credit) || 0);
                }
              }
            }
            const recomputed = (Number(b.initialBalance) || 0) + delta;
            if (b.currentBalance !== recomputed) { b.currentBalance = recomputed; bChanged = true; }
          } else if (isCurInflated) {
            const res = deinflateMonetaryValue(b.currentBalance, MAX_BANK_BALANCE);
            if (res.factor > 1) { b.currentBalance = res.value; bChanged = true; }
          }
        } else if (isCurInflated) {
          const res = deinflateMonetaryValue(b.currentBalance, MAX_BANK_BALANCE);
          if (res.factor > 1) { b.currentBalance = res.value; bChanged = true; }
        }
      }
      if (bChanged) {
        b._updatedAtMs = Math.max(nowTs, (Number(b._updatedAtMs) || 0) + 1000);
        modified = true;
      }
    }
  }

  if (Array.isArray(data.rawMaterials)) {
    for (const rm of data.rawMaterials) {
      if (!rm || typeof rm !== 'object') continue;
      let rmChanged = false;
      const ceiling = rm.unit === 'عدد' && isBeverageLabel(rm.name) ? MAX_BEVERAGE_UNIT : MAX_RAW_MATERIAL_UNIT;
      if (typeof rm.avgCost === 'number' && rm.avgCost > ceiling) {
        const res = deinflateMonetaryValue(rm.avgCost, ceiling);
        if (res.factor > 1) { rm.avgCost = res.value; rmChanged = true; }
      }
      if (typeof rm.lastPurchasePrice === 'number' && rm.lastPurchasePrice > ceiling) {
        const res = deinflateMonetaryValue(rm.lastPurchasePrice, ceiling);
        if (res.factor > 1) { rm.lastPurchasePrice = res.value; rmChanged = true; }
      }
      if (rmChanged) {
        rm._updatedAtMs = Math.max(nowTs, (Number(rm._updatedAtMs) || 0) + 1000);
        modified = true;
      }
    }
  }

  if (Array.isArray(data.inventoryTransactions)) {
    for (const tx of data.inventoryTransactions) {
      if (!tx || typeof tx !== 'object') continue;
      const ceiling = tx.unit === 'عدد' && isBeverageLabel(tx.materialName) ? MAX_BEVERAGE_UNIT : MAX_RAW_MATERIAL_UNIT;
      const uRes = deinflateMonetaryValue(tx.unitPrice, ceiling);
      const qty = Math.max(0, Number(tx.quantity) || 0);
      const balQty = Math.max(0, Number(tx.balanceQtyAfter) || 0);
      const expectedTotal = Math.round(qty * uRes.value);
      const expectedBalVal = Math.round(balQty * uRes.value);
      if (
        uRes.factor > 1 ||
        (typeof tx.totalPrice === 'number' && tx.totalPrice > Math.max(expectedTotal * 5, ceiling)) ||
        (typeof tx.balanceValueAfter === 'number' && tx.balanceValueAfter > Math.max(expectedBalVal * 5, ceiling * 10))
      ) {
        tx.unitPrice = uRes.value;
        tx.totalPrice = expectedTotal;
        tx.balanceValueAfter = expectedBalVal;
        tx._updatedAtMs = Math.max(nowTs, (Number(tx._updatedAtMs) || 0) + 1000);
        modified = true;
      }
    }
  }

  if (Array.isArray(data.cashClosures)) {
    const MAX_CLOSURE_SALES = 2000000000 * mult;
    for (const cc of data.cashClosures) {
      if (!cc || typeof cc !== 'object') continue;
      const avgOrderCeiling = 35000000 * mult;
      const oCount = Math.max(1, Number(cc.orderCount) || 1);
      const maxAllowedTotal = Math.min(MAX_CLOSURE_SALES, oCount * avgOrderCeiling);
      if (typeof cc.totalSales === 'number' && cc.totalSales > maxAllowedTotal) {
        const res = deinflateMonetaryValue(cc.totalSales, maxAllowedTotal);
        if (res.factor > 1) {
          const f = res.factor;
          cc.totalSales = Math.round((Number(cc.totalSales) || 0) / f);
          cc.expectedCash = Math.round((Number(cc.expectedCash) || 0) / f);
          cc.actualCash = Math.round((Number(cc.actualCash) || 0) / f);
          cc.cashDiscrepancy = cc.actualCash - cc.expectedCash;
          cc.totalCard = Math.round((Number(cc.totalCard) || 0) / f);
          cc.totalCredit = Math.round((Number(cc.totalCredit) || 0) / f);
          if (Array.isArray(cc.bankBreakdown)) {
            cc.bankBreakdown = cc.bankBreakdown.map((bb) => ({
              ...bb,
              amount: Math.round((Number(bb.amount) || 0) / f),
            }));
          }
          cc._updatedAtMs = Math.max(nowTs, (Number(cc._updatedAtMs) || 0) + 1000);
          modified = true;
        }
      }
    }
  }

  // 13. Normalize appUsers PINs (Persian/Arabic digits -> ASCII) and repair corrupted UTF-8 replacement characters
  if (Array.isArray(data.appUsers)) {
    const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
    const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    const normalizePin = (raw) => {
      if (raw === undefined || raw === null) return '';
      let str = String(raw);
      for (let i = 0; i < 10; i++) {
        str = str.replace(new RegExp(persianDigits[i], 'g'), String(i));
        str = str.replace(new RegExp(arabicDigits[i], 'g'), String(i));
      }
      return str.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '').trim();
    };
    for (const u of data.appUsers) {
      if (!u || typeof u !== 'object') continue;
      let userChanged = false;
      if (typeof u.pin === 'string' || typeof u.pin === 'number') {
        const cleanPin = normalizePin(u.pin);
        if (cleanPin && cleanPin !== u.pin) {
          u.pin = cleanPin;
          userChanged = true;
        }
      }
      if (typeof u.fullName === 'string' && u.fullName.includes('\uFFFD')) {
        const cleanName = u.fullName
          .replace(/امیر\s*حسی\uFFFD+/g, 'امیر حسین')
          .replace(/\uFFFD+/g, '')
          .trim();
        if (cleanName && cleanName !== u.fullName) {
          u.fullName = cleanName;
          userChanged = true;
        }
      }
      if (userChanged) {
        u._updatedAtMs = Math.max(nowTs, (Number(u._updatedAtMs) || 0) + 1000);
        modified = true;
      }
    }
  }

  return modified;
}

// Sanitize central_db.json on startup: purge legacy deletedRecords, strip the 3 unauthorized demo banks, and repair excess zero inflation
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
      if (!currentDb.deletedRecordsV3 || typeof currentDb.deletedRecordsV3 !== 'object') {
        currentDb.deletedRecordsV3 = {};
      }
      if (!currentDb.deletedRecordsV3.bankAccounts) {
        currentDb.deletedRecordsV3.bankAccounts = {};
      }
      for (const b of currentDb.bankAccounts) {
        if (isLegacyDemoBank(b)) {
          modified = true;
          if (b.id !== undefined && b.id !== null) {
            currentDb.deletedRecordsV3.bankAccounts[String(b.id)] = nowTs;
            currentDb.deletedRecordsV3.bankAccounts['id:' + b.id] = nowTs;
          }
          if (b.bankName) {
            currentDb.deletedRecordsV3.bankAccounts['bank:' + b.bankName] = nowTs;
          }
        } else {
          filteredBanks.push(b);
        }
      }
      if (filteredBanks.length !== currentDb.bankAccounts.length) {
        currentDb.bankAccounts = filteredBanks;
      }
    }

    if (repairExcessZeroInflationOnDataObject(currentDb, nowTs)) {
      modified = true;
    }

    // Ensure every record has a valid _updatedAtMs
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

    if (modified) {
      const cleanJson = JSON.stringify(currentDb, null, 2);
      fs.writeFileSync(DB_FILE, cleanJson, 'utf8');
      try {
        fs.writeFileSync(path.join(DATA_DIR, 'latest_db_backup.json'), cleanJson, 'utf8');
      } catch (e) {}
    }
  } catch (e) {
    console.warn('[-] Startup sanitize check error:', e.message);
  }
})();

let currentRev = 1;
let lastRawResetRev = 0;

try {
  if (fs.existsSync(DB_FILE)) {
    const stat = fs.statSync(DB_FILE);
    currentRev = Math.max(1, Math.floor(stat.mtimeMs / 1000));
  }
} catch (e) {}

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
      const content = fs.readFileSync(hostIpFile, 'utf8').trim();
      content.split(/[\s,]+/).forEach((ip) => {
        if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip) && !hostConfiguredIps.includes(ip)) {
          hostConfiguredIps.push(ip);
        }
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
        // Skip internal Docker bridge subnets 172.17.x.x - 172.31.x.x if host IPs exist
        const isDockerBridge = /^172\.(1[7-9]|2\d|3[0-1])\./.test(iface.address);
        if (isVirtual || isDockerBridge) {
          virtualIps.push(iface.address);
        } else {
          physicalIps.push(iface.address);
        }
      }
    }
  }

  const sortFn = (a, b) => {
    if (a.startsWith('192.168.') && !b.startsWith('192.168.')) return -1;
    if (!a.startsWith('192.168.') && b.startsWith('192.168.')) return 1;
    if (a.startsWith('10.') && !b.startsWith('10.')) return -1;
    if (!a.startsWith('10.') && b.startsWith('10.')) return 1;
    return a.localeCompare(b);
  };

  physicalIps.sort(sortFn);
  virtualIps.sort(sortFn);

  const combined = [...hostConfiguredIps, ...physicalIps];
  if (combined.length === 0) {
    combined.push(...virtualIps);
  }
  return Array.from(new Set(combined));
}

function hasDbData(obj) {
  if (!obj || typeof obj !== 'object') return false;
  let totalCount = 0;
  for (const t of ALL_SYNC_TABLES) {
    if (Array.isArray(obj[t])) {
      totalCount += obj[t].length;
    }
  }
  const hasDel =
    obj.deletedRecordsV3 &&
    typeof obj.deletedRecordsV3 === 'object' &&
    Object.keys(obj.deletedRecordsV3).length > 0;
  return totalCount > 0 || Boolean(hasDel);
}

function getItemTimestampMs(item) {
  if (!item || typeof item !== 'object') return 1;
  if (item._updatedAtMs && Number.isFinite(Number(item._updatedAtMs)) && Number(item._updatedAtMs) > 0) {
    return Number(item._updatedAtMs);
  }
  const fields = ['updatedAt', 'createdAt', 'closedAt', 'date', 'issueDate', 'employmentStartDate'];
  for (const f of fields) {
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
    case 'settings':
      return 'settings_singleton';
    case 'orders':
      return String(item.invoiceNumber !== undefined && item.invoiceNumber !== null ? item.invoiceNumber : effId || '');
    case 'journalVouchers':
      return String(item.voucherNumber !== undefined && item.voucherNumber !== null ? item.voucherNumber : effId || '');
    case 'customers':
      return String(item.phone || effId || '');
    case 'cashClosures':
      return String(item.dateLabel || item.closedAt || effId || '');
    case 'kitchenProductions':
      return String(item.batchNumber || effId || '');
    case 'categories':
    case 'menuItems':
      return String(effId || item.name || '');
    case 'bankAccounts':
      return String(effId || (item.bankName ? `${item.bankName}_${item.cardNumber || ''}` : ''));
    case 'persons':
      return String(effId || (item.name ? `${item.name}_${item.role || ''}` : ''));
    case 'cheques':
      return String(item.chequeNumber || effId || '');
    case 'rawMaterials':
      return String(effId || item.name || '');
    case 'productionRecipes':
      return String(item.menuItemId || effId || '');
    case 'inventoryTransactions':
      return String(effId || `${item.materialId || ''}_${item.date || ''}_${item.type || ''}`);
    case 'appUsers':
      return String(item.username || effId || '').trim().toLowerCase();
    case 'accounts':
      return String(item.code || effId || '');
    default:
      return String(effId || item.code || item.name || '');
  }
}

function isRecordDeletedInMap(tableName, item, canonicalKey, deletedMap) {
  if (tableName === 'bankAccounts' && isLegacyDemoBank(item)) {
    return true;
  }
  const tableDel = deletedMap && deletedMap[tableName];
  if (!tableDel || typeof tableDel !== 'object') return false;

  let maxDelTs = 0;
  if (canonicalKey && tableDel[canonicalKey]) {
    maxDelTs = Math.max(maxDelTs, Number(tableDel[canonicalKey]) || 0);
  }
  if (item && typeof item === 'object') {
    if (item.id !== undefined && item.id !== null) {
      maxDelTs = Math.max(
        maxDelTs,
        Number(tableDel['id:' + item.id]) || 0,
        tableName !== 'orders' && tableName !== 'journalVouchers' ? (Number(tableDel[String(item.id)]) || 0) : 0
      );
    }
    if (item.invoiceNumber !== undefined && item.invoiceNumber !== null) {
      maxDelTs = Math.max(maxDelTs, Number(tableDel[String(item.invoiceNumber)]) || 0);
    }
    if (item.voucherNumber !== undefined && item.voucherNumber !== null) {
      maxDelTs = Math.max(maxDelTs, Number(tableDel[String(item.voucherNumber)]) || 0);
    }
    if (item.phone) {
      maxDelTs = Math.max(maxDelTs, Number(tableDel[String(item.phone)]) || 0);
    }
    if (item.name) {
      maxDelTs = Math.max(maxDelTs, Number(tableDel['name:' + item.name]) || 0);
    }
    if (item.bankName) {
      maxDelTs = Math.max(maxDelTs, Number(tableDel['bank:' + item.bankName]) || 0);
    }
    if (item.username) {
      maxDelTs = Math.max(maxDelTs, Number(tableDel[String(item.username)]) || 0);
    }
  }

  if (maxDelTs <= 0) return false;
  const itemTs = getItemTimestampMs(item);
  return maxDelTs >= itemTs;
}

function mergeDatabaseObjects(existing, incoming, preferIncoming) {
  if (!existing || typeof existing !== 'object') return incoming || {};
  if (!incoming || typeof incoming !== 'object') return existing || {};

  const result = { ...existing };
  delete result.deletedRecords;
  const nowTs = Date.now();

  // Merge deletedRecordsV3 tombstones from both existing and incoming
  const mergedDeleted = {};
  const sourceDelMaps = [existing.deletedRecordsV3, incoming.deletedRecordsV3];
  for (const src of sourceDelMaps) {
    if (!src || typeof src !== 'object') continue;
    for (const [table, keyMap] of Object.entries(src)) {
      if (!keyMap || typeof keyMap !== 'object') continue;
      if (!mergedDeleted[table]) mergedDeleted[table] = {};
      for (const [k, ts] of Object.entries(keyMap)) {
        const numTs = Number(ts) || 0;
        if (numTs > (mergedDeleted[table][k] || 0)) {
          mergedDeleted[table][k] = numTs;
        }
      }
    }
  }
  result.deletedRecordsV3 = mergedDeleted;

  const mergeTableChronologically = (tableName, sortComparator) => {
    const map = new Map();
    if (Array.isArray(existing[tableName])) {
      for (const item of existing[tableName]) {
        if (!item) continue;
        const k = getCanonicalKey(tableName, item);
        if (!k) continue;
        if (!isRecordDeletedInMap(tableName, item, k, mergedDeleted)) {
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
          const prevIsDefaultSeed = Boolean(prev._isDefaultSeed);
          const incIsDefaultSeed = Boolean(item._isDefaultSeed);
          if (incIsDefaultSeed && !prevIsDefaultSeed && !preferIncoming) {
            continue;
          }
          const prevTs = getItemTimestampMs(prev);
          const incTs = getItemTimestampMs(item);
          if (preferIncoming || (prevIsDefaultSeed && !incIsDefaultSeed) || incTs >= prevTs) {
            map.set(k, {
              ...prev,
              ...item,
              id: prev.id !== undefined ? prev.id : item.id,
              _updatedAtMs: preferIncoming ? Math.max(incTs, prevTs + 1000, nowTs) : Math.max(incTs, prevTs, 1),
            });
          }
        } else {
          map.set(
            k,
            preferIncoming
              ? { ...item, _updatedAtMs: Math.max(getItemTimestampMs(item), nowTs) }
              : item._updatedAtMs
              ? item
              : { ...item, _updatedAtMs: getItemTimestampMs(item) || nowTs }
          );
        }
      }
    }
    const arr = Array.from(map.values());
    if (sortComparator) {
      arr.sort(sortComparator);
    }
    result[tableName] = arr;
  };

  mergeTableChronologically('orders', (a, b) => (Number(a.invoiceNumber) || 0) - (Number(b.invoiceNumber) || 0));
  mergeTableChronologically('customers');
  mergeTableChronologically('journalVouchers', (a, b) => (Number(a.voucherNumber) || 0) - (Number(b.voucherNumber) || 0));
  mergeTableChronologically('inventoryTransactions');
  mergeTableChronologically('kitchenProductions');
  mergeTableChronologically('cashClosures');
  mergeTableChronologically('categories');
  mergeTableChronologically('menuItems');
  mergeTableChronologically('bankAccounts');
  mergeTableChronologically('persons');
  mergeTableChronologically('cheques');
  mergeTableChronologically('rawMaterials');
  mergeTableChronologically('productionRecipes');
  mergeTableChronologically('accounts');
  mergeTableChronologically('appUsers');

  // Settings: compare timestamps, deduplicate, and NEVER overwrite real bot tokens with empty strings
  if (Array.isArray(incoming.settings) && incoming.settings.length > 0) {
    if (Array.isArray(existing.settings) && existing.settings.length > 0) {
      const prevS = existing.settings[0];
      const incS = incoming.settings[0];
      const prevTs = getItemTimestampMs(prevS);
      const incTs = getItemTimestampMs(incS);
      const isIncDefault = Boolean(incS._isDefaultSeed) || incTs <= 1000;

      const mergedS = { ...prevS, ...incS };
      // Protect bot tokens & central license info
      for (const bf of ['baleBotToken', 'baleChatId', 'telegramBotToken', 'telegramChatId', 'logoUrl']) {
        if ((!incS[bf] || String(incS[bf]).trim() === '') && prevS[bf] && String(prevS[bf]).trim() !== '') {
          mergedS[bf] = prevS[bf];
        }
      }
      if (!incS.centralLicenseInfo && prevS.centralLicenseInfo) {
        mergedS.centralLicenseInfo = prevS.centralLicenseInfo;
      }
      if (isIncDefault && prevS.currencyUnit) {
        mergedS.currencyUnit = prevS.currencyUnit;
        mergedS.selfServicePricePerPerson = prevS.selfServicePricePerPerson;
      }
      mergedS.id = 1;
      mergedS._updatedAtMs = Math.max(incTs, prevTs, nowTs);
      mergedS._isDefaultSeed = false;
      result.settings = [mergedS];
    } else {
      result.settings = [{ ...incoming.settings[0], id: 1 }];
    }
  } else if (Array.isArray(existing.settings) && existing.settings.length > 0) {
    result.settings = [{ ...existing.settings[0], id: 1 }];
  }

  repairExcessZeroInflationOnDataObject(result, nowTs);

  result.version = incoming.version || existing.version || 8;
  result.exportedAt = new Date().toISOString();
  return result;
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

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

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
        serverHostname: getEffectiveHostname(),
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

    if (parsedUrl.pathname === '/api/db/version' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(JSON.stringify({
        ok: true,
        rev: currentRev,
        lastRawResetRev,
        serverTimeMs: Date.now(),
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
          res.end(JSON.stringify({
            ok: true,
            rev: currentRev,
            serverTimeMs: Date.now(),
            data: JSON.parse(content),
          }));
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
      let domainUrl = '';
      if (customDomain) {
        if (customDomain.startsWith('http://') || customDomain.startsWith('https://')) {
          domainUrl = customDomain;
        } else if (customDomain.includes(':')) {
          domainUrl = `http://${customDomain}`;
        } else {
          domainUrl = os.platform() === 'linux' ? `https://${customDomain}` : `http://${customDomain}:${publicPort}`;
        }
      }
      const portSuffix = publicPort === 80 || publicPort === 443 ? '' : `:${publicPort}`;
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store',
      });
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

    if (parsedUrl.pathname === '/api/network/set-domain' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const cleanDomain = String(payload.domain || '').trim();
          fs.writeFileSync(path.join(DATA_DIR, 'server_domain.conf'), cleanDomain, 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, domain: cleanDomain, message: 'دامنه اختصاصی سرور ذخیره گردید.' }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'خطا در ثبت دامنه سرور.' }));
        }
      });
      return;
    }

    if (parsedUrl.pathname === '/api/network/set-port' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const newPort = Number(payload.port);
          if (newPort && newPort >= 80 && newPort < 65535) {
            fs.writeFileSync(path.join(DATA_DIR, 'server_port.conf'), String(newPort), 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true, port: newPort, message: 'پورت سرور ذخیره گردید.' }));
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: 'شماره پورت نامعتبر است.' }));
          }
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'خطا در ثبت پورت.' }));
        }
      });
      return;
    }

    if (parsedUrl.pathname === '/api/printers/list' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store',
      });
      const { exec } = require('child_process');
      if (os.platform() === 'win32') {
        exec('powershell -NoProfile -Command "Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name"', { timeout: 4000 }, (err, stdout) => {
          if (!err && stdout) {
            const printers = stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
            res.end(JSON.stringify({ ok: true, printers }));
          } else {
            exec('wmic printer get name', { timeout: 3000 }, (err2, stdout2) => {
              if (!err2 && stdout2) {
                const printers = stdout2.split(/\r?\n/).map(s => s.trim()).filter(s => s && s !== 'Name');
                res.end(JSON.stringify({ ok: true, printers }));
              } else {
                res.end(JSON.stringify({ ok: false, printers: [] }));
              }
            });
          }
        });
      } else {
        exec('lpstat -e', { timeout: 3000 }, (err, stdout) => {
          if (!err && stdout) {
            const printers = stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
            res.end(JSON.stringify({ ok: true, printers }));
          } else {
            res.end(JSON.stringify({ ok: false, printers: [] }));
          }
        });
      }
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
          const forceOverwrite = Boolean(payload.forceOverwrite);

          if (serverHasData && !clientHasData && !forceOverwrite) {
            res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              ok: false,
              isOutdated: true,
              rev: currentRev,
              serverTimeMs: Date.now(),
              error: 'دیتابیس سرور دارای اطلاعات موجود است و کلاینت خالی مجاز به پاک کردن آن نیست.'
            }));
            return;
          }

          let finalDataToSave = payload.data;
          let wasMerged = false;
          if (payload.data && (clientHasData || forceOverwrite)) {
            if (serverHasData && existingData) {
              try {
                fs.writeFileSync(
                  path.join(BACKUP_DIR, 'central_db_autobackup.json'),
                  JSON.stringify(existingData, null, 2),
                  'utf8'
                );
              } catch (e) {}

              if (!forceOverwrite) {
                finalDataToSave = mergeDatabaseObjects(existingData, payload.data, false);
                wasMerged = true;
              } else {
                finalDataToSave = mergeDatabaseObjects(existingData, payload.data, true);
                wasMerged = false;
              }
            }

            const finalJson = JSON.stringify(finalDataToSave, null, 2);
            const tmpFile = DB_FILE + '.tmp';
            fs.writeFileSync(tmpFile, finalJson, 'utf8');
            fs.renameSync(tmpFile, DB_FILE);
            try {
              fs.writeFileSync(path.join(DATA_DIR, 'latest_db_backup.json'), finalJson, 'utf8');
            } catch (e) {}
            currentRev += forceOverwrite ? 100 : 1;
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            ok: true,
            rev: currentRev,
            serverTimeMs: Date.now(),
            merged: wasMerged,
            data: wasMerged ? finalDataToSave : undefined,
          }));
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
            const cleanData = { ...payload.data, deletedRecords: {}, deletedRecordsV3: {} };
            delete cleanData.deletedRecords;
            const jsonContent = JSON.stringify(cleanData, null, 2);
            fs.writeFileSync(DB_FILE, jsonContent, 'utf8');
            try {
              fs.writeFileSync(path.join(DATA_DIR, 'latest_db_backup.json'), jsonContent, 'utf8');
            } catch (e) {}
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
            if (payload.overwriteCentral || !fs.existsSync(DB_FILE)) {
              try {
                const parsedBackup = JSON.parse(payload.backupJson);
                const nowTs = Date.now();
                delete parsedBackup.deletedRecords;
                parsedBackup.deletedRecordsV3 = {};
                for (const t of ALL_SYNC_TABLES) {
                  if (Array.isArray(parsedBackup[t])) {
                    parsedBackup[t] = parsedBackup[t].map((r) =>
                      r && typeof r === 'object' ? { ...r, _updatedAtMs: nowTs } : r
                    );
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
          res.end(JSON.stringify({ ok: true, rev: currentRev }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false }));
        }
      });
      return;
    }

    // Windows & Linux Automatic Backup on Close endpoint
    if (req.method === 'POST' && parsedUrl.pathname === '/api/db/backup-on-close') {
      try {
        const savedPaths = triggerServerSideAutoBackup('app_close_api');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, savedPaths }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }

    // Static file serving with anti-cache headers for HTML & Service Workers
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
  }
  console.log('═'.repeat(66) + '\n');
});
