/**
 * Central Server Live Network Synchronization Engine for Arka Restaurant
 * Supports multi-client LAN / Internet real-time synchronization between
 * Central Linux Server, Windows Tauri Server, Cashier PCs, Mobile Waiters/Cashiers, Kitchen Displays, and Managers.
 *
 * Includes:
 * 1. Clock-Skew-Proof Network Timestamping (_updatedAtMs + serverTimeOffsetMs)
 * 2. Tombstone Deletion Registry (deletedRecords) + Known Synced Keys tracking so deleted records NEVER resurrect
 * 3. Chronological Conflict Resolution (newest edit/delete always wins across concurrent users)
 * 4. Platform-Aware Detection (Linux Environment Port/IP vs Windows Tauri In-App Port/Role Management)
 */

import { db } from './db';
import { exportDB } from './utils';

export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  serverUrl: string;
  lastSyncTime: Date | null;
  serverRevision: number;
  localRevision: number;
  lastError: string | null;
  clientCount?: number;
  serverPlatform?: string;
  serverPort?: number;
}

type SyncListener = (state: SyncState) => void;

const DELETED_RECORDS_STORAGE_KEY = 'arka_deleted_records_v2';
const KNOWN_SYNCED_KEYS_STORAGE_KEY = 'arka_known_synced_keys_v2';
const DIRTY_RECORDS_STORAGE_KEY = 'arka_dirty_records_v2';
const PENDING_PUSH_STORAGE_KEY = 'arka_has_pending_push_v2';

// Tombstone map: { [tableName]: { [recordKey]: deletedAtTimestampMs } }
let localDeletedRecords: Record<string, Record<string, number>> = {};

// Set of keys that were present on the central server during the last sync: { [tableName]: Set<string> }
const knownSyncedKeys: Record<string, Set<string>> = {};

// Set of keys locally created/updated on this terminal that have NOT yet been confirmed pushed to server
const dirtyRecordKeys: Record<string, Set<string>> = {};
const dirtyTables = new Set<string>();
let hasPendingPush = false;
let lastSuccessfulPushMs = 0;

// Offset between central server clock and local device clock (serverTimeMs - Date.now())
let serverTimeOffsetMs = 0;

function loadPersistedSyncMetadata() {
  if (typeof window === 'undefined') return;
  try {
    const rawDel = window.localStorage.getItem(DELETED_RECORDS_STORAGE_KEY);
    if (rawDel) {
      const parsed = JSON.parse(rawDel);
      if (parsed && typeof parsed === 'object') {
        localDeletedRecords = parsed;
      }
    }
  } catch {
    // ignore
  }
  try {
    const rawKnown = window.localStorage.getItem(KNOWN_SYNCED_KEYS_STORAGE_KEY);
    if (rawKnown) {
      const parsed = JSON.parse(rawKnown);
      if (parsed && typeof parsed === 'object') {
        for (const [table, arr] of Object.entries(parsed)) {
          if (Array.isArray(arr)) {
            knownSyncedKeys[table] = new Set(arr.map(String));
          }
        }
      }
    }
  } catch {
    // ignore
  }
  try {
    const rawDirty = window.localStorage.getItem(DIRTY_RECORDS_STORAGE_KEY);
    if (rawDirty) {
      const parsed = JSON.parse(rawDirty);
      if (parsed && typeof parsed === 'object') {
        for (const [table, arr] of Object.entries(parsed)) {
          if (Array.isArray(arr) && arr.length > 0) {
            dirtyRecordKeys[table] = new Set(arr.map(String));
            dirtyTables.add(table);
          }
        }
      }
    }
    if (window.localStorage.getItem(PENDING_PUSH_STORAGE_KEY) === '1') {
      hasPendingPush = true;
    }
  } catch {
    // ignore
  }
}

function savePersistedDeletedRecords() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DELETED_RECORDS_STORAGE_KEY, JSON.stringify(localDeletedRecords));
  } catch {
    // ignore
  }
}

