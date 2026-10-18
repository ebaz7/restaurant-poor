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
  serverUrl: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
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

/**
 * Initializes the central network synchronization engine on client startup:
 * 1. Checks connection with central server (/api/db/version).
 * 2. If server has data, pulls and initializes local Dexie database.
 * 3. Starts background polling (every 3.5s) to detect updates from other cashiers/devices.
 */
export async function initNetworkSync(customServerUrl?: string) {
  if (isInitialized && !customServerUrl) return;
  isInitialized = true;

  if (customServerUrl) {
    currentSyncState.serverUrl = customServerUrl.replace(/\/+$/, '');
  } else if (typeof window !== 'undefined') {
    currentSyncState.serverUrl = window.location.origin;
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
 * Pulls the entire database state from the central server into local Dexie.
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
      // If server has data, import it into local Dexie
      isApplyingRemoteChange = true;
      try {
        await importDB(JSON.stringify(payload.data));
        currentSyncState.localRevision = Number(payload.rev) || 1;
        currentSyncState.serverRevision = currentSyncState.localRevision;
        currentSyncState.lastSyncTime = new Date();
        currentSyncState.lastError = null;
        currentSyncState.isOnline = true;
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
