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
 * Strips excess powers of 10 from a monetary value that was accidentally multiplied
 * during repeated Rial <-> Toman switches, bringing it back within `maxAllowed`.
 */
export function deinflateMonetaryValue(
  rawVal: number | undefined | null,
  maxAllowed: number
): { value: number; factor: number } {
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

  // If the value was inflated by >= 10^9 (where IEEE-754 double precision can introduce low-digit noise),
  // snap unit prices >= 10,000 to the nearest 500 to recover the exact clean price (e.g. 8,330,000 or 4,165,000).
  let cleaned = Math.round(absVal);
  if (factor >= 1e9 && cleaned >= 10000) {
    cleaned = Math.round(absVal / 500) * 500;
  } else if (factor >= 10 && cleaned >= 1000 && cleaned % 100 !== 0) {
    cleaned = Math.round(absVal / 100) * 100;
  }

  return { value: sign * cleaned, factor };
}

/**
 * Repairs excess zero inflation (10^k) across an entire database snapshot (orders, journalVouchers,
 * bankAccounts, settings, menuItems, rawMaterials, inventoryTransactions, productionRecipes,
 * kitchenProductions, cashClosures, cheques, persons).
 * Never deletes any records — only strips accidental extra zeros and recomputes order/voucher totals.
 */