function savePersistedKnownSyncedKeys() {
  if (typeof window === 'undefined') return;
  try {
    const serializable: Record<string, string[]> = {};
    for (const [table, set] of Object.entries(knownSyncedKeys)) {
      serializable[table] = Array.from(set);
    }
    window.localStorage.setItem(KNOWN_SYNCED_KEYS_STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // ignore
  }
}

function savePersistedDirtyState() {
  if (typeof window === 'undefined') return;
  try {
    const serializable: Record<string, string[]> = {};
    for (const [table, set] of Object.entries(dirtyRecordKeys)) {
      if (set && set.size > 0) {
        serializable[table] = Array.from(set);
      }
    }
    window.localStorage.setItem(DIRTY_RECORDS_STORAGE_KEY, JSON.stringify(serializable));
    window.localStorage.setItem(PENDING_PUSH_STORAGE_KEY, hasPendingPush ? '1' : '0');
  } catch {
    // ignore
  }
}

function markRecordDirty(tableName: string, item?: any, primKey?: any) {
  if (!tableName) return;
  hasPendingPush = true;
  dirtyTables.add(tableName);
  if (!dirtyRecordKeys[tableName]) {
    dirtyRecordKeys[tableName] = new Set<string>();
  }
  const k = getRecordCanonicalKey(tableName, item, primKey);
  if (k) {
    dirtyRecordKeys[tableName].add(k);
  }
  savePersistedDirtyState();
}

function clearDirtyStateAfterSuccessfulPush() {
  for (const k of Object.keys(dirtyRecordKeys)) {
    delete dirtyRecordKeys[k];
  }
  dirtyTables.clear();
  hasPendingPush = false;
  lastSuccessfulPushMs = getNetworkNow();
  savePersistedDirtyState();
}

loadPersistedSyncMetadata();

/**
 * Returns current network-synchronized timestamp in milliseconds (immune to local PC clock skew)
 */
export function getNetworkNow(): number {
  return Date.now() + serverTimeOffsetMs;
}

export function updateServerTimeOffset(serverTimeInput?: number | string) {
  if (!serverTimeInput) return;
  const serverMs =
    typeof serverTimeInput === 'number'
      ? serverTimeInput
      : new Date(serverTimeInput).getTime();
  if (Number.isFinite(serverMs) && serverMs > 1700000000000) {
    serverTimeOffsetMs = serverMs - Date.now();
  }
}

export function getLocalDeletedRecords(): Record<string, Record<string, number>> {
  return localDeletedRecords;
}

export function mergeDeletedRecordsMap(incomingDeleted?: Record<string, Record<string, number>>) {
  if (!incomingDeleted || typeof incomingDeleted !== 'object') return;
  let changed = false;
  for (const [table, map] of Object.entries(incomingDeleted)) {
    if (!map || typeof map !== 'object') continue;
    if (!localDeletedRecords[table]) {
      localDeletedRecords[table] = {};
    }
    for (const [key, ts] of Object.entries(map)) {
      const numTs = Number(ts) || 0;
      if (numTs > (localDeletedRecords[table][key] || 0)) {
        localDeletedRecords[table][key] = numTs;
        changed = true;
      }
    }
  }
  if (changed) {
    savePersistedDeletedRecords();
  }
}

export function clearAllDeletedRecordsOnRawReset() {
  localDeletedRecords = {};
  for (const k of Object.keys(knownSyncedKeys)) {
    delete knownSyncedKeys[k];
  }
  clearDirtyStateAfterSuccessfulPush();
  savePersistedDeletedRecords();
  savePersistedKnownSyncedKeys();
}

/**
 * Extracts timestamp in ms from a database record
 */
export function getRecordTimestampMs(item: any): number {
  if (!item || typeof item !== 'object') return 1;
  if (item._updatedAtMs && Number.isFinite(Number(item._updatedAtMs))) {
    return Number(item._updatedAtMs);
  }
  const dateFields = ['updatedAt', 'createdAt', 'closedAt', 'date', 'issueDate'];
  for (const field of dateFields) {
    if (item[field]) {
      const t = item[field] instanceof Date ? item[field].getTime() : new Date(item[field]).getTime();
      if (Number.isFinite(t) && t > 0) return t;
    }
  }
  return 1;
}

/**
 * Computes canonical synchronization key for a record in a given table
 */
export function getRecordCanonicalKey(tableName: string, item: any, fallbackPrimKey?: any): string {
  if (!item || typeof item !== 'object') {
    return fallbackPrimKey !== undefined && fallbackPrimKey !== null ? String(fallbackPrimKey) : '';
  }
  switch (tableName) {
    case 'orders':
      return String(
        item.invoiceNumber !== undefined && item.invoiceNumber !== null
          ? item.invoiceNumber
          : item.id ?? fallbackPrimKey ?? ''
      );
    case 'journalVouchers':
      return String(
        item.voucherNumber !== undefined && item.voucherNumber !== null
          ? item.voucherNumber
          : item.id ?? fallbackPrimKey ?? ''
      );
    case 'customers':
      return String(item.phone || item.id || fallbackPrimKey || '');
    case 'cashClosures':
      return String(item.dateLabel || item.closedAt || item.id || fallbackPrimKey || '');
    case 'kitchenProductions':
      return String(item.batchNumber || item.id || fallbackPrimKey || '');
    case 'categories':
    case 'menuItems':
      return String(item.id || item.name || fallbackPrimKey || '');
    case 'appUsers':
      return String(item.username || item.id || fallbackPrimKey || '');
    case 'accounts':
      return String(item.code || item.id || fallbackPrimKey || '');
    default:
      return String(item.id || item.code || item.name || fallbackPrimKey || '');
  }
}

/**
 * Records a tombstone when a record is deleted on this terminal so the central server
 * and all other terminals permanently delete it and never resurrect it.
 */
export function recordRecordDeletion(tableName: string, objOrKey: any, primKey?: any) {
  if (!tableName) return;
  if (!localDeletedRecords[tableName]) {
    localDeletedRecords[tableName] = {};
  }

  const obj = objOrKey && typeof objOrKey === 'object' ? objOrKey : null;
  const itemTs = obj ? getRecordTimestampMs(obj) : 0;
  // Ensure deletion timestamp is strictly greater than the item's own timestamp (immune to clock skew)
  const deletedAt = Math.max(getNetworkNow(), itemTs + 5000);

  const setMaxTs = (key: string) => {
    if (!key) return;
    const prev = Number(localDeletedRecords[tableName][key]) || 0;
    localDeletedRecords[tableName][key] = Math.max(prev, deletedAt);
    if (dirtyRecordKeys[tableName]) {
      dirtyRecordKeys[tableName].delete(key);
    }
  };

  if (obj) {
    const canonical = getRecordCanonicalKey(tableName, obj, primKey);
    if (canonical) setMaxTs(canonical);
    if (obj.id !== undefined && obj.id !== null) {
      setMaxTs(`id:${obj.id}`);
      setMaxTs(String(obj.id));
    }
    if (obj.invoiceNumber !== undefined && obj.invoiceNumber !== null) {
      setMaxTs(String(obj.invoiceNumber));
    }
    if (obj.voucherNumber !== undefined && obj.voucherNumber !== null) {
      setMaxTs(String(obj.voucherNumber));
    }
    if (obj.phone) {
      setMaxTs(String(obj.phone));
    }
    if (obj.name) {
      setMaxTs(`name:${obj.name}`);
    }
    if (obj.username) {
      setMaxTs(String(obj.username));
    }
  } else if (objOrKey !== undefined && objOrKey !== null) {
    setMaxTs(String(objOrKey));
  }

  if (primKey !== undefined && primKey !== null) {
    setMaxTs(`id:${primKey}`);
    if (!obj) {
      setMaxTs(String(primKey));
    }
  }

  hasPendingPush = true;
  savePersistedDeletedRecords();
  savePersistedDirtyState();
}

/**
 * Checks if a record has been deleted according to the tombstone map
 */
export function isRecordDeletedInMap(
  tableName: string,
  item: any,
  canonicalKey: string,
  deletedMap: Record<string, Record<string, number>>
): boolean {
  const tableDel = deletedMap?.[tableName];
  if (!tableDel || typeof tableDel !== 'object') return false;

  let maxDelTs = 0;
  if (canonicalKey && tableDel[canonicalKey]) {
    maxDelTs = Math.max(maxDelTs, Number(tableDel[canonicalKey]) || 0);
  }
  if (item && typeof item === 'object') {
    if (item.id !== undefined && item.id !== null) {
      maxDelTs = Math.max(
        maxDelTs,
        Number(tableDel[`id:${item.id}`]) || 0,
        tableName !== 'orders' && tableName !== 'journalVouchers' ? Number(tableDel[String(item.id)]) || 0 : 0
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
      maxDelTs = Math.max(maxDelTs, Number(tableDel[`name:${item.name}`]) || 0);
    }
    if (item.username) {
      maxDelTs = Math.max(maxDelTs, Number(tableDel[String(item.username)]) || 0);
    }
  }

  if (maxDelTs <= 0) return false;
  const itemTs = getRecordTimestampMs(item);
  return maxDelTs >= itemTs;
}

function clearTombstoneForCreatedOrUpdatedItem(tableName: string, item: any, primKey?: any) {
  const tableDel = localDeletedRecords[tableName];
  if (!tableDel || !item || typeof item !== 'object') return;
  const canonical = getRecordCanonicalKey(tableName, item, primKey);
  if (canonical) delete tableDel[canonical];
  if (item.id !== undefined) {
    delete tableDel[`id:${item.id}`];
    delete tableDel[String(item.id)];
  }
  if (item.invoiceNumber !== undefined) delete tableDel[String(item.invoiceNumber)];
  if (item.voucherNumber !== undefined) delete tableDel[String(item.voucherNumber)];
  if (item.phone) delete tableDel[String(item.phone)];
  if (item.name) delete tableDel[`name:${item.name}`];
  if (item.username) delete tableDel[String(item.username)];
  savePersistedDeletedRecords();
}

export function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.location.protocol === 'tauri:' ||
      window.location.origin.includes('tauri') ||
      (window as any).__TAURI__ ||
      (window as any).__TAURI_INTERNALS__
  );
}

