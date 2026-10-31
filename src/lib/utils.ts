import { db, AppSettings } from './db';
import { formatNumberThreeDigits, parseThreeDigitNumber } from './accountingEngine';
import { clearAllDeletedRecordsOnRawReset, notifyRawResetToCentralServer } from './networkSync';

let activeCurrencyUnit: 'toman' | 'rial' = (() => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('arka_currency_unit');
      if (saved === 'rial' || saved === 'toman') return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'toman';
})();

export const setGlobalCurrencyUnit = (unit: 'toman' | 'rial') => {
  activeCurrencyUnit = unit === 'rial' ? 'rial' : 'toman';
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('arka_currency_unit', activeCurrencyUnit);
    }
  } catch {
    // ignore storage errors
  }
};

export const getGlobalCurrencyUnit = (): 'toman' | 'rial' => activeCurrencyUnit;

export const getCurrencyLabel = (overrideUnit?: 'toman' | 'rial'): string => {
  const unit = overrideUnit || activeCurrencyUnit;
  return unit === 'rial' ? 'ریال' : 'تومان';
};

export const formatCurrency = (amount: number, overrideUnit?: 'toman' | 'rial'): string => {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  const label = getCurrencyLabel(overrideUnit);
  return new Intl.NumberFormat('fa-IR').format(safe) + ' ' + label;
};

export const formatNumber = (amount: number): string => {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('fa-IR').format(safe);
};

export { formatNumberThreeDigits, parseThreeDigitNumber };

export const exportDB = async (): Promise<string> => {
  const data = {
    version: 8,
    exportedAt: new Date().toISOString(),
    categories: await db.categories.toArray(),
    menuItems: await db.menuItems.toArray(),
    orders: await db.orders.toArray(),
    settings: await db.settings.toArray(),
    customers: await db.customers.toArray(),
    accounts: await db.accounts.toArray(),
    bankAccounts: await db.bankAccounts.toArray(),
    persons: await db.persons.toArray(),
    journalVouchers: await db.journalVouchers.toArray(),
    cheques: await db.cheques.toArray(),
    rawMaterials: await db.rawMaterials.toArray(),
    inventoryTransactions: await db.inventoryTransactions.toArray(),
    productionRecipes: await db.productionRecipes.toArray(),
    kitchenProductions: await db.kitchenProductions.toArray(),
    cashClosures: await db.cashClosures.toArray(),
    appUsers: await db.appUsers.toArray(),
  };
  return JSON.stringify(data, null, 2);
};

