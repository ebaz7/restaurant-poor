import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampSelfServiceGuests,
  calculateSelfServiceInvoice,
  calculateRecipeCost,
  calculateWeightedAveragePurchase,
  validateDoubleEntryLines,
  computeProfitAndLoss,
  classifyChequeDueStatus,
  summarizeCashierSettlements,
  DEFAULT_CHART_OF_ACCOUNTS,
  formatNumberThreeDigits,
  parseThreeDigitNumber,
  filterAccountsForAutocomplete,
  calculateKitchenBatchProduction,
  scaleMonetaryAmountForCurrencySwitch,
  deinflateMonetaryValue,
  repairExcessZeroInflationOnDataObject,
} from './accountingEngine.ts';

test('Self-service guest count supports 1 to 4 and any higher number of guests', () => {
  assert.equal(clampSelfServiceGuests(0), 1);
  assert.equal(clampSelfServiceGuests(-3), 1);
  assert.equal(clampSelfServiceGuests(1), 1);
  assert.equal(clampSelfServiceGuests(3), 3);
  assert.equal(clampSelfServiceGuests(4), 4);
  assert.equal(clampSelfServiceGuests(5), 5);
  assert.equal(clampSelfServiceGuests(12), 12);
});

test('Self-service invoice calculates price, drink quota, discount, and tax accurately for any guest count', () => {
  const res = calculateSelfServiceInvoice({
    guestCount: 6,
    pricePerPerson: 180000,
    extraItemsSubtotal: 50000,
    discountType: 'percent',
    discountValue: 10,
    taxEnabled: true,
    taxPercentage: 9,
  });

  assert.equal(res.clampedGuests, 6);
  assert.equal(res.drinkQuota, 6);
  assert.equal(res.selfServiceTotal, 1080000);
  assert.equal(res.subtotal, 1130000);
  assert.equal(res.discountAmount, 113000);
  assert.equal(res.taxableAmount, 1017000);
  assert.equal(res.taxAmount, 91530);
  assert.equal(res.total, 1108530);
});

test('Self-service invoice accurately calculates half-price / child guests at 50% ticket price', () => {
  const res = calculateSelfServiceInvoice({
    guestCount: 2, // 2 adults @ 200,000 = 400,000
    halfPriceGuestCount: 1, // 1 child @ 100,000 (half price) = 100,000
    pricePerPerson: 200000,
    extraItemsSubtotal: 0,
  });

  assert.equal(res.clampedGuests, 2);
  assert.equal(res.halfPriceGuests, 1);
  assert.equal(res.fullPriceTotal, 400000);
  assert.equal(res.halfPriceTotal, 100000);
  assert.equal(res.selfServiceTotal, 500000);
  assert.equal(res.drinkQuota, 3);
  assert.equal(res.total, 500000);
});

test('Self-service invoice supports 0 guests (beverage-only order without self-service ticket)', () => {
  const res = calculateSelfServiceInvoice({
    guestCount: 0,
    halfPriceGuestCount: 0,
    pricePerPerson: 200000,
    extraItemsSubtotal: 45000, // e.g. 3 drinks @ 15,000
  });

  assert.equal(res.clampedGuests, 0);
  assert.equal(res.halfPriceGuests, 0);
  assert.equal(res.selfServiceTotal, 0);
  assert.equal(res.drinkQuota, 0);
  assert.equal(res.subtotal, 45000);
  assert.equal(res.total, 45000);
});

test('Production formula (BOM) calculates exact COGS, waste, profit per unit, and margins without bugs', () => {
  const cost = calculateRecipeCost({
    ingredients: [
      {
        materialId: 1,
        materialName: 'گوشت گوسفندی',
        unit: 'کیلوگرم',
        quantity: 0.2, // 200g
        unitCost: 600000, // 600,000 per kg -> 120,000 raw
        wastePercent: 5, // +5% waste -> 0.21 kg -> 126,000
      },
      {
        materialId: 2,
        materialName: 'برنج ایرانی هاشمی',
        unit: 'کیلوگرم',
        quantity: 0.15, // 150g
        unitCost: 140000, // 140,000 per kg -> 21,000
        wastePercent: 0,
      },
    ],
    overheadCost: 8000,
    laborCost: 12000,
    packagingCost: 5000,
    sellingPrice: 280000,
  });

  assert.equal(cost.ingredientsCost, 126000 + 21000); // 147,000
  assert.equal(cost.totalUnitCost, 147000 + 8000 + 12000 + 5000); // 172,000
  assert.equal(cost.netProfitPerUnit, 280000 - 172000); // 108,000
  assert.equal(cost.profitMarginPercent, 38.6);
  assert.equal(cost.foodCostPercent, 61.4);
  assert.equal(cost.ingredientBreakdown.length, 2);
});