let currentSyncState: SyncState = {
  isOnline: true,
  isSyncing: false,
  serverUrl: typeof window !== 'undefined' && !isTauriEnvironment() ? window.location.origin : 'http://127.0.0.1:4040',
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
let isPullInFlight = false;
let isPushInFlight = false;
let activePushPromise: Promise<boolean> | null = null;
let syncDebounceTimer: any = null;
let pollTimer: any = null;
let isInitialized = false;
let crossTabChannel: BroadcastChannel | null = null;

try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    crossTabChannel = new BroadcastChannel('arka_pos_live_sync_channel');
    crossTabChannel.onmessage = (ev) => {
      if (ev?.data?.type === 'DB_UPDATED') {
        checkServerRevision();
      }
    };
  }
} catch {
  // ignore
}

export function setServerUrl(url: string) {
  let cleanUrl = url.trim().replace(/\/+$/, '');
  // On HTTPS web pages (e.g. https://foodmix.ir), never allow an insecure http:// URL that causes Mixed Content errors
  if (
    typeof window !== 'undefined' &&
    !isTauriEnvironment() &&
    window.location.protocol === 'https:' &&
    cleanUrl.startsWith('http://')
  ) {
    cleanUrl = window.location.origin.replace(/\/+$/, '');
  }
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
 * Resolves the authoritative server base URL for the current runtime environment.
 * In web browsers (!isTauriEnvironment()), window.location.origin is the server serving the app.
 */
function resolveEffectiveServerUrl(): string {
  if (typeof window === 'undefined') return currentSyncState.serverUrl;
  const isTauri = isTauriEnvironment();
  if (!isTauri) {
    const origin = window.location.origin.replace(/\/+$/, '');
    const current = (currentSyncState.serverUrl || '').replace(/\/+$/, '');
    // Prevent Mixed Content (https page trying to fetch http LAN IP) or stale localhost on web clients
    if (
      !current ||
      (window.location.protocol === 'https:' && current.startsWith('http://')) ||
      current.includes('localhost') ||
      current.includes('127.0.0.1') ||
      window.location.hostname !== 'localhost'
    ) {
      if (origin && origin.startsWith('http')) {
        currentSyncState.serverUrl = origin;
        return origin;
      }
    }
  }
  return currentSyncState.serverUrl;
}

/**
 * Initializes the central network synchronization engine on client startup:
 * 1. Determines correct server URL (Linux Web origin vs Windows Tauri local/remote server).
 * 2. Attaches Dexie hooks to track creations, updates (_updatedAtMs), and deletions (tombstones).
 * 3. Pulls central database state and starts fast real-time background sync (every 1.2s).
 */
export async function initNetworkSync(customServerUrl?: string) {
  if (isInitialized && !customServerUrl) return;
  isInitialized = true;

  const isTauri = isTauriEnvironment();

  if (customServerUrl) {
    setServerUrl(customServerUrl);
  } else if (typeof window !== 'undefined') {
    const savedUrl = window.localStorage.getItem('arka_server_url');

    if (!isTauri) {
      // Running in a web browser (e.g. connected to https://foodmix.ir or http://192.168.1.x:3000):
      // The origin serving the web application IS the central server!
      currentSyncState.serverUrl = window.location.origin.replace(/\/+$/, '');
      try {
        window.localStorage.setItem('arka_server_url', currentSyncState.serverUrl);
      } catch {}
    } else {
      // Running inside Windows Tauri Desktop App
      if (savedUrl && savedUrl.startsWith('http')) {
        currentSyncState.serverUrl = savedUrl.replace(/\/+$/, '');
      } else {
        const savedPort = window.localStorage.getItem('arka_server_port') || '4040';
        currentSyncState.serverUrl = `http://127.0.0.1:${savedPort}`;
      }
    }
  }

  // Attach hooks to Dexie tables so ANY create/update/delete on this client is timestamped and synced
  try {
    db.tables.forEach((table) => {
      const tableName = table.name;
      table.hook('creating', function (primKey, obj) {
        if (!isApplyingRemoteChange && obj && typeof obj === 'object') {
          const nowMs = getNetworkNow();
          obj._updatedAtMs = nowMs;
          if (!obj.updatedAt) {
            obj.updatedAt = new Date(nowMs);
          }
          clearTombstoneForCreatedOrUpdatedItem(tableName, obj, primKey);
          markRecordDirty(tableName, obj, primKey);
          const self: any = this;
          if (self && typeof self.onsuccess === 'function') {
            const origOnSuccess = self.onsuccess;
            self.onsuccess = function (generatedKey: any) {
              markRecordDirty(tableName, obj, generatedKey);
              return origOnSuccess.apply(this, arguments);
            };
          } else if (self) {
            self.onsuccess = function (generatedKey: any) {
              markRecordDirty(tableName, obj, generatedKey);
            };
          }
          notifyDataChanged();
        }
      });

      table.hook('updating', function (modifications: any, primKey, obj) {
        if (!isApplyingRemoteChange && obj && typeof obj === 'object') {
          const prevTs = getRecordTimestampMs(obj);
          const nextTs = Math.max(getNetworkNow(), prevTs + 1000);
          const mergedObj = { ...obj, ...modifications, _updatedAtMs: nextTs };
          clearTombstoneForCreatedOrUpdatedItem(tableName, mergedObj, primKey);
          markRecordDirty(tableName, mergedObj, primKey);
          notifyDataChanged();
          return {
            _updatedAtMs: nextTs,
            updatedAt: new Date(nextTs),
          };
        }
      });

      table.hook('deleting', function (primKey, obj) {
        if (!isApplyingRemoteChange) {
          recordRecordDeletion(tableName, obj, primKey);
          notifyDataChanged();
        }
      });
    });
  } catch {
    // ignore hook attachment if already attached
  }

  // Initial pull from server
  await pullFromCentralServer(true);

  // If this browser had pending unpushed changes before reload, push them now
  if (hasPendingPush) {
    await pushToCentralServer(false);
  }

  // Fast real-time polling every 1.2 seconds so multi-user changes apply almost instantaneously
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    checkServerRevision();
  }, 1200);

  // Hook online/offline and window focus for instant sync when switching tabs/windows
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      currentSyncState.isOnline = true;
      notifyListeners();
      if (hasPendingPush) {
        pushToCentralServer(false);
      } else {
        pullFromCentralServer(false);
      }
    });
    window.addEventListener('offline', () => {
      currentSyncState.isOnline = false;
      notifyListeners();
    });
    window.addEventListener('focus', () => {
      checkServerRevision();
    });
  }
}

