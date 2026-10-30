/**
 * Central Server Live Network Synchronization Engine for Arka Restaurant
 * Supports multi-client LAN / Internet real-time synchronization between
 * Central Linux Server, Cashier PCs, Mobile Waiters/Cashiers, Kitchen Displays, and Managers.
 */

import { db } from './db';
import { exportDB, importDB } from './utils';

export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  serverUrl: string;
  lastSyncTime: Date | null;
  serverRevision: number;
  localRevision: number;
  lastError: string | null;
  clientCount?: number;
}

type SyncListener = (state: SyncState) => void;

let currentSyncState: SyncState = {
  isOnline: true,
  isSyncing: false,
  serverUrl: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4040',
  lastSyncTime: null,
  serverRevision: 0,
  localRevision: 0,
  lastError: null,
};

const listeners = new Set<SyncListener>();

function notifyListeners() {
  listeners.forEach((l) => {
    try {
      l({ ...currentSyncState });
    } catch {
      // ignore
    }
  });
}

export function subscribeSyncState(listener: SyncListener): () => void {
  listeners.add(listener);
  listener({ ...currentSyncState });
  return () => {
    listeners.delete(listener);
  };
}

export function getSyncState(): SyncState {
  return { ...currentSyncState };
}

let isApplyingRemoteChange = false;
let syncDebounceTimer: any = null;
let pollTimer: any = null;
let isInitialized = false;

export function setServerUrl(url: string) {
  const cleanUrl = url.trim().replace(/\/+$/, '');
  currentSyncState.serverUrl = cleanUrl;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem('arka_server_url', cleanUrl);
    } catch {
      // ignore
    }
  }
  notifyListeners();
  pullFromCentralServer(true);
}

/**
 * Initializes the central network synchronization engine on client startup:
 * 1. Checks connection with central server (/api/db/version).
 * 2. If server has data, pulls and initializes local Dexie database.
 * 3. Starts background polling (every 2s) to detect updates from other cashiers/devices.
 */
export async function initNetworkSync(customServerUrl?: string) {
  if (isInitialized && !customServerUrl) return;
  isInitialized = true;

  if (customServerUrl) {
    setServerUrl(customServerUrl);
  } else if (typeof window !== 'undefined') {
    const savedUrl = window.localStorage.getItem('arka_server_url');
    if (savedUrl) {
      currentSyncState.serverUrl = savedUrl.replace(/\/+$/, '');
    } else if (
      window.location.protocol === 'tauri:' ||
      window.location.origin.includes('tauri') ||
      (window as any).__TAURI__
    ) {
      currentSyncState.serverUrl = 'http://127.0.0.1:4040';
    } else {
      currentSyncState.serverUrl = window.location.origin;
    }
  }

  // Attach hooks to Dexie tables so ANY change on this client automatically triggers sync to central server
  try {
    db.tables.forEach((table) => {
      table.hook('creating', () => {
        notifyDataChanged();
      });
      table.hook('updating', () => {
        notifyDataChanged();
      });
      table.hook('deleting', () => {
        notifyDataChanged();
      });
    });
  } catch {
    // ignore hook attachment if already attached
  }

  // Initial pull from server
  await pullFromCentralServer(true);

  // Periodic polling every 2 seconds
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    checkServerRevision();
  }, 2000);

  // Hook online/offline events
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      currentSyncState.isOnline = true;
      notifyListeners();
      pullFromCentralServer(false);
    });
    window.addEventListener('offline', () => {
      currentSyncState.isOnline = false;
      notifyListeners();
    });
  }
}

/**
 * Checks central server revision. If server has a newer revision than this client, pulls state.
 */
async function checkServerRevision() {
  if (isApplyingRemoteChange || currentSyncState.isSyncing) return;

  try {
    const res = await fetch(`${currentSyncState.serverUrl}/api/db/version`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      if (currentSyncState.isOnline) {
        currentSyncState.isOnline = false;
        notifyListeners();
      }
      return;
    }

    const info = await res.json();
    currentSyncState.isOnline = true;

    if (info.rev !== undefined && info.rev > currentSyncState.localRevision) {
      // Server has newer changes from another cashier/terminal! Pull now!
      await pullFromCentralServer(false);
    } else {
      currentSyncState.serverRevision = Number(info.rev) || currentSyncState.localRevision;
      notifyListeners();
    }
  } catch (err: any) {
    if (currentSyncState.isOnline) {
      currentSyncState.isOnline = false;
      currentSyncState.lastError = err?.message || 'خطا در اتصال به سرور مرکزی';
      notifyListeners();
    }
  }
}

