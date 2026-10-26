/**
 * Pure Accounting, Costing (BOM), Inventory Kardex, Cheque Alert,
 * Self-Service POS, and P&L Engine for Arka Restaurant System.
 * Decoupled for deterministic unit testing and zero-bug calculations.
 */

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'cogs' | 'expense';

export interface AccountNode {
  code: string;
  name: string;
  type: AccountType;
  parentCode?: string;
  isSystem?: boolean;
  description?: string;
}

export interface JournalLine {
  accountCode: string;
  accountName: string;
  personId?: number;
  personName?: string;
  debit: number;
  credit: number;
  description?: string;
}

export type MeasurementUnit =
  | 'کیلوگرم'
  | 'گرم'
  | 'مثقال'
  | 'عدد'
  | 'کارتن'
  | 'بسته'
  | 'لیتر'
  | 'سی‌سی'
  | 'پیمانه'
  | 'قاشق'
  | 'پرس';

export const ALL_MEASUREMENT_UNITS: MeasurementUnit[] = [
  'گرم',
  'کیلوگرم',
  'عدد',
  'کارتن',
  'بسته',
  'لیتر',
  'سی‌سی',
  'مثقال',
  'پیمانه',
  'قاشق',
  'پرس',
];

/**
 * Converts a recipe quantity expressed in `recipeUnit` into the equivalent quantity
 * in the material's warehouse `stockUnit` (e.g., 150 گرم -> 0.15 کیلوگرم, or 2 عدد from a 24-count کارتن -> 2/24 کارتن).
 */
export function convertRecipeQtyToStockUnit(params: {
  quantity: number;
  recipeUnit: string;
  stockUnit: string;
  unitsPerPackage?: number;
}): number {
  const qty = Math.max(0, Number(params.quantity) || 0);
  if (qty <= 0) return 0;

  const rUnit = (params.recipeUnit || '').trim();
  const sUnit = (params.stockUnit || '').trim();
  if (!rUnit || !sUnit || rUnit === sUnit) return qty;

  const packSize = Math.max(0.0001, Number(params.unitsPerPackage) || 0);

  // Weight conversions
  const weightToGrams: Record<string, number> = {
    'گرم': 1,
    'کیلوگرم': 1000,
    'مثقال': 4.608,
    'پیمانه': 150,
    'قاشق': 15,
  };

  if (weightToGrams[rUnit] !== undefined && weightToGrams[sUnit] !== undefined) {
    return (qty * weightToGrams[rUnit]) / weightToGrams[sUnit];
  }

  // Volume conversions
  const volumeToMl: Record<string, number> = {
    'سی‌سی': 1,
    'لیتر': 1000,
    'پیمانه': 240,
    'قاشق': 15,
  };

  if (volumeToMl[rUnit] !== undefined && volumeToMl[sUnit] !== undefined) {
    return (qty * volumeToMl[rUnit]) / volumeToMl[sUnit];
  }

  // Package / Carton <-> Count or Weight conversions using unitsPerPackage
  const isStockPack = sUnit === 'کارتن' || sUnit === 'بسته';
  const isRecipePack = rUnit === 'کارتن' || rUnit === 'بسته';

  if (isStockPack && !isRecipePack) {
    const divisor = packSize > 0 ? packSize : 1;
    if (rUnit === 'گرم' && divisor <= 100) {
      return qty / (divisor * 1000);
    }
    return qty / divisor;
  }

  if (isRecipePack && !isStockPack) {
    const multiplier = packSize > 0 ? packSize : 1;
    return qty * multiplier;
  }

  if (packSize > 0 && packSize !== 1) {
    return qty / packSize;
  }

  return qty;
}

export interface BOMIngredientInput {
  materialId: number; // < 0 for Miscellaneous (متفرقه - خارج از انبار)
  materialName: string;
  unit: string; // Stock / base unit
  recipeUnit?: string; // Unit chosen in BOM (گرم، کیلوگرم، کارتن، عدد...)
  unitsPerPackage?: number; // Optional conversion ratio (e.g. تعداد/وزن در کارتن یا بسته)
  quantity: number; // Quantity consumed per 1 unit of menu item (in recipeUnit)
  unitCost: number; // Cost per 1 stockUnit (or manual unit price for miscellaneous items)
  wastePercent?: number; // e.g., 5 for 5% wastage during prep/cooking
  isMisc?: boolean; // True if miscellaneous item (متفرقه - does not enter/deduct warehouse)
}

export interface BOMCostResult {
  ingredientsCost: number;
  miscIngredientsCost: number;
  warehouseIngredientsCost: number;
  overheadCost: number;
  laborCost: number;
  packagingCost: number;
  totalUnitCost: number;
  sellingPrice: number;
  netProfitPerUnit: number;
  profitMarginPercent: number; // (Profit / SellingPrice) * 100
  foodCostPercent: number; // (TotalUnitCost / SellingPrice) * 100
  suggestedPriceFor40Margin: number;
  ingredientBreakdown: Array<{
    materialId: number;
    materialName: string;
    recipeUnit: string;
    stockUnit: string;
    effectiveQuantity: number;
    stockEquivalentQuantity: number;
    lineCost: number;
    sharePercent: number;
    isMisc: boolean;
  }>;
}