/**
 * Checks central server revision. If server has a newer revision than this client, pulls state immediately.
 * If this client has pending unpushed changes, pushes them immediately.
 */
async function checkServerRevision() {
  if (isApplyingRemoteChange || isPullInFlight || isPushInFlight) return;

  // If a local change is waiting to be pushed, push it first!
  if (hasPendingPush) {
    await pushToCentralServer(false);
    return;
  }

  const baseUrl = resolveEffectiveServerUrl();

  try {
    const res = await fetch(`${baseUrl}/api/db/version`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
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
    updateServerTimeOffset(info.serverTimeMs || info.lastModified);

    if (info.rev !== undefined && Number(info.rev) !== currentSyncState.localRevision) {
      // Server has changes from another cashier/terminal! Pull now!
      await pullFromCentralServer(false);
    } else {
      currentSyncState.serverRevision = Number(info.rev) || currentSyncState.localRevision;
      notifyListeners();
    }
  } catch (err: any) {
    // If web browser had a custom URL that failed, fall back to window.location.origin
    if (
      typeof window !== 'undefined' &&
      !isTauriEnvironment() &&
      window.location.origin.startsWith('http') &&
      currentSyncState.serverUrl !== window.location.origin
    ) {
      currentSyncState.serverUrl = window.location.origin.replace(/\/+$/, '');
      return;
    }
    if (currentSyncState.isOnline) {
      currentSyncState.isOnline = false;
      currentSyncState.lastError = err?.message || 'خطا در اتصال به سرور مرکزی';
      notifyListeners();
    }
  }
}

/**
 * Synchronizes server database state into local Dexie with full support for:
 * - Deleting records that were deleted on another terminal (via deletedRecords tombstones or knownSyncedKeys)
 * - Chronological ordering of edits (_updatedAtMs comparison so newer edits win)
 * - Preserving genuinely new offline local records created on this terminal that haven't been pushed yet
 */
export async function mergeServerDataIntoDexie(
  serverData: any,
  isStartup: boolean = false
): Promise<{ hasUnsyncedLocalRecords: boolean }> {
  if (!serverData || typeof serverData !== 'object') {
    return { hasUnsyncedLocalRecords: false };
  }

  let hasUnsyncedLocalRecords = false;

  // 0. Merge tombstones from server
  if (serverData.deletedRecords && typeof serverData.deletedRecords === 'object') {
    mergeDeletedRecordsMap(serverData.deletedRecords);
  }

  const parseDatesInItem = (item: any): any => {
    if (!item || typeof item !== 'object') return item;
    const copy = { ...item };
    const dateFields = ['createdAt', 'updatedAt', 'date', 'closedAt', 'issueDate', 'dueDate', 'employmentStartDate'];
    for (const f of dateFields) {
      if (copy[f] && typeof copy[f] === 'string') {
        const d = new Date(copy[f]);
        if (!isNaN(d.getTime())) copy[f] = d;
      }
    }
    return copy;
  };

  const parseDatesInArray = (arr: any[]): any[] => {
    if (!Array.isArray(arr)) return [];
    return arr.map(parseDatesInItem);
  };

  const serverHasAnyData =
    (Array.isArray(serverData.orders) && serverData.orders.length > 0) ||
    (Array.isArray(serverData.categories) && serverData.categories.length > 0) ||
    (Array.isArray(serverData.menuItems) && serverData.menuItems.length > 0) ||
    (Array.isArray(serverData.settings) && serverData.settings.length > 0);

  /**
   * Generic chronological table synchronizer with tombstone & deletion propagation
   */
  const syncTableChronologically = async (
    tableName: string,
    serverArrayRaw: any[] | undefined,
    findExistingLocal: (sItem: any, localAll: any[]) => any | undefined
  ) => {
    if (!Array.isArray(serverArrayRaw)) return;
    const table = (db as any)[tableName];
    if (!table) return;

    const serverItems = parseDatesInArray(serverArrayRaw).filter(
      (sItem) => sItem && !isRecordDeletedInMap(tableName, sItem, getRecordCanonicalKey(tableName, sItem), localDeletedRecords)
    );

    const serverKeyMap = new Map<string, any>();
    for (const sItem of serverItems) {
      const k = getRecordCanonicalKey(tableName, sItem);
      if (k) serverKeyMap.set(k, sItem);
    }

    const previouslySyncedSet = knownSyncedKeys[tableName] || new Set<string>();
    const dirtySet = dirtyRecordKeys[tableName] || new Set<string>();
    const localItems = await table.toArray();

    // 1. Check local items: if deleted on server, delete locally! If genuinely new local item on this terminal, keep & push.
    for (const lItem of localItems) {
      if (!lItem) continue;
      const k = getRecordCanonicalKey(tableName, lItem);
      if (!k) continue;

      const deletedByTombstone = isRecordDeletedInMap(tableName, lItem, k, localDeletedRecords);
      if (deletedByTombstone) {
        if (lItem.id !== undefined) {
          try {
            await table.delete(lItem.id);
          } catch {}
        }
        continue;
      }

      if (!serverKeyMap.has(k)) {
        // Server does NOT have this record.
        // Is it a genuinely new local record created on THIS terminal that hasn't been pushed yet?
        const isLocallyDirty =
          dirtySet.has(k) ||
          (lItem.id !== undefined && dirtySet.has(String(lItem.id))) ||
          (hasPendingPush && dirtyTables.has(tableName) && getRecordTimestampMs(lItem) > Date.now() - 120000);

        if (isLocallyDirty && !previouslySyncedSet.has(k)) {
          hasUnsyncedLocalRecords = true;
        } else if (previouslySyncedSet.has(k) || serverHasAnyData) {
          // Record was previously on server (deleted by another terminal) OR is stale local seed data when server has authoritative DB
          if (lItem.id !== undefined) {
            try {
              await table.delete(lItem.id);
            } catch {}
          }
        } else {
          hasUnsyncedLocalRecords = true;
        }
      }
    }

    // Re-fetch remaining local items after deletions
    const remainingLocalItems = await table.toArray();

    // 2. Upsert server items into local Dexie respecting chronological order (_updatedAtMs)
    for (const sItem of serverItems) {
      const k = getRecordCanonicalKey(tableName, sItem);
      if (!k) continue;

      try {
        const existingLocal = findExistingLocal(sItem, remainingLocalItems);
        if (existingLocal) {
          const sTime = getRecordTimestampMs(sItem);
          const lTime = getRecordTimestampMs(existingLocal);
          const isLocalEdited = dirtySet.has(k) && lTime > sTime;

          if (isLocalEdited) {
            // Local has a newer unpushed edit on this terminal
            hasUnsyncedLocalRecords = true;
          } else {
            await table.put({ ...sItem, id: existingLocal.id });
          }
        } else {
          // New item from server
          const conflict = sItem.id !== undefined ? await table.get(sItem.id) : null;
          if (conflict && getRecordCanonicalKey(tableName, conflict) !== k) {
            const { id: _, ...withoutId } = sItem;
            await table.add(withoutId);
          } else {
            await table.put(sItem);
          }
        }
      } catch (e) {
        console.warn(`Error syncing table ${tableName} record ${k}:`, e);
      }
    }

    // 3. Record current server keys as known synced keys
    knownSyncedKeys[tableName] = new Set(serverKeyMap.keys());
  };

  // 1. Orders
  await syncTableChronologically('orders', serverData.orders, (sOrder, localAll) =>
    localAll.find(
      (lo) =>
        (sOrder.invoiceNumber !== undefined && lo.invoiceNumber === sOrder.invoiceNumber) ||
        (sOrder.invoiceNumber === undefined && lo.id === sOrder.id)
    )
  );

  // 2. Journal Vouchers
  await syncTableChronologically('journalVouchers', serverData.journalVouchers, (sVoucher, localAll) =>
    localAll.find(
      (lv) =>
        (sVoucher.voucherNumber !== undefined && lv.voucherNumber === sVoucher.voucherNumber) ||
        (sVoucher.voucherNumber === undefined && lv.id === sVoucher.id)
    )
  );

  // 3. Customers
  await syncTableChronologically('customers', serverData.customers, (sCust, localAll) =>
    localAll.find((lc) => (sCust.phone && lc.phone === sCust.phone) || (lc.id && lc.id === sCust.id))
  );

  // 4. Categories
  await syncTableChronologically('categories', serverData.categories, (sCat, localAll) =>
    localAll.find((lc) => (sCat.id && lc.id === sCat.id) || (sCat.name && lc.name === sCat.name))
  );

  // 5. Menu Items
  await syncTableChronologically('menuItems', serverData.menuItems, (sMenu, localAll) =>
    localAll.find((lm) => (sMenu.id && lm.id === sMenu.id) || (sMenu.name && lm.name === sMenu.name))
  );

  // 6. Cash Closures
  await syncTableChronologically('cashClosures', serverData.cashClosures, (sClosure, localAll) =>
    localAll.find(
      (lc) =>
        (sClosure.dateLabel && lc.dateLabel === sClosure.dateLabel) ||
        (sClosure.id && lc.id === sClosure.id)
    )
  );

  // 7. Kitchen Productions
  await syncTableChronologically('kitchenProductions', serverData.kitchenProductions, (sKp, localAll) =>
    localAll.find(
      (lk) =>
        (sKp.batchNumber && lk.batchNumber === sKp.batchNumber) ||
        (sKp.id && lk.id === sKp.id)
    )
  );

  // 8. Inventory Transactions
  await syncTableChronologically('inventoryTransactions', serverData.inventoryTransactions, (sTx, localAll) =>
    localAll.find((lt) => sTx.id && lt.id === sTx.id)
  );

  // 9. Raw Materials, Production Recipes, Bank Accounts, Persons, Cheques, Accounts, AppUsers
  await syncTableChronologically('rawMaterials', serverData.rawMaterials, (sMat, localAll) =>
    localAll.find((lm) => (sMat.id && lm.id === sMat.id) || (sMat.name && lm.name === sMat.name))
  );
  await syncTableChronologically('productionRecipes', serverData.productionRecipes, (sRec, localAll) =>
    localAll.find((lr) => (sRec.id && lr.id === sRec.id) || (sRec.name && lr.name === sRec.name))
  );
  await syncTableChronologically('bankAccounts', serverData.bankAccounts, (sBank, localAll) =>
    localAll.find((lb) => sBank.id && lb.id === sBank.id)
  );
  await syncTableChronologically('persons', serverData.persons, (sPerson, localAll) =>
    localAll.find((lp) => (sPerson.id && lp.id === sPerson.id) || (sPerson.name && lp.name === sPerson.name))
  );
  await syncTableChronologically('cheques', serverData.cheques, (sChq, localAll) =>
    localAll.find((lc) => sChq.id && lc.id === sChq.id)
  );
  await syncTableChronologically('accounts', serverData.accounts, (sAcc, localAll) =>
    localAll.find((la) => (sAcc.code && la.code === sAcc.code) || (sAcc.id && la.id === sAcc.id))
  );
  await syncTableChronologically('appUsers', serverData.appUsers, (sUser, localAll) =>
    localAll.find((lu) => (sUser.username && lu.username === sUser.username) || (sUser.id && lu.id === sUser.id))
  );

  // 10. Settings: compare timestamps so newest settings win
  if (Array.isArray(serverData.settings) && serverData.settings.length > 0) {
    const s = parseDatesInItem(serverData.settings[0]);
    const localSetting = await db.settings.toCollection().first();
    if (localSetting?.id) {
      const sTime = getRecordTimestampMs(s);
      const lTime = getRecordTimestampMs(localSetting);
      if (!isStartup && dirtyTables.has('settings') && lTime > sTime) {
        hasUnsyncedLocalRecords = true;
      } else {
        await db.settings.update(localSetting.id, s);
      }
    } else {
      await db.settings.add(s);
    }
  }

  savePersistedKnownSyncedKeys();
  return { hasUnsyncedLocalRecords };
}

/**
 * Pulls the database state from the central server into local Dexie.
 */
export async function pullFromCentralServer(isStartup: boolean = false): Promise<boolean> {
  if (isApplyingRemoteChange || isPullInFlight) return false;

  isPullInFlight = true;
  currentSyncState.isSyncing = true;
  notifyListeners();

  const baseUrl = resolveEffectiveServerUrl();

  try {
    const res = await fetch(`${baseUrl}/api/db/state`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`پاسخ ناموفق سرور: ${res.status}`);
    }

    const payload = await res.json();
    updateServerTimeOffset(payload.serverTimeMs);

    if ((payload.ok || payload.data) && payload.data) {
      isApplyingRemoteChange = true;
      try {
        const mergeResult = await mergeServerDataIntoDexie(payload.data, isStartup);
        currentSyncState.localRevision = Number(payload.rev) || 1;
        currentSyncState.serverRevision = currentSyncState.localRevision;
        currentSyncState.lastSyncTime = new Date();
        currentSyncState.lastError = null;
        currentSyncState.isOnline = true;

        if (mergeResult.hasUnsyncedLocalRecords) {
          hasPendingPush = true;
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
    isPullInFlight = false;
    currentSyncState.isSyncing = isPushInFlight;
    notifyListeners();

    // If a local change occurred while pull was in flight, push it immediately now!
    if (hasPendingPush && !isPushInFlight) {
      setTimeout(() => {
        pushToCentralServer(false);
      }, 20);
    }
  }
}

/**
 * Builds a compact delta payload (< 150 KB) when the full database exceeds Nginx's default 1MB body limit.
 * Because server.cjs and Tauri lib.rs merge incoming records by canonical key into central_db.json
 * and only remove records listed in deletedRecords, sending recent/dirty records + core config tables
 * is 100% lossless and 50x faster over the network.
 */
function buildCompactDeltaPayload(fullData: any, ultraCompact: boolean = false): any {
  const nowMs = getNetworkNow();
  const windowMs = ultraCompact ? 18 * 3600 * 1000 : 72 * 3600 * 1000;
  const cutoffMs = nowMs - windowMs;
  const maxRecentCount = ultraCompact ? 25 : 60;

  const filterLargeTable = (tableName: string, arr: any[]) => {
    if (!Array.isArray(arr)) return [];
    const dirtySet = dirtyRecordKeys[tableName] || new Set<string>();
    const syncedSet = knownSyncedKeys[tableName] || new Set<string>();

    const recentSlice = arr.slice(-maxRecentCount);
    const recentKeys = new Set(recentSlice.map((it) => getRecordCanonicalKey(tableName, it)));

    return arr.filter((item) => {
      if (!item) return false;
      const k = getRecordCanonicalKey(tableName, item);
      if (dirtySet.has(k) || !syncedSet.has(k) || recentKeys.has(k)) return true;
      const ts = getRecordTimestampMs(item);
      return ts >= cutoffMs;
    });
  };

  const compactMenuItems = Array.isArray(fullData.menuItems)
    ? fullData.menuItems.map((m: any) => {
        if (!m) return m;
        const k = getRecordCanonicalKey('menuItems', m);
        const isDirty = dirtyRecordKeys['menuItems']?.has(k) || !knownSyncedKeys['menuItems']?.has(k);
        if (!isDirty && typeof m.image === 'string' && m.image.length > 1500) {
          const { image: _, ...rest } = m;
          return rest;
        }
        return m;
      })
    : [];

  return {
    ...fullData,
    orders: filterLargeTable('orders', fullData.orders),
    journalVouchers: filterLargeTable('journalVouchers', fullData.journalVouchers),
    inventoryTransactions: filterLargeTable('inventoryTransactions', fullData.inventoryTransactions),
    customers: ultraCompact ? filterLargeTable('customers', fullData.customers) : fullData.customers,
    menuItems: compactMenuItems,
    deletedRecords: localDeletedRecords,
  };
}

/**
 * Pushes the local database state (including deletedRecords tombstones and _updatedAtMs)
 * to the central server, and immediately applies the merged authoritative server state if returned.
 * Never drops a push if another sync is in flight — queues and executes immediately after.
 */
export async function pushToCentralServer(isInitialSeed: boolean = false): Promise<boolean> {
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
  }

  hasPendingPush = true;
  savePersistedDirtyState();

  // If a remote pull is currently applying changes or another push is in flight, queue and wait
  if (isApplyingRemoteChange || isPullInFlight) {
    return false;
  }

  if (isPushInFlight && activePushPromise) {
    return activePushPromise;
  }

  isPushInFlight = true;
  currentSyncState.isSyncing = true;
  notifyListeners();

  activePushPromise = (async (): Promise<boolean> => {
    let pushedSuccessfully = false;
    try {
      hasPendingPush = false;
      const baseUrl = resolveEffectiveServerUrl();
      const jsonString = await exportDB();
      const fullData = JSON.parse(jsonString);
      fullData.deletedRecords = localDeletedRecords;

      const catCount = Array.isArray(fullData?.categories) ? fullData.categories.length : 0;
      const menuCount = Array.isArray(fullData?.menuItems) ? fullData.menuItems.length : 0;
      const orderCount = Array.isArray(fullData?.orders) ? fullData.orders.length : 0;
      const closureCount = Array.isArray(fullData?.cashClosures) ? fullData.cashClosures.length : 0;
      const voucherCount = Array.isArray(fullData?.journalVouchers) ? fullData.journalVouchers.length : 0;
      const settingsCount = Array.isArray(fullData?.settings) ? fullData.settings.length : 0;
      const hasDeletions = Object.keys(localDeletedRecords).some(
        (k) => Object.keys(localDeletedRecords[k] || {}).length > 0
      );
      const totalMeaningful = catCount + menuCount + orderCount + closureCount + voucherCount + settingsCount;

      if (totalMeaningful === 0 && !hasDeletions && !isInitialSeed) {
        clearDirtyStateAfterSuccessfulPush();
        await pullFromCentralServer(true);
        return true;
      }

      const clientRevBeforePush = currentSyncState.localRevision;

      // Use compact delta payload if full payload > 220 KB and server already has data (avoids Nginx 1MB 413 error)
      const shouldUseCompact = !isInitialSeed && clientRevBeforePush > 0 && jsonString.length > 220000;
      const payloadData = shouldUseCompact ? buildCompactDeltaPayload(fullData, false) : fullData;

      let res = await fetch(`${baseUrl}/api/db/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          data: payloadData,
          isInitialSeed,
          clientRevision: clientRevBeforePush,
          timestamp: new Date(getNetworkNow()).toISOString(),
        }),
      });

      // Automatic fallback if Nginx / Proxy returned 413 Payload Too Large
      if (res.status === 413) {
        const ultraCompactData = buildCompactDeltaPayload(fullData, true);
        res = await fetch(`${baseUrl}/api/db/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            data: ultraCompactData,
            isInitialSeed: false,
            clientRevision: clientRevBeforePush,
            timestamp: new Date(getNetworkNow()).toISOString(),
          }),
        });
      }

      if (res.status === 409) {
        const result = await res.json().catch(() => ({}));
        console.warn('Sync Conflict (Outdated Client):', result.error || 'Server reset or updated');
        currentSyncState.lastError = 'داده‌های این دستگاه با آخرین وضعیت سرور مرکزی همگام‌سازی شد.';
        await pullFromCentralServer(false);
        return false;
      }

      if (!res.ok) {
        throw new Error(`خطای سرور: ${res.status}`);
      }

      const result = await res.json();
      updateServerTimeOffset(result.serverTimeMs);

      if (result.isOutdated) {
        await pullFromCentralServer(false);
        return false;
      }

      if (result.ok) {
        const nextRev = Number(result.rev ?? result.state?.rev) || clientRevBeforePush + 1;
        currentSyncState.localRevision = nextRev;
        currentSyncState.serverRevision = nextRev;
        currentSyncState.lastSyncTime = new Date();
        currentSyncState.lastError = null;
        currentSyncState.isOnline = true;

        // Update knownSyncedKeys from fullData so we know all current local records are on the server
        const syncedTables = [
          'orders',
          'journalVouchers',
          'customers',
          'categories',
          'menuItems',
          'cashClosures',
          'kitchenProductions',
          'inventoryTransactions',
          'rawMaterials',
          'productionRecipes',
          'bankAccounts',
          'persons',
          'cheques',
          'accounts',
          'appUsers',
        ];
        for (const t of syncedTables) {
          if (Array.isArray(fullData[t])) {
            knownSyncedKeys[t] = new Set(
              fullData[t].filter(Boolean).map((item: any) => getRecordCanonicalKey(t, item)).filter(Boolean)
            );
          }
        }
        savePersistedKnownSyncedKeys();

        if (!hasPendingPush) {
          clearDirtyStateAfterSuccessfulPush();
        }
        pushedSuccessfully = true;

        // Notify other tabs on the same browser immediately
        try {
          crossTabChannel?.postMessage({ type: 'DB_UPDATED', rev: nextRev });
        } catch {}

        // If another client ALSO pushed changes to the server in the meantime, merge server's state into local Dexie
        const mergedServerData = result.data || result.state?.data;
        if (result.merged && mergedServerData) {
          isApplyingRemoteChange = true;
          try {
            await mergeServerDataIntoDexie(mergedServerData, false);
          } finally {
            isApplyingRemoteChange = false;
          }
        }
        return true;
      } else {
        throw new Error(result.error || 'خطا در ثبت داده‌ها روی سرور مرکزی');
      }
    } catch (err: any) {
      hasPendingPush = true;
      savePersistedDirtyState();
      currentSyncState.lastError = err?.message || 'عدم ارسال داده به سرور مرکزی';
      return false;
    } finally {
      isPushInFlight = false;
      activePushPromise = null;
      currentSyncState.isSyncing = isPullInFlight;
      notifyListeners();

      // If another local write happened while this push was in flight, immediately run another push!
      if (hasPendingPush && pushedSuccessfully) {
        setTimeout(() => {
          pushToCentralServer(false);
        }, 50);
      }
    }
  })();

  return activePushPromise;
}