/**
 * Smartly merges server database state into local Dexie WITHOUT wiping or clearing tables.
 * Preserves newly created local orders, vouchers, customers, and records that haven't been pushed yet.
 */
export async function mergeServerDataIntoDexie(serverData: any): Promise<{ hasUnsyncedLocalRecords: boolean }> {
  if (!serverData || typeof serverData !== 'object') {
    return { hasUnsyncedLocalRecords: false };
  }

  let hasUnsyncedLocalRecords = false;

  const parseDatesInArray = (arr: any[]): any[] => {
    if (!Array.isArray(arr)) return [];
    return arr.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const copy = { ...item };
      if (copy.createdAt && typeof copy.createdAt === 'string') {
        const d = new Date(copy.createdAt);
        if (!isNaN(d.getTime())) copy.createdAt = d;
      }
      if (copy.updatedAt && typeof copy.updatedAt === 'string') {
        const d = new Date(copy.updatedAt);
        if (!isNaN(d.getTime())) copy.updatedAt = d;
      }
      if (copy.date && typeof copy.date === 'string') {
        const d = new Date(copy.date);
        if (!isNaN(d.getTime())) copy.date = d;
      }
      if (copy.closedAt && typeof copy.closedAt === 'string') {
        const d = new Date(copy.closedAt);
        if (!isNaN(d.getTime())) copy.closedAt = d;
      }
      if (copy.issueDate && typeof copy.issueDate === 'string') {
        const d = new Date(copy.issueDate);
        if (!isNaN(d.getTime())) copy.issueDate = d;
      }
      if (copy.dueDate && typeof copy.dueDate === 'string') {
        const d = new Date(copy.dueDate);
        if (!isNaN(d.getTime())) copy.dueDate = d;
      }
      return copy;
    });
  };

  // 1. Orders: NEVER CLEAR! Safely merge all server orders by invoiceNumber, preserving local unpushed orders
  if (Array.isArray(serverData.orders)) {
    const serverOrders = parseDatesInArray(serverData.orders);
    const serverInvoiceNumbers = new Set(
      serverOrders
        .filter((o) => o && o.invoiceNumber !== undefined && o.invoiceNumber !== null)
        .map((o) => String(o.invoiceNumber))
    );

    // Check if local has any orders not present on server
    const localOrders = await db.orders.toArray();
    for (const lo of localOrders) {
      if (lo && lo.invoiceNumber !== undefined && lo.invoiceNumber !== null) {
        const key = String(lo.invoiceNumber);
        if (!serverInvoiceNumbers.has(key)) {
          hasUnsyncedLocalRecords = true;
        }
      }
    }

    for (const sOrder of serverOrders) {
      if (!sOrder || sOrder.invoiceNumber === undefined || sOrder.invoiceNumber === null) continue;
      try {
        const existingLocal = await db.orders.where('invoiceNumber').equals(sOrder.invoiceNumber).first();
        if (existingLocal) {
          // Update in-place keeping existing local id to prevent Dexie primary key collisions
          await db.orders.put({ ...sOrder, id: existingLocal.id });
        } else {
          // New order from server. Check if sOrder.id conflicts with a different local order
          const conflict = sOrder.id ? await db.orders.get(sOrder.id) : null;
          if (conflict && conflict.invoiceNumber !== sOrder.invoiceNumber) {
            const { id: _, ...orderWithoutId } = sOrder;
            await db.orders.add(orderWithoutId);
          } else {
            await db.orders.put(sOrder);
          }
        }
      } catch (e) {
        console.warn('Error merging server order:', sOrder.invoiceNumber, e);
      }
    }
  }

  // 2. Journal Vouchers: NEVER CLEAR! Safely merge by voucherNumber
  if (Array.isArray(serverData.journalVouchers)) {
    const serverVouchers = parseDatesInArray(serverData.journalVouchers);
    const serverVoucherNums = new Set(
      serverVouchers
        .filter((v) => v && v.voucherNumber !== undefined && v.voucherNumber !== null)
        .map((v) => String(v.voucherNumber))
    );

    const localVouchers = await db.journalVouchers.toArray();
    for (const lv of localVouchers) {
      if (lv && lv.voucherNumber !== undefined && lv.voucherNumber !== null) {
        const key = String(lv.voucherNumber);
        if (!serverVoucherNums.has(key)) {
          hasUnsyncedLocalRecords = true;
        }
      }
    }

    for (const sVoucher of serverVouchers) {
      if (!sVoucher || sVoucher.voucherNumber === undefined || sVoucher.voucherNumber === null) continue;
      try {
        const existingLocal = await db.journalVouchers.where('voucherNumber').equals(sVoucher.voucherNumber).first();
        if (existingLocal) {
          await db.journalVouchers.put({ ...sVoucher, id: existingLocal.id });
        } else {
          const conflict = sVoucher.id ? await db.journalVouchers.get(sVoucher.id) : null;
          if (conflict && conflict.voucherNumber !== sVoucher.voucherNumber) {
            const { id: _, ...vWithoutId } = sVoucher;
            await db.journalVouchers.add(vWithoutId);
          } else {
            await db.journalVouchers.put(sVoucher);
          }
        }
      } catch (e) {
        console.warn('Error merging server voucher:', sVoucher.voucherNumber, e);
      }
    }
  }

  // 3. Customers: NEVER CLEAR! Safely merge by phone
  if (Array.isArray(serverData.customers) && serverData.customers.length > 0) {
    const sanitized = parseDatesInArray(serverData.customers);
    for (const sCust of sanitized) {
      if (!sCust || !sCust.phone) continue;
      try {
        const existingLocal = await db.customers.where('phone').equals(sCust.phone).first();
        if (existingLocal) {
          await db.customers.put({ ...sCust, id: existingLocal.id });
        } else {
          const conflict = sCust.id ? await db.customers.get(sCust.id) : null;
          if (conflict && conflict.phone !== sCust.phone) {
            const { id: _, ...cWithoutId } = sCust;
            await db.customers.add(cWithoutId);
          } else {
            await db.customers.put(sCust);
          }
        }
      } catch (e) {
        console.warn('Error merging customer:', sCust.phone, e);
      }
    }
  }

  // 4. Categories & MenuItems: NEVER CLEAR!
  if (Array.isArray(serverData.categories) && serverData.categories.length > 0) {
    for (const cat of serverData.categories) {
      if (!cat) continue;
      try {
        const existing = cat.id ? await db.categories.get(cat.id) : await db.categories.where('name').equals(cat.name).first();
        if (existing) {
          await db.categories.put({ ...cat, id: existing.id });
        } else {
          await db.categories.put(cat);
        }
      } catch {}
    }
  }
  if (Array.isArray(serverData.menuItems) && serverData.menuItems.length > 0) {
    for (const item of serverData.menuItems) {
      if (!item) continue;
      try {
        const existing = item.id ? await db.menuItems.get(item.id) : await db.menuItems.where('name').equals(item.name).first();
        if (existing) {
          await db.menuItems.put({ ...item, id: existing.id });
        } else {
          await db.menuItems.put(item);
        }
      } catch {}
    }
  }

  // 5. Raw Materials & Recipes & Kitchen Productions & Inventory
  const safeBulkPutTable = async (tableName: string, dataArr: any[]) => {
    if (!Array.isArray(dataArr) || dataArr.length === 0) return;
    const table = (db as any)[tableName];
    if (!table) return;
    const sanitized = parseDatesInArray(dataArr);
    try {
      await table.bulkPut(sanitized);
    } catch {
      for (const item of sanitized) {
        try { await table.put(item); } catch {}
      }
    }
  };

  await safeBulkPutTable('rawMaterials', serverData.rawMaterials);
  await safeBulkPutTable('productionRecipes', serverData.productionRecipes);
  await safeBulkPutTable('kitchenProductions', serverData.kitchenProductions);
  await safeBulkPutTable('inventoryTransactions', serverData.inventoryTransactions);
  await safeBulkPutTable('cashClosures', serverData.cashClosures);
  await safeBulkPutTable('bankAccounts', serverData.bankAccounts);
  await safeBulkPutTable('persons', serverData.persons);
  await safeBulkPutTable('cheques', serverData.cheques);
  await safeBulkPutTable('accounts', serverData.accounts);

  // 6. Settings
  if (Array.isArray(serverData.settings) && serverData.settings.length > 0) {
    const s = serverData.settings[0];
    const localSetting = await db.settings.toCollection().first();
    if (localSetting?.id) {
      await db.settings.update(localSetting.id, s);
    } else {
      await db.settings.add(s);
    }
  }

  // 7. AppUsers
  if (Array.isArray(serverData.appUsers) && serverData.appUsers.length > 0) {
    const sanitizedUsers = parseDatesInArray(serverData.appUsers);
    for (const u of sanitizedUsers) {
      try {
        const existing = await db.appUsers.where('username').equals(u.username).first();
        if (existing?.id) {
          await db.appUsers.update(existing.id, u);
        } else {
          await db.appUsers.add(u);
        }
      } catch {}
    }
  }

  return { hasUnsyncedLocalRecords };
}

