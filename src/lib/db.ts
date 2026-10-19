import Dexie, { Table } from 'dexie';
import {
  AccountType,
  DEFAULT_CHART_OF_ACCOUNTS,
  JournalLine,
  calculateRecipeCost,
  calculateWeightedAveragePurchase,
  convertRecipeQtyToStockUnit,
} from './accountingEngine';

export interface Category {
  id?: number;
  name: string;
}

export interface MenuItem {
  id?: number;
  categoryId: number;
  name: string;
  price: number;
  isActive: boolean;
  image?: string;
}

export interface OrderItem {
  menuItemId: number;
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
  id?: number;
  invoiceNumber: number;
  createdAt: Date;
  customerPhone: string;
  customerName?: string;
  customerSubscriptionCode?: string;
  customerAddress?: string;
  items: OrderItem[];
  subtotal: number;
  discountType: 'none' | 'percent' | 'amount';
  discountValue: number;
  taxEnabled: boolean;
  taxPercentage: number;
  taxAmount: number;
  total: number;
  status: 'paid' | 'cancelled';
  // New fields for Self-Service (Mode 2) & Bank/Cashier Settlement
  invoiceMode?: 'standard' | 'self_service';
  selfServiceGuests?: number; // 1 to 4
  selfServiceUnitPrice?: number;
  selfServiceDrinkNote?: string;
  paymentMethod?: 'cash' | 'card' | 'split' | 'credit';
  bankId?: number;
  bankName?: string;
  cashAmount?: number;
  cardAmount?: number;
  personId?: number; // If credit/person linked
  cogsAmount?: number; // Cost of Goods Sold calculated at checkout
}

export interface Customer {
  id?: number;
  phone: string;
  name: string;
  subscriptionCode: string;
  address: string;
  createdAt: Date;
}

export interface AppSettings {
  id?: number;
  restaurantName: string;
  phone: string;
  address: string;
  website: string;
  instagram: string;
  telegram: string;
  logoUrl: string;
  taxEnabled: boolean;
  taxPercentage: number;
  requireCustomerPhone: boolean;
  // Currency unit ('toman' | 'rial')
  currencyUnit?: 'toman' | 'rial';
  // Self-Service & Beverage default prices
  selfServicePricePerPerson?: number;
  selfServiceTitle?: string;
  defaultSodaPrice?: number;
  defaultDoughPrice?: number;
  defaultWaterPrice?: number;
  defaultDelsterPrice?: number;
  // Default Invoice Mode ('self_service' | 'standard') and lock option
  defaultInvoiceMode?: 'self_service' | 'standard';
  lockSelfServiceMode?: boolean;
  // Auto Backup (Bale & Telegram Bot) settings
  autoBackupEnabled?: boolean;
  autoBackupIntervalHours?: number; // default 1 hour
  telegramBotToken?: string;
  telegramChatId?: string;
  baleBotToken?: string;
  baleChatId?: string;
  lastAutoBackupAt?: string;
  lastAutoBackupStatus?: string;
  // Raw mode & RBAC login settings
  isRawInitialized?: boolean;
  requireLoginOnStart?: boolean;
  autoBackupBeforeUpdate?: boolean;
  // Kitchen Privacy: hide COGS / cost prices from chef
  hideCostPriceFromKitchen?: boolean;
  // Central Server License shared across all LAN clients
  centralLicenseInfo?: {
    isActivated: boolean;
    systemCode: string;
    licenseKey: string;
    activatedAt: string;
    isEmergencyOverride?: boolean;
  };
}

export type PermissionKey =
  | 'pos'
  | 'pos_discount'
  | 'pos_cancel'
  | 'pos_edit_invoice'
  | 'pos_delete_invoice'
  | 'kitchen'
  | 'accounting'
  | 'menu'
  | 'reports'
  | 'customers'
  | 'settings';

export const ALL_PERMISSIONS: PermissionKey[] = [
  'pos',
  'pos_discount',
  'pos_cancel',
  'pos_edit_invoice',
  'pos_delete_invoice',
  'kitchen',
  'accounting',
  'menu',
  'reports',
  'customers',
  'settings',
];

export const PERMISSION_DEFINITIONS: Array<{
  key: PermissionKey;
  title: string;
  description: string;
  category: 'module' | 'action';
}> = [
  {
    key: 'pos',
    title: 'صندوق فروش و صدور فیش',
    description: 'دسترسی به صفحه صندوق، ثبت سفارش سلف و منوی عادی',
    category: 'module',
  },
  {
    key: 'pos_discount',
    title: 'اعمال تخفیف و تغییر قیمت در صندوق',
    description: 'مجوز ثبت تخفیف درصدی/مبلغی و تغییر دستی فی سلف سرویس',
    category: 'action',
  },
  {
    key: 'pos_edit_invoice',
    title: 'ویرایش فاکتورهای صادر شده',
    description: 'مجوز اصلاح آیتم‌ها، تخفیف، مشتری و نحوه تسویه فاکتور صادر شده',
    category: 'action',
  },
  {
    key: 'pos_delete_invoice',
    title: 'حذف یا ابطال کامل فاکتور',
    description: 'مجوز حذف یا لغو کامل فاکتور و برگشت اسناد حسابداری مرتبط',
    category: 'action',
  },
  {
    key: 'pos_cancel',
    title: 'ابطال فاکتور و بستن صندوق روزانه',
    description: 'مجوز بستن شیفت صندوق (Z-Report) و ابطال فاکتورها',
    category: 'action',
  },
  {
    key: 'kitchen',
    title: 'منو آشپزخانه و ثبت تولید',
    description: 'دسترسی به بخش تولید روزانه آشپزخانه و فرمولاسیون پخت',
    category: 'module',
  },
  {
    key: 'accounting',
    title: 'حسابداری، بانک، چک، انبار و اشخاص',
    description: 'دسترسی به اسناد حسابداری، حساب‌های بانکی، چک‌ها، انبار مواد اولیه و طرف‌حساب‌ها',
    category: 'module',
  },
  {
    key: 'menu',
    title: 'مدیریت منو و دسته‌بندی‌ها',
    description: 'افزودن، ویرایش و قیمت‌گذاری غذاها و دسته‌بندی‌های منو',
    category: 'module',
  },
  {
    key: 'reports',
    title: 'گزارشات فروش و آمار',
    description: 'مشاهده گزارشات مالی فروش، تعداد نفرات، نمودارها و تاریخچه فاکتورها',
    category: 'module',
  },
  {
    key: 'customers',
    title: 'باشگاه مشتریان',
    description: 'مشاهده و مدیریت اطلاعات و اشتراک مشتریان',
    category: 'module',
  },
  {
    key: 'settings',
    title: 'تنظیمات سیستم، کاربران و بکاپ',
    description: 'دسترسی به تنظیمات کل سیستم، تعریف کاربران، بات بکاپ و خام‌سازی',
    category: 'module',
  },
];

export interface AppUser {
  id?: number;
  username: string;
  fullName: string;
  pin: string;
  roleLabel: string;
  isAdmin: boolean;
  permissions: PermissionKey[];
  isActive: boolean;
  createdAt: Date;
}

// --- ACCOUNTING & INVENTORY INTERFACES ---

export interface Account {
  id?: number;
  code: string;
  name: string;
  type: AccountType;
  isSystem: boolean;
  description?: string;
}

export interface BankAccount {
  id?: number;
  bankName: string;
  accountNumber: string;
  cardNumber: string;
  iban?: string;
  posTerminalId?: string;
  hasPos?: boolean; // آیا متصل به کارتخوان پوز است
  hasChequeBook?: boolean; // آیا دارای دسته چک است
  chequeBookSeries?: string; // سریال دسته چک
  chequeBookPages?: number; // تعداد برگ دسته چک
  initialBalance: number;
  currentBalance: number;
  isDefaultPos: boolean;
  isActive: boolean;
}

export type PersonRole = 'customer' | 'supplier' | 'staff';

export interface Person {
  id?: number;
  name: string;
  role: PersonRole;
  phone: string;
  code?: string;
  address?: string;
  description?: string;
  initialBalance?: number; // positive = debit (بدهکار به ما), negative = credit (طلبکار از ما)
  monthlySalary?: number; // مبلغ حقوق ماهیانه توافقی (ویژه پرسنل)
  employmentStartDate?: Date; // تاریخ شروع به کار / روز اول کاری
  accrueCurrentMonthImmediately?: boolean; // شناسایی خودکار طلب حقوق در ابتدای هر ماه کاری (پیش‌فرض: true)
  createdAt: Date;
}

export interface JournalVoucher {
  id?: number;
  voucherNumber: number;
  date: Date;
  description: string;
  type: 'auto_sale' | 'auto_expense' | 'auto_payment' | 'auto_purchase' | 'auto_cheque' | 'manual';
  referenceId?: number;
  salaryPeriodKey?: string;
  bankId?: number;
  bankName?: string;
  lines: JournalLine[];
  totalAmount: number;
}