/**
 * Triggers a fast debounced push (250ms) to central server whenever a local user creates,
 * edits, or deletes any record.
 */
export function notifyDataChanged() {
  if (isApplyingRemoteChange) return;

  hasPendingPush = true;
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    pushToCentralServer(false);
  }, 250);
}

/**
 * Explicitly notifies central server that a 100% factory raw reset was performed,
 * wiping server data and advancing revision so no client pulls old data back.
 */
export async function notifyRawResetToCentralServer(): Promise<boolean> {
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  clearAllDeletedRecordsOnRawReset();
  currentSyncState.isSyncing = true;
  notifyListeners();

  try {
    const jsonString = await exportDB();
    const data = JSON.parse(jsonString);
    data.deletedRecords = {};

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
      currentSyncState.localRevision = Number(result.rev) || currentSyncState.localRevision + 1000;
      currentSyncState.serverRevision = currentSyncState.localRevision;
      currentSyncState.lastSyncTime = new Date();
      currentSyncState.lastError = null;
      currentSyncState.isOnline = true;
      return true;
    } else {
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
 * Detects local LAN IPv4 address directly inside browser / Tauri WebView using WebRTC ICE candidate discovery.
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

    const timer = setTimeout(finish, 900);

    const parseCandidate = (candStr: string) => {
      const match = candStr.match(
        /\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})\b/
      );
      if (match && match[0] && !match[0].startsWith('172.17.') && !match[0].startsWith('172.18.')) {
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
 * Fetches network info (Platform: Linux vs Windows, Real IP, Port configured in Linux or Windows, Hostname, Custom Domain).
 * Automatically prioritizes current origin on Linux/Web so Linux server settings are detected immediately.
 */
export async function fetchServerNetworkInfo(customUrl?: string): Promise<{
  ok: boolean;
  hostname?: string;
  platform?: string;
  isLinuxServer?: boolean;
  isTauriApp?: boolean;
  port?: number;
  localIps?: string[];
  primaryUrl?: string;
  customDomain?: string;
  domainUrl?: string;
  isServerRunning?: boolean;
  rev?: number;
}> {
  const isTauri = isTauriEnvironment();
  const candidates: string[] = [];

  if (customUrl) {
    candidates.push(customUrl.trim().replace(/\/+$/, ''));
  } else {
    // If running in browser (e.g. Linux server or web client), check window.location.origin FIRST!
    if (!isTauri && typeof window !== 'undefined' && window.location.origin && !window.location.origin.startsWith('tauri:')) {
      candidates.push(window.location.origin.replace(/\/+$/, ''));
    }
    if (currentSyncState.serverUrl && !currentSyncState.serverUrl.startsWith('tauri:')) {
      candidates.push(currentSyncState.serverUrl.trim().replace(/\/+$/, ''));
    }
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('arka_server_url') : null;
    if (saved && !saved.startsWith('tauri:')) {
      candidates.push(saved.trim().replace(/\/+$/, ''));
    }
    const savedPort = (typeof window !== 'undefined' && window.localStorage.getItem('arka_server_port')) || '4040';
    candidates.push(`http://127.0.0.1:${savedPort}`);
    candidates.push('http://127.0.0.1:4040');
    candidates.push('http://localhost:4040');
    candidates.push('http://127.0.0.1:3000');
  }

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
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) continue;
        const data = await res.json();
        if (data && data.ok) {
          const isLinux = data.platform === 'linux' || Boolean(data.isLinuxServer);
          const detectedPort = Number(data.port) || 4040;

          if (typeof window !== 'undefined' && detectedPort) {
            try {
              window.localStorage.setItem('arka_server_port', String(detectedPort));
            } catch {}
          }

          if (getNodeRole() === 'server') {
            currentSyncState.serverUrl = target;
            currentSyncState.isOnline = true;
            currentSyncState.serverPlatform = data.platform;
            currentSyncState.serverPort = detectedPort;
            notifyListeners();
          }

          // If accessed via browser on a domain or IP not in localIps, ensure current hostname is included
          const ipsList: string[] = Array.isArray(data.localIps) ? [...data.localIps] : [];
          if (
            typeof window !== 'undefined' &&
            window.location.hostname &&
            window.location.hostname !== 'localhost' &&
            window.location.hostname !== '127.0.0.1' &&
            !window.location.hostname.includes('tauri') &&
            /^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname) &&
            !ipsList.includes(window.location.hostname)
          ) {
            ipsList.unshift(window.location.hostname);
          }

          const effectivePrimaryUrl =
            ipsList.length > 0
              ? `http://${ipsList[0]}:${detectedPort}`
              : data.primaryUrl || `${target}`;

          return {
            ...data,
            port: detectedPort,
            localIps: ipsList,
            primaryUrl: effectivePrimaryUrl,
            isLinuxServer: isLinux,
            isTauriApp: isTauri,
            isServerRunning: true,
          };
        }
      }
    } catch {
      // try next candidate
    }
  }

  // Fallback if backend /api/network/info is unreachable
  const webrtcIps = await detectClientLanIpViaWebRTC();
  const savedLanIp = typeof window !== 'undefined' ? window.localStorage.getItem('arka_server_lan_ip') : null;
  const savedDomain = typeof window !== 'undefined' ? window.localStorage.getItem('arka_server_domain') : null;
  const savedPort = Number((typeof window !== 'undefined' && window.localStorage.getItem('arka_server_port')) || 4040) || 4040;

  const resolvedIps = Array.from(
    new Set([...(savedLanIp ? [savedLanIp] : []), ...webrtcIps])
  ).filter(Boolean);

  const bestIp = resolvedIps.length > 0 ? resolvedIps[0] : '';

  return {
    ok: resolvedIps.length > 0,
    hostname: isTauri ? 'سرور ویندوز (تائوری)' : 'سیستم محلی',
    platform: isTauri ? 'win32' : 'unknown',
    isLinuxServer: false,
    isTauriApp: isTauri,
    port: savedPort,
    localIps: resolvedIps,
    primaryUrl: bestIp ? `http://${bestIp}:${savedPort}` : `http://localhost:${savedPort}`,
    customDomain: savedDomain || '',
    domainUrl: savedDomain ? (savedDomain.startsWith('http') ? savedDomain : `http://${savedDomain}:${savedPort}`) : '',
    isServerRunning: false,
  };
}