/**
 * Pulls the database state from the central server into local Dexie.
 * Uses mergeServerDataIntoDexie to ensure local unsynced invoices are never cleared or deleted.
 */
export async function pullFromCentralServer(isStartup: boolean = false): Promise<boolean> {
  if (isApplyingRemoteChange) return false;

  currentSyncState.isSyncing = true;
  notifyListeners();

  try {
    const res = await fetch(`${currentSyncState.serverUrl}/api/db/state`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`پاسخ ناموفق سرور: ${res.status}`);
    }

    const payload = await res.json();

    if (payload.ok && payload.data) {
      isApplyingRemoteChange = true;
      try {
        const mergeResult = await mergeServerDataIntoDexie(payload.data);
        currentSyncState.localRevision = Number(payload.rev) || 1;
        currentSyncState.serverRevision = currentSyncState.localRevision;
        currentSyncState.lastSyncTime = new Date();
        currentSyncState.lastError = null;
        currentSyncState.isOnline = true;

        // If local has new orders that server doesn't have, immediately push them so server records them!
        if (mergeResult.hasUnsyncedLocalRecords) {
          setTimeout(() => {
            pushToCentralServer(false);
          }, 150);
        }
      } finally {
        isApplyingRemoteChange = false;
      }
      return true;
    }
    return false;
  } catch (err: any) {
    currentSyncState.lastError = err?.message || 'عدم دسترسی به سرور مرکزی';
    return false;
  } finally {
    currentSyncState.isSyncing = false;
    notifyListeners();
  }
}