test('Weighted average inventory calculation handles stock additions accurately', () => {
  const res = calculateWeightedAveragePurchase({
    currentQty: 10,
    currentAvgCost: 500000, // 5,000,000
    purchaseQty: 10,
    purchaseUnitPrice: 600000, // 6,000,000
  });

  assert.equal(res.newQuantity, 20);
  assert.equal(res.newAverageCost, 550000);
  assert.equal(res.totalInventoryValue, 11000000);
});

test('Double-entry voucher validation enforces balanced debit and credit', () => {
  const unbalanced = validateDoubleEntryLines([
    { accountCode: '602', accountName: 'هزینه اجاره', debit: 15000000, credit: 0 },
    { accountCode: '102', accountName: 'بانک ملت', debit: 0, credit: 14000000 },
  ]);
  assert.equal(unbalanced.isValid, false);
  assert.equal(unbalanced.difference, 1000000);

  const balanced = validateDoubleEntryLines([
    { accountCode: '602', accountName: 'هزینه اجاره', debit: 15000000, credit: 0 },
    { accountCode: '102', accountName: 'بانک ملت', debit: 0, credit: 15000000 },
  ]);
  assert.equal(balanced.isValid, true);
  assert.equal(balanced.difference, 0);
  assert.equal(balanced.totalDebit, 15000000);
});

test('Standard Profit & Loss statement aggregates revenue, discounts, COGS, and expenses accurately', () => {
  const pnl = computeProfitAndLoss({
    accounts: DEFAULT_CHART_OF_ACCOUNTS,
    journalLines: [
      // Menu sale of 2,000,000 with 100,000 discount
      { accountCode: '102', accountName: 'بانک', debit: 1900000, credit: 0 },
      { accountCode: '403', accountName: 'تخفیفات فروش', debit: 100000, credit: 0 },
      { accountCode: '401', accountName: 'فروش غذا', debit: 0, credit: 2000000 },
      // Self-service sale of 600,000
      { accountCode: '101', accountName: 'صندوق', debit: 600000, credit: 0 },
      { accountCode: '402', accountName: 'فروش سلف سرویس', debit: 0, credit: 600000 },
      // COGS of 950,000
      { accountCode: '501', accountName: 'بهای تمام شده', debit: 950000, credit: 0 },
      { accountCode: '105', accountName: 'انبار مواد اولیه', debit: 0, credit: 950000 },
      // Operating Expenses: Salary 400,000 + Rent 300,000
      { accountCode: '601', accountName: 'حقوق پرسنل', debit: 400000, credit: 0 },
      { accountCode: '102', accountName: 'بانک', debit: 0, credit: 400000 },
      { accountCode: '602', accountName: 'اجاره', debit: 300000, credit: 0 },
      { accountCode: '102', accountName: 'بانک', debit: 0, credit: 300000 },
    ],
  });

  assert.equal(pnl.grossMenuSales, 2000000);
  assert.equal(pnl.grossSelfServiceSales, 600000);
  assert.equal(pnl.grossSales, 2600000);
  assert.equal(pnl.salesDiscounts, 100000);
  assert.equal(pnl.netSales, 2500000);
  assert.equal(pnl.totalCOGS, 950000);
  assert.equal(pnl.grossProfit, 1550000);
  assert.equal(pnl.totalOperatingExpenses, 700000);
  assert.equal(pnl.netProfit, 850000);
});

test('Cheque due date classifier identifies overdue, due today, and upcoming cheques', () => {
  const ref = new Date(2026, 9, 17); // Oct 17, 2026
  const todayCheque = classifyChequeDueStatus(
    {
      chequeNumber: '1001',
      type: 'issued',
      amount: 5000000,
      dueDate: new Date(2026, 9, 17),
      status: 'pending',
      personName: 'تامین گوشت',
      bankName: 'بانک ملت',
    },
    ref
  );
  assert.equal(todayCheque.urgency, 'due_today');
  assert.equal(todayCheque.daysRemaining, 0);

  const overdueCheque = classifyChequeDueStatus(
    {
      chequeNumber: '1002',
      type: 'issued',
      amount: 3000000,
      dueDate: new Date(2026, 9, 15),
      status: 'pending',
      personName: 'تامین برنج',
      bankName: 'بانک سامان',
    },
    ref
  );
  assert.equal(overdueCheque.urgency, 'overdue');
  assert.equal(overdueCheque.daysRemaining, -2);
});