export interface Cheque {
  id?: number;
  chequeNumber: string; // شماره صیادی / سریال چک
  type: 'issued' | 'received'; // پرداختی ما | دریافتی از مشتری
  amount: number;
  issueDate: Date;
  dueDate: Date;
  bankId?: number;
  bankName: string;
  personId?: number;
  personName: string;
  description: string;
  status: 'pending' | 'cleared' | 'bounced' | 'cancelled';
  clearedAt?: Date;
}

export interface RawMaterial {
  id?: number;
  name: string;
  unit: 'کیلوگرم' | 'گرم' | 'عدد' | 'لیتر' | 'بسته' | 'کارتن' | 'سی‌سی' | 'مثقال';
  unitsPerPackage?: number; // ضریب تبدیل بسته/کارتن (مثلاً هر کارتن ۲۴ عدد یا ۱۰ کیلوگرم)
  currentQty: number;
  minQty: number;
  avgCost: number; // میانگین موزون قیمت واحد
  lastPurchasePrice: number;
  updatedAt: Date;
}

export interface InventoryTransaction {
  id?: number;
  materialId: number;
  materialName: string;
  unit: string;
  date: Date;
  type: 'in_purchase' | 'out_sale_bom' | 'out_manual_waste' | 'in_initial';
  quantity: number; // همیشه مثبت، جهت با type مشخص می‌شود
  unitPrice: number;
  totalPrice: number;
  balanceQtyAfter: number; // مانده مقداری در کاردکس
  balanceValueAfter: number; // مانده ریالی در کاردکس
  personId?: number;
  personName?: string;
  paymentMethod?: 'cash' | 'bank' | 'credit' | 'cheque';
  bankName?: string;
  description: string;
}

export interface ProductionRecipeItem {
  rowKey?: string; // کلید یکتای ردیف در فرمول تولید
  materialId: number; // برای کالای متفرقه (خارج از انبار) منفی است (مثلاً -1)
  materialName: string;
  unit: string; // واحد پایه انبار
  recipeUnit?: string; // واحد انتخابی در فرمول تولید (گرم، کیلوگرم، کارتن، عدد، بسته، لیتر...)
  unitsPerPackage?: number; // ضریب تبدیل کارتن/بسته به واحد مصرفی
  quantity: number; // مصرف به ازای ۱ پرس محصول (بر حسب recipeUnit)
  wastePercent: number; // درصد پرت پخت
  isMisc?: boolean; // کالای متفرقه (در انبار نمی‌آید و فی دستی دارد اما روی قیمت تمام شده محاسبه می‌شود)
  customUnitPrice?: number; // فی دستی برای کالای متفرقه
}

export interface ProductionRecipe {
  id?: number;
  menuItemId: number;
  menuItemName: string;
  ingredients: ProductionRecipeItem[];
  laborCost: number; // دستمزد مستقیم پخت هر پرس
  overheadCost: number; // سربار (گاز، برق، استهلاک) هر پرس
  packagingCost: number; // هزینه ظرف و بسته‌بندی هر پرس
  notes?: string;
  updatedAt: Date;
}

export interface KitchenProductionLog {
  id?: number;
  batchNumber: number;
  createdAt: Date;
  shiftLabel: string;
  chefName: string;
  items: Array<{
    menuItemId: number;
    menuItemName: string;
    quantityProduced: number;
    unitCost: number;
    totalCost: number;
  }>;
  materialConsumptions: Array<{
    materialId: number;
    materialName: string;
    unit: string;
    grossQuantityConsumed: number;
    unitCost: number;
    totalMaterialCost: number;
  }>;
  totalPortions: number;
  totalMaterialsCost: number;
  totalLaborAndOverheadCost: number;
  totalBatchCost: number;
  notes?: string;
}

export interface CashClosure {
  id?: number;
  closedAt: Date;
  dateLabel: string;
  cashierName: string;
  totalSales: number;
  orderCount: number;
  selfServiceCount: number;
  expectedCash: number;
  actualCash: number;
  cashDiscrepancy: number; // actualCash - expectedCash
  totalCard: number;
  totalCredit: number;
  bankBreakdown: Array<{
    bankId: number;
    bankName: string;
    amount: number;
    txCount: number;
  }>;
  notes?: string;
}

export class POSDatabase extends Dexie {
  categories!: Table<Category>;
  menuItems!: Table<MenuItem>;
  orders!: Table<Order>;
  settings!: Table<AppSettings>;
  customers!: Table<Customer>;
  accounts!: Table<Account>;
  bankAccounts!: Table<BankAccount>;
  persons!: Table<Person>;
  journalVouchers!: Table<JournalVoucher>;
  cheques!: Table<Cheque>;
  rawMaterials!: Table<RawMaterial>;
  inventoryTransactions!: Table<InventoryTransaction>;
  productionRecipes!: Table<ProductionRecipe>;
  kitchenProductions!: Table<KitchenProductionLog>;
  cashClosures!: Table<CashClosure>;
  appUsers!: Table<AppUser>;

  constructor() {
    super('RestaurantPOSDB');
    this.version(1).stores({
      categories: '++id, name',
      menuItems: '++id, categoryId, name',
      orders: '++id, invoiceNumber, createdAt, status',
      settings: '++id',
    });
    this.version(5).stores({
      categories: '++id, name',
      menuItems: '++id, categoryId, name',
      orders: '++id, invoiceNumber, createdAt, status',
      settings: '++id',
      customers: '++id, phone, name, subscriptionCode',
    });
    this.version(6).stores({
      categories: '++id, name',
      menuItems: '++id, categoryId, name',
      orders: '++id, invoiceNumber, createdAt, status, invoiceMode, paymentMethod, bankId',
      settings: '++id',
      customers: '++id, phone, name, subscriptionCode',
      accounts: '++id, &code, name, type',
      bankAccounts: '++id, bankName, isDefaultPos, isActive',
      persons: '++id, name, role, phone',
      journalVouchers: '++id, voucherNumber, date, type',
      cheques: '++id, chequeNumber, type, dueDate, status, personId, bankId',
      rawMaterials: '++id, name, unit',
      inventoryTransactions: '++id, materialId, date, type',
      productionRecipes: '++id, &menuItemId',
      cashClosures: '++id, closedAt, dateLabel',
    });
    this.version(7).stores({
      categories: '++id, name',
      menuItems: '++id, categoryId, name',
      orders: '++id, invoiceNumber, createdAt, status, invoiceMode, paymentMethod, bankId',
      settings: '++id',
      customers: '++id, phone, name, subscriptionCode',
      accounts: '++id, &code, name, type',
      bankAccounts: '++id, bankName, isDefaultPos, isActive',
      persons: '++id, name, role, phone',
      journalVouchers: '++id, voucherNumber, date, type',
      cheques: '++id, chequeNumber, type, dueDate, status, personId, bankId',
      rawMaterials: '++id, name, unit',
      inventoryTransactions: '++id, materialId, date, type',
      productionRecipes: '++id, &menuItemId',
      kitchenProductions: '++id, batchNumber, createdAt, shiftLabel',
      cashClosures: '++id, closedAt, dateLabel',
    });
    this.version(8).stores({
      categories: '++id, name',
      menuItems: '++id, categoryId, name',
      orders: '++id, invoiceNumber, createdAt, status, invoiceMode, paymentMethod, bankId',
      settings: '++id',
      customers: '++id, phone, name, subscriptionCode',
      accounts: '++id, &code, name, type',
      bankAccounts: '++id, bankName, isDefaultPos, isActive',
      persons: '++id, name, role, phone',
      journalVouchers: '++id, voucherNumber, date, type',
      cheques: '++id, chequeNumber, type, dueDate, status, personId, bankId',
      rawMaterials: '++id, name, unit',
      inventoryTransactions: '++id, materialId, date, type',
      productionRecipes: '++id, &menuItemId',
      kitchenProductions: '++id, batchNumber, createdAt, shiftLabel',
      cashClosures: '++id, closedAt, dateLabel',
      appUsers: '++id, &username, roleLabel, isActive',
    });
  }
}

export const db = new POSDatabase();

/**
 * Helper: Generates next sequential voucher number.
 */
export async function getNextVoucherNumber(): Promise<number> {
  const last = await db.journalVouchers.orderBy('voucherNumber').last();
  return (last?.voucherNumber || 100) + 1;
}

/**
 * Helper: Records a balanced double-entry voucher and updates bank balances if applicable.
 */
export async function recordJournalVoucher(params: {
  date?: Date;
  description: string;
  type: JournalVoucher['type'];
  referenceId?: number;
  salaryPeriodKey?: string;
  bankId?: number;
  bankName?: string;
  lines: JournalLine[];
}): Promise<number> {
  const voucherNumber = await getNextVoucherNumber();
  const totalAmount = params.lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);

  const id = await db.journalVouchers.add({
    voucherNumber,
    date: params.date || new Date(),
    description: params.description,
    type: params.type,
    referenceId: params.referenceId,
    salaryPeriodKey: params.salaryPeriodKey,
    bankId: params.bankId,
    bankName: params.bankName,
    lines: params.lines,
    totalAmount,
  });

  // Update Bank currentBalance if bankId is provided and line 102 is affected
  if (params.bankId) {
    const bank = await db.bankAccounts.get(params.bankId);
    if (bank) {
      let delta = 0;
      for (const line of params.lines) {
        if (line.accountCode === '102') {
          delta += (Number(line.debit) || 0) - (Number(line.credit) || 0);
        }
      }
      if (delta !== 0) {
        await db.bankAccounts.update(params.bankId, {
          currentBalance: bank.currentBalance + delta,
        });
      }
    }
  }

  return id as number;
}