/**
 * Pushes the local database state to the central server so all other clients can see it.
 */
export async function pushToCentralServer(isInitialSeed: boolean = false): Promise<boolean> {
  if (isApplyingRemoteChange) return false;

  currentSyncState.isSyncing = true;
  notifyListeners();

  try {
    const jsonString = await exportDB();
    const data = JSON.parse(jsonString);

    // SAFEGUARD: If local client database is empty (e.g., fresh PWA client on phone),
    // NEVER push empty data to central server! Force a pull from central server instead!
    const catCount = Array.isArray(data?.categories) ? data.categories.length : 0;
    const menuCount = Array.isArray(data?.menuItems) ? data.menuItems.length : 0;
    const orderCount = Array.isArray(data?.orders) ? data.orders.length : 0;
    if (catCount === 0 && menuCount === 0 && orderCount === 0 && !isInitialSeed) {
      console.log('Local DB is empty. Pulling central database from server instead of pushing empty state...');
      await pullFromCentralServer(true);
      return true;
    }

    const res = await fetch(`${currentSyncState.serverUrl}/api/db/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        data,
        isInitialSeed,
        clientRevision: currentSyncState.localRevision,
        timestamp: new Date().toISOString(),
      }),
    });

    if (res.status === 409) {
      // Server rejected our push because a Raw Reset or newer update happened on another terminal!
      // Immediately pull the central server's clean state into local Dexie!
      const result = await res.json().catch(() => ({}));
      console.warn('Sync Conflict (Outdated Client):', result.error || 'Server reset or updated');
      currentSyncState.lastError = 'داده‌های این دستگاه قدیمی بود و با سرور خام/بروزرسانی شده جایگزین شد.';
      await pullFromCentralServer(false);
      return false;
    }

    if (!res.ok) {
      throw new Error(`خطای سرور: ${res.status}`);
    }

    const result = await res.json();
    if (result.isOutdated) {
      await pullFromCentralServer(false);
      return false;
    }

    if (result.ok) {
      currentSyncState.localRevision = Number(result.rev) || currentSyncState.localRevision + 1;
      currentSyncState.serverRevision = currentSyncState.localRevision;
      currentSyncState.lastSyncTime = new Date();
      currentSyncState.lastError = null;
      currentSyncState.isOnline = true;
      return true;
    } else {
      throw new Error(result.error || 'خطا در ثبت داده‌ها روی سرور مرکزی');
    }
  } catch (err: any) {
    currentSyncState.lastError = err?.message || 'عدم ارسال داده به سرور مرکزی';
    return false;
  } finally {
    currentSyncState.isSyncing = false;
    notifyListeners();
  }
}

/**
 * Triggers a debounced push to central server whenever a local user creates/updates an order,
 * adds customer, kitchen batch, menu item, or changes settings.
 */
export function notifyDataChanged() {
  if (isApplyingRemoteChange) return;

  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    pushToCentralServer(false);
  }, 400);
}

/**
 * Explicitly notifies central server that a 100% factory raw reset was performed,
 * wiping server data and advancing revision so no client pulls old data back.
 */
export async function notifyRawResetToCentralServer(): Promise<boolean> {
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  currentSyncState.isSyncing = true;
  notifyListeners();

  try {
    const jsonString = await exportDB();
    const data = JSON.parse(jsonString);

    const res = await fetch(`${currentSyncState.serverUrl}/api/db/raw-reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        data,
        timestamp: new Date().toISOString(),
      }),
    });

    if (res.ok) {
      const result = await res.json();
      currentSyncState.localRevision = Number(result.rev) || (currentSyncState.localRevision + 10);
      currentSyncState.serverRevision = currentSyncState.localRevision;
      currentSyncState.lastSyncTime = new Date();
      currentSyncState.lastError = null;
      currentSyncState.isOnline = true;
      return true;
    } else {
      // Fallback to normal sync push
      return await pushToCentralServer(false);
    }
  } catch (err: any) {
    console.warn('Central server raw-reset sync warning:', err);
    return false;
  } finally {
    currentSyncState.isSyncing = false;
    notifyListeners();
  }
}