export interface SelfServiceCalcInput {
  guestCount: number;
  halfPriceGuestCount?: number; // تعداد نفرات نیم‌بها / کودکان
  pricePerPerson: number;
  extraItemsSubtotal?: number;
  discountType?: 'none' | 'percent' | 'amount';
  discountValue?: number;
  taxEnabled?: boolean;
  taxPercentage?: number;
}

export interface SelfServiceCalcResult {
  clampedGuests: number;
  halfPriceGuests: number;
  fullPriceTotal: number;
  halfPriceTotal: number;
  selfServiceTotal: number;
  extraItemsSubtotal: number;
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  total: number;
  drinkQuota: number;
}

export interface WeightedAverageResult {
  newQuantity: number;
  newAverageCost: number;
  totalInventoryValue: number;
}

export interface ChequeAlertItem {
  id?: number;
  chequeNumber: string;
  type: 'issued' | 'received';
  amount: number;
  dueDate: Date | string;
  status: 'pending' | 'cleared' | 'bounced' | 'cancelled';
  personName: string;
  bankName: string;
}

export type ChequeUrgency = 'overdue' | 'due_today' | 'upcoming' | 'future' | 'resolved';

export interface ProfitAndLossReport {
  grossMenuSales: number;
  grossSelfServiceSales: number;
  grossSales: number;
  salesDiscounts: number;
  netSales: number;
  totalCOGS: number;
  grossProfit: number;
  grossMarginPercent: number;
  operatingExpensesByCategory: Array<{
    code: string;
    name: string;
    amount: number;
  }>;
  totalOperatingExpenses: number;
  netProfit: number;
  netMarginPercent: number;
}

export interface OrderPaymentRecord {
  total: number;
  status: 'paid' | 'cancelled';
  invoiceMode?: 'standard' | 'self_service';
  paymentMethod?: 'cash' | 'card' | 'split' | 'credit';
  bankId?: number;
  bankName?: string;
  cashAmount?: number;
  cardAmount?: number;
}

export interface CashierSettlementSummary {
  totalSales: number;
  orderCount: number;
  standardOrderCount: number;
  selfServiceOrderCount: number;
  totalCash: number;
  totalCard: number;
  totalCredit: number;
  byBank: Array<{
    bankId: number;
    bankName: string;
    amount: number;
    txCount: number;
  }>;
}

export const MAX_SELF_SERVICE_GUESTS = 9999;
export const MIN_SELF_SERVICE_GUESTS = 1;

/**
 * Clamps self-service guest count to a valid positive integer (1 or more).
 */
export function clampSelfServiceGuests(guests: number): number {
  if (!Number.isFinite(guests) || isNaN(guests)) return MIN_SELF_SERVICE_GUESTS;
  const rounded = Math.round(guests);
  return Math.max(MIN_SELF_SERVICE_GUESTS, Math.min(MAX_SELF_SERVICE_GUESTS, rounded));
}

/**
 * Scales a monetary amount when switching system currency unit between Toman and Rial.
 * - Switching from 'rial' to 'toman' removes one zero (divides by 10).
 * - Switching from 'toman' to 'rial' adds one zero (multiplies by 10).
 */
export function scaleMonetaryAmountForCurrencySwitch(
  amount: number | undefined | null,
  fromUnit: 'toman' | 'rial',
  toUnit: 'toman' | 'rial'
): number {
  const num = Number(amount);
  if (amount === undefined || amount === null || isNaN(num) || num === 0) return 0;
  if (fromUnit === toUnit) return Math.round(num);
  if (fromUnit === 'toman' && toUnit === 'rial') {
    return Math.round(num * 10);
  }
  return Math.round(num / 10);
}

/**
 * Computes Self-Service ticket pricing (for 1 or more guests) + optional extra items, discounts, and tax.
 */
export function calculateSelfServiceInvoice(input: SelfServiceCalcInput): SelfServiceCalcResult {
  const rawGuests = Math.max(0, Math.round(Number(input.guestCount) || 0));
  const halfGuests = Math.max(0, Math.round(Number(input.halfPriceGuestCount) || 0));
  // If both full-price and half-price guests are 0, clamp full guests to 1
  const clampedGuests = rawGuests === 0 && halfGuests === 0 ? 1 : rawGuests;
  const unitPrice = Math.max(0, Number(input.pricePerPerson) || 0);
  const halfUnitPrice = Math.round(unitPrice / 2);
  const extraItemsSubtotal = Math.max(0, Number(input.extraItemsSubtotal) || 0);

  const fullPriceTotal = Math.round(clampedGuests * unitPrice);
  const halfPriceTotal = Math.round(halfGuests * halfUnitPrice);
  const selfServiceTotal = fullPriceTotal + halfPriceTotal;
  const subtotal = selfServiceTotal + extraItemsSubtotal;

  let discountAmount = 0;
  const discountVal = Math.max(0, Number(input.discountValue) || 0);
  if (input.discountType === 'percent') {
    const pct = Math.min(100, discountVal);
    discountAmount = Math.round((subtotal * pct) / 100);
  } else if (input.discountType === 'amount') {
    discountAmount = Math.min(subtotal, Math.round(discountVal));
  }

  const taxableAmount = Math.max(0, subtotal - discountAmount);
  let taxAmount = 0;
  if (input.taxEnabled && Number(input.taxPercentage) > 0) {
    taxAmount = Math.round((taxableAmount * Number(input.taxPercentage)) / 100);
  }

  const total = Math.max(0, taxableAmount + taxAmount);

  return {
    clampedGuests,
    halfPriceGuests: halfGuests,
    fullPriceTotal,
    halfPriceTotal,
    selfServiceTotal,
    extraItemsSubtotal,
    subtotal,
    discountAmount,
    taxableAmount,
    taxAmount,
    total,
    drinkQuota: clampedGuests + halfGuests,
  };
}