/**
 * Helper: Deletes a journal voucher and reverses its effect on the associated bank's currentBalance.
 */
export async function deleteJournalVoucherAndSyncBanks(voucherId: number): Promise<void> {
  const v = await db.journalVouchers.get(voucherId);
  if (!v) return;

  if (v.bankId) {
    const bank = await db.bankAccounts.get(v.bankId);
    if (bank) {
      let delta = 0;
      for (const line of v.lines) {
        if (line.accountCode === '102') {
          delta += (Number(line.debit) || 0) - (Number(line.credit) || 0);
        }
      }
      if (delta !== 0) {
        await db.bankAccounts.update(v.bankId, {
          currentBalance: Math.max(0, bank.currentBalance - delta),
        });
      }
    }
  }

  await db.journalVouchers.delete(voucherId);
}

/**
 * Helper: Updates an existing journal voucher and adjusts bank balances accurately.
 */
export async function updateJournalVoucherAndSyncBanks(
  voucherId: number,
  updates: {
    description?: string;
    date?: Date;
    bankId?: number;
    bankName?: string;
    lines: JournalLine[];
  }
): Promise<void> {
  const oldV = await db.journalVouchers.get(voucherId);
  if (!oldV) return;

  // 1. Reverse old bank impact
  if (oldV.bankId) {
    const oldBank = await db.bankAccounts.get(oldV.bankId);
    if (oldBank) {
      let oldDelta = 0;
      for (const line of oldV.lines) {
        if (line.accountCode === '102') {
          oldDelta += (Number(line.debit) || 0) - (Number(line.credit) || 0);
        }
      }
      if (oldDelta !== 0) {
        await db.bankAccounts.update(oldV.bankId, {
          currentBalance: oldBank.currentBalance - oldDelta,
        });
      }
    }
  }

  const totalAmount = updates.lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  const newBankId = updates.bankId !== undefined ? updates.bankId : oldV.bankId;
  const newBankName = updates.bankName !== undefined ? updates.bankName : oldV.bankName;

  await db.journalVouchers.update(voucherId, {
    description: updates.description !== undefined ? updates.description : oldV.description,
    date: updates.date || oldV.date,
    bankId: newBankId,
    bankName: newBankName,
    lines: updates.lines,
    totalAmount,
  });

  // 2. Apply new bank impact
  if (newBankId) {
    const newBank = await db.bankAccounts.get(newBankId);
    if (newBank) {
      let newDelta = 0;
      for (const line of updates.lines) {
        if (line.accountCode === '102') {
          newDelta += (Number(line.debit) || 0) - (Number(line.credit) || 0);
        }
      }
      if (newDelta !== 0) {
        await db.bankAccounts.update(newBankId, {
          currentBalance: newBank.currentBalance + newDelta,
        });
      }
    }
  }
}

/**
 * Helper: Recalculates running Kardex balances and weighted average cost for a raw material
 * after any initial stock, purchase invoice, or outflow transaction is edited or deleted.
 */
export async function recalculateMaterialKardex(materialId: number): Promise<void> {
  const mat = await db.rawMaterials.get(materialId);
  if (!mat) return;

  const txs = await db.inventoryTransactions
    .where('materialId')
    .equals(materialId)
    .toArray();

  // Sort chronologically
  txs.sort((a, b) => {
    const tDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (tDiff !== 0) return tDiff;
    return (a.id || 0) - (b.id || 0);
  });

  if (txs.length === 0) {
    return;
  }

  let runningQty = 0;
  let runningAvgCost = mat.avgCost || 0;
  let lastBuyPrice = mat.lastPurchasePrice || mat.avgCost || 0;

  for (const tx of txs) {
    const isIn = tx.type === 'in_initial' || tx.type === 'in_purchase';
    if (isIn) {
      const wAvg = calculateWeightedAveragePurchase({
        currentQty: runningQty,
        currentAvgCost: runningAvgCost,
        purchaseQty: tx.quantity,
        purchaseUnitPrice: tx.unitPrice,
      });
      runningQty = wAvg.newQuantity;
      runningAvgCost = wAvg.newAverageCost;
      lastBuyPrice = tx.unitPrice;
      const totalPrice = Math.round(tx.quantity * tx.unitPrice);
      if (tx.id) {
        await db.inventoryTransactions.update(tx.id, {
          materialName: mat.name,
          unit: mat.unit,
          totalPrice,
          balanceQtyAfter: runningQty,
          balanceValueAfter: wAvg.totalInventoryValue,
        });
      }
    } else {
      runningQty = Math.max(0, Number((runningQty - tx.quantity).toFixed(4)));
      const unitPrice = tx.unitPrice || runningAvgCost;
      const totalPrice = Math.round(tx.quantity * unitPrice);
      const valAfter = Math.round(runningQty * runningAvgCost);
      if (tx.id) {
        await db.inventoryTransactions.update(tx.id, {
          materialName: mat.name,
          unit: mat.unit,
          unitPrice,
          totalPrice,
          balanceQtyAfter: runningQty,
          balanceValueAfter: valAfter,
        });
      }
    }
  }

  await db.rawMaterials.update(materialId, {
    currentQty: runningQty,
    avgCost: runningAvgCost,
    lastPurchasePrice: lastBuyPrice,
    updatedAt: new Date(),
  });
}

/**
 * Helper: Computes the monthly salary periods that should be accrued for a staff member
 * from their employmentStartDate (or createdAt) up to `now`.
 */
export function calculateStaffSalaryPeriods(
  startDateInput: Date | string,
  accrueAtMonthStart: boolean = true,
  now: Date = new Date()
): Array<{ periodNumber: number; periodStart: Date; periodEnd: Date }> {
  const start = new Date(startDateInput);
  if (isNaN(start.getTime())) return [];
  start.setHours(0, 0, 0, 0);

  const current = new Date(now);
  current.setHours(23, 59, 59, 999);

  if (start > current) return [];

  const periods: Array<{ periodNumber: number; periodStart: Date; periodEnd: Date }> = [];
  const MAX_PERIODS = 60; // Cap at 5 years (60 months) for safety

  for (let k = 1; k <= MAX_PERIODS; k++) {
    const pStart = new Date(start);
    pStart.setMonth(pStart.getMonth() + (k - 1));

    const pEnd = new Date(start);
    pEnd.setMonth(pEnd.getMonth() + k);

    if (accrueAtMonthStart) {
      if (pStart <= current) {
        periods.push({ periodNumber: k, periodStart: pStart, periodEnd: pEnd });
      } else {
        break;
      }
    } else {
      if (pEnd <= current) {
        periods.push({ periodNumber: k, periodStart: pStart, periodEnd: pEnd });
      } else {
        break;
      }
    }
  }

  return periods;
}

/**
 * Helper: Automatically issues or updates monthly salary credit (طلب حقوق ماهانه) journal vouchers
 * for all staff members who have `monthlySalary > 0`.
 * Returns the number of newly issued salary vouchers.
 */