/**
 * Returns current terminal node role: 'server' (Master Server / Host) or 'client' (LAN terminal)
 */
export function getNodeRole(): 'server' | 'client' {
  if (typeof window === 'undefined') return 'server';
  try {
    const saved = window.localStorage.getItem('arka_node_role');
    if (saved === 'server' || saved === 'client') return saved;
  } catch {
    // ignore
  }
  return 'server';
}

/**
 * Updates terminal node role in localStorage
 */
export function setNodeRole(role: 'server' | 'client') {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem('arka_node_role', role);
  } catch {
    // ignore
  }
}

/**
 * Detects local LAN IPv4 address (e.g. 192.168.1.X, 10.X.X.X) directly inside the
 * browser / Tauri WebView using WebRTC ICE candidate discovery.
 * This runs completely offline on the client side without needing any external or local server.
 */
export async function detectClientLanIpViaWebRTC(): Promise<string[]> {
  if (typeof window === 'undefined' || typeof RTCPeerConnection === 'undefined') {
    return [];
  }
  return new Promise((resolve) => {
    const ips = new Set<string>();
    let resolved = false;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      try {
        pc1.close();
      } catch {}
      try {
        pc2.close();
      } catch {}
      resolve(Array.from(ips));
    };

    const timer = setTimeout(finish, 1000);

    const parseCandidate = (candStr: string) => {
      const match = candStr.match(/\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})\b/);
      if (match && match[0]) {
        ips.add(match[0]);
      }
    };

    let pc1: RTCPeerConnection;
    let pc2: RTCPeerConnection;
    try {
      pc1 = new RTCPeerConnection({ iceServers: [] });
      pc2 = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

      pc1.onicecandidate = (e) => {
        if (e.candidate && e.candidate.candidate) {
          parseCandidate(e.candidate.candidate);
        }
      };
      pc2.onicecandidate = (e) => {
        if (e.candidate && e.candidate.candidate) {
          parseCandidate(e.candidate.candidate);
        }
      };

      pc1.createDataChannel('arka_probe');
      pc2.createDataChannel('arka_probe2');

      pc1.createOffer().then((offer) => pc1.setLocalDescription(offer)).catch(() => {});
      pc2.createOffer().then((offer) => pc2.setLocalDescription(offer)).catch(() => {});
    } catch {
      clearTimeout(timer);
      resolve([]);
    }
  });
}