/**
 * Calculates exact BOM (Recipe / Production Formula) unit cost, profit, and margins.
 */
export function calculateRecipeCost(params: {
  ingredients: BOMIngredientInput[];
  overheadCost?: number;
  laborCost?: number;
  packagingCost?: number;
  sellingPrice: number;
}): BOMCostResult {
  const overheadCost = Math.max(0, Math.round(Number(params.overheadCost) || 0));
  const laborCost = Math.max(0, Math.round(Number(params.laborCost) || 0));
  const packagingCost = Math.max(0, Math.round(Number(params.packagingCost) || 0));
  const sellingPrice = Math.max(0, Math.round(Number(params.sellingPrice) || 0));

  let warehouseIngredientsCost = 0;
  let miscIngredientsCost = 0;

  const rawBreakdown = (params.ingredients || []).map((ing) => {
    const qty = Math.max(0, Number(ing.quantity) || 0);
    const unitCost = Math.max(0, Number(ing.unitCost) || 0);
    const wastePct = Math.max(0, Math.min(100, Number(ing.wastePercent) || 0));
    const isMisc = Boolean(ing.isMisc || ing.materialId < 0);
    const stockUnit = ing.unit || 'عدد';
    const recipeUnit = ing.recipeUnit || stockUnit;

    const effectiveQuantity = Number((qty * (1 + wastePct / 100)).toFixed(4));
    const stockEquivalentQuantity = isMisc
      ? effectiveQuantity
      : Number(
          convertRecipeQtyToStockUnit({
            quantity: effectiveQuantity,
            recipeUnit,
            stockUnit,
            unitsPerPackage: ing.unitsPerPackage,
          }).toFixed(6)
        );

    const lineCost = Math.round(stockEquivalentQuantity * unitCost);
    if (isMisc) {
      miscIngredientsCost += lineCost;
    } else {
      warehouseIngredientsCost += lineCost;
    }

    return {
      materialId: ing.materialId,
      materialName: ing.materialName,
      recipeUnit,
      stockUnit,
      effectiveQuantity,
      stockEquivalentQuantity,
      lineCost,
      isMisc,
    };
  });

  const ingredientsCost = warehouseIngredientsCost + miscIngredientsCost;
  const totalUnitCost = ingredientsCost + overheadCost + laborCost + packagingCost;
  const netProfitPerUnit = sellingPrice - totalUnitCost;

  const profitMarginPercent =
    sellingPrice > 0 ? Number(((netProfitPerUnit / sellingPrice) * 100).toFixed(1)) : 0;

  const foodCostPercent =
    sellingPrice > 0 ? Number(((totalUnitCost / sellingPrice) * 100).toFixed(1)) : 0;

  // Target 40% margin => Cost is 60% of Selling Price => Price = Cost / 0.6
  const suggestedPriceFor40Margin =
    totalUnitCost > 0 ? Math.ceil(totalUnitCost / 0.6 / 1000) * 1000 : 0;

  const ingredientBreakdown = rawBreakdown.map((b) => ({
    ...b,
    sharePercent:
      totalUnitCost > 0 ? Number(((b.lineCost / totalUnitCost) * 100).toFixed(1)) : 0,
  }));

  return {
    ingredientsCost,
    miscIngredientsCost,
    warehouseIngredientsCost,
    overheadCost,
    laborCost,
    packagingCost,
    totalUnitCost,
    sellingPrice,
    netProfitPerUnit,
    profitMarginPercent,
    foodCostPercent,
    suggestedPriceFor40Margin,
    ingredientBreakdown,
  };
}

/**
 * Computes Weighted Average Cost (میانگین موزون) when purchasing new raw material stock.
 */