export async function syncStaffMonthlySalaries(): Promise<number> {
  const allPersons = await db.persons.toArray();
  const allVouchers = await db.journalVouchers.toArray();
  let newlyCreatedCount = 0;

  for (const person of allPersons) {
    if (!person.id) continue;
    const salary = Math.round(Number(person.monthlySalary) || 0);
    const keyPrefix = `staff_salary_${person.id}_period_`;

    // Find all existing auto salary vouchers for this person
    const existingPersonSalaryVouchers = allVouchers.filter(
      (v) =>
        (v.salaryPeriodKey && v.salaryPeriodKey.startsWith(keyPrefix)) ||
        (v.referenceId === person.id &&
          v.type === 'auto_expense' &&
          v.description.includes('شناسایی خودکار طلب حقوق ماهیانه'))
    );

    if (person.role !== 'staff' || salary <= 0) {
      // If salary was disabled or set to 0, remove auto salary vouchers
      for (const ev of existingPersonSalaryVouchers) {
        if (ev.id) await db.journalVouchers.delete(ev.id);
      }
      continue;
    }

    const startDate = person.employmentStartDate || person.createdAt || new Date();
    const accrueAtStart = person.accrueCurrentMonthImmediately !== false;
    const duePeriods = calculateStaffSalaryPeriods(startDate, accrueAtStart, new Date());

    const validKeys = new Set<string>();

    for (const period of duePeriods) {
      const periodKey = `${keyPrefix}${period.periodNumber}`;
      validKeys.add(periodKey);

      const existing = existingPersonSalaryVouchers.find(
        (v) =>
          v.salaryPeriodKey === periodKey ||
          v.description.includes(`(دوره ${period.periodNumber})`)
      );

      const desc = `شناسایی خودکار طلب حقوق ماهیانه (دوره ${period.periodNumber}) - ${person.name}`;
      const lines: JournalLine[] = [
        {
          accountCode: '601',
          accountName: 'هزینه حقوق و دستمزد پرسنل',
          debit: salary,
          credit: 0,
          description: `هزینه حقوق ماهیانه دوره ${period.periodNumber} (${person.name})`,
        },
        {
          accountCode: '201',
          accountName: 'حساب‌های پرداختنی (تأمین‌کنندگان و پرسنل)',
          personId: person.id,
          personName: person.name,
          debit: 0,
          credit: salary,
          description: `ثبت طلب حقوق ماهیانه دوره ${period.periodNumber}`,
        },
      ];

      if (!existing) {
        await recordJournalVoucher({
          date: period.periodStart,
          description: desc,
          type: 'auto_expense',
          referenceId: person.id,
          salaryPeriodKey: periodKey,
          lines,
        });
        newlyCreatedCount++;
      } else if (existing.id && (existing.totalAmount !== salary || existing.salaryPeriodKey !== periodKey)) {
        // Update if salary amount or person name changed
        await db.journalVouchers.update(existing.id, {
          description: desc,
          date: period.periodStart,
          salaryPeriodKey: periodKey,
          lines,
          totalAmount: salary,
        });
      }
    }

    // Delete any excess periods if employmentStartDate was moved forward
    for (const ev of existingPersonSalaryVouchers) {
      const evKey = ev.salaryPeriodKey;
      if (ev.id && evKey && !validKeys.has(evKey)) {
        await db.journalVouchers.delete(ev.id);
      }
    }
  }

  return newlyCreatedCount;
}

/**
 * Computes the current exact BOM cost for a menuItemId based on current rawMaterials avgCost.
 */
export async function computeMenuItemLiveCost(menuItemId: number): Promise<number> {
  const recipe = await db.productionRecipes.where('menuItemId').equals(menuItemId).first();
  if (!recipe) return 0;

  const materials = await db.rawMaterials.toArray();
  const matMap = new Map<number, RawMaterial>();
  materials.forEach((m) => {
    if (m.id !== undefined) matMap.set(m.id, m);
  });

  const menuItem = await db.menuItems.get(menuItemId);
  const res = calculateRecipeCost({
    ingredients: recipe.ingredients.map((ing) => {
      const isMisc = Boolean(ing.isMisc || ing.materialId < 0);
      const m = isMisc ? undefined : matMap.get(ing.materialId);
      const stockUnit = isMisc ? ing.recipeUnit || ing.unit || 'عدد' : m?.unit || ing.unit;
      return {
        materialId: ing.materialId,
        materialName: isMisc ? ing.materialName || 'کالای متفرقه' : m?.name || ing.materialName,
        unit: stockUnit,
        recipeUnit: ing.recipeUnit || stockUnit,
        unitsPerPackage: ing.unitsPerPackage || m?.unitsPerPackage,
        quantity: ing.quantity,
        unitCost: isMisc ? Number(ing.customUnitPrice) || 0 : m?.avgCost || 0,
        wastePercent: ing.wastePercent || 0,
        isMisc,
      };
    }),
    laborCost: recipe.laborCost,
    overheadCost: recipe.overheadCost,
    packagingCost: recipe.packagingCost,
    sellingPrice: menuItem?.price || 0,
  });

  return res.totalUnitCost;
}

/**
 * Deducts raw materials from inventory based on BOM recipes when a POS order is completed,
 * and returns the total COGS (بهای تمام شده) for the order.
 */
export async function processOrderInventoryAndCOGS(order: Order): Promise<number> {
  let totalOrderCOGS = 0;
  const materials = await db.rawMaterials.toArray();
  const matMap = new Map<number, RawMaterial>();
  materials.forEach((m) => {
    if (m.id !== undefined) matMap.set(m.id, m);
  });

  // 1. For self-service mode, deduct 1 canned drink per guest if 'نوشابه قوطی' exists in raw materials
  if (order.invoiceMode === 'self_service' && order.selfServiceGuests && order.selfServiceGuests > 0) {
    const drinkMat = materials.find((m) => m.name.includes('نوشابه'));
    if (drinkMat && drinkMat.id) {
      const qtyUsed = order.selfServiceGuests;
      const costUsed = Math.round(qtyUsed * drinkMat.avgCost);
      // Plus average self-service buffet food cost per person (approx 45% of unit price if no specific item)
      const buffetFoodCost = Math.round((order.selfServiceUnitPrice || 0) * order.selfServiceGuests * 0.42);
      totalOrderCOGS += costUsed + buffetFoodCost;

      const newQty = Math.max(0, Number((drinkMat.currentQty - qtyUsed).toFixed(4)));
      const newVal = Math.round(newQty * drinkMat.avgCost);
      await db.rawMaterials.update(drinkMat.id, {
        currentQty: newQty,
        updatedAt: new Date(),
      });
      await db.inventoryTransactions.add({
        materialId: drinkMat.id,
        materialName: drinkMat.name,
        unit: drinkMat.unit,
        date: new Date(),
        type: 'out_sale_bom',
        quantity: qtyUsed,
        unitPrice: drinkMat.avgCost,
        totalPrice: costUsed,
        balanceQtyAfter: newQty,
        balanceValueAfter: newVal,
        description: `مصرف اتوماتیک فیش سلف سرویس #${order.invoiceNumber} (${qtyUsed} نفر)`,
      });
    } else {
      totalOrderCOGS += Math.round((order.selfServiceUnitPrice || 0) * order.selfServiceGuests * 0.45);
    }
  }

  // 2. Process menu items via BOM recipes
  for (const item of order.items) {
    if (item.menuItemId <= 0) continue; // virtual self-service line handled above
    const recipe = await db.productionRecipes.where('menuItemId').equals(item.menuItemId).first();
    if (!recipe) continue;

    for (const ing of recipe.ingredients) {
      const isMisc = Boolean(ing.isMisc || ing.materialId < 0);
      const effectiveRecipeQty = ing.quantity * (1 + (ing.wastePercent || 0) / 100);

      // Miscellaneous items (کالای متفرقه) do NOT deduct from warehouse inventory, but DO add to COGS!
      if (isMisc) {
        const miscUnitPrice = Math.max(0, Number(ing.customUnitPrice) || 0);
        const miscLineCost = Math.round(effectiveRecipeQty * miscUnitPrice * item.quantity);
        totalOrderCOGS += miscLineCost;
        continue;
      }

      const mat = matMap.get(ing.materialId);
      if (!mat || !mat.id) continue;

      const stockUnit = mat.unit || ing.unit || 'کیلوگرم';
      const recipeUnit = ing.recipeUnit || stockUnit;

      // Convert from recipeUnit (e.g., گرم) to warehouse stockUnit (e.g., کیلوگرم or کارتن)
      const effectiveStockPerUnit = convertRecipeQtyToStockUnit({
        quantity: effectiveRecipeQty,
        recipeUnit,
        stockUnit,
        unitsPerPackage: ing.unitsPerPackage || mat.unitsPerPackage,
      });

      const totalConsumed = Number((effectiveStockPerUnit * item.quantity).toFixed(4));
      const lineCost = Math.round(totalConsumed * mat.avgCost);
      totalOrderCOGS += lineCost;

      const newQty = Math.max(0, Number((mat.currentQty - totalConsumed).toFixed(4)));
      const newVal = Math.round(newQty * mat.avgCost);
      mat.currentQty = newQty;

      await db.rawMaterials.update(mat.id, {
        currentQty: newQty,
        updatedAt: new Date(),
      });

      await db.inventoryTransactions.add({
        materialId: mat.id,
        materialName: mat.name,
        unit: mat.unit,
        date: new Date(),
        type: 'out_sale_bom',
        quantity: totalConsumed,
        unitPrice: mat.avgCost,
        totalPrice: lineCost,
        balanceQtyAfter: newQty,
        balanceValueAfter: newVal,
        description: `مصرف فرمول تولید (${item.name} × ${item.quantity}) - فاکتور #${order.invoiceNumber}`,
      });
    }

    const directExtra =
      ((recipe.laborCost || 0) + (recipe.overheadCost || 0) + (recipe.packagingCost || 0)) *
      item.quantity;
    totalOrderCOGS += directExtra;
  }

  return totalOrderCOGS;
}

/**
 * Records a Kitchen Production Batch (for Self-Service buffet or daily kitchen prep),
 * deducts exact raw materials from inventory according to BOM recipes, records Kardex entries,
 * and posts a balanced Double-Entry Journal Voucher for the production material consumption.
 */