/**
 * Fetches network info (Real Windows IP, Port, Hostname, Custom Domain) from the server.
 * If backend server is unreachable or offline, it falls back to WebRTC client-side IP detection
 * so that the user never sees "localhost" or "نامعلوم".
 */
export async function fetchServerNetworkInfo(customUrl?: string): Promise<{
  ok: boolean;
  hostname?: string;
  port?: number;
  localIps?: string[];
  primaryUrl?: string;
  customDomain?: string;
  domainUrl?: string;
  isServerRunning?: boolean;
  rev?: number;
}> {
  // Build list of candidate endpoints to probe
  const candidates: string[] = [];
  if (customUrl) {
    candidates.push(customUrl.trim().replace(/\/+$/, ''));
  } else {
    if (currentSyncState.serverUrl && !currentSyncState.serverUrl.startsWith('tauri:')) {
      candidates.push(currentSyncState.serverUrl.trim().replace(/\/+$/, ''));
    }
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('arka_server_url') : null;
    if (saved && !saved.startsWith('tauri:')) {
      candidates.push(saved.trim().replace(/\/+$/, ''));
    }
    // Try standard Windows server local addresses
    candidates.push('http://127.0.0.1:4040');
    candidates.push('http://localhost:4040');
    candidates.push('http://127.0.0.1:3000');
    if (typeof window !== 'undefined' && window.location.origin && !window.location.origin.startsWith('tauri:')) {
      candidates.push(window.location.origin);
    }
  }

  // Deduplicate candidates
  const uniqueCandidates = Array.from(new Set(candidates)).filter(Boolean);

  for (const target of uniqueCandidates) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1800);
      const res = await fetch(`${target}/api/network/info`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          // If in server mode, update our active serverUrl
          if (getNodeRole() === 'server' && target.startsWith('http://127.0.0.1')) {
            currentSyncState.serverUrl = target;
            currentSyncState.isOnline = true;
            notifyListeners();
          }
          return {
            ...data,
            isServerRunning: true,
          };
        }
      }
    } catch {
      // try next candidate
    }
  }

  // If server daemon is not responding, detect real Windows IP directly via WebRTC
  const webrtcIps = await detectClientLanIpViaWebRTC();
  const savedLanIp = typeof window !== 'undefined' ? window.localStorage.getItem('arka_server_lan_ip') : null;
  const savedDomain = typeof window !== 'undefined' ? window.localStorage.getItem('arka_server_domain') : null;

  const resolvedIps = Array.from(new Set([
    ...(savedLanIp ? [savedLanIp] : []),
    ...webrtcIps,
  ])).filter(Boolean);

  const bestIp = resolvedIps.length > 0 ? resolvedIps[0] : '';
  const port = 4040;

  return {
    ok: resolvedIps.length > 0,
    hostname: 'ویندوز (سیستم محلی)',
    port,
    localIps: resolvedIps,
    primaryUrl: bestIp ? `http://${bestIp}:${port}` : `http://localhost:${port}`,
    customDomain: savedDomain || '',
    domainUrl: savedDomain ? (savedDomain.startsWith('http') ? savedDomain : `http://${savedDomain}:${port}`) : '',
    isServerRunning: false,
  };
}

/**
 * Tests connection to a potential server URL with clear, human-friendly Persian error messages
 */