export function calculateWeightedAveragePurchase(params: {
  currentQty: number;
  currentAvgCost: number;
  purchaseQty: number;
  purchaseUnitPrice: number;
}): WeightedAverageResult {
  const curQty = Math.max(0, Number(params.currentQty) || 0);
  const curCost = Math.max(0, Number(params.currentAvgCost) || 0);
  const buyQty = Math.max(0, Number(params.purchaseQty) || 0);
  const buyPrice = Math.max(0, Number(params.purchaseUnitPrice) || 0);

  const newQuantity = Number((curQty + buyQty).toFixed(4));
  if (newQuantity <= 0) {
    return { newQuantity: 0, newAverageCost: buyPrice || curCost, totalInventoryValue: 0 };
  }

  const currentVal = curQty * curCost;
  const purchaseVal = buyQty * buyPrice;
  const totalInventoryValue = Math.round(currentVal + purchaseVal);
  const newAverageCost = Math.round(totalInventoryValue / newQuantity);

  return {
    newQuantity,
    newAverageCost,
    totalInventoryValue,
  };
}

/**
 * Validates a Double-Entry Journal Voucher (سند حسابداری دوبل).
 */
export function validateDoubleEntryLines(lines: JournalLine[]): {
  isValid: boolean;
  totalDebit: number;
  totalCredit: number;
  difference: number;
  error?: string;
} {
  if (!lines || lines.length < 2) {
    return {
      isValid: false,
      totalDebit: 0,
      totalCredit: 0,
      difference: 0,
      error: 'سند حسابداری باید حداقل دارای ۲ ردیف (بدهکار و بستانکار) باشد.',
    };
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    const d = Math.max(0, Math.round(Number(line.debit) || 0));
    const c = Math.max(0, Math.round(Number(line.credit) || 0));
    if (d > 0 && c > 0) {
      return {
        isValid: false,
        totalDebit,
        totalCredit,
        difference: Math.abs(totalDebit - totalCredit),
        error: 'یک ردیف سند نمی‌تواند همزمان هم بدهکار و هم بستانکار باشد.',
      };
    }
    totalDebit += d;
    totalCredit += c;
  }

  const difference = Math.abs(totalDebit - totalCredit);
  if (totalDebit === 0 || totalCredit === 0) {
    return {
      isValid: false,
      totalDebit,
      totalCredit,
      difference,
      error: 'مبلغ سند باید بزرگتر از صفر باشد.',
    };
  }

  if (difference !== 0) {
    const unitLabel =
      typeof window !== 'undefined' &&
      window.localStorage &&
      window.localStorage.getItem('arka_currency_unit') === 'rial'
        ? 'ریال'
        : 'تومان';
    return {
      isValid: false,
      totalDebit,
      totalCredit,
      difference,
      error: `سند تراز نیست! جمع بدهکار و بستانکار ${difference.toLocaleString('fa-IR')} ${unitLabel} اختلاف دارد.`,
    };
  }

  return {
    isValid: true,
    totalDebit,
    totalCredit,
    difference: 0,
  };
}

/**
 * Computes Standard Profit and Loss (سود و زیان استاندارد حسابداری) from journal entries.
 */
export function computeProfitAndLoss(params: {
  accounts: AccountNode[];
  journalLines: JournalLine[];
}): ProfitAndLossReport {
  const accountMap = new Map<string, AccountNode>();
  for (const acc of params.accounts) {
    accountMap.set(acc.code, acc);
  }

  let grossMenuSales = 0;
  let grossSelfServiceSales = 0;
  let otherRevenue = 0;
  let salesDiscounts = 0;
  let totalCOGS = 0;
  const expenseTotals = new Map<string, { code: string; name: string; amount: number }>();

  for (const line of params.journalLines) {
    const acc = accountMap.get(line.accountCode);
    const debit = Math.max(0, Math.round(Number(line.debit) || 0));
    const credit = Math.max(0, Math.round(Number(line.credit) || 0));

    if (line.accountCode === '401') {
      grossMenuSales += credit - debit;
    } else if (line.accountCode === '402') {
      grossSelfServiceSales += credit - debit;
    } else if (line.accountCode === '403') {
      // Sales discounts (contra-revenue: debit balance)
      salesDiscounts += debit - credit;
    } else if (acc?.type === 'revenue' || line.accountCode.startsWith('4')) {
      otherRevenue += credit - debit;
    } else if (acc?.type === 'cogs' || line.accountCode.startsWith('5')) {
      totalCOGS += debit - credit;
    } else if (acc?.type === 'expense' || line.accountCode.startsWith('6')) {
      const netExp = debit - credit;
      const existing = expenseTotals.get(line.accountCode) || {
        code: line.accountCode,
        name: acc?.name || line.accountName || `هزینه (${line.accountCode})`,
        amount: 0,
      };
      existing.amount += netExp;
      expenseTotals.set(line.accountCode, existing);
    }
  }

  const grossSales = Math.max(0, grossMenuSales + grossSelfServiceSales + otherRevenue);
  const netSales = Math.max(0, grossSales - salesDiscounts);
  const grossProfit = netSales - totalCOGS;
  const grossMarginPercent =
    netSales > 0 ? Number(((grossProfit / netSales) * 100).toFixed(1)) : 0;

  const operatingExpensesByCategory = Array.from(expenseTotals.values())
    .filter((e) => e.amount !== 0)
    .sort((a, b) => b.amount - a.amount);

  const totalOperatingExpenses = operatingExpensesByCategory.reduce(
    (sum, item) => sum + item.amount,
    0
  );

  const netProfit = grossProfit - totalOperatingExpenses;
  const netMarginPercent =
    netSales > 0 ? Number(((netProfit / netSales) * 100).toFixed(1)) : 0;

  return {
    grossMenuSales,
    grossSelfServiceSales,
    grossSales,
    salesDiscounts,
    netSales,
    totalCOGS,
    grossProfit,
    grossMarginPercent,
    operatingExpensesByCategory,
    totalOperatingExpenses,
    netProfit,
    netMarginPercent,
  };
}