export function repairExcessZeroInflationOnDataObject(
  data: any,
  overrideUnit?: 'toman' | 'rial',
  nowTimestampMs?: number
): { repairedCount: number; modified: boolean } {
  if (!data || typeof data !== 'object') {
    return { repairedCount: 0, modified: false };
  }

  const firstSetting = Array.isArray(data.settings) && data.settings.length > 0 ? data.settings[0] : null;
  const unit: 'toman' | 'rial' =
    overrideUnit || (firstSetting?.currencyUnit === 'rial' ? 'rial' : 'toman');
  const mult = unit === 'rial' ? 10 : 1;
  const nowTs = nowTimestampMs || Date.now();

  // Realistic upper bounds per single item in Toman (multiplied by 10 when unit === 'rial'):
  // - Self-service per person: e.g. 833,000 Toman / 8,330,000 Rial -> ceiling 3,500,000 Toman / 35,000,000 Rial
  // - Half-price child ticket: e.g. 416,500 Toman / 4,165,000 Rial -> ceiling 2,000,000 Toman / 20,000,000 Rial
  // - Quick beverage / drink: e.g. 25,000..125,000 Toman / 250,000..1,250,000 Rial -> ceiling 450,000 Toman / 4,500,000 Rial
  // - Menu food item: ceiling 3,000,000 Toman / 30,000,000 Rial
  const MAX_SELF_SERVICE_UNIT = 3_500_000 * mult;
  const MAX_HALF_SERVICE_UNIT = 2_000_000 * mult;
  const MAX_BEVERAGE_UNIT = 450_000 * mult;
  const MAX_MENU_FOOD_UNIT = 3_000_000 * mult;
  const MAX_RAW_MATERIAL_UNIT = 50_000_000 * mult;

  const isBeverageLabel = (name: string | undefined): boolean => {
    if (!name) return false;
    return /(نوشابه|دوغ|آب|دلستر|ماءالشعیر|شربت|آبمیوه|کوکا|فانتا|اسپرایت|پپسی|سودا)/.test(name);
  };

  let repairedCount = 0;

  // 1. Settings
  if (Array.isArray(data.settings)) {
    for (const s of data.settings) {
      if (!s || typeof s !== 'object') continue;
      let sChanged = false;

      if (typeof s.selfServicePricePerPerson === 'number' && s.selfServicePricePerPerson > MAX_SELF_SERVICE_UNIT) {
        const res = deinflateMonetaryValue(s.selfServicePricePerPerson, MAX_SELF_SERVICE_UNIT);
        if (res.factor > 1) {
          s.selfServicePricePerPerson = res.value;
          sChanged = true;
        }
      }

      for (const field of ['defaultSodaPrice', 'defaultDoughPrice', 'defaultWaterPrice', 'defaultDelsterPrice']) {
        if (typeof s[field] === 'number' && s[field] > MAX_BEVERAGE_UNIT) {
          const res = deinflateMonetaryValue(s[field], MAX_BEVERAGE_UNIT);
          if (res.factor > 1) {
            s[field] = res.value;
            sChanged = true;
          }
        }
      }

      if (Array.isArray(s.quickBeverages)) {
        for (const bev of s.quickBeverages) {
          if (bev && typeof bev.price === 'number' && bev.price > MAX_BEVERAGE_UNIT) {
            const res = deinflateMonetaryValue(bev.price, MAX_BEVERAGE_UNIT);
            if (res.factor > 1) {
              bev.price = res.value;
              sChanged = true;
            }
          }
        }
      }

      if (sChanged) {
        s._updatedAtMs = Math.max(nowTs, (Number(s._updatedAtMs) || 0) + 1000);
        repairedCount++;
      }
    }
  }

  // 2. Menu Items
  if (Array.isArray(data.menuItems)) {
    for (const m of data.menuItems) {
      if (!m || typeof m !== 'object') continue;
      const ceiling = m.isQuickBeverage || isBeverageLabel(m.name) ? MAX_BEVERAGE_UNIT : MAX_MENU_FOOD_UNIT;
      if (typeof m.price === 'number' && m.price > ceiling) {
        const res = deinflateMonetaryValue(m.price, ceiling);
        if (res.factor > 1) {
          m.price = res.value;
          m._updatedAtMs = Math.max(nowTs, (Number(m._updatedAtMs) || 0) + 1000);
          repairedCount++;
        }
      }
    }
  }

  // 3. Orders (POS & Self-Service Invoices)
  const orderFactorByInvoiceNum = new Map<number, { factor: number; order: any }>();
  const orderFactorById = new Map<number, { factor: number; order: any }>();

  if (Array.isArray(data.orders)) {
    for (const o of data.orders) {
      if (!o || typeof o !== 'object') continue;

      let orderFactor = 1;
      if (typeof o.selfServiceUnitPrice === 'number' && o.selfServiceUnitPrice > MAX_SELF_SERVICE_UNIT) {
        const ssRes = deinflateMonetaryValue(o.selfServiceUnitPrice, MAX_SELF_SERVICE_UNIT);
        orderFactor = Math.max(orderFactor, ssRes.factor);
      }

      if (Array.isArray(o.items)) {
        for (const it of o.items) {
          if (!it || typeof it.price !== 'number' || it.price <= 0) continue;
          const itemCeiling =
            it.menuItemId === -1 || String(it.name || '').includes('تمام‌بها')
              ? MAX_SELF_SERVICE_UNIT
              : it.menuItemId === -2 || String(it.name || '').includes('نیم‌بها')
              ? MAX_HALF_SERVICE_UNIT
              : isBeverageLabel(it.name)
              ? MAX_BEVERAGE_UNIT
              : MAX_MENU_FOOD_UNIT;
          if (it.price > itemCeiling) {
            const itRes = deinflateMonetaryValue(it.price, itemCeiling);
            orderFactor = Math.max(orderFactor, itRes.factor);
          }
        }
      }

      // Fallback check if order has no items or unit prices but total is astronomically inflated
      const totalGuests = Math.max(
        1,
        (Number(o.selfServiceGuests) || 0) + (Number(o.selfServiceHalfPriceGuests) || 0)
      );
      const maxReasonableOrderTotal = Math.max(250_000_000 * mult, totalGuests * MAX_SELF_SERVICE_UNIT * 3);
      if (orderFactor === 1 && typeof o.total === 'number' && o.total > maxReasonableOrderTotal) {
        const totRes = deinflateMonetaryValue(o.total, maxReasonableOrderTotal);
        orderFactor = Math.max(orderFactor, totRes.factor);
      }

      // Also check if order total suffers from float precision noise or doesn't match its items
      if (orderFactor > 1) {
        if (typeof o.selfServiceUnitPrice === 'number' && o.selfServiceUnitPrice > 0) {
          const scaledSS = o.selfServiceUnitPrice / orderFactor;
          o.selfServiceUnitPrice = deinflateMonetaryValue(
            orderFactor >= 1e9 && scaledSS >= 10000 ? Math.round(scaledSS / 500) * 500 : Math.round(scaledSS),
            MAX_SELF_SERVICE_UNIT
          ).value;
        }

        if (typeof o.selfServiceHalfPriceUnitPrice === 'number' && o.selfServiceHalfPriceUnitPrice > 0) {
          o.selfServiceHalfPriceUnitPrice = o.selfServiceUnitPrice
            ? Math.round(o.selfServiceUnitPrice / 2)
            : deinflateMonetaryValue(Math.round(o.selfServiceHalfPriceUnitPrice / orderFactor), MAX_HALF_SERVICE_UNIT).value;
        }

        let itemsSubtotal = 0;
        let hasSelfServiceTicketInItems = false;

        if (Array.isArray(o.items)) {
          o.items = o.items.map((it: any) => {
            if (!it || typeof it !== 'object') return it;
            const rawPrice = Number(it.price) || 0;
            const qty = Math.max(0, Number(it.quantity) || 0);
            const itemCeiling =
              it.menuItemId === -1 || String(it.name || '').includes('تمام‌بها')
                ? MAX_SELF_SERVICE_UNIT
                : it.menuItemId === -2 || String(it.name || '').includes('نیم‌بها')
                ? MAX_HALF_SERVICE_UNIT
                : isBeverageLabel(it.name)
                ? MAX_BEVERAGE_UNIT
                : MAX_MENU_FOOD_UNIT;

            let cleanPrice = rawPrice / orderFactor;
            if (orderFactor >= 1e9 && cleanPrice >= 10000) {
              cleanPrice = Math.round(cleanPrice / 500) * 500;
            } else {
              cleanPrice = Math.round(cleanPrice);
            }
            if (cleanPrice > itemCeiling) {
              cleanPrice = deinflateMonetaryValue(cleanPrice, itemCeiling).value;
            }
            if (it.menuItemId === -1 && o.selfServiceUnitPrice) {
              cleanPrice = o.selfServiceUnitPrice;
              hasSelfServiceTicketInItems = true;
            } else if (it.menuItemId === -2 && o.selfServiceUnitPrice) {
              cleanPrice = Math.round(o.selfServiceUnitPrice / 2);
              hasSelfServiceTicketInItems = true;
            } else if (String(it.name || '').includes('ورودی بار سلف سرویس')) {
              hasSelfServiceTicketInItems = true;
            }

            itemsSubtotal += Math.round(cleanPrice * qty);
            return {
              ...it,
              price: cleanPrice,
            };
          });
        }

        if (
          o.invoiceMode === 'self_service' &&
          !hasSelfServiceTicketInItems &&
          (Number(o.selfServiceGuests) || 0) > 0 &&
          (Number(o.selfServiceUnitPrice) || 0) > 0
        ) {
          const fullG = Math.max(0, Number(o.selfServiceGuests) || 0);
          const halfG = Math.max(0, Number(o.selfServiceHalfPriceGuests) || 0);
          const uPrice = Number(o.selfServiceUnitPrice) || 0;
          itemsSubtotal += Math.round(fullG * uPrice) + Math.round(halfG * Math.round(uPrice / 2));
        }

        const repairedSubtotal = itemsSubtotal > 0 ? itemsSubtotal : Math.round((Number(o.subtotal) || 0) / orderFactor);
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

        if (typeof o.cogsAmount === 'number' && o.cogsAmount > 0) {
          let scaledCogs = Math.round(o.cogsAmount / orderFactor);
          if (scaledCogs > repairedTotal * 2 && repairedTotal > 0) {
            scaledCogs = deinflateMonetaryValue(scaledCogs, repairedTotal).value;
          }
          o.cogsAmount = scaledCogs;
        }

        o._updatedAtMs = Math.max(nowTs, (Number(o._updatedAtMs) || 0) + 1000);
        repairedCount++;

        if (o.invoiceNumber !== undefined && o.invoiceNumber !== null) {
          orderFactorByInvoiceNum.set(Number(o.invoiceNumber), { factor: orderFactor, order: o });
        }
        if (o.id !== undefined && o.id !== null) {
          orderFactorById.set(Number(o.id), { factor: orderFactor, order: o });
        }
      } else {
        if (o.invoiceNumber !== undefined && o.invoiceNumber !== null) {
          orderFactorByInvoiceNum.set(Number(o.invoiceNumber), { factor: 1, order: o });
        }
        if (o.id !== undefined && o.id !== null) {
          orderFactorById.set(Number(o.id), { factor: 1, order: o });
        }
      }
    }
  }

  // 4. Raw Materials
  const materialCostMap = new Map<number, number>();
  if (Array.isArray(data.rawMaterials)) {
    for (const rm of data.rawMaterials) {
      if (!rm || typeof rm !== 'object') continue;
      let rmChanged = false;
      const ceiling =
        rm.unit === 'عدد' && isBeverageLabel(rm.name) ? MAX_BEVERAGE_UNIT : MAX_RAW_MATERIAL_UNIT;
      if (typeof rm.avgCost === 'number' && rm.avgCost > ceiling) {
        const res = deinflateMonetaryValue(rm.avgCost, ceiling);
        if (res.factor > 1) {
          rm.avgCost = res.value;
          rmChanged = true;
        }
      }
      if (typeof rm.lastPurchasePrice === 'number' && rm.lastPurchasePrice > ceiling) {
        const res = deinflateMonetaryValue(rm.lastPurchasePrice, ceiling);
        if (res.factor > 1) {
          rm.lastPurchasePrice = res.value;
          rmChanged = true;
        }
      }
      if (rm.id !== undefined && typeof rm.avgCost === 'number') {
        materialCostMap.set(Number(rm.id), rm.avgCost);
      }
      if (rmChanged) {
        rm._updatedAtMs = Math.max(nowTs, (Number(rm._updatedAtMs) || 0) + 1000);
        repairedCount++;
      }
    }
  }

  // 5. Inventory Transactions (Kardex)
  if (Array.isArray(data.inventoryTransactions)) {
    for (const tx of data.inventoryTransactions) {
      if (!tx || typeof tx !== 'object') continue;
      const ceiling =
        tx.unit === 'عدد' && isBeverageLabel(tx.materialName) ? MAX_BEVERAGE_UNIT : MAX_RAW_MATERIAL_UNIT;
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
        repairedCount++;
      }
    }
  }

  // 6. Production Recipes (BOM)
  if (Array.isArray(data.productionRecipes)) {
    for (const r of data.productionRecipes) {
      if (!r || typeof r !== 'object') continue;
      let rChanged = false;
      for (const f of ['laborCost', 'overheadCost', 'packagingCost']) {
        if (typeof r[f] === 'number' && r[f] > MAX_MENU_FOOD_UNIT) {
          const res = deinflateMonetaryValue(r[f], MAX_MENU_FOOD_UNIT);
          if (res.factor > 1) {
            r[f] = res.value;
            rChanged = true;
          }
        }
      }
      if (Array.isArray(r.ingredients)) {
        for (const ing of r.ingredients) {
          if (ing && typeof ing.customUnitPrice === 'number' && ing.customUnitPrice > MAX_RAW_MATERIAL_UNIT) {
            const res = deinflateMonetaryValue(ing.customUnitPrice, MAX_RAW_MATERIAL_UNIT);
            if (res.factor > 1) {
              ing.customUnitPrice = res.value;
              rChanged = true;
            }
          }
        }
      }
      if (rChanged) {
        r._updatedAtMs = Math.max(nowTs, (Number(r._updatedAtMs) || 0) + 1000);
        repairedCount++;
      }
    }
  }

  // 7. Kitchen Productions
  if (Array.isArray(data.kitchenProductions)) {
    for (const kp of data.kitchenProductions) {
      if (!kp || typeof kp !== 'object') continue;
      let kpFactor = 1;
      if (Array.isArray(kp.items)) {
        for (const it of kp.items) {
          if (it && typeof it.unitCost === 'number' && it.unitCost > MAX_MENU_FOOD_UNIT) {
            kpFactor = Math.max(kpFactor, deinflateMonetaryValue(it.unitCost, MAX_MENU_FOOD_UNIT).factor);
          }
        }
      }
      if (kpFactor > 1) {
        let sumMat = 0;
        if (Array.isArray(kp.materialConsumptions)) {
          kp.materialConsumptions = kp.materialConsumptions.map((mc: any) => {
            const uCost = Math.round((Number(mc.unitCost) || 0) / kpFactor);
            const tCost = Math.round((Number(mc.grossQuantityConsumed) || 0) * uCost);
            sumMat += tCost;
            return { ...mc, unitCost: uCost, totalMaterialCost: tCost };
          });
        }
        if (Array.isArray(kp.items)) {
          kp.items = kp.items.map((it: any) => {
            const uCost = Math.round((Number(it.unitCost) || 0) / kpFactor);
            const tCost = Math.round((Number(it.quantityProduced) || 0) * uCost);
            return { ...it, unitCost: uCost, totalCost: tCost };
          });
        }
        kp.totalMaterialsCost = sumMat > 0 ? sumMat : Math.round((Number(kp.totalMaterialsCost) || 0) / kpFactor);
        kp.totalLaborAndOverheadCost = Math.round((Number(kp.totalLaborAndOverheadCost) || 0) / kpFactor);
        kp.totalBatchCost = kp.totalMaterialsCost + kp.totalLaborAndOverheadCost;
        kp._updatedAtMs = Math.max(nowTs, (Number(kp._updatedAtMs) || 0) + 1000);
        repairedCount++;
      }
    }
  }

  // 8. Journal Vouchers
  const repairedBankIds = new Set<number>();
  if (Array.isArray(data.journalVouchers)) {
    for (const v of data.journalVouchers) {
      if (!v || typeof v !== 'object' || !Array.isArray(v.lines)) continue;

      let matchedOrder: any = null;
      let orderFactor = 1;

      if (v.type === 'auto_sale' && !String(v.description || '').includes('تولید آشپزخانه')) {
        if (v.referenceId !== undefined && orderFactorByInvoiceNum.has(Number(v.referenceId))) {
          const entry = orderFactorByInvoiceNum.get(Number(v.referenceId))!;
          matchedOrder = entry.order;
          orderFactor = entry.factor;
        } else if (v.referenceId !== undefined && orderFactorById.has(Number(v.referenceId))) {
          const entry = orderFactorById.get(Number(v.referenceId))!;
          matchedOrder = entry.order;
          orderFactor = entry.factor;
        } else if (v.description) {
          const match = String(v.description).match(/#(\d+)/);
          if (match && orderFactorByInvoiceNum.has(Number(match[1]))) {
            const entry = orderFactorByInvoiceNum.get(Number(match[1]))!;
            matchedOrder = entry.order;
            orderFactor = entry.factor;
          }
        }
      }

      if (matchedOrder && matchedOrder.total > 0) {
        // Check if this sale voucher's settlement lines are inflated relative to matchedOrder.total
        const settlementDebit = v.lines
          .filter((l: any) => ['101', '102', '103'].includes(String(l?.accountCode)))
          .reduce((s: number, l: any) => s + (Number(l.debit) || 0), 0);

        if (orderFactor > 1 || settlementDebit > matchedOrder.total * 5) {
          // Rebuild clean balanced lines from matchedOrder
          const rebuiltLines: JournalLine[] = [];
          const invNum = matchedOrder.invoiceNumber || v.referenceId || '';
          const payMethod = matchedOrder.paymentMethod || 'card';

          if (payMethod === 'cash') {
            rebuiltLines.push({
              accountCode: '101',
              accountName: 'صندوق نقدی رستوران',
              debit: matchedOrder.total,
              credit: 0,
              description: `دریافت نقدی فاکتور #${invNum}`,
            });
          } else if (payMethod === 'credit') {
            rebuiltLines.push({
              accountCode: '103',
              accountName: 'حساب‌های دریافتنی (مشتریان و نسیه)',
              personName: matchedOrder.customerName || matchedOrder.customerPhone || 'مشتری نسیه',
              debit: matchedOrder.total,
              credit: 0,
              description: `فروش نسیه فاکتور #${invNum}`,
            });
          } else if (payMethod === 'split') {
            const csh = Number(matchedOrder.cashAmount) || 0;
            const crd = Number(matchedOrder.cardAmount) || Math.max(0, matchedOrder.total - csh);
            if (csh > 0) {
              rebuiltLines.push({
                accountCode: '101',
                accountName: 'صندوق نقدی رستوران',
                debit: csh,
                credit: 0,
                description: `بخش نقدی فاکتور #${invNum}`,
              });
            }
            if (crd > 0) {
              rebuiltLines.push({
                accountCode: '102',
                accountName: 'موجودی بانک‌ها و کارتخوان‌ها',
                debit: crd,
                credit: 0,
                description: `بخش کارتخوان (${matchedOrder.bankName || v.bankName || ''}) فاکتور #${invNum}`,
              });
            }
          } else {
            rebuiltLines.push({
              accountCode: '102',
              accountName: 'موجودی بانک‌ها و کارتخوان‌ها',
              debit: matchedOrder.total,
              credit: 0,
              description: `دریافت کارتخوان (${matchedOrder.bankName || v.bankName || ''}) فاکتور #${invNum}`,
            });
          }

          const subtotal = Number(matchedOrder.subtotal) || matchedOrder.total;
          const taxAmt = Number(matchedOrder.taxAmount) || 0;
          const discountAmt = Math.max(0, subtotal + taxAmt - matchedOrder.total);

          if (discountAmt > 0) {
            rebuiltLines.push({
              accountCode: '403',
              accountName: 'تخفیفات نقدی فروش',
              debit: discountAmt,
              credit: 0,
              description: `تخفیف فاکتور #${invNum}`,
            });
          }

          if (matchedOrder.invoiceMode === 'self_service') {
            const fullG = Math.max(0, Number(matchedOrder.selfServiceGuests) || 0);
            const halfG = Math.max(0, Number(matchedOrder.selfServiceHalfPriceGuests) || 0);
            const uPrice = Number(matchedOrder.selfServiceUnitPrice) || 0;
            const ssPortion = Math.min(
              subtotal,
              Math.round(fullG * uPrice) + Math.round(halfG * Math.round(uPrice / 2))
            );
            const extraPortion = Math.max(0, subtotal - ssPortion);
            if (ssPortion > 0) {
              rebuiltLines.push({
                accountCode: '402',
                accountName: 'درآمد فیش سلف سرویس و نوشابه',
                debit: 0,
                credit: ssPortion,
                description: `فیش سلف سرویس (${fullG + halfG} نفر) #${invNum}`,
              });
            }
            if (extraPortion > 0) {
              rebuiltLines.push({
                accountCode: '401',
                accountName: 'درآمد فروش غذا و منو',
                debit: 0,
                credit: extraPortion,
                description: `آیتم‌های اضافی فاکتور #${invNum}`,
              });
            }
            if (ssPortion === 0 && extraPortion === 0) {
              rebuiltLines.push({
                accountCode: '402',
                accountName: 'درآمد فیش سلف سرویس و نوشابه',
                debit: 0,
                credit: subtotal,
                description: `فیش سلف سرویس #${invNum}`,
              });
            }
          } else {
            rebuiltLines.push({
              accountCode: '401',
              accountName: 'درآمد فروش غذا و منو',
              debit: 0,
              credit: subtotal,
              description: `فروش منو فاکتور #${invNum}`,
            });
          }

          if (taxAmt > 0) {
            rebuiltLines.push({
              accountCode: '203',
              accountName: 'مالیات بر ارزش افزوده پرداختنی',
              debit: 0,
              credit: taxAmt,
              description: `مالیات فاکتور #${invNum}`,
            });
          }

          const cogs = Number(matchedOrder.cogsAmount) || 0;
          if (cogs > 0) {
            rebuiltLines.push({
              accountCode: '501',
              accountName: 'بهای تمام شده غذای فروش رفته (مصرف مواد و تولید)',
              debit: cogs,
              credit: 0,
              description: `بهای تمام شده اتوماتیک فاکتور #${invNum}`,
            });
            rebuiltLines.push({
              accountCode: '105',
              accountName: 'موجودی مواد اولیه انبار',
              debit: 0,
              credit: cogs,
              description: `خروج مواد اولیه مصرفی فاکتور #${invNum}`,
            });
          }

          v.lines = rebuiltLines;
          v.totalAmount = rebuiltLines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
          v._updatedAtMs = Math.max(nowTs, (Number(v._updatedAtMs) || 0) + 1000);
          if (v.bankId) repairedBankIds.add(Number(v.bankId));
          repairedCount++;
          continue;
        }
      }

      // Non-matched voucher: check if any line exceeds reasonable voucher ceiling (500M Toman / 5B Rial)
      const MAX_VOUCHER_LINE = 500_000_000 * mult;
      let vFactor = 1;
      for (const l of v.lines) {
        const m = Math.max(Number(l?.debit) || 0, Number(l?.credit) || 0);
        if (m > MAX_VOUCHER_LINE) {
          vFactor = Math.max(vFactor, deinflateMonetaryValue(m, MAX_VOUCHER_LINE).factor);
        }
      }
      if (vFactor > 1) {
        v.lines = v.lines.map((l: any) => ({
          ...l,
          debit: Math.round((Number(l.debit) || 0) / vFactor),
          credit: Math.round((Number(l.credit) || 0) / vFactor),
        }));
        v.totalAmount = v.lines.reduce((sum: number, l: any) => sum + (Number(l.debit) || 0), 0);
        v._updatedAtMs = Math.max(nowTs, (Number(v._updatedAtMs) || 0) + 1000);
        if (v.bankId) repairedBankIds.add(Number(v.bankId));
        repairedCount++;
      }
    }
  }

  // 9. Bank Accounts
  if (Array.isArray(data.bankAccounts)) {
    const MAX_BANK_BALANCE = 20_000_000_000 * mult;
    for (const b of data.bankAccounts) {
      if (!b || typeof b !== 'object') continue;
      let bChanged = false;

      if (typeof b.initialBalance === 'number' && Math.abs(b.initialBalance) > MAX_BANK_BALANCE) {
        const res = deinflateMonetaryValue(b.initialBalance, MAX_BANK_BALANCE);
        if (res.factor > 1) {
          b.initialBalance = res.value;
          bChanged = true;
        }
      }

      const bId = b.id !== undefined ? Number(b.id) : undefined;
      const isBankAffectedByRepairedVouchers = bId !== undefined && repairedBankIds.has(bId);
      const isCurrentBalanceInflated =
        typeof b.currentBalance === 'number' && Math.abs(b.currentBalance) > MAX_BANK_BALANCE;

      if (isBankAffectedByRepairedVouchers || isCurrentBalanceInflated) {
        if (bId !== undefined && Array.isArray(data.journalVouchers)) {
          const matchingVouchers = data.journalVouchers.filter(
            (v: any) => v && Number(v.bankId) === bId && Array.isArray(v.lines)
          );
          if (matchingVouchers.length > 0) {
            let delta = 0;
            for (const v of matchingVouchers) {
              for (const line of v.lines) {
                if (String(line?.accountCode) === '102') {
                  delta += (Number(line.debit) || 0) - (Number(line.credit) || 0);
                }
              }
            }
            const recomputedBalance = (Number(b.initialBalance) || 0) + delta;
            if (b.currentBalance !== recomputedBalance) {
              b.currentBalance = recomputedBalance;
              bChanged = true;
            }
          } else if (isCurrentBalanceInflated) {
            const res = deinflateMonetaryValue(b.currentBalance, MAX_BANK_BALANCE);
            if (res.factor > 1) {
              b.currentBalance = res.value;
              bChanged = true;
            }
          }
        } else if (isCurrentBalanceInflated) {
          const res = deinflateMonetaryValue(b.currentBalance, MAX_BANK_BALANCE);
          if (res.factor > 1) {
            b.currentBalance = res.value;
            bChanged = true;
          }
        }
      }

      if (bChanged) {
        b._updatedAtMs = Math.max(nowTs, (Number(b._updatedAtMs) || 0) + 1000);
        repairedCount++;
      }
    }
  }

  // 10. Persons (Staff, Suppliers, Customers)
  if (Array.isArray(data.persons)) {
    const MAX_SALARY = 200_000_000 * mult;
    const MAX_PERSON_BAL = 5_000_000_000 * mult;
    for (const p of data.persons) {
      if (!p || typeof p !== 'object') continue;
      let pChanged = false;
      if (typeof p.monthlySalary === 'number' && p.monthlySalary > MAX_SALARY) {
        const res = deinflateMonetaryValue(p.monthlySalary, MAX_SALARY);
        if (res.factor > 1) {
          p.monthlySalary = res.value;
          pChanged = true;
        }
      }
      if (typeof p.initialBalance === 'number' && Math.abs(p.initialBalance) > MAX_PERSON_BAL) {
        const res = deinflateMonetaryValue(p.initialBalance, MAX_PERSON_BAL);
        if (res.factor > 1) {
          p.initialBalance = res.value;
          pChanged = true;
        }
      }
      if (pChanged) {
        p._updatedAtMs = Math.max(nowTs, (Number(p._updatedAtMs) || 0) + 1000);
        repairedCount++;
      }
    }
  }

  // 11. Cheques
  if (Array.isArray(data.cheques)) {
    const MAX_CHEQUE = 5_000_000_000 * mult;
    for (const ch of data.cheques) {
      if (!ch || typeof ch !== 'object') continue;
      if (typeof ch.amount === 'number' && ch.amount > MAX_CHEQUE) {
        const res = deinflateMonetaryValue(ch.amount, MAX_CHEQUE);
        if (res.factor > 1) {
          ch.amount = res.value;
          ch._updatedAtMs = Math.max(nowTs, (Number(ch._updatedAtMs) || 0) + 1000);
          repairedCount++;
        }
      }
    }
  }

  // 12. Cash Closures (Z-Reports)
  if (Array.isArray(data.cashClosures)) {
    const MAX_CLOSURE_SALES = 2_000_000_000 * mult;
    for (const cc of data.cashClosures) {
      if (!cc || typeof cc !== 'object') continue;
      const avgOrderCeiling = 35_000_000 * mult;
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
            cc.bankBreakdown = cc.bankBreakdown.map((bb: any) => ({
              ...bb,
              amount: Math.round((Number(bb.amount) || 0) / f),
            }));
          }
          cc._updatedAtMs = Math.max(nowTs, (Number(cc._updatedAtMs) || 0) + 1000);
          repairedCount++;
        }
      }
    }
  }

  return { repairedCount, modified: repairedCount > 0 };
}

/**
 * Computes Self-Service ticket pricing (for 1 or more guests) + optional extra items, discounts, and tax.
 */
export function calculateSelfServiceInvoice(input: SelfServiceCalcInput): SelfServiceCalcResult {
  const rawGuests = Math.max(0, Math.round(Number(input.guestCount) || 0));
  const halfGuests = Math.max(0, Math.round(Number(input.halfPriceGuestCount) || 0));
  const clampedGuests = rawGuests;
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