export const importDB = async (jsonString: string): Promise<void> => {
  try {
    const raw = JSON.parse(jsonString);
    // Support nested json containers from central server or old versions ({ data: ... })
    const data = raw && typeof raw === 'object' && raw.data && typeof raw.data === 'object' ? raw.data : raw;

    if (!data || typeof data !== 'object') {
      throw new Error('ساختار فایل پشتیبان نامعتبر است.');
    }

    const restoreNowMs = Date.now();
    const restoreDate = new Date(restoreNowMs);

    // Clear all local tombstones before restoring so no restored record is blocked by old deletions
    clearAllDeletedRecordsOnRawReset();

    // Helper function to safely parse all date fields and stamp fresh _updatedAtMs on restored records
    const parseDatesInArray = (arr: any[]): any[] => {
      if (!Array.isArray(arr)) return [];
      const dateFields = ['createdAt', 'updatedAt', 'date', 'closedAt', 'issueDate', 'dueDate', 'employmentStartDate'];
      return arr.map((item) => {
        if (!item || typeof item !== 'object') return item;
        const copy = { ...item };
        for (const f of dateFields) {
          if (copy[f] && typeof copy[f] === 'string') {
            const parsed = new Date(copy[f]);
            if (!isNaN(parsed.getTime())) copy[f] = parsed;
          }
        }
        copy._updatedAtMs = restoreNowMs;
        if (!copy.updatedAt) {
          copy.updatedAt = restoreDate;
        }
        return copy;
      });
    };

    await db.transaction('rw', db.tables, async () => {
      const tableMap: Record<string, string> = {
        categories: 'categories',
        menuItems: 'menuItems',
        orders: 'orders',
        settings: 'settings',
        customers: 'customers',
        accounts: 'accounts',
        bankAccounts: 'bankAccounts',
        persons: 'persons',
        journalVouchers: 'journalVouchers',
        cheques: 'cheques',
        rawMaterials: 'rawMaterials',
        inventoryTransactions: 'inventoryTransactions',
        productionRecipes: 'productionRecipes',
        kitchenProductions: 'kitchenProductions',
        cashClosures: 'cashClosures',
      };

      for (const [key, tableName] of Object.entries(tableMap)) {
        const table = (db as any)[tableName];
        if (!table) continue;
        // Only clear & overwrite if the key exists in the backup object (or is an array)
        if (key in data && Array.isArray(data[key])) {
          await table.clear();
          if (data[key].length > 0) {
            const sanitized = parseDatesInArray(data[key]);
            try {
              await table.bulkPut(sanitized);
            } catch {
              for (const item of sanitized) {
                try {
                  await table.put(item);
                } catch {
                  // ignore faulty record
                }
              }
            }
          }
        }
      }

      // AppUsers: Restore all users & passwords from backup
      if (Array.isArray(data.appUsers) && data.appUsers.length > 0) {
        await db.appUsers.clear();
        const sanitizedUsers = parseDatesInArray(data.appUsers);
        try {
          await db.appUsers.bulkPut(sanitizedUsers);
        } catch {
          for (const u of sanitizedUsers) {
            try {
              await db.appUsers.put(u);
            } catch {}
          }
        }
      }

      // Immediately synchronize global currency unit from imported settings
      if (Array.isArray(data.settings) && data.settings.length > 0) {
        const importedUnit = data.settings[0]?.currencyUnit;
        if (importedUnit === 'rial' || importedUnit === 'toman') {
          setGlobalCurrencyUnit(importedUnit);
        }
      }
    });

    // If the restored backup has data, disable raw mode so standard operations work seamlessly
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const totalRestored =
          (await db.categories.count()) +
          (await db.menuItems.count()) +
          (await db.bankAccounts.count()) +
          (await db.orders.count());
        if (totalRestored > 0) {
          window.localStorage.removeItem('arka_raw_mode');
        }
      }
    } catch {}

    // Auto-recover/sync menu if categories or menuItems are empty in an old POS-only backup
    try {
      const catCount = await db.categories.count();
      const menuCount = await db.menuItems.count();
      if (catCount === 0 || menuCount === 0) {
        await autoSyncBeveragesToMenuIfEmpty();
      }
    } catch (e) {
      console.warn('Auto-sync menu notice:', e);
    }

    // Immediately overwrite central_db.json and latest_db_backup.json on the central server
    // so all connected clients receive the restored backup and old server state never overwrites it!
    await notifyRawResetToCentralServer();
    await syncBackupToServer(undefined, true);
  } catch (err: any) {
    console.error('Failed to import database', err);
    throw new Error(err?.message || 'فرمت یا محتوای فایل بکاپ نامعتبر است.');
  }
};

/**
 * Automatically creates categories and menuItems from settings.quickBeverages
 * and order history if the menu tables are empty.
 */
export const autoSyncBeveragesToMenuIfEmpty = async (): Promise<number> => {
  const currentCategories = await db.categories.toArray();
  const currentMenuItems = await db.menuItems.toArray();

  if (currentCategories.length > 0 && currentMenuItems.length > 0) {
    return 0; // Menu already contains items
  }

  const settings = await db.settings.toCollection().first();
  const beverages =
    settings?.quickBeverages && settings.quickBeverages.length > 0
      ? settings.quickBeverages
      : [
          { id: 'soda', name: 'نوشابه', price: settings?.currencyUnit === 'rial' ? 550000 : 55000, color: 'amber' as const, isActive: true },
          { id: 'dough', name: 'دوغ', price: settings?.currencyUnit === 'rial' ? 150000 : 15000, color: 'emerald' as const, isActive: true },
          { id: 'water', name: 'آب معدنی', price: settings?.currencyUnit === 'rial' ? 250000 : 25000, color: 'blue' as const, isActive: true },
          { id: 'delster', name: 'دلستر', price: settings?.currencyUnit === 'rial' ? 800000 : 80000, color: 'purple' as const, isActive: true },
        ];

  // Scan order history for any unique items sold
  const orders = await db.orders.toArray();
  const orderItemsMap = new Map<string, number>();
  for (const order of orders) {
    for (const item of order.items || []) {
      if (item.menuItemId !== -1 && item.name && item.price > 0) {
        const cleanName = item.name.replace(/\s*اضافه$/, '').trim();
        if (!orderItemsMap.has(cleanName)) {
          orderItemsMap.set(cleanName, item.price);
        }
      }
    }
  }

  let catId: number;
  if (currentCategories.length === 0) {
    catId = (await db.categories.add({ name: 'نوشیدنی‌ها و مخلفات' })) as number;
  } else {
    catId = currentCategories[0].id!;
  }

  let addedCount = 0;
  const existingNames = new Set(currentMenuItems.map((m) => m.name.trim()));

  // 1. Add quickBeverages
  for (const bev of beverages) {
    const cleanName = bev.name.replace(/\s*اضافه$/, '').trim();
    if (!existingNames.has(cleanName) && !existingNames.has(bev.name.trim())) {
      await db.menuItems.add({
        categoryId: catId,
        name: cleanName,
        price: bev.price,
        isActive: bev.isActive !== false,
        isQuickBeverage: true,
      });
      existingNames.add(cleanName);
      addedCount++;
    }
  }

  // 2. Add any other items discovered in orders
  for (const [name, price] of orderItemsMap.entries()) {
    if (!existingNames.has(name)) {
      await db.menuItems.add({
        categoryId: catId,
        name,
        price,
        isActive: true,
        isQuickBeverage: true,
      });
      existingNames.add(name);
      addedCount++;
    }
  }

  return addedCount;
};