/**
 * Classifies cheque due date urgency relative to a reference date.
 */
export function classifyChequeDueStatus(
  cheque: ChequeAlertItem,
  referenceDate: Date = new Date()
): { urgency: ChequeUrgency; daysRemaining: number } {
  if (cheque.status !== 'pending') {
    return { urgency: 'resolved', daysRemaining: 999 };
  }

  const due = new Date(cheque.dueDate);
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const refStart = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  ).getTime();

  const diffDays = Math.round((dueStart - refStart) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { urgency: 'overdue', daysRemaining: diffDays };
  }
  if (diffDays === 0) {
    return { urgency: 'due_today', daysRemaining: 0 };
  }
  if (diffDays <= 7) {
    return { urgency: 'upcoming', daysRemaining: diffDays };
  }
  return { urgency: 'future', daysRemaining: diffDays };
}

/**
 * Aggregates cashier POS orders by settlement method and by individual bank account.
 */
export function summarizeCashierSettlements(
  orders: OrderPaymentRecord[]
): CashierSettlementSummary {
  let totalSales = 0;
  let orderCount = 0;
  let standardOrderCount = 0;
  let selfServiceOrderCount = 0;
  let totalCash = 0;
  let totalCard = 0;
  let totalCredit = 0;

  const bankMap = new Map<number, { bankId: number; bankName: string; amount: number; txCount: number }>();

  for (const order of orders) {
    if (order.status !== 'paid') continue;
    const total = Math.max(0, Math.round(Number(order.total) || 0));
    totalSales += total;
    orderCount += 1;

    if (order.invoiceMode === 'self_service') {
      selfServiceOrderCount += 1;
    } else {
      standardOrderCount += 1;
    }

    const method = order.paymentMethod || 'card';
    if (method === 'cash') {
      totalCash += total;
    } else if (method === 'credit') {
      totalCredit += total;
    } else if (method === 'split') {
      const cashPart = Math.max(0, Math.round(Number(order.cashAmount) || 0));
      const cardPart = Math.max(0, Math.round(Number(order.cardAmount) || total - cashPart));
      totalCash += cashPart;
      totalCard += cardPart;
      if (cardPart > 0) {
        const bId = order.bankId || 0;
        const bName = order.bankName || 'کارتخوان پیش‌فرض';
        const cur = bankMap.get(bId) || { bankId: bId, bankName: bName, amount: 0, txCount: 0 };
        cur.amount += cardPart;
        cur.txCount += 1;
        bankMap.set(bId, cur);
      }
    } else {
      // 'card'
      totalCard += total;
      const bId = order.bankId || 0;
      const bName = order.bankName || 'کارتخوان پیش‌فرض';
      const cur = bankMap.get(bId) || { bankId: bId, bankName: bName, amount: 0, txCount: 0 };
      cur.amount += total;
      cur.txCount += 1;
      bankMap.set(bId, cur);
    }
  }

  return {
    totalSales,
    orderCount,
    standardOrderCount,
    selfServiceOrderCount,
    totalCash,
    totalCard,
    totalCredit,
    byBank: Array.from(bankMap.values()).sort((a, b) => b.amount - a.amount),
  };
}