test('Cashier settlement summary groups sales by bank and payment method', () => {
  const summary = summarizeCashierSettlements([
    {
      total: 500000,
      status: 'paid',
      invoiceMode: 'standard',
      paymentMethod: 'card',
      bankId: 1,
      bankName: 'بانک ملت',
    },
    {
      total: 360000,
      status: 'paid',
      invoiceMode: 'self_service',
      paymentMethod: 'card',
      bankId: 2,
      bankName: 'بانک سامان',
    },
    {
      total: 200000,
      status: 'paid',
      invoiceMode: 'standard',
      paymentMethod: 'cash',
    },
    {
      total: 300000,
      status: 'paid',
      invoiceMode: 'standard',
      paymentMethod: 'split',
      cashAmount: 100000,
      cardAmount: 200000,
      bankId: 1,
      bankName: 'بانک ملت',
    },
  ]);

  assert.equal(summary.totalSales, 1360000);
  assert.equal(summary.orderCount, 4);
  assert.equal(summary.selfServiceOrderCount, 1);
  assert.equal(summary.standardOrderCount, 3);
  assert.equal(summary.totalCash, 300000);
  assert.equal(summary.totalCard, 1060000);
  assert.equal(summary.byBank.length, 2);
  assert.equal(summary.byBank[0].bankName, 'بانک ملت');
  assert.equal(summary.byBank[0].amount, 700000);
  assert.equal(summary.byBank[1].bankName, 'بانک سامان');
  assert.equal(summary.byBank[1].amount, 360000);
});

test('3-digit number formatting and parsing handles Persian and English digits cleanly', () => {
  assert.equal(formatNumberThreeDigits('1250000'), '1,250,000');
  assert.equal(formatNumberThreeDigits('۱۲۵۰۰۰۰'), '1,250,000');
  assert.equal(formatNumberThreeDigits('0045000'), '45,000');
  assert.equal(formatNumberThreeDigits('1250.75', true), '1,250.75');
  assert.equal(parseThreeDigitNumber('1,250,000'), 1250000);
  assert.equal(parseThreeDigitNumber('۱٬۲۵۰٬۰۰۰'), 1250000);
});

test('Account autocomplete filters by code prefix and Persian name substring', () => {
  const byCode = filterAccountsForAutocomplete(DEFAULT_CHART_OF_ACCOUNTS, '۱۰۲');
  assert.equal(byCode.length, 1);
  assert.equal(byCode[0].code, '102');

  const byName = filterAccountsForAutocomplete(DEFAULT_CHART_OF_ACCOUNTS, 'حقوق');
  assert.equal(byName.some((a) => a.code === '601'), true);
});

test('Kitchen batch production calculates exact raw material consumption, waste, and stock shortage', () => {
  const res = calculateKitchenBatchProduction({
    items: [
      { menuItemId: 1, menuItemName: 'چلوکباب کوبیده', quantityProduced: 20 },
      { menuItemId: 2, menuItemName: 'زرشک پلو با مرغ', quantityProduced: 10 },
    ],
    recipes: [
      {
        menuItemId: 1,
        menuItemName: 'چلوکباب کوبیده',
        ingredients: [
          { materialId: 10, materialName: 'گوشت', unit: 'کیلوگرم', quantity: 0.2, wastePercent: 5 }, // 0.21 * 20 = 4.2 kg
          { materialId: 11, materialName: 'برنج', unit: 'کیلوگرم', quantity: 0.15, wastePercent: 0 }, // 0.15 * 20 = 3.0 kg
        ],
        laborCost: 10000,
        overheadCost: 5000,
        packagingCost: 5000,
      },
      {
        menuItemId: 2,
        menuItemName: 'زرشک پلو با مرغ',
        ingredients: [
          { materialId: 12, materialName: 'مرغ', unit: 'کیلوگرم', quantity: 0.3, wastePercent: 10 }, // 0.33 * 10 = 3.3 kg
          { materialId: 11, materialName: 'برنج', unit: 'کیلوگرم', quantity: 0.15, wastePercent: 0 }, // 0.15 * 10 = 1.5 kg
        ],
        laborCost: 8000,
        overheadCost: 4000,
        packagingCost: 4000,
      },
    ],
    materials: [
      { id: 10, name: 'گوشت', unit: 'کیلوگرم', currentQty: 10, avgCost: 500000 },
      { id: 11, name: 'برنج', unit: 'کیلوگرم', currentQty: 50, avgCost: 100000 },
      { id: 12, name: 'مرغ', unit: 'کیلوگرم', currentQty: 2, avgCost: 120000 }, // only 2kg in stock -> shortage!
    ],
  });

  assert.equal(res.totalPortionsProduced, 30);
  assert.equal(res.hasAnyShortage, true);

  const meatRow = res.materialConsumptions.find((m) => m.materialId === 10)!;
  assert.equal(meatRow.grossQuantityConsumed, 4.2);
  assert.equal(meatRow.remainingStock, 5.8);
  assert.equal(meatRow.isShortage, false);

  const riceRow = res.materialConsumptions.find((m) => m.materialId === 11)!;
  assert.equal(riceRow.grossQuantityConsumed, 4.5); // 3.0 + 1.5
  assert.equal(riceRow.remainingStock, 45.5);

  const chickenRow = res.materialConsumptions.find((m) => m.materialId === 12)!;
  assert.equal(chickenRow.grossQuantityConsumed, 3.3);
  assert.equal(chickenRow.remainingStock, -1.3);
  assert.equal(chickenRow.isShortage, true);
});