/**
 * Tests connection to a potential server URL with clear Persian error messages
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
        error: 'پاسخی از این آدرس دریافت نشد (Timeout). لطفاً مطمئن شوید سرویس سرور روشن است و پورت انتخابی در فایروال باز می‌باشد.',
      };
    }
    if (
      String(err?.message || '').toLowerCase().includes('failed to fetch') ||
      String(err?.message || '').toLowerCase().includes('networkerror')
    ) {
      return {
        ok: false,
        error: 'ارتباط شبکه با سرور برقرار نشد (Connection Refused). ممکن است آدرس آی‌پی یا پورت اشتباه باشد یا فایروال مانع ارتباط شده باشد.',
      };
    }
    return { ok: false, error: err?.message || 'امکان برقراری ارتباط با این آدرس وجود ندارد.' };
  }
}

/**
 * Protective Database Pre-Switch Snapshot
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
 * Sends request to server to save a custom port configuration (and updates Tauri local port URL if applicable)
 */
export async function updateServerPort(port: number): Promise<{ ok: boolean; message?: string; error?: string }> {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem('arka_server_port', String(port));
    } catch {}
  }
  try {
    const target = currentSyncState.serverUrl || 'http://127.0.0.1:4040';
    const res = await fetch(`${target}/api/network/set-port`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port }),
    });
    if (res.ok) {
      const data = await res.json();
      if (isTauriEnvironment() && getNodeRole() === 'server') {
        const newUrl = `http://127.0.0.1:${port}`;
        currentSyncState.serverUrl = newUrl;
        try {
          window.localStorage.setItem('arka_server_url', newUrl);
        } catch {}
        notifyListeners();
      }
      return { ok: true, message: data.message || `پورت سرور روی ${port} ذخیره و فعال شد.` };
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
  } catch {
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