export const DEFAULT_CHART_OF_ACCOUNTS: AccountNode[] = [
  // 100 - دارایی‌ها
  { code: '101', name: 'صندوق نقدی رستوران', type: 'asset', isSystem: true, description: 'موجودی وجه نقد در صندوق' },
  { code: '102', name: 'موجودی بانک‌ها و کارتخوان‌ها', type: 'asset', isSystem: true, description: 'حساب‌های بانکی متصل به پوز و کارت' },
  { code: '103', name: 'حساب‌های دریافتنی (مشتریان و نسیه)', type: 'asset', isSystem: true, description: 'مطالبات از مشتریان و مشترکین' },
  { code: '104', name: 'اسناد دریافتنی (چک‌های مشتریان)', type: 'asset', isSystem: true, description: 'چک‌های دریافت شده در جریان وصول' },
  { code: '105', name: 'موجودی مواد اولیه انبار', type: 'asset', isSystem: true, description: 'ارزش ریالی مواد غذایی و کالاهای انبار' },
  // 200 - بدهی‌ها
  { code: '201', name: 'حساب‌های پرداختنی (تأمین‌کنندگان و پرسنل)', type: 'liability', isSystem: true, description: 'بدهی به فروشندگان مواد و حقوق پرسنل' },
  { code: '202', name: 'اسناد پرداختنی (چک‌های صادره)', type: 'liability', isSystem: true, description: 'چک‌های پرداختی پاس نشده به اشخاص' },
  { code: '203', name: 'مالیات بر ارزش افزوده پرداختنی', type: 'liability', isSystem: true, description: 'مالیات دریافتی در فاکتورهای فروش' },
  // 300 - سرمایه
  { code: '301', name: 'سرمایه اولیه و جاری شرکا', type: 'equity', isSystem: true, description: 'آورده نقدی و غیرنقدی صاحب رستوران' },
  // 400 - درآمدها
  { code: '401', name: 'درآمد فروش غذا و منو', type: 'revenue', isSystem: true, description: 'فروش غذاهای اصلی، پیش‌غذا و نوشیدنی' },
  { code: '402', name: 'درآمد فیش سلف سرویس و نوشابه', type: 'revenue', isSystem: true, description: 'فروش فیش‌های ورودی سلف سرویس' },
  { code: '403', name: 'تخفیفات نقدی فروش', type: 'revenue', isSystem: true, description: 'تخفیف‌های اعمال شده روی فاکتورها (کاهنده درآمد)' },
  // 500 - بهای تمام شده
  { code: '501', name: 'بهای تمام شده غذای فروش رفته (مصرف مواد و تولید)', type: 'cogs', isSystem: true, description: 'هزینه دقیق مواد اولیه و سربار مصرفی طبق فرمول تولید' },
  // 600 - هزینه‌های عملیاتی رستوران
  { code: '601', name: 'هزینه حقوق و دستمزد پرسنل', type: 'expense', isSystem: true, description: 'حقوق آشپز، سالن‌دار، صندوقدار و بیمه' },
  { code: '602', name: 'هزینه اجاره رستوران', type: 'expense', isSystem: true, description: 'اجاره ماهانه ملک رستوران و انبار' },
  { code: '603', name: 'هزینه قبوض (آب، برق، گاز، تلفن و اینترنت)', type: 'expense', isSystem: true, description: 'قبوض مصرفی انرژی و مخابرات' },
  { code: '604', name: 'هزینه پیک و ارسال بیرون‌بر', type: 'expense', isSystem: true, description: 'کرایه پیک موتوری و آژانس' },
  { code: '605', name: 'هزینه ظروف یکبارمصرف و بسته‌بندی', type: 'expense', isSystem: true, description: 'ظروف آلومینیومی، پاکت، کیسه و ملزومات' },
  { code: '606', name: 'هزینه تعمیرات و نگهداری تجهیزات', type: 'expense', isSystem: true, description: 'سرویس یخچال، فر، تهویه و تجهیزات آشپزخانه' },
  { code: '607', name: 'هزینه تبلیغات و بازاریابی', type: 'expense', isSystem: true, description: 'چاپ تراکت، اینستاگرام و اسنپ‌فود' },
  { code: '608', name: 'هزینه ضایعات و دورریز مواد غذایی', type: 'expense', isSystem: true, description: 'خرابی یا انقضای مواد اولیه انبار' },
  { code: '609', name: 'سایر هزینه‌های عمومی و تنخواه', type: 'expense', isSystem: true, description: 'خریدهای جزئی روزانه، مواد شوینده و پذیرایی' },
];

// ---------------------------------------------------------------------------
// 8. 3-Digit Live Number Formatting & Parsing (Supports Persian & English digits)
// ---------------------------------------------------------------------------
const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export function normalizeDigitsToEnglish(raw: string | number): string {
  let str = String(raw ?? '');
  for (let i = 0; i < 10; i++) {
    str = str.replaceAll(PERSIAN_DIGITS[i], String(i)).replaceAll(ARABIC_DIGITS[i], String(i));
  }
  return str;
}