export async function recordKitchenProductionBatch(params: {
  shiftLabel: string;
  chefName: string;
  notes?: string;
  items: Array<{
    menuItemId: number;
    menuItemName: string;
    quantityProduced: number;
    unitCost: number;
    totalCost: number;
  }>;
  materialConsumptions: Array<{
    materialId: number;
    materialName: string;
    unit: string;
    grossQuantityConsumed: number;
    unitCost: number;
    totalMaterialCost: number;
  }>;
  totalPortions: number;
  totalMaterialsCost: number;
  totalLaborAndOverheadCost: number;
  totalBatchCost: number;
}): Promise<number> {
  const lastBatch = await db.kitchenProductions.orderBy('batchNumber').last();
  const batchNumber = (lastBatch?.batchNumber || 100) + 1;
  const now = new Date();

  const id = (await db.kitchenProductions.add({
    batchNumber,
    createdAt: now,
    shiftLabel: params.shiftLabel,
    chefName: params.chefName || 'سرآشپز شیفت',
    items: params.items,
    materialConsumptions: params.materialConsumptions,
    totalPortions: params.totalPortions,
    totalMaterialsCost: params.totalMaterialsCost,
    totalLaborAndOverheadCost: params.totalLaborAndOverheadCost,
    totalBatchCost: params.totalBatchCost,
    notes: params.notes,
  })) as number;

  // Deduct raw materials from warehouse & record Kardex rows
  for (const mc of params.materialConsumptions) {
    if (mc.grossQuantityConsumed <= 0) continue;
    const mat = await db.rawMaterials.get(mc.materialId);
    if (!mat || !mat.id) continue;

    const newQty = Math.max(0, Number((mat.currentQty - mc.grossQuantityConsumed).toFixed(4)));
    const newVal = Math.round(newQty * mat.avgCost);
    await db.rawMaterials.update(mat.id, {
      currentQty: newQty,
      updatedAt: now,
    });

    await db.inventoryTransactions.add({
      materialId: mat.id,
      materialName: mat.name,
      unit: mat.unit,
      date: now,
      type: 'out_sale_bom',
      quantity: mc.grossQuantityConsumed,
      unitPrice: mat.avgCost,
      totalPrice: mc.totalMaterialCost,
      balanceQtyAfter: newQty,
      balanceValueAfter: newVal,
      description: `مصرف تولید آشپزخانه و سلف (پارت #${batchNumber} - ${params.shiftLabel})`,
    });
  }

  // Record automatic Double-Entry Journal Voucher for raw materials consumed in production
  if (params.totalMaterialsCost > 0) {
    const itemsSummary = params.items
      .map((i) => `${i.menuItemName} (${i.quantityProduced} پرس)`)
      .join('، ');
    await recordJournalVoucher({
      date: now,
      description: `سند مصرف مواد اولیه تولید آشپزخانه پارت #${batchNumber} (${params.shiftLabel}): ${itemsSummary}`,
      type: 'auto_sale',
      referenceId: batchNumber,
      lines: [
        {
          accountCode: '501',
          accountName: 'بهای تمام شده غذای فروش رفته (مصرف مواد و تولید)',
          debit: params.totalMaterialsCost,
          credit: 0,
          description: `بهای مواد مصرفی پارت تولید #${batchNumber} (${params.totalPortions} پرس)`,
        },
        {
          accountCode: '105',
          accountName: 'موجودی مواد اولیه انبار',
          debit: 0,
          credit: params.totalMaterialsCost,
          description: `خروج مواد اولیه از انبار به آشپزخانه و خط سلف سرویس`,
        },
      ],
    });
  }

  return id;
}

let initDbPromise: Promise<void> | null = null;

/**
 * Seeds initial rich restaurant data on first boot so POS, BOM, Inventory, Cheques, and Accounting work immediately.
 * Guarded by a singleton promise to prevent React StrictMode double-seeding.
 */
export function initializeDefaultDatabase(): Promise<void> {
  if (!initDbPromise) {
    initDbPromise = runInitializeDefaultDatabase().catch((err) => {
      console.error('DB init error:', err);
      initDbPromise = null;
    });
  }
  return initDbPromise;
}