/**
 * Optimizes database storage size:
 * 1. Compresses huge base64 images in menu items / settings to lightweight WebP/JPEG.
 * 2. Cleans up empty or corrupted records.
 * 3. Returns optimization metrics.
 */
export async function optimizeDatabaseStorage(): Promise<{
  optimizedItems: number;
  cleanedVouchers: number;
  freedBytesEstimate: number;
}> {
  let optimizedItems = 0;
  let cleanedVouchers = 0;
  let freedBytesEstimate = 0;

  try {
    // 1. Optimize images in menuItems
    const items = await db.menuItems.toArray();
    for (const item of items) {
      if (item.image && typeof item.image === 'string' && item.image.length > 150000) {
        const originalSize = item.image.length;
        // Simple client-side canvas compression if running in browser
        try {
          if (typeof window !== 'undefined' && typeof document !== 'undefined') {
            const compressed = await compressBase64Image(item.image, 400, 0.7);
            if (compressed && compressed.length < originalSize) {
              item.image = compressed;
              await db.menuItems.put(item);
              optimizedItems++;
              freedBytesEstimate += originalSize - compressed.length;
            }
          }
        } catch {
          // ignore compression errors
        }
      }
    }

    // 2. Clean corrupted / empty journal vouchers
    const vouchers = await db.journalVouchers.toArray();
    for (const v of vouchers) {
      if (!v.lines || v.lines.length === 0) {
        if (v.id) {
          await db.journalVouchers.delete(v.id);
          cleanedVouchers++;
          freedBytesEstimate += 500;
        }
      }
    }
  } catch (e) {
    console.warn('Optimization error:', e);
  }

  return { optimizedItems, cleanedVouchers, freedBytesEstimate };
}

/**
 * Helper to compress a base64 image data URI using HTML Canvas
 */
function compressBase64Image(base64Str: string, maxDim: number, quality: number): Promise<string> {
  return new Promise((resolve) => {
    if (!base64Str.startsWith('data:image')) {
      return resolve(base64Str);
    }
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(base64Str);

      ctx.drawImage(img, 0, 0, width, height);
      const res = canvas.toDataURL('image/jpeg', quality);
      resolve(res);
    };
    img.onerror = () => resolve(base64Str);
  });
}

/**
 * Syncs the current DB backup JSON + Bot settings to the Linux server's /api/sync-backup endpoint
 * so that when `install.sh` runs an update, it can automatically send the latest backup to Bale & Telegram.
 */
export async function syncBackupToServer(
  overrideSettings?: Partial<AppSettings>,
  overwriteCentral: boolean = false
): Promise<void> {
  try {
    const json = await exportDB();
    const currentSettings = overrideSettings || (await db.settings.toCollection().first()) || {};
    await fetch('/api/sync-backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        backupJson: json,
        overwriteCentral,
        settings: {
          restaurantName: currentSettings.restaurantName || 'Arka Restaurant',
          baleBotToken: currentSettings.baleBotToken || '',
          baleChatId: currentSettings.baleChatId || '',
          telegramBotToken: currentSettings.telegramBotToken || '',
          telegramChatId: currentSettings.telegramChatId || '',
          autoBackupBeforeUpdate: currentSettings.autoBackupBeforeUpdate ?? true,
        },
      }),
    });
  } catch {
    // Silent fallback when running in client-only preview mode
  }
}