export function formatNumberThreeDigits(
  raw: string | number | undefined | null,
  allowDecimal = false
): string {
  if (raw === undefined || raw === null || raw === '') return '';
  const normalized = normalizeDigitsToEnglish(raw).replace(/[,٬\s]/g, '');
  if (!normalized) return '';

  const isNegative = normalized.startsWith('-');
  const unsigned = isNegative ? normalized.slice(1) : normalized;

  if (allowDecimal) {
    const parts = unsigned.split('.');
    const intPart = parts[0].replace(/\D/g, '');
    const decPart = parts.length > 1 ? parts[1].replace(/\D/g, '') : undefined;
    if (!intPart && decPart === undefined) return '';
    const formattedInt = (intPart || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const result = decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt;
    return isNegative ? `-${result}` : result;
  }

  const digitsOnly = unsigned.replace(/\D/g, '');
  if (!digitsOnly) return '';
  // Remove leading zeros unless the number is just "0"
  const cleanInt = digitsOnly.replace(/^0+(?=\d)/, '');
  const formatted = cleanInt.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return isNegative ? `-${formatted}` : formatted;
}

export function parseThreeDigitNumber(raw: string | number | undefined | null): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : 0;
  }
  if (!raw) return 0;
  const normalized = normalizeDigitsToEnglish(raw).replace(/[,٬\s]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ---------------------------------------------------------------------------
// 9. Account Autocomplete Filter (Search by Code or Name)
// ---------------------------------------------------------------------------
export function filterAccountsForAutocomplete<T extends { code: string; name: string; description?: string }>(
  accounts: T[],
  query: string
): T[] {
  const q = normalizeDigitsToEnglish(query || '').trim().toLowerCase();
  if (!q) return accounts;

  const exactCodeMatches: T[] = [];
  const nameMatches: T[] = [];

  for (const acc of accounts) {
    const codeNorm = normalizeDigitsToEnglish(acc.code).toLowerCase();
    const nameNorm = normalizeDigitsToEnglish(acc.name).toLowerCase();
    const descNorm = normalizeDigitsToEnglish(acc.description || '').toLowerCase();

    if (codeNorm.startsWith(q)) {
      exactCodeMatches.push(acc);
    } else if (nameNorm.includes(q) || codeNorm.includes(q) || descNorm.includes(q)) {
      nameMatches.push(acc);
    }
  }

  return [...exactCodeMatches, ...nameMatches];
}

// ---------------------------------------------------------------------------
// 10. Kitchen Production Batch & Raw Material Consumption Engine (BOM)
// ---------------------------------------------------------------------------
export interface KitchenBatchItemInput {
  menuItemId: number;
  menuItemName: string;
  quantityProduced: number;
  sellingPrice?: number;
}

export interface KitchenRecipeSource {
  menuItemId: number;
  menuItemName: string;
  ingredients: Array<{
    materialId: number;
    materialName: string;
    unit: string;
    recipeUnit?: string;
    unitsPerPackage?: number;
    quantity: number; // per 1 portion (in recipeUnit)
    wastePercent: number;
    isMisc?: boolean;
    customUnitPrice?: number;
  }>;
  laborCost: number;
  overheadCost: number;
  packagingCost: number;
}

export interface KitchenMaterialStockSource {
  id: number;
  name: string;
  unit: string;
  currentQty: number;
  avgCost: number;
}

export interface KitchenMaterialConsumptionRow {
  materialId: number;
  materialName: string;
  unit: string;
  netQuantity: number;
  wasteQuantity: number;
  grossQuantityConsumed: number;
  unitCost: number;
  totalMaterialCost: number;
  availableStock: number;
  remainingStock: number;
  isShortage: boolean;
}

export interface KitchenProductCostRow {
  menuItemId: number;
  menuItemName: string;
  quantityProduced: number;
  hasRecipe: boolean;
  unitMaterialsCost: number;
  unitOverheadAndLaborCost: number;
  unitTotalCost: number;
  batchMaterialsCost: number;
  batchLaborCost: number;
  batchOverheadCost: number;
  batchPackagingCost: number;
  batchTotalCost: number;
}

export interface KitchenBatchProductionSummary {
  totalPortionsProduced: number;
  totalMaterialsCost: number;
  totalLaborCost: number;
  totalOverheadCost: number;
  totalPackagingCost: number;
  totalBatchCost: number;
  productBreakdown: KitchenProductCostRow[];
  materialConsumptions: KitchenMaterialConsumptionRow[];
  hasAnyShortage: boolean;
}

export function calculateKitchenBatchProduction(params: {
  items: KitchenBatchItemInput[];
  recipes: KitchenRecipeSource[];
  materials: KitchenMaterialStockSource[];
}): KitchenBatchProductionSummary {
  const recipeByMenuId = new Map<number, KitchenRecipeSource>();
  for (const r of params.recipes) {
    recipeByMenuId.set(r.menuItemId, r);
  }

  const materialById = new Map<number, KitchenMaterialStockSource>();
  for (const m of params.materials) {
    materialById.set(m.id, m);
  }

  const consumptionMap = new Map<
    number,
    {
      materialId: number;
      materialName: string;
      unit: string;
      netQuantity: number;
      wasteQuantity: number;
      grossQuantityConsumed: number;
      unitCost: number;
    }
  >();

  const productBreakdown: KitchenProductCostRow[] = [];
  let totalPortionsProduced = 0;
  let totalMaterialsCost = 0;
  let totalLaborCost = 0;
  let totalOverheadCost = 0;
  let totalPackagingCost = 0;

  for (const item of params.items) {
    const qtyProduced = Math.max(0, Math.round(Number(item.quantityProduced) || 0));
    if (qtyProduced <= 0) continue;

    totalPortionsProduced += qtyProduced;
    const recipe = recipeByMenuId.get(item.menuItemId);

    if (!recipe) {
      productBreakdown.push({
        menuItemId: item.menuItemId,
        menuItemName: item.menuItemName,
        quantityProduced: qtyProduced,
        hasRecipe: false,
        unitMaterialsCost: 0,
        unitOverheadAndLaborCost: 0,
        unitTotalCost: 0,
        batchMaterialsCost: 0,
        batchLaborCost: 0,
        batchOverheadCost: 0,
        batchPackagingCost: 0,
        batchTotalCost: 0,
      });
      continue;
    }

    let unitMatCost = 0;
    let unitMiscCost = 0;
    for (const ing of recipe.ingredients) {
      const isMisc = Boolean(ing.isMisc || ing.materialId < 0);
      const baseQtyInRecipeUnit = Math.max(0, Number(ing.quantity) || 0);
      const wastePct = Math.max(0, Math.min(100, Number(ing.wastePercent) || 0));

      if (isMisc) {
        const miscUnitPrice = Math.max(0, Number(ing.customUnitPrice) || 0);
        const grossMiscQty = baseQtyInRecipeUnit * (1 + wastePct / 100);
        unitMiscCost += Math.round(grossMiscQty * miscUnitPrice);
        continue;
      }

      const mat = materialById.get(ing.materialId);
      const stockUnit = mat?.unit || ing.unit || 'کیلوگرم';
      const recipeUnit = ing.recipeUnit || stockUnit;
      const unitCost = Math.max(0, Number(mat?.avgCost) || 0);

      const baseQtyPerUnit = convertRecipeQtyToStockUnit({
        quantity: baseQtyInRecipeUnit,
        recipeUnit,
        stockUnit,
        unitsPerPackage: ing.unitsPerPackage,
      });
      const grossQtyPerUnit = baseQtyPerUnit * (1 + wastePct / 100);
      const wasteQtyPerUnit = grossQtyPerUnit - baseQtyPerUnit;

      unitMatCost += Math.round(grossQtyPerUnit * unitCost);

      const batchNetQty = baseQtyPerUnit * qtyProduced;
      const batchWasteQty = wasteQtyPerUnit * qtyProduced;
      const batchGrossQty = grossQtyPerUnit * qtyProduced;

      const existing = consumptionMap.get(ing.materialId) || {
        materialId: ing.materialId,
        materialName: mat?.name || ing.materialName,
        unit: stockUnit,
        netQuantity: 0,
        wasteQuantity: 0,
        grossQuantityConsumed: 0,
        unitCost,
      };
      existing.netQuantity += batchNetQty;
      existing.wasteQuantity += batchWasteQty;
      existing.grossQuantityConsumed += batchGrossQty;
      consumptionMap.set(ing.materialId, existing);
    }

    const uLabor = Math.max(0, Math.round(Number(recipe.laborCost) || 0));
    const uOverhead = Math.max(0, Math.round(Number(recipe.overheadCost) || 0)) + unitMiscCost;
    const uPack = Math.max(0, Math.round(Number(recipe.packagingCost) || 0));
    const uTotal = unitMatCost + uLabor + uOverhead + uPack;

    const bMat = unitMatCost * qtyProduced;
    const bLabor = uLabor * qtyProduced;
    const bOverhead = uOverhead * qtyProduced;
    const bPack = uPack * qtyProduced;
    const bTotal = bMat + bLabor + bOverhead + bPack;

    totalMaterialsCost += bMat;
    totalLaborCost += bLabor;
    totalOverheadCost += bOverhead;
    totalPackagingCost += bPack;

    productBreakdown.push({
      menuItemId: item.menuItemId,
      menuItemName: item.menuItemName,
      quantityProduced: qtyProduced,
      hasRecipe: true,
      unitMaterialsCost: unitMatCost,
      unitOverheadAndLaborCost: uLabor + uOverhead + uPack,
      unitTotalCost: uTotal,
      batchMaterialsCost: bMat,
      batchLaborCost: bLabor,
      batchOverheadCost: bOverhead,
      batchPackagingCost: bPack,
      batchTotalCost: bTotal,
    });
  }

  let hasAnyShortage = false;
  const materialConsumptions: KitchenMaterialConsumptionRow[] = Array.from(
    consumptionMap.values()
  ).map((c) => {
    const stock = materialById.get(c.materialId);
    const availableStock = Number((Number(stock?.currentQty) || 0).toFixed(4));
    const netQuantity = Number(c.netQuantity.toFixed(4));
    const wasteQuantity = Number(c.wasteQuantity.toFixed(4));
    const grossQuantityConsumed = Number(c.grossQuantityConsumed.toFixed(4));
    const remainingStock = Number((availableStock - grossQuantityConsumed).toFixed(4));
    const isShortage = remainingStock < 0;
    if (isShortage) hasAnyShortage = true;
    const totalMaterialCost = Math.round(grossQuantityConsumed * c.unitCost);

    return {
      materialId: c.materialId,
      materialName: c.materialName,
      unit: c.unit,
      netQuantity,
      wasteQuantity,
      grossQuantityConsumed,
      unitCost: c.unitCost,
      totalMaterialCost,
      availableStock,
      remainingStock,
      isShortage,
    };
  });

  const totalBatchCost =
    totalMaterialsCost + totalLaborCost + totalOverheadCost + totalPackagingCost;

  return {
    totalPortionsProduced,
    totalMaterialsCost,
    totalLaborCost,
    totalOverheadCost,
    totalPackagingCost,
    totalBatchCost,
    productBreakdown,
    materialConsumptions,
    hasAnyShortage,
  };
}