test('Currency switch scaling removes one zero for Rial to Toman and adds one zero for Toman to Rial', () => {
  assert.equal(scaleMonetaryAmountForCurrencySwitch(2450000, 'rial', 'toman'), 245000);
  assert.equal(scaleMonetaryAmountForCurrencySwitch(100000000, 'rial', 'toman'), 10000000);
  assert.equal(scaleMonetaryAmountForCurrencySwitch(245000, 'toman', 'rial'), 2450000);
  assert.equal(scaleMonetaryAmountForCurrencySwitch(15000, 'toman', 'rial'), 150000);
  assert.equal(scaleMonetaryAmountForCurrencySwitch(245000, 'toman', 'toman'), 245000);
  assert.equal(scaleMonetaryAmountForCurrencySwitch(2450000, 'rial', 'rial'), 2450000);
  assert.equal(scaleMonetaryAmountForCurrencySwitch(0, 'rial', 'toman'), 0);
});

test('repairExcessZeroInflationOnDataObject strips 6 and 15 excess zeros from orders, vouchers, and bank balances in Rial and Toman', () => {
  const sampleData = {
    settings: [
      {
        id: 1,
        currencyUnit: 'rial',
        selfServicePricePerPerson: 8330000,
        quickBeverages: [
          { id: 'soda', name: 'نوشابه', price: 550000 },
          { id: 'family_soda', name: 'نوشابه خانواده', price: 1250000 },
        ],
      },
    ],
    orders: [
      // #2229: 1 person self-service (8,330,000) + 1 soda (550,000) = 8,880,000 Rial, inflated by 10^6 -> 8,880,000,000,000
      {
        id: 101,
        invoiceNumber: 2229,
        invoiceMode: 'self_service',
        selfServiceGuests: 1,
        selfServiceUnitPrice: 8330000000000,
        items: [
          { menuItemId: -1, name: 'ورودی بار سلف سرویس + نوشابه (1 نفر تمام‌بها)', price: 8330000000000, quantity: 1 },
          { menuItemId: 10, name: 'نوشابه اضافه', price: 550000000000, quantity: 1 },
        ],
        subtotal: 8880000000000,
        discountType: 'none',
        discountValue: 0,
        taxEnabled: false,
        taxPercentage: 9,
        taxAmount: 0,
        total: 8880000000000,
        paymentMethod: 'card',
        bankId: 1,
        bankName: 'بانک مسکن',
        cashAmount: 0,
        cardAmount: 8880000000000,
        status: 'paid',
      },
      // #2227: 2 person self-service (16,660,000) + 2 sodas (1,100,000) = 17,760,000 Rial, inflated by 10^6 -> 17,760,000,000,000
      {
        id: 102,
        invoiceNumber: 2227,
        invoiceMode: 'self_service',
        selfServiceGuests: 2,
        selfServiceUnitPrice: 8330000000000,
        items: [
          { menuItemId: -1, name: 'ورودی بار سلف سرویس + نوشابه (2 نفر تمام‌بها)', price: 8330000000000, quantity: 2 },
          { menuItemId: 10, name: 'نوشابه اضافه', price: 550000000000, quantity: 2 },
        ],
        subtotal: 17760000000000,
        discountType: 'none',
        discountValue: 0,
        taxEnabled: false,
        taxPercentage: 9,
        taxAmount: 0,
        total: 17760000000000,
        paymentMethod: 'card',
        bankId: 1,
        bankName: 'بانک مسکن',
        cashAmount: 0,
        cardAmount: 17760000000000,
        status: 'paid',
      },
      // #2225: 2 person self-service (16,660,000) + 1 family soda (1,250,000) = 17,910,000 Rial, inflated by 10^6 -> 17,910,000,000,000
      {
        id: 103,
        invoiceNumber: 2225,
        invoiceMode: 'self_service',
        selfServiceGuests: 2,
        selfServiceUnitPrice: 8330000000000,
        items: [
          { menuItemId: -1, name: 'ورودی بار سلف سرویس + نوشابه (2 نفر تمام‌بها)', price: 8330000000000, quantity: 2 },
          { menuItemId: 11, name: 'نوشابه خانواده', price: 1250000000000, quantity: 1 },
        ],
        subtotal: 17910000000000,
        discountType: 'none',
        discountValue: 0,
        taxEnabled: false,
        taxPercentage: 9,
        taxAmount: 0,
        total: 17910000000000,
        paymentMethod: 'card',
        bankId: 1,
        bankName: 'بانک مسکن',
        cashAmount: 0,
        cardAmount: 17910000000000,
        status: 'paid',
      },
      // #2224: 3 person self-service + 3 sodas = 26,640,000 Rial, inflated by 10^15 -> 2.664e22
      {
        id: 104,
        invoiceNumber: 2224,
        invoiceMode: 'self_service',
        selfServiceGuests: 3,
        selfServiceUnitPrice: 8330000 * 1e15,
        items: [
          { menuItemId: -1, name: 'ورودی بار سلف سرویس + نوشابه (3 نفر تمام‌بها)', price: 8330000 * 1e15, quantity: 3 },
          { menuItemId: 10, name: 'نوشابه اضافه', price: 550000 * 1e15, quantity: 3 },
        ],
        subtotal: 26640000 * 1e15,
        discountType: 'none',
        discountValue: 0,
        taxEnabled: false,
        taxPercentage: 9,
        taxAmount: 0,
        total: 26640000 * 1e15,
        paymentMethod: 'card',
        bankId: 1,
        bankName: 'بانک مسکن',
        cashAmount: 0,
        cardAmount: 26640000 * 1e15,
        status: 'paid',
      },
    ],
    journalVouchers: [
      {
        id: 501,
        voucherNumber: 501,
        type: 'auto_sale',
        referenceId: 2229,
        bankId: 1,
        bankName: 'بانک مسکن',
        description: 'سند اتوماتیک فیش سلف سرویس #2229 (1 نفر)',
        totalAmount: 8880000000000,
        lines: [
          { accountCode: '102', accountName: 'موجودی بانک‌ها', debit: 8880000000000, credit: 0 },
          { accountCode: '402', accountName: 'درآمد سلف سرویس', debit: 0, credit: 8330000000000 },
          { accountCode: '401', accountName: 'درآمد فروش منو', debit: 0, credit: 550000000000 },
        ],
      },
    ],
    bankAccounts: [
      {
        id: 1,
        bankName: 'بانک مسکن',
        initialBalance: 0,
        currentBalance: 8880000000000,
      },
    ],
  };

  const res = repairExcessZeroInflationOnDataObject(sampleData);
  assert.equal(res.modified, true);
  assert.equal(sampleData.orders[0].total, 8880000);
  assert.equal(sampleData.orders[0].selfServiceUnitPrice, 8330000);
  assert.equal(sampleData.orders[0].items[1].price, 550000);

  assert.equal(sampleData.orders[1].total, 17760000);
  assert.equal(sampleData.orders[2].total, 17910000);
  assert.equal(sampleData.orders[3].total, 26640000);

  assert.equal(sampleData.journalVouchers[0].totalAmount, 8880000);
  assert.equal(sampleData.journalVouchers[0].lines[0].debit, 8880000);
  assert.equal(sampleData.bankAccounts[0].currentBalance, 8880000);

  // Calling repair a second time is a no-op (idempotent)
  const secondRun = repairExcessZeroInflationOnDataObject(sampleData);
  assert.equal(secondRun.modified, false);
  assert.equal(sampleData.orders[0].total, 8880000);
});