/**
 * Sends a backup JSON file + summary caption to Telegram and/or Bale Bot APIs.
 */
export async function sendBackupToMessengers(
  settings: Partial<AppSettings>,
  triggerLabel: string = 'ارسال خودکار ساعتی'
): Promise<{
  success: boolean;
  messages: string[];
}> {
  await syncBackupToServer(settings);
  const json = await exportDB();
  const ordersCount = await db.orders.count();
  const vouchersCount = await db.journalVouchers.count();
  const menuCount = await db.menuItems.count();
  const bankCount = await db.bankAccounts.count();
  const usersCount = await db.appUsers.count();
  const materialsCount = await db.rawMaterials.count();
  const nowStr = new Date().toLocaleString('fa-IR');
  const fileName = `arka_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

  const caption =
    `📦 فایل پشتیبان جامع کل نرم‌افزار آرکا\n` +
    `🏢 نام مجموعه: ${settings.restaurantName || 'آرکا'}\n` +
    `⏰ زمان بکاپ: ${nowStr}\n` +
    `🔔 نوع ارسال: ${triggerLabel}\n` +
    `🧾 فاکتورها: ${ordersCount} | 📒 اسناد حسابداری: ${vouchersCount}\n` +
    `🍽️ اقلام منو: ${menuCount} | 🏦 بانک‌ها: ${bankCount}\n` +
    `📦 مواد انبار: ${materialsCount} | 👤 کاربران و رمزها: ${usersCount}`;

  const results: string[] = [];
  let anySuccess = false;

  const sendToBotApi = async (
    platformName: string,
    baseUrl: string,
    token: string,
    chatId: string
  ) => {
    try {
      // Primary Route: Server-side Proxy (Bypasses Browser CORS)
      const proxyRes = await fetch('/api/send-bot-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: platformName.includes('بله') ? 'bale' : 'telegram',
          token: token.trim(),
          chatId: chatId.trim(),
          caption,
          fileName,
          backupJson: json,
        }),
      });

      if (proxyRes.ok) {
        const proxyData = await proxyRes.json();
        if (proxyData.ok) {
          anySuccess = true;
          results.push(`✅ بکاپ با موفقیت به ربات ${platformName} ارسال شد.`);
          return;
        } else if (proxyData.error) {
          results.push(`⚠️ ${platformName}: ${proxyData.error}`);
          return;
        }
      }

      // Fallback Route: Direct Browser Fetch
      const blob = new Blob([json], { type: 'application/json' });
      const formData = new FormData();
      formData.append('chat_id', chatId.trim());
      formData.append('caption', caption);
      formData.append('document', blob, fileName);

      const response = await fetch(`${baseUrl}/bot${token.trim()}/sendDocument`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        anySuccess = true;
        results.push(`✅ بکاپ با موفقیت به ربات ${platformName} ارسال شد.`);
      } else {
        results.push(`⚠️ خطا در پاسخ سرور ${platformName} (کد ${response.status}) - توکن یا چت‌آیدی را بررسی کنید.`);
      }
    } catch (err) {
      results.push(
        `⚠️ عدم امکان ارسال مستقیم مرورگر به ${platformName}. توکن روی سرور ذخیره شد و در ارسال بعدی خروجی گرفته می‌شود.`
      );
    }
  };

  const hasBale = Boolean(settings.baleBotToken?.trim() && settings.baleChatId?.trim());
  const hasTelegram = Boolean(settings.telegramBotToken?.trim() && settings.telegramChatId?.trim());

  if (!hasBale && !hasTelegram) {
    return {
      success: false,
      messages: ['لطفاً ابتدا توکن و شناسه چت ربات بله یا تلگرام را وارد کنید.'],
    };
  }

  if (hasBale) {
    await sendToBotApi('بله (Bale)', 'https://tapi.bale.ai', settings.baleBotToken!, settings.baleChatId!);
  }

  if (hasTelegram) {
    await sendToBotApi(
      'تلگرام (Telegram)',
      'https://api.telegram.org',
      settings.telegramBotToken!,
      settings.telegramChatId!
    );
  }

  const currentSettings = await db.settings.toCollection().first();
  if (currentSettings?.id) {
    await db.settings.update(currentSettings.id, {
      lastAutoBackupAt: nowStr,
      lastAutoBackupStatus: results.join(' | '),
    });
  }

  return {
    success: anySuccess,
    messages: results,
  };
}
