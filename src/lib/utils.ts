import { db, AppSettings } from './db';
import { formatNumberThreeDigits, parseThreeDigitNumber } from './accountingEngine';

let activeCurrencyUnit: 'toman' | 'rial' = 'toman';

export const setGlobalCurrencyUnit = (unit: 'toman' | 'rial') => {
  activeCurrencyUnit = unit === 'rial' ? 'rial' : 'toman';
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
    const data = JSON.parse(jsonString);
    await db.transaction(
      'rw',
      [
        db.categories,
        db.menuItems,
        db.orders,
        db.settings,
        db.customers,
        db.accounts,
        db.bankAccounts,
        db.persons,
        db.journalVouchers,
        db.cheques,
        db.rawMaterials,
        db.inventoryTransactions,
        db.productionRecipes,
        db.kitchenProductions,
        db.cashClosures,
        db.appUsers,
      ],
      async () => {
        await db.categories.clear();
        await db.menuItems.clear();
        await db.orders.clear();
        await db.settings.clear();
        await db.customers.clear();
        await db.accounts.clear();
        await db.bankAccounts.clear();
        await db.persons.clear();
        await db.journalVouchers.clear();
        await db.cheques.clear();
        await db.rawMaterials.clear();
        await db.inventoryTransactions.clear();
        await db.productionRecipes.clear();
        await db.kitchenProductions.clear();
        await db.cashClosures.clear();

        if (data.categories) await db.categories.bulkAdd(data.categories);
        if (data.menuItems) await db.menuItems.bulkAdd(data.menuItems);
        if (data.orders) await db.orders.bulkAdd(data.orders);
        if (data.settings) await db.settings.bulkAdd(data.settings);
        if (data.customers) await db.customers.bulkAdd(data.customers);
        if (data.accounts) await db.accounts.bulkAdd(data.accounts);
        if (data.bankAccounts) await db.bankAccounts.bulkAdd(data.bankAccounts);
        if (data.persons) await db.persons.bulkAdd(data.persons);
        if (data.journalVouchers) await db.journalVouchers.bulkAdd(data.journalVouchers);
        if (data.cheques) await db.cheques.bulkAdd(data.cheques);
        if (data.rawMaterials) await db.rawMaterials.bulkAdd(data.rawMaterials);
        if (data.inventoryTransactions) await db.inventoryTransactions.bulkAdd(data.inventoryTransactions);
        if (data.productionRecipes) await db.productionRecipes.bulkAdd(data.productionRecipes);
        if (data.kitchenProductions) await db.kitchenProductions.bulkAdd(data.kitchenProductions);
        if (data.cashClosures) await db.cashClosures.bulkAdd(data.cashClosures);
        if (data.appUsers && Array.isArray(data.appUsers) && data.appUsers.length > 0) {
          await db.appUsers.clear();
          await db.appUsers.bulkAdd(data.appUsers);
        }
      }
    );
  } catch (err) {
    console.error('Failed to import database', err);
    throw new Error('فرمت فایل بکاپ نامعتبر است.');
  }
};

/**
 * Syncs the current DB backup JSON + Bot settings to the Linux server's /api/sync-backup endpoint
 * so that when `install.sh` runs an update, it can automatically send the latest backup to Bale & Telegram.
 */
export async function syncBackupToServer(overrideSettings?: Partial<AppSettings>): Promise<void> {
  try {
    const json = await exportDB();
    const currentSettings = overrideSettings || (await db.settings.toCollection().first()) || {};
    await fetch('/api/sync-backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        backupJson: json,
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
  const nowStr = new Date().toLocaleString('fa-IR');
  const fileName = `arka_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

  const caption =
    `📦 فایل پشتیبان سیستم رستورانی و حسابداری آرکا\n` +
    `🏢 نام مجموعه: ${settings.restaurantName || 'آرکا'}\n` +
    `⏰ زمان بکاپ: ${nowStr}\n` +
    `🔔 نوع ارسال: ${triggerLabel}\n` +
    `🧾 تعداد کل فاکتورها: ${ordersCount}\n` +
    `📒 تعداد اسناد حسابداری: ${vouchersCount}`;

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