async function runInitializeDefaultDatabase(): Promise<void> {
  // Check if raw mode is requested
  let isRawMode = false;
  try {
    if (typeof window !== 'undefined' && window.localStorage.getItem('arka_raw_mode') === '1') {
      isRawMode = true;
    }
  } catch {
    // ignore storage errors
  }

  // 1. Settings check
  const settingsCount = await db.settings.count();
  if (settingsCount > 0) {
    const firstSetting = await db.settings.toCollection().first();
    if (firstSetting?.isRawInitialized) {
      isRawMode = true;
    }
  }

  // 0. Ensure at least one Admin User exists ONLY IF NOT IN 100% RAW MODE
  // In 100% raw mode, the user must explicitly register the first administrator user/pass themselves!
  const usersCount = await db.appUsers.count();
  if (usersCount === 0 && !isRawMode) {
    await db.appUsers.add({
      username: 'admin',
      fullName: 'مدیر کل سیستم',
      pin: '1234',
      roleLabel: 'مدیر کل',
      isAdmin: true,
      permissions: [...ALL_PERMISSIONS],
      isActive: true,
      createdAt: new Date(),
    });
  }

  if (settingsCount === 0) {
    if (isRawMode) {
      await db.settings.add({
        restaurantName: '',
        phone: '',
        address: '',
        website: '',
        instagram: '',
        telegram: '',
        logoUrl: '',
        taxEnabled: false,
        taxPercentage: 0,
        requireCustomerPhone: false,
        currencyUnit: 'toman',
        selfServicePricePerPerson: 0,
        selfServiceTitle: '',
        defaultInvoiceMode: 'self_service',
        lockSelfServiceMode: false,
        autoBackupEnabled: false,
        autoBackupIntervalHours: 1,
        telegramBotToken: '',
        telegramChatId: '',
        baleBotToken: '',
        baleChatId: '',
        isRawInitialized: true,
        requireLoginOnStart: false,
        autoBackupBeforeUpdate: true,
        hideCostPriceFromKitchen: false,
      });
    } else {
      await db.settings.add({
        restaurantName: 'رستوران و سلف سرویس آرکا',
        phone: '021-88776655',
        address: 'تهران، بلوار کشاورز، پلاک ۱۲۰',
        website: 'www.arkarestaurant.ir',
        instagram: '@arka_restaurant',
        telegram: '@arka_pos',
        logoUrl: '',
        taxEnabled: false,
        taxPercentage: 9,
        requireCustomerPhone: false,
        currencyUnit: 'toman',
        selfServicePricePerPerson: 220000,
        selfServiceTitle: 'ورودی بار سلف سرویس + نوشابه',
        defaultInvoiceMode: 'self_service',
        lockSelfServiceMode: true,
        autoBackupEnabled: false,
        autoBackupIntervalHours: 1,
        telegramBotToken: '',
        telegramChatId: '',
        baleBotToken: '',
        baleChatId: '',
        isRawInitialized: false,
        requireLoginOnStart: false,
        autoBackupBeforeUpdate: true,
        hideCostPriceFromKitchen: false,
      });
    }
  } else {
    const firstSetting = await db.settings.toCollection().first();
    if (firstSetting) {
      const updates: Partial<AppSettings> = {};
      if (firstSetting.selfServicePricePerPerson === undefined) {
        updates.selfServicePricePerPerson = isRawMode ? 0 : 220000;
        updates.selfServiceTitle = isRawMode ? '' : 'ورودی بار سلف سرویس + نوشابه';
        updates.autoBackupEnabled = false;
        updates.autoBackupIntervalHours = 1;
      }
      if (!firstSetting.currencyUnit) {
        updates.currencyUnit = 'toman';
      }
      if (!firstSetting.defaultInvoiceMode) {
        updates.defaultInvoiceMode = 'self_service';
        updates.lockSelfServiceMode = !isRawMode;
      }
      if (firstSetting.autoBackupBeforeUpdate === undefined) {
        updates.autoBackupBeforeUpdate = true;
      }
      if (firstSetting.hideCostPriceFromKitchen === undefined) {
        updates.hideCostPriceFromKitchen = false;
      }
      if (Object.keys(updates).length > 0) {
        await db.settings.update(firstSetting.id!, updates);
      }
    }
  }

  // 2. Chart of Accounts (always required for double-entry accounting engine)
  const accountsCount = await db.accounts.count();
  if (accountsCount === 0) {
    await db.accounts.bulkAdd(
      DEFAULT_CHART_OF_ACCOUNTS.map((a) => ({
        code: a.code,
        name: a.name,
        type: a.type,
        isSystem: true,
        description: a.description,
      }))
    );
  }

  // If 100% Raw Mode is active, do NOT seed any sample banks, menus, inventory, persons, cheques, or orders!
  if (isRawMode) {
    const bankCount = await db.bankAccounts.count();
    const orderCount = await db.orders.count();
    if (bankCount > 0 || orderCount > 0) {
      await db.bankAccounts.clear();
      await db.orders.clear();
      await db.categories.clear();
      await db.menuItems.clear();
      await db.customers.clear();
      await db.persons.clear();
      await db.journalVouchers.clear();
      await db.cheques.clear();
      await db.rawMaterials.clear();
      await db.inventoryTransactions.clear();
      await db.productionRecipes.clear();
      await db.kitchenProductions.clear();
      await db.cashClosures.clear();
    }
    return;
  }

  // 3. Default Bank Accounts (with deduplication safeguard)
  const existingBanks = await db.bankAccounts.toArray();
  if (existingBanks.length === 0) {
    await db.bankAccounts.bulkAdd([
      {
        bankName: 'بانک ملت (کارتخوان ۱)',
        accountNumber: '4589123456',
        cardNumber: '6104-3378-9012-3456',
        iban: 'IR450120000000004589123456',
        posTerminalId: 'POS-101',
        initialBalance: 85000000,
        currentBalance: 98500000,
        isDefaultPos: true,
        isActive: true,
      },
      {
        bankName: 'بانک سامان (کارتخوان ۲)',
        accountNumber: '8210987654',
        cardNumber: '6219-8610-4455-6677',
        iban: 'IR820560082180008210987654',
        posTerminalId: 'POS-102',
        initialBalance: 42000000,
        currentBalance: 42000000,
        isDefaultPos: false,
        isActive: true,
      },
      {
        bankName: 'بانک ملی (حساب چک و جاری)',
        accountNumber: '0109988776001',
        cardNumber: '6037-9975-1122-3344',
        iban: 'IR110170000000109988776001',
        posTerminalId: 'POS-103',
        initialBalance: 60000000,
        currentBalance: 60000000,
        isDefaultPos: false,
        isActive: true,
      },
    ]);
  } else {
    // Deduplicate banks by bankName if StrictMode created duplicates
    const seenBankNames = new Set<string>();
    for (const b of existingBanks) {
      if (seenBankNames.has(b.bankName)) {
        if (b.id) await db.bankAccounts.delete(b.id);
      } else {
        seenBankNames.add(b.bankName);
      }
    }
  }

  // 4. Categories & Menu Items
  const catCount = await db.categories.count();
  if (catCount === 0) {
    const catKebab = (await db.categories.add({ name: 'کباب و غذای ایرانی' })) as number;
    const catFastFood = (await db.categories.add({ name: 'پیتزا و برگر' })) as number;
    const catDrinks = (await db.categories.add({ name: 'نوشیدنی و پیش‌غذا' })) as number;

    const item1 = (await db.menuItems.add({
      categoryId: catKebab,
      name: 'چلوکباب کوبیده مخصوص (دو سیخ)',
      price: 295000,
      isActive: true,
      image: '',
    })) as number;

    const item2 = (await db.menuItems.add({
      categoryId: catKebab,
      name: 'زرشک پلو با مرغ زعفرانی',
      price: 245000,
      isActive: true,
      image: '',
    })) as number;

    const item3 = (await db.menuItems.add({
      categoryId: catFastFood,
      name: 'پیتزا مخصوص آرکا',
      price: 310000,
      isActive: true,
      image: '',
    })) as number;

    const item4 = (await db.menuItems.add({
      categoryId: catDrinks,
      name: 'نوشابه قوطی مشکی',
      price: 35000,
      isActive: true,
      image: '',
    })) as number;

    await db.menuItems.add({
      categoryId: catDrinks,
      name: 'دوغ سنتی محلی',
      price: 40000,
      isActive: true,
      image: '',
    });

    // 5. Raw Materials & Initial Kardex
    const rawCount = await db.rawMaterials.count();
    if (rawCount === 0) {
      const mMeat = (await db.rawMaterials.add({
        name: 'گوشت مخلوط گوسفندی و گوساله',
        unit: 'کیلوگرم',
        currentQty: 35,
        minQty: 10,
        avgCost: 580000,
        lastPurchasePrice: 580000,
        updatedAt: new Date(),
      })) as number;

      const mRice = (await db.rawMaterials.add({
        name: 'برنج ایرانی طارم هاشمی',
        unit: 'کیلوگرم',
        currentQty: 120,
        minQty: 30,
        avgCost: 135000,
        lastPurchasePrice: 135000,
        updatedAt: new Date(),
      })) as number;

      const mChicken = (await db.rawMaterials.add({
        name: 'ران و سینه مرغ تازه',
        unit: 'کیلوگرم',
        currentQty: 45,
        minQty: 15,
        avgCost: 115000,
        lastPurchasePrice: 115000,
        updatedAt: new Date(),
      })) as number;

      const mCheese = (await db.rawMaterials.add({
        name: 'پنیر پیتزا موزارلا',
        unit: 'کیلوگرم',
        currentQty: 25,
        minQty: 8,
        avgCost: 260000,
        lastPurchasePrice: 260000,
        updatedAt: new Date(),
      })) as number;

      const mCola = (await db.rawMaterials.add({
        name: 'نوشابه قوطی (پک انبار)',
        unit: 'عدد',
        currentQty: 180,
        minQty: 48,
        avgCost: 21000,
        lastPurchasePrice: 21000,
        updatedAt: new Date(),
      })) as number;

      await db.inventoryTransactions.bulkAdd([
        {
          materialId: mMeat,
          materialName: 'گوشت مخلوط گوسفندی و گوساله',
          unit: 'کیلوگرم',
          date: new Date(Date.now() - 86400000 * 3),
          type: 'in_initial',
          quantity: 35,
          unitPrice: 580000,
          totalPrice: 35 * 580000,
          balanceQtyAfter: 35,
          balanceValueAfter: 35 * 580000,
          personName: 'پروتئین البرز (تأمین‌کننده)',
          paymentMethod: 'bank',
          bankName: 'بانک ملت (کارتخوان ۱)',
          description: 'موجودی اول دوره و خرید گوشت تازه',
        },
        {
          materialId: mRice,
          materialName: 'برنج ایرانی طارم هاشمی',
          unit: 'کیلوگرم',
          date: new Date(Date.now() - 86400000 * 3),
          type: 'in_initial',
          quantity: 120,
          unitPrice: 135000,
          totalPrice: 120 * 135000,
          balanceQtyAfter: 120,
          balanceValueAfter: 120 * 135000,
          personName: 'بازرگانی برنج شمال',
          paymentMethod: 'cheque',
          bankName: 'بانک ملی (حساب چک و جاری)',
          description: 'خرید محموله برنج هاشمی با چک',
        },
        {
          materialId: mChicken,
          materialName: 'ران و سینه مرغ تازه',
          unit: 'کیلوگرم',
          date: new Date(Date.now() - 86400000 * 2),
          type: 'in_initial',
          quantity: 45,
          unitPrice: 115000,
          totalPrice: 45 * 115000,
          balanceQtyAfter: 45,
          balanceValueAfter: 45 * 115000,
          personName: 'پروتئین البرز (تأمین‌کننده)',
          paymentMethod: 'bank',
          bankName: 'بانک سامان (کارتخوان ۲)',
          description: 'ورود مرغ کشتار روز به انبار',
        },
        {
          materialId: mCola,
          materialName: 'نوشابه قوطی (پک انبار)',
          unit: 'عدد',
          date: new Date(Date.now() - 86400000 * 2),
          type: 'in_initial',
          quantity: 180,
          unitPrice: 21000,
          totalPrice: 180 * 21000,
          balanceQtyAfter: 180,
          balanceValueAfter: 180 * 21000,
          personName: 'پخش نوشیدنی خوشگوار',
          paymentMethod: 'cash',
          description: 'خرید نقدی نوشابه قوطی جهت سلف سرویس و منو',
        },
      ]);

      // 6. Production Formulas (BOM)
      await db.productionRecipes.bulkAdd([
        {
          menuItemId: item1,
          menuItemName: 'چلوکباب کوبیده مخصوص (دو سیخ)',
          ingredients: [
            {
              materialId: mMeat,
              materialName: 'گوشت مخلوط گوسفندی و گوساله',
              unit: 'کیلوگرم',
              quantity: 0.22,
              wastePercent: 5,
            },
            {
              materialId: mRice,
              materialName: 'برنج ایرانی طارم هاشمی',
              unit: 'کیلوگرم',
              quantity: 0.16,
              wastePercent: 2,
            },
          ],
          laborCost: 14000,
          overheadCost: 8000,
          packagingCost: 7000,
          notes: 'فرمول استاندارد ۲ سیخ ۱۱۰ گرمی به همراه چلو کره زعفرانی و گوجه کبابی',
          updatedAt: new Date(),
        },
        {
          menuItemId: item2,
          menuItemName: 'زرشک پلو با مرغ زعفرانی',
          ingredients: [
            {
              materialId: mChicken,
              materialName: 'ران و سینه مرغ تازه',
              unit: 'کیلوگرم',
              quantity: 0.35,
              wastePercent: 8,
            },
            {
              materialId: mRice,
              materialName: 'برنج ایرانی طارم هاشمی',
              unit: 'کیلوگرم',
              quantity: 0.16,
              wastePercent: 2,
            },
          ],
          laborCost: 12000,
          overheadCost: 7500,
          packagingCost: 7000,
          notes: 'ران مرغ کامل ۴۰۰ گرمی با سس زعفرانی و زرشک خلال پسته',
          updatedAt: new Date(),
        },
        {
          menuItemId: item3,
          menuItemName: 'پیتزا مخصوص آرکا',
          ingredients: [
            {
              materialId: mCheese,
              materialName: 'پنیر پیتزا موزارلا',
              unit: 'کیلوگرم',
              quantity: 0.22,
              wastePercent: 3,
            },
            {
              materialId: mMeat,
              materialName: 'گوشت مخلوط گوسفندی و گوساله',
              unit: 'کیلوگرم',
              quantity: 0.1,
              wastePercent: 4,
            },
          ],
          laborCost: 15000,
          overheadCost: 9000,
          packagingCost: 8500,
          notes: 'پیتزا ۲ نفره با خمیر دست‌ساز و پنیر موزارلا ویژه',
          updatedAt: new Date(),
        },
        {
          menuItemId: item4,
          menuItemName: 'نوشابه قوطی مشکی',
          ingredients: [
            {
              materialId: mCola,
              materialName: 'نوشابه قوطی (پک انبار)',
              unit: 'عدد',
              quantity: 1,
              wastePercent: 0,
            },
          ],
          laborCost: 0,
          overheadCost: 500,
          packagingCost: 0,
          notes: 'فروش مستقیم نوشابه قوطی از یخچال',
          updatedAt: new Date(),
        },
      ]);
    }
  }

  // 7. Persons (Staff, Suppliers, Customers)
  const personCount = await db.persons.count();
  if (personCount === 0) {
    const pSupplier1 = (await db.persons.add({
      name: 'پروتئین البرز (حاج رحیمی)',
      role: 'supplier',
      phone: '09121112233',
      code: 'SUP-101',
      address: 'تهران، میدان بهمن، غرفه ۱۲',
      description: 'تأمین‌کننده اصلی گوشت و مرغ رستوران',
      initialBalance: 0,
      createdAt: new Date(),
    })) as number;

    const pSupplier2 = (await db.persons.add({
      name: 'بازرگانی برنج شمال (علوی)',
      role: 'supplier',
      phone: '09112223344',
      code: 'SUP-102',
      address: 'فریدونکنار، بلوار ساحلی',
      description: 'تأمین برنج طارم هاشمی سورتینگ',
      initialBalance: 0,
      createdAt: new Date(),
    })) as number;

    const pStaff1 = (await db.persons.add({
      name: 'استاد رضا کمالی (سرآشپز)',
      role: 'staff',
      phone: '09123334455',
      code: 'EMP-201',
      address: 'تهران، صادقیه',
      description: 'سرآشپز شیفت ظهر و شب',
      initialBalance: 0,
      createdAt: new Date(),
    })) as number;

    const pCust1 = (await db.persons.add({
      name: 'شرکت مهندسی پارس (قرارداد ناهار)',
      role: 'customer',
      phone: '02188990011',
      code: 'CUS-301',
      address: 'بلوار کشاورز، خیابان فلسطین، پلاک ۴۴',
      description: 'مشتری سازمانی سفارش روزانه',
      initialBalance: 0,
      createdAt: new Date(),
    })) as number;

    // 8. Sample Cheques (One due TODAY so due-date alert shows immediately!)
    const today = new Date();
    const inThreeDays = new Date(today.getTime() + 3 * 86400000);
    await db.cheques.bulkAdd([
      {
        chequeNumber: '1403089911223344',
        type: 'issued',
        amount: 16200000,
        issueDate: new Date(today.getTime() - 10 * 86400000),
        dueDate: today,
        bankId: 3,
        bankName: 'بانک ملی (حساب چک و جاری)',
        personId: pSupplier2,
        personName: 'بازرگانی برنج شمال (علوی)',
        description: 'بابت خرید ۱۲۰ کیلوگرم برنج ایرانی طارم هاشمی',
        status: 'pending',
      },
      {
        chequeNumber: '1403089955667788',
        type: 'issued',
        amount: 12500000,
        issueDate: new Date(today.getTime() - 5 * 86400000),
        dueDate: inThreeDays,
        bankId: 3,
        bankName: 'بانک ملی (حساب چک و جاری)',
        personId: pSupplier1,
        personName: 'پروتئین البرز (حاج رحیمی)',
        description: 'تسویه پارت دوم خرید گوشت گوسفندی',
        status: 'pending',
      },
      {
        chequeNumber: '1403091100229988',
        type: 'received',
        amount: 18500000,
        issueDate: new Date(today.getTime() - 4 * 86400000),
        dueDate: today,
        bankId: 1,
        bankName: 'بانک ملت (کارتخوان ۱)',
        personId: pCust1,
        personName: 'شرکت مهندسی پارس (قرارداد ناهار)',
        description: 'چک تسویه صورتحساب غذای پرسنل شرکت پارس',
        status: 'pending',
      },
    ]);

    // 9. Seed sample double-entry journal vouchers
    await recordJournalVoucher({
      date: new Date(today.getTime() - 2 * 86400000),
      description: 'خرید ۱۲۰ کیلو برنج هاشمی از بازرگانی برنج شمال و صدور چک',
      type: 'auto_purchase',
      lines: [
        {
          accountCode: '105',
          accountName: 'موجودی مواد اولیه انبار',
          debit: 16200000,
          credit: 0,
          description: 'ورود ۱۲۰ کیلو برنج هاشمی به انبار',
        },
        {
          accountCode: '201',
          accountName: 'حساب‌های پرداختنی (تأمین‌کنندگان و پرسنل)',
          personId: pSupplier2,
          personName: 'بازرگانی برنج شمال (علوی)',
          debit: 0,
          credit: 16200000,
          description: 'بستانکاری بازرگانی برنج شمال بابت فاکتور خرید',
        },
      ],
    });

    await recordJournalVoucher({
      date: new Date(today.getTime() - 2 * 86400000),
      description: 'تحویل چک صیادی 1403089911223344 به بازرگانی برنج شمال',
      type: 'auto_cheque',
      lines: [
        {
          accountCode: '201',
          accountName: 'حساب‌های پرداختنی (تأمین‌کنندگان و پرسنل)',
          personId: pSupplier2,
          personName: 'بازرگانی برنج شمال (علوی)',
          debit: 16200000,
          credit: 0,
          description: 'تحویل چک بابت تسویه فاکتور برنج',
        },
        {
          accountCode: '202',
          accountName: 'اسناد پرداختنی (چک‌های صادره)',
          personId: pSupplier2,
          personName: 'بازرگانی برنج شمال (علوی)',
          debit: 0,
          credit: 16200000,
          description: 'چک سررسید امروز بانک ملی',
        },
      ],
    });

    await recordJournalVoucher({
      date: new Date(today.getTime() - 86400000),
      description: 'پرداخت علی‌الحساب حقوق استاد رضا کمالی (سرآشپز) از بانک ملت',
      type: 'auto_expense',
      bankId: 1,
      bankName: 'بانک ملت (کارتخوان ۱)',
      lines: [
        {
          accountCode: '601',
          accountName: 'هزینه حقوق و دستمزد پرسنل',
          personId: pStaff1,
          personName: 'استاد رضا کمالی (سرآشپز)',
          debit: 4500000,
          credit: 0,
          description: 'پرداخت مساعده و حقوق هفتگی سرآشپز',
        },
        {
          accountCode: '102',
          accountName: 'موجودی بانک‌ها و کارتخوان‌ها',
          debit: 0,
          credit: 4500000,
          description: 'کسر از بانک ملت',
        },
      ],
    });

    await recordJournalVoucher({
      date: new Date(today.getTime() - 86400000),
      description: 'پرداخت قبض گاز و برق رستوران از بانک سامان',
      type: 'auto_expense',
      bankId: 2,
      bankName: 'بانک سامان (کارتخوان ۲)',
      lines: [
        {
          accountCode: '603',
          accountName: 'هزینه قبوض (آب، برق، گاز، تلفن و اینترنت)',
          debit: 1850000,
          credit: 0,
          description: 'قبض برق صنعتی و گاز آشپزخانه',
        },
        {
          accountCode: '102',
          accountName: 'موجودی بانک‌ها و کارتخوان‌ها',
          debit: 0,
          credit: 1850000,
          description: 'پرداخت از بانک سامان',
        },
      ],
    });

    // 10. Seed realistic orders (Catering + Menu + Self-Service) so P&L shows healthy positive profit out-of-the-box
    const ordersCount = await db.orders.count();
    if (ordersCount === 0) {
      await db.orders.add({
        invoiceNumber: 1000,
        createdAt: new Date(today.getTime() - 86400000),
        customerPhone: '02188990011',
        customerName: 'شرکت مهندسی پارس (قرارداد ناهار)',
        items: [
          { menuItemId: 1, name: 'چلوکباب کوبیده مخصوص (دو سیخ)', price: 295000, quantity: 40 },
          { menuItemId: 2, name: 'زرشک پلو با مرغ زعفرانی', price: 245000, quantity: 30 },
        ],
        subtotal: 19150000,
        discountType: 'amount',
        discountValue: 650000,
        taxEnabled: false,
        taxPercentage: 9,
        taxAmount: 0,
        total: 18500000,
        status: 'paid',
        invoiceMode: 'standard',
        paymentMethod: 'card',
        bankId: 1,
        bankName: 'بانک ملت (کارتخوان ۱)',
        cogsAmount: 9850000,
      });

      await recordJournalVoucher({
        date: new Date(today.getTime() - 86400000),
        description: 'سند فروش فاکتور سازمانی #1000 شرکت مهندسی پارس (۷۰ پرس غذا)',
        type: 'auto_sale',
        referenceId: 1000,
        bankId: 1,
        bankName: 'بانک ملت (کارتخوان ۱)',
        lines: [
          {
            accountCode: '102',
            accountName: 'موجودی بانک‌ها و کارتخوان‌ها',
            debit: 18500000,
            credit: 0,
            description: 'واریز به بانک ملت - فاکتور #1000',
          },
          {
            accountCode: '403',
            accountName: 'تخفیفات نقدی فروش',
            debit: 650000,
            credit: 0,
            description: 'تخفیف سازمانی فاکتور #1000',
          },
          {
            accountCode: '401',
            accountName: 'درآمد فروش غذا و منو',
            debit: 0,
            credit: 19150000,
            description: 'فروش ۴۰ پرس کوبیده و ۳۰ پرس زرشک پلو با مرغ',
          },
          {
            accountCode: '501',
            accountName: 'بهای تمام شده غذای فروش رفته (مصرف مواد و تولید)',
            debit: 9850000,
            credit: 0,
            description: 'بهای تمام شده طبق فرمول تولید فاکتور #1000',
          },
          {
            accountCode: '105',
            accountName: 'موجودی مواد اولیه انبار',
            debit: 0,
            credit: 9850000,
            description: 'کسر مواد اولیه مصرفی از انبار',
          },
        ],
      });

      await db.orders.add({
        invoiceNumber: 1001,
        createdAt: new Date(today.getTime() - 3600000 * 2),
        customerPhone: '09123456789',
        customerName: 'مهندس کریمی',
        items: [
          { menuItemId: 1, name: 'چلوکباب کوبیده مخصوص (دو سیخ)', price: 295000, quantity: 2 },
          { menuItemId: 4, name: 'نوشابه قوطی مشکی', price: 35000, quantity: 2 },
        ],
        subtotal: 660000,
        discountType: 'none',
        discountValue: 0,
        taxEnabled: false,
        taxPercentage: 9,
        taxAmount: 0,
        total: 660000,
        status: 'paid',
        invoiceMode: 'standard',
        paymentMethod: 'card',
        bankId: 1,
        bankName: 'بانک ملت (کارتخوان ۱)',
        cogsAmount: 400000,
      });

      await recordJournalVoucher({
        date: new Date(today.getTime() - 3600000 * 2),
        description: 'سند فروش اتوماتیک فاکتور #1001 (کارتخوان بانک ملت)',
        type: 'auto_sale',
        referenceId: 1001,
        bankId: 1,
        bankName: 'بانک ملت (کارتخوان ۱)',
        lines: [
          {
            accountCode: '102',
            accountName: 'موجودی بانک‌ها و کارتخوان‌ها',
            debit: 660000,
            credit: 0,
            description: 'دریافت کارتخوان بانک ملت - فاکتور #1001',
          },
          {
            accountCode: '401',
            accountName: 'درآمد فروش غذا و منو',
            debit: 0,
            credit: 660000,
            description: 'فروش ۲ پرس کوبیده و نوشابه',
          },
          {
            accountCode: '501',
            accountName: 'بهای تمام شده غذای فروش رفته (مصرف مواد و تولید)',
            debit: 400000,
            credit: 0,
            description: 'بهای تمام شده طبق فرمول تولید فاکتور #1001',
          },
          {
            accountCode: '105',
            accountName: 'موجودی مواد اولیه انبار',
            debit: 0,
            credit: 400000,
            description: 'کسر مواد اولیه مصرفی از انبار',
          },
        ],
      });

      await db.orders.add({
        invoiceNumber: 1002,
        createdAt: new Date(today.getTime() - 3600000),
        customerPhone: '',
        customerName: 'مهمان حضوری سلف سرویس',
        items: [
          {
            menuItemId: -1,
            name: 'ورودی بار سلف سرویس + نوشابه (۳ نفر)',
            price: 220000,
            quantity: 3,
          },
        ],
        subtotal: 660000,
        discountType: 'none',
        discountValue: 0,
        taxEnabled: false,
        taxPercentage: 9,
        taxAmount: 0,
        total: 660000,
        status: 'paid',
        invoiceMode: 'self_service',
        selfServiceGuests: 3,
        selfServiceUnitPrice: 220000,
        selfServiceDrinkNote: '۳ عدد نوشابه قوطی + استفاده آزاد از بار سلف سرویس',
        paymentMethod: 'card',
        bankId: 2,
        bankName: 'بانک سامان (کارتخوان ۲)',
        cogsAmount: 295000,
      });

      await recordJournalVoucher({
        date: new Date(today.getTime() - 3600000),
        description: 'سند فروش اتوماتیک فیش سلف سرویس #1002 (۳ نفر - بانک سامان)',
        type: 'auto_sale',
        referenceId: 1002,
        bankId: 2,
        bankName: 'بانک سامان (کارتخوان ۲)',
        lines: [
          {
            accountCode: '102',
            accountName: 'موجودی بانک‌ها و کارتخوان‌ها',
            debit: 660000,
            credit: 0,
            description: 'دریافت کارتخوان بانک سامان - فیش سلف #1002',
          },
          {
            accountCode: '402',
            accountName: 'درآمد فیش سلف سرویس و نوشابه',
            debit: 0,
            credit: 660000,
            description: 'فیش سلف سرویس ۳ نفره به همراه نوشابه',
          },
          {
            accountCode: '501',
            accountName: 'بهای تمام شده غذای فروش رفته (مصرف مواد و تولید)',
            debit: 295000,
            credit: 0,
            description: 'بهای تمام شده مواد و نوشابه سلف سرویس #1002',
          },
          {
            accountCode: '105',
            accountName: 'موجودی مواد اولیه انبار',
            debit: 0,
            credit: 295000,
            description: 'کسر نوشابه و مواد اولیه سلف از انبار',
          },
        ],
      });
    }
  }
}