export async function testServerConnection(url: string): Promise<{ ok: boolean; rev?: number; error?: string }> {
  const cleanUrl = url.trim().replace(/\/+$/, '');
  if (!cleanUrl) {
    return { ok: false, error: 'آدرس سرور وارد نشده است.' };
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(`${cleanUrl}/api/db/version`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return { ok: true, rev: data.rev };
    }
    return { ok: false, error: `پاسخ ناموفق از سرور مقصد (کد وضعیت خطا: ${res.status} ${res.statusText})` };
  } catch (err: any) {
    if (err?.name === 'AbortError' || String(err?.message || '').toLowerCase().includes('abort')) {
      return {
        ok: false,
        error: 'پاسخی از این آدرس دریافت نشد (Timeout - مهلت اتصال سررسید شد). لطفاً مطمئن شوید سرویس سرور روی این کامپیوتر روشن است و پورت ۴۰۴۰ در فایروال ویندوز باز می‌باشد.',
      };
    }
    if (
      String(err?.message || '').toLowerCase().includes('failed to fetch') ||
      String(err?.message || '').toLowerCase().includes('networkerror')
    ) {
      return {
        ok: false,
        error: 'ارتباط شبکه با سرور برقرار نشد (Connection Refused). ممکن است آدرس آی‌پی اشتباه باشد، کامپیوتر مقصد خاموش باشد یا شبکه روی حالت Public قرار داشته باشد.',
      };
    }
    return { ok: false, error: err?.message || 'امکان برقراری ارتباط با این آدرس وجود ندارد.' };
  }
}

/**
 * Protective Database Pre-Switch Snapshot
 * Takes a full export of Dexie tables and stores it in localStorage & returns integrity stats
 */
export async function createSafetyBackupBeforeRoleSwitch(): Promise<{
  ok: boolean;
  timestamp: string;
  counts: Record<string, number>;
  backupJson: string;
}> {
  try {
    const backupJson = await exportDB();
    const parsed = JSON.parse(backupJson);
    const counts = {
      orders: Array.isArray(parsed.orders) ? parsed.orders.length : 0,
      categories: Array.isArray(parsed.categories) ? parsed.categories.length : 0,
      menuItems: Array.isArray(parsed.menuItems) ? parsed.menuItems.length : 0,
      customers: Array.isArray(parsed.customers) ? parsed.customers.length : 0,
      journalVouchers: Array.isArray(parsed.journalVouchers) ? parsed.journalVouchers.length : 0,
    };

    const timestamp = new Date().toISOString();
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('arka_pre_role_switch_backup', backupJson);
        window.localStorage.setItem('arka_pre_role_switch_backup_time', timestamp);
      } catch {
        // ignore storage quota limit
      }
    }

    return {
      ok: true,
      timestamp,
      counts,
      backupJson,
    };
  } catch (err: any) {
    console.error('Safety backup failed:', err);
    return {
      ok: false,
      timestamp: new Date().toISOString(),
      counts: {},
      backupJson: '',
    };
  }
}

/**
 * Hard cache refresh: unregisters service workers and clears caches so new software code is loaded immediately.
 */
export async function clearCacheAndHardReload() {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      for (const key of keys) {
        await caches.delete(key);
      }
    }
  } catch {
    // ignore
  }
  window.location.reload();
}

/**
 * Sends request to server to save a custom port configuration
 */
export async function updateServerPort(port: number): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const target = currentSyncState.serverUrl || 'http://127.0.0.1:4040';
    const res = await fetch(`${target}/api/network/set-port`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port }),
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, message: data.message || 'پورت ذخیره گردید.' };
    }
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err.error || 'خطا در ثبت پورت.' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'ارتباط با سرور امکان‌پذیر نیست.' };
  }
}

/**
 * Sends request to server to save a custom domain configuration
 */
export async function updateServerDomain(domain: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  const cleanDomain = domain.trim();
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem('arka_server_domain', cleanDomain);
    } catch {}
  }
  try {
    const target = currentSyncState.serverUrl || 'http://127.0.0.1:4040';
    const res = await fetch(`${target}/api/network/set-domain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: cleanDomain }),
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, message: data.message || 'دامنه سرور ثبت گردید.' };
    }
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err.error || 'خطا در ثبت دامنه سرور.' };
  } catch (e: any) {
    // If backend is not running, localStorage still has it
    return { ok: true, message: 'دامنه در تنظیمات این سیستم ذخیره شد.' };
  }
}

/**
 * Stores preferred manual server LAN IP in localStorage
 */
export function saveServerLanIpPreference(ip: string) {
  if (typeof window === 'undefined') return;
  try {
    const cleanIp = ip.trim();
    if (cleanIp) {
      window.localStorage.setItem('arka_server_lan_ip', cleanIp);
    } else {
      window.localStorage.removeItem('arka_server_lan_ip');
    }
  } catch {}
}



