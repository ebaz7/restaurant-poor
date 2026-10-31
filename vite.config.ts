import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import https from 'https';
import { defineConfig, Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const MASTER_SECRET_SALT = 'ARKA_POS_OFFLINE_SECRET_SALT_2026_x987654321_REST_SYS';
const MASTER_EMERGENCY_KEY = 'ARKA-9999-MASTER-OVERRIDE-KEY';

function fnvFallbackHexNode(str: string): string {
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

function isKeyValidForCodeNode(userKey: string, sysCode: string): { valid: boolean; isEmergency: boolean } {
  if (!userKey || !sysCode) return { valid: false, isEmergency: false };
  const cleanKey = String(userKey).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanEmergency = MASTER_EMERGENCY_KEY.replace(/[^A-Z0-9]/g, '');
  if (cleanKey === cleanEmergency) {
    return { valid: true, isEmergency: true };
  }
  const cleanCode = String(sysCode).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const combined = `${cleanCode}_${MASTER_SECRET_SALT}`;
  const shaHash = crypto.createHash('sha256').update(combined, 'utf8').digest('hex').substring(0, 16).toUpperCase();
  const fnvHash = fnvFallbackHexNode(combined).substring(0, 16).toUpperCase();
  if (cleanKey === shaHash || cleanKey === fnvHash) {
    return { valid: true, isEmergency: false };
  }
  return { valid: false, isEmergency: false };
}

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
  const licenseFile = path.join(dataDir, 'server_license.json');
  let currentRev = 1;
  let lastRawResetRev = 0;

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Auto-seed central_db.json from backup if missing
  if (!fs.existsSync(dbFile)) {
    const seedBackup = path.join(dataDir, 'latest_db_backup.json');
    if (fs.existsSync(seedBackup)) {
      try {
        fs.copyFileSync(seedBackup, dbFile);
      } catch (e) {}
    }
  }

  try {
    if (fs.existsSync(dbFile)) {
      const stat = fs.statSync(dbFile);
      currentRev = Math.max(1, Math.floor(stat.mtimeMs / 1000));
    }
  } catch {}

  function getItemTimestampMsNode(item: any): number {
    if (!item || typeof item !== 'object') return 1;
    if (item._updatedAtMs && Number.isFinite(Number(item._updatedAtMs))) {
      return Number(item._updatedAtMs);
    }
    const fields = ['updatedAt', 'createdAt', 'closedAt', 'date', 'issueDate'];
    for (const f of fields) {
      if (item[f]) {
        const t = new Date(item[f]).getTime();
        if (Number.isFinite(t) && t > 0) return t;
      }
    }
    return 1;
  }

  function getCanonicalKeyNode(tableName: string, item: any): string {
    if (!item || typeof item !== 'object') return '';
    switch (tableName) {
      case 'orders':
        return String(item.invoiceNumber !== undefined && item.invoiceNumber !== null ? item.invoiceNumber : item.id || '');
      case 'journalVouchers':
        return String(item.voucherNumber !== undefined && item.voucherNumber !== null ? item.voucherNumber : item.id || '');
      case 'customers':
        return String(item.phone || item.id || '');
      case 'cashClosures':
        return String(item.dateLabel || item.closedAt || item.id || '');
      case 'kitchenProductions':
        return String(item.batchNumber || item.id || '');
      case 'categories':
      case 'menuItems':
        return String(item.id || item.name || '');
      case 'appUsers':
        return String(item.username || item.id || '');
      case 'accounts':
        return String(item.code || item.id || '');
      default:
        return String(item.id || item.code || item.name || '');
    }
  }

  function isRecordDeletedInMapNode(tableName: string, item: any, canonicalKey: string, deletedMap: any): boolean {
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
      if (item.username) {
        maxDelTs = Math.max(maxDelTs, Number(tableDel[String(item.username)]) || 0);
      }
    }

    if (maxDelTs <= 0) return false;
    const itemTs = getItemTimestampMsNode(item);
    return maxDelTs >= itemTs;
  }

  function mergeDatabaseObjectsNode(existing: any, incoming: any) {
    if (!existing || typeof existing !== 'object') return incoming || {};
    if (!incoming || typeof incoming !== 'object') return existing || {};

    const result = { ...existing };

    const mergedDeleted: Record<string, Record<string, number>> = {};
    for (const src of [existing.deletedRecords, incoming.deletedRecords]) {
      if (!src || typeof src !== 'object') continue;
      for (const [table, keyMap] of Object.entries(src)) {
        if (!keyMap || typeof keyMap !== 'object') continue;
        if (!mergedDeleted[table]) mergedDeleted[table] = {};
        for (const [k, ts] of Object.entries(keyMap as Record<string, any>)) {
          const numTs = Number(ts) || 0;
          if (numTs > (mergedDeleted[table][k] || 0)) {
            mergedDeleted[table][k] = numTs;
          }
        }
      }
    }
    result.deletedRecords = mergedDeleted;

    const mergeTable = (tableName: string, sortFn?: (a: any, b: any) => number) => {
      const map = new Map();
      if (Array.isArray(existing[tableName])) {
        for (const item of existing[tableName]) {
          if (!item) continue;
          const k = getCanonicalKeyNode(tableName, item);
          if (k && !isRecordDeletedInMapNode(tableName, item, k, mergedDeleted)) {
            map.set(k, item);
          }
        }
      }
      if (Array.isArray(incoming[tableName])) {
        for (const item of incoming[tableName]) {
          if (!item) continue;
          const k = getCanonicalKeyNode(tableName, item);
          if (!k) continue;
          if (isRecordDeletedInMapNode(tableName, item, k, mergedDeleted)) {
            map.delete(k);
            continue;
          }
          const prev = map.get(k);
          if (prev) {
            const prevTs = getItemTimestampMsNode(prev);
            const incTs = getItemTimestampMsNode(item);
            if (incTs >= prevTs) {
              map.set(k, { ...prev, ...item, _updatedAtMs: Math.max(incTs, prevTs) });
            }
          } else {
            map.set(k, item);
          }
        }
      }
      const arr = Array.from(map.values());
      if (sortFn) arr.sort(sortFn);
      result[tableName] = arr;
    };

    mergeTable('orders', (a: any, b: any) => (Number(a.invoiceNumber) || 0) - (Number(b.invoiceNumber) || 0));
    mergeTable('customers');
    mergeTable('journalVouchers', (a: any, b: any) => (Number(a.voucherNumber) || 0) - (Number(b.voucherNumber) || 0));
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

    if (Array.isArray(incoming.settings) && incoming.settings.length > 0) {
      result.settings = incoming.settings;
    } else if (Array.isArray(existing.settings)) {
      result.settings = existing.settings;
    }

    result.version = incoming.version || existing.version || 8;
    result.exportedAt = new Date().toISOString();
    return result;
  }

  function getOrCreateServerLicense() {
    let record: any = null;
    if (fs.existsSync(licenseFile)) {
      try {
        record = JSON.parse(fs.readFileSync(licenseFile, 'utf8'));
      } catch {}
    }

    if ((!record || !record.isActivated) && fs.existsSync(dbFile)) {
      try {
        const dbData = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
        const firstSetting = Array.isArray(dbData?.settings) ? dbData.settings[0] : null;
        if (firstSetting?.centralLicenseInfo?.isActivated && firstSetting.centralLicenseInfo.licenseKey) {
          const cli = firstSetting.centralLicenseInfo;
          const check = isKeyValidForCodeNode(cli.licenseKey, cli.systemCode);
          if (check.valid) {
            record = {
              systemCode: cli.systemCode,
              licenseKey: cli.licenseKey,
              activatedAt: cli.activatedAt || new Date().toISOString(),
              isActivated: true,
              isEmergencyOverride: check.isEmergency,
            };
            try {
              fs.writeFileSync(licenseFile, JSON.stringify(record, null, 2), 'utf8');
            } catch {}
          }
        }
      } catch {}
    }

    if (record && record.systemCode) {
      if (record.licenseKey) {
        const check = isKeyValidForCodeNode(record.licenseKey, record.systemCode);
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
      fs.writeFileSync(licenseFile, JSON.stringify(initialRecord, null, 2), 'utf8');
    } catch {}
    return initialRecord;
  }

  return {
    name: 'central-server-db-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Set standard CORS headers for LAN clients & Tauri Desktop App
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, X-Requested-With, Access-Control-Request-Private-Network');
        res.setHeader('Access-Control-Allow-Private-Network', 'true');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        const url = req.url ? new URL(req.url, 'http://localhost:3000') : new URL('http://localhost:3000');

        if (
          url.pathname === '/registerSW.js' ||
          url.pathname === '/sw.js' ||
          url.pathname === '/dev-sw.js'
        ) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.end('// No-op in dev mode\n');
          return;
        }

        if (url.pathname === '/api/license/status' && req.method === 'GET') {
          const record = getOrCreateServerLicense();
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-store');
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

        if (url.pathname === '/api/license/activate' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c.toString()));
          req.on('end', () => {
            try {
              const payload = JSON.parse(body || '{}');
              const userKey = String(payload.licenseKey || '').trim().toUpperCase();
              const clientSystemCode = String(payload.clientSystemCode || '').trim().toUpperCase();
              const record = getOrCreateServerLicense();

              let targetCode = record.systemCode;
              let check = isKeyValidForCodeNode(userKey, record.systemCode);

              if (!check.valid && clientSystemCode) {
                const clientCheck = isKeyValidForCodeNode(userKey, clientSystemCode);
                if (clientCheck.valid) {
                  check = clientCheck;
                  targetCode = clientSystemCode;
                }
              }

              if (!check.valid) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ ok: false, message: 'کد فعال‌سازی وارد شده معتبر نمی‌باشد.' }));
                return;
              }

              const updatedRecord = {
                systemCode: targetCode,
                licenseKey: userKey,
                activatedAt: new Date().toISOString(),
                isActivated: true,
                isEmergencyOverride: check.isEmergency,
              };

              fs.writeFileSync(licenseFile, JSON.stringify(updatedRecord, null, 2), 'utf8');

              if (fs.existsSync(dbFile)) {
                try {
                  const dbData = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
                  if (Array.isArray(dbData?.settings) && dbData.settings.length > 0) {
                    dbData.settings[0].centralLicenseInfo = updatedRecord;
                    fs.writeFileSync(dbFile, JSON.stringify(dbData, null, 2), 'utf8');
                    currentRev += 1;
                  }
                } catch {}
              }

              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({
                ok: true,
                ...updatedRecord,
                message: 'لایسنس روی سرور مرکزی فعال شد و تمامی کلاینت‌های شبکه به صورت خودکار فعال گردیدند.',
              }));
            } catch (err: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, message: err?.message }));
            }
          });
          return;
        }

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

        if (url.pathname === '/api/network/info' && req.method === 'GET') {
          const interfaces = os.networkInterfaces();
          const ips: string[] = [];
          for (const name of Object.keys(interfaces)) {
            const ifaceList = interfaces[name];
            if (!ifaceList) continue;
            for (const iface of ifaceList) {
              if (iface.family === 'IPv4' && !iface.internal) {
                ips.push(iface.address);
              }
            }
          }
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-store');
          res.end(JSON.stringify({
            ok: true,
            hostname: os.hostname(),
            platform: os.platform(),
            isLinuxServer: os.platform() === 'linux',
            port: 3000,
            localIps: ips,
            primaryUrl: ips.length > 0 ? `http://${ips[0]}:3000` : `http://localhost:3000`,
            serverTime: new Date().toISOString(),
            serverTimeMs: Date.now(),
            rev: currentRev,
          }));
          return;
        }

        if (url.pathname === '/api/db/sync' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c.toString()));
          req.on('end', () => {
            try {
              const payload = JSON.parse(body || '{}');
              const clientRev = Number(payload.clientRevision) || 0;

              const hasData = (obj: any) => {
                if (!obj || typeof obj !== 'object') return false;
                const c = Array.isArray(obj.categories) ? obj.categories.length : 0;
                const m = Array.isArray(obj.menuItems) ? obj.menuItems.length : 0;
                const o = Array.isArray(obj.orders) ? obj.orders.length : 0;
                const s = Array.isArray(obj.settings) ? obj.settings.length : 0;
                const cc = Array.isArray(obj.cashClosures) ? obj.cashClosures.length : 0;
                const jv = Array.isArray(obj.journalVouchers) ? obj.journalVouchers.length : 0;
                const hasDel = obj.deletedRecords && typeof obj.deletedRecords === 'object' && Object.keys(obj.deletedRecords).length > 0;
                return (c + m + o + s + cc + jv) > 0 || Boolean(hasDel);
              };

              let existingData: any = null;
              if (fs.existsSync(dbFile)) {
                try {
                  existingData = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
                } catch {}
              }

              const serverHasData = hasData(existingData);
              const clientHasData = hasData(payload.data);

              if (serverHasData && !clientHasData) {
                res.statusCode = 409;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({
                  ok: false,
                  isOutdated: true,
                  rev: currentRev,
                  serverTimeMs: Date.now(),
                  error: 'دیتابیس سرور دارای اطلاعات موجود است و کلاینت خالی مجاز به پاک کردن آن نیست.'
                }));
                return;
              }

              if (lastRawResetRev > 0 && clientRev < lastRawResetRev) {
                res.statusCode = 409;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({
                  ok: false,
                  isOutdated: true,
                  rev: currentRev,
                  serverTimeMs: Date.now(),
                  error: 'اطلاعات این کلاینت قدیمی است و سرور خام یا بروزرسانی شده است.'
                }));
                return;
              }

              let finalDataToSave = payload.data;
              let wasMerged = false;
              if (payload.data && clientHasData) {
                if (serverHasData && existingData) {
                  try {
                    const backupDir = path.join(dataDir, 'backups');
                    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
                    fs.writeFileSync(path.join(backupDir, 'central_db_autobackup.json'), JSON.stringify(existingData, null, 2), 'utf8');
                  } catch {}

                  finalDataToSave = mergeDatabaseObjectsNode(existingData, payload.data);
                  wasMerged = true;
                }

                const tmpFile = dbFile + '.tmp';
                fs.writeFileSync(tmpFile, JSON.stringify(finalDataToSave, null, 2), 'utf8');
                fs.renameSync(tmpFile, dbFile);
                currentRev += 1;
              }
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({
                ok: true,
                rev: currentRev,
                serverTimeMs: Date.now(),
                merged: wasMerged,
                data: wasMerged ? finalDataToSave : undefined,
              }));
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
                const cleanData = { ...payload.data, deletedRecords: {} };
                const jsonContent = JSON.stringify(cleanData, null, 2);
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
          enabled: false,
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