/**
 * Resets the entire database to 100% Raw / Factory Blank mode:
 * - Clears all orders, menu items, categories, banks, persons, cheques, vouchers, raw materials, kardex, recipes, kitchen logs, and cash closures.
 * - Preserves only the standard Chart of Accounts (with 0 balances), user accounts, and system settings (marking isRawInitialized = true so sample data never re-seeds).
 */
export async function resetDatabaseToRaw(): Promise<void> {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('arka_raw_mode', '1');
    }
  } catch {
    // ignore storage errors
  }

  await db.transaction(
    'rw',
    [
      db.categories,
      db.menuItems,
      db.orders,
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
      db.settings,
      db.appUsers,
    ],
    async () => {
      await db.categories.clear();
      await db.menuItems.clear();
      await db.orders.clear();
      await db.customers.clear();
      await db.bankAccounts.clear();
      await db.persons.clear();
      await db.journalVouchers.clear();
      await db.cheques.clear();
      await db.rawMaterials.clear();
      await db.inventoryTransactions.clear();
      await db.productionRecipes.clear();
      await db.kitchenProductions.clear();
      await db.cashClosures.clear();
      await db.accounts.clear();
      await db.appUsers.clear();

      await db.accounts.bulkAdd(
        DEFAULT_CHART_OF_ACCOUNTS.map((a) => ({
          code: a.code,
          name: a.name,
          type: a.type,
          isSystem: true,
          description: a.description,
        }))
      );

      await db.settings.clear();
      await db.settings.add({
        restaurantName: '',
        phone: '',
        address: '',
        website: '',
        instagram: '',
        telegram: '',
        logoUrl: '',
        taxEnabled: false,
        taxPercentage: 0,
        requireCustomerPhone: false,
        currencyUnit: 'toman',
        selfServicePricePerPerson: 0,
        selfServiceTitle: '',
        defaultInvoiceMode: 'self_service',
        lockSelfServiceMode: false,
        autoBackupEnabled: false,
        autoBackupIntervalHours: 1,
        telegramBotToken: '',
        telegramChatId: '',
        baleBotToken: '',
        baleChatId: '',
        lastAutoBackupAt: '',
        lastAutoBackupStatus: '',
        isRawInitialized: true,
        requireLoginOnStart: false,
        autoBackupBeforeUpdate: true,
        hideCostPriceFromKitchen: false,
      });
    }
  );

  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem('arka_active_user_id');
      window.localStorage.removeItem('arka_active_user_id');
      window.localStorage.setItem('arka_raw_mode', '1');
    }
  } catch {
    // ignore
  }
}

