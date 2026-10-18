import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  MenuItem,
  Order,
  OrderItem,
  Customer,
  recordJournalVoucher,
  processOrderInventoryAndCOGS,
} from '../../lib/db';
import {
  clampSelfServiceGuests,
  calculateSelfServiceInvoice,
  summarizeCashierSettlements,
  JournalLine,
} from '../../lib/accountingEngine';
import { formatCurrency } from '../../lib/utils';
import {
  Search,
  Plus,
  Minus,
  X,
  Printer,
  CreditCard,
  Receipt as ReceiptIcon,
  Edit3,
  Check,
  ArrowLeft,
  ArrowRight,
  Users,
  Utensils,
  Wallet,
  Building2,
  Lock,
  CheckCircle2,
  Eye,
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { Receipt } from './Receipt';
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
} from 'date-fns-jalali';

interface OpenTab {
  id: string;
  title: string;
  invoiceMode: 'standard' | 'self_service';
  selfServiceGuests: number; // 1 to 4
  selfServiceUnitPrice: number;
  selfServiceDrinkNote: string;
  customerPhone: string;
  customerName?: string;
  customerSubscriptionCode?: string;
  customerAddress?: string;
  items: OrderItem[];
  discountType: 'none' | 'percent' | 'amount';
  discountValue: number;
  taxEnabled: boolean;
  paymentMethod: 'cash' | 'card' | 'split' | 'credit';
  bankId?: number;
  cashAmount?: number;
}

export default function POSScreen() {
  const categories = useLiveQuery(() => db.categories.toArray());
  const allMenuItems = useLiveQuery(() => db.menuItems.toArray());
  const settings = useLiveQuery(() => db.settings.toCollection().first());
  const bankAccounts = useLiveQuery(() => db.bankAccounts.toArray()) || [];
  const allOrders = useLiveQuery(() => db.orders.toArray()) || [];
  const cashClosures = useLiveQuery(() => db.cashClosures.reverse().toArray()) || [];

  const activeBanks = useMemo(
    () => bankAccounts.filter((b) => b.isActive !== false),
    [bankAccounts]
  );
  const defaultBank = useMemo(
    () => activeBanks.find((b) => b.isDefaultPos) || activeBanks[0],
    [activeBanks]
  );

  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [openTabs, setOpenTabs] = useState<OpenTab[]>([
    {
      id: '1',
      title: 'سفارش 1',
      invoiceMode: 'self_service',
      selfServiceGuests: 2,
      selfServiceUnitPrice: 220000,
      selfServiceDrinkNote: 'نوشابه قوطی + استفاده از بار سلف سرویس',
      customerPhone: '',
      customerName: '',
      customerSubscriptionCode: '',
      customerAddress: '',
      items: [],
      discountType: 'none',
      discountValue: 0,
      taxEnabled: false,
      paymentMethod: 'card',
    },
  ]);
  const [activeTabId, setActiveTabId] = useState('1');
  const [modeLockNotice, setModeLockNotice] = useState<string | null>(null);

  // Customer Autocomplete & Details
  const [matchingCustomers, setMatchingCustomers] = useState<Customer[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Mobile cart view toggle
  const [showCartOnMobile, setShowCartOnMobile] = useState(false);

  // Inline Price Editing
  const [editingPriceId, setEditingPriceId] = useState<number | null>(null);
  const [tempPrice, setTempPrice] = useState<string>('');

  // Printing & Preview Modal
  const receiptRef = useRef<HTMLDivElement>(null);
  const [orderToPrint, setOrderToPrint] = useState<Order | null>(null);
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null);

  // Cashier Daily/Weekly/Monthly Report & Close Register Modal
  const [showCashierModal, setShowCashierModal] = useState(false);
  const [cashierPeriod, setCashierPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [actualCashCounted, setActualCashCounted] = useState<string>('');
  const [cashierNameInput, setCashierNameInput] = useState<string>('صندوقدار شیفت');
  const [closureNotes, setClosureNotes] = useState<string>('');
  const [closureSuccessMsg, setClosureSuccessMsg] = useState<string>('');

  const activeTab = openTabs.find((t) => t.id === activeTabId) || openTabs[0];

  // Sync default settings & default bank into initial tab
  useEffect(() => {
    if (settings || defaultBank) {
      const defaultMode = settings?.defaultInvoiceMode || 'self_service';
      setOpenTabs((prev) =>
        prev.map((tab) => ({
          ...tab,
          invoiceMode: settings?.lockSelfServiceMode ? 'self_service' : (tab.invoiceMode || defaultMode),
          selfServiceUnitPrice:
            tab.selfServiceUnitPrice === 220000 && settings?.selfServicePricePerPerson
              ? settings.selfServicePricePerPerson
              : tab.selfServiceUnitPrice,
          bankId: tab.bankId ?? defaultBank?.id,
        }))
      );
    }
  }, [settings, defaultBank]);

  useEffect(() => {
    if (categories?.length && !activeCategoryId) {
      setActiveCategoryId(categories[0].id!);
    }
  }, [categories, activeCategoryId]);

  // Calculate Totals for both Mode 1 (Standard) and Mode 2 (Self-Service 1-4 guests)
  const extraMenuSubtotal =
    activeTab?.items.reduce((acc, item) => acc + item.price * item.quantity, 0) || 0;

  const selfServiceCalc = useMemo(() => {
    return calculateSelfServiceInvoice({
      guestCount: activeTab.selfServiceGuests,
      pricePerPerson: activeTab.selfServiceUnitPrice,
      extraItemsSubtotal: extraMenuSubtotal,
      discountType: activeTab.discountType,
      discountValue: activeTab.discountValue,
      taxEnabled: activeTab.taxEnabled,
      taxPercentage: settings?.taxPercentage || 0,
    });
  }, [
    activeTab.selfServiceGuests,
    activeTab.selfServiceUnitPrice,
    extraMenuSubtotal,
    activeTab.discountType,
    activeTab.discountValue,
    activeTab.taxEnabled,
    settings?.taxPercentage,
  ]);

  const activeTabSubtotal =
    activeTab.invoiceMode === 'self_service' ? selfServiceCalc.subtotal : extraMenuSubtotal;

  let discountAmount = 0;
  if (activeTab.invoiceMode === 'self_service') {
    discountAmount = selfServiceCalc.discountAmount;
  } else if (activeTab.discountType === 'percent') {
    discountAmount = Math.round((activeTabSubtotal * activeTab.discountValue) / 100);
  } else if (activeTab.discountType === 'amount') {
    discountAmount = Math.min(activeTabSubtotal, Math.round(activeTab.discountValue));
  }

  const taxableAmount = Math.max(0, activeTabSubtotal - discountAmount);
  let taxAmount = 0;
  if (activeTab.taxEnabled && settings?.taxPercentage) {
    taxAmount = Math.round((taxableAmount * settings.taxPercentage) / 100);
  }

  const activeTabTotal = Math.max(0, taxableAmount + taxAmount);

  // Cashier Live Stats (Today / Week / Month)
  const cashierStats = useMemo(() => {
    const now = new Date();
    const todayOrders = allOrders.filter(
      (o) =>
        o.status === 'paid' &&
        isWithinInterval(new Date(o.createdAt), {
          start: startOfDay(now),
          end: endOfDay(now),
        })
    );
    const weekOrders = allOrders.filter(
      (o) =>
        o.status === 'paid' &&
        isWithinInterval(new Date(o.createdAt), {
          start: startOfWeek(now),
          end: endOfWeek(now),
        })
    );
    const monthOrders = allOrders.filter(
      (o) =>
        o.status === 'paid' &&
        isWithinInterval(new Date(o.createdAt), {
          start: startOfMonth(now),
          end: endOfMonth(now),
        })
    );

    return {
      todaySummary: summarizeCashierSettlements(todayOrders),
      weekSummary: summarizeCashierSettlements(weekOrders),
      monthSummary: summarizeCashierSettlements(monthOrders),
      todayOrders,
      weekOrders,
      monthOrders,
    };
  }, [allOrders]);

  const selectedPeriodSummary =
    cashierPeriod === 'today'
      ? cashierStats.todaySummary
      : cashierPeriod === 'week'
      ? cashierStats.weekSummary
      : cashierStats.monthSummary;

  useEffect(() => {
    const query = activeTab?.customerPhone || '';
    if (query.trim().length >= 2) {
      const timer = setTimeout(() => {
        db.customers
          .filter((c) => c.phone.includes(query) || c.subscriptionCode.includes(query))
          .toArray()
          .then((res) => {
            setMatchingCustomers(res);
          });
      }, 200);
      return () => clearTimeout(timer);
    } else {
      setMatchingCustomers([]);
      setShowCustomerDropdown(false);
    }
  }, [activeTab?.customerPhone]);

  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: 'Receipt',
    onAfterPrint: () => setOrderToPrint(null),
    pageStyle: `
      @page {
        size: 80mm auto;
        margin: 2mm 3mm 2mm 3mm;
      }
      @media print {
        * {
          box-sizing: border-box !important;
        }
        html, body {
          width: 100% !important;
          max-width: 70mm !important;
          margin: 0 auto !important;
          padding: 0 !important;
          background: #fff !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .receipt-print-wrapper {
          width: 100% !important;
          max-width: 66mm !important;
          margin: 0 auto !important;
          padding: 1mm 1.5mm !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
        }
      }
    `,
  });

  const displayedMenuItems = useMemo(() => {
    return (
      allMenuItems?.filter((item) => {
        if (!item.isActive) return false;
        if (searchQuery) {
          return item.name.includes(searchQuery);
        }
        return item.categoryId === activeCategoryId;
      }) || []
    );
  }, [allMenuItems, searchQuery, activeCategoryId]);

  const defaultInvoiceMode = settings?.defaultInvoiceMode || 'self_service';

  const handleNewTab = () => {
    const newId = Date.now().toString();
    setOpenTabs([
      ...openTabs,
      {
        id: newId,
        title: `سفارش ${openTabs.length + 1}`,
        invoiceMode: defaultInvoiceMode,
        selfServiceGuests: 2,
        selfServiceUnitPrice: settings?.selfServicePricePerPerson || 220000,
        selfServiceDrinkNote: 'نوشابه قوطی + استفاده از بار سلف سرویس',
        customerPhone: '',
        customerName: '',
        customerSubscriptionCode: '',
        customerAddress: '',
        items: [],
        discountType: 'none',
        discountValue: 0,
        taxEnabled: settings?.taxEnabled ?? false,
        paymentMethod: 'card',
        bankId: defaultBank?.id,
      },
    ]);
    setActiveTabId(newId);
  };

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (openTabs.length === 1) {
      setOpenTabs([
        {
          id: Date.now().toString(),
          title: 'سفارش 1',
          invoiceMode: defaultInvoiceMode,
          selfServiceGuests: 2,
          selfServiceUnitPrice: settings?.selfServicePricePerPerson || 220000,
          selfServiceDrinkNote: 'نوشابه قوطی + استفاده از بار سلف سرویس',
          customerPhone: '',
          customerName: '',
          customerSubscriptionCode: '',
          customerAddress: '',
          items: [],
          discountType: 'none',
          discountValue: 0,
          taxEnabled: settings?.taxEnabled ?? false,
          paymentMethod: 'card',
          bankId: defaultBank?.id,
        },
      ]);
      return;
    }
    const newTabs = openTabs.filter((t) => t.id !== id);
    setOpenTabs(newTabs);
    if (activeTabId === id) setActiveTabId(newTabs[0].id);
  };

  const updateActiveTab = (updates: Partial<OpenTab>) => {
    setOpenTabs(openTabs.map((t) => (t.id === activeTabId ? { ...t, ...updates } : t)));
  };

  const handleAddItem = (menuItem: MenuItem) => {
    const existingItem = activeTab.items.find((i) => i.menuItemId === menuItem.id);
    if (existingItem) {
      updateActiveTab({
        items: activeTab.items.map((i) =>
          i.menuItemId === menuItem.id ? { ...i, quantity: i.quantity + 1 } : i
        ),
      });
    } else {
      updateActiveTab({
        items: [
          ...activeTab.items,
          {
            menuItemId: menuItem.id!,
            name: menuItem.name,
            price: menuItem.price,
            quantity: 1,
          },
        ],
      });
    }
  };

  const handleAdjustQuantity = (menuItemId: number, delta: number) => {
    updateActiveTab({
      items: activeTab.items
        .map((i) => {
          if (i.menuItemId === menuItemId) {
            const newQ = i.quantity + delta;
            return newQ > 0 ? { ...i, quantity: newQ } : i;
          }
          return i;
        })
        .filter((i) => i.quantity > 0),
    });
  };

  const handleStartPriceEdit = (item: OrderItem) => {
    setEditingPriceId(item.menuItemId);
    setTempPrice(item.price.toString());
  };

  const handleSavePrice = (menuItemId: number) => {
    const newPrice = Number(tempPrice);
    if (!isNaN(newPrice) && newPrice >= 0) {
      updateActiveTab({
        items: activeTab.items.map((i) =>
          i.menuItemId === menuItemId ? { ...i, price: newPrice } : i
        ),
      });
    }
    setEditingPriceId(null);
  };

  const handleRemoveItem = (menuItemId: number) => {
    updateActiveTab({
      items: activeTab.items.filter((i) => i.menuItemId !== menuItemId),
    });
  };

  const canCheckout =
    activeTab.invoiceMode === 'self_service'
      ? activeTab.selfServiceGuests >= 1 &&
        activeTab.selfServiceGuests <= 4 &&
        activeTab.selfServiceUnitPrice > 0
      : activeTab.items.length > 0;

  const handleCheckout = async () => {
    if (!canCheckout) return;

    if (settings?.requireCustomerPhone && !activeTab.customerPhone.trim()) {
      return;
    }

    try {
      const phone = activeTab.customerPhone.trim();
      const name = activeTab.customerName?.trim() || '';
      const subscriptionCode = activeTab.customerSubscriptionCode?.trim() || '';
      const address = activeTab.customerAddress?.trim() || '';

      if (phone) {
        const existingCustomer = await db.customers.where('phone').equals(phone).first();
        if (existingCustomer) {
          await db.customers.update(existingCustomer.id!, {
            name: name || existingCustomer.name || '',
            subscriptionCode: subscriptionCode || existingCustomer.subscriptionCode || '',
            address: address || existingCustomer.address || '',
          });
        } else {
          await db.customers.add({
            phone,
            name,
            subscriptionCode,
            address,
            createdAt: new Date(),
          });
        }
      }

      const lastOrder = await db.orders.orderBy('invoiceNumber').last();
      const nextInvoiceNum = (lastOrder?.invoiceNumber || 1000) + 1;

      const selectedBank =
        activeBanks.find((b) => b.id === activeTab.bankId) || defaultBank;

      // Build final items list (for self-service mode, include the self-service line item + any extra items)
      const clampedGuests = clampSelfServiceGuests(activeTab.selfServiceGuests);
      const finalItems: OrderItem[] =
        activeTab.invoiceMode === 'self_service'
          ? [
              {
                menuItemId: -1,
                name: `${settings?.selfServiceTitle || 'ورودی بار سلف سرویس + نوشابه'} (${clampedGuests} نفر)`,
                price: activeTab.selfServiceUnitPrice,
                quantity: clampedGuests,
              },
              ...activeTab.items,
            ]
          : [...activeTab.items];

      const splitCash =
        activeTab.paymentMethod === 'split'
          ? Math.min(activeTabTotal, Math.max(0, Number(activeTab.cashAmount) || 0))
          : activeTab.paymentMethod === 'cash'
          ? activeTabTotal
          : 0;
      const splitCard =
        activeTab.paymentMethod === 'split'
          ? Math.max(0, activeTabTotal - splitCash)
          : activeTab.paymentMethod === 'card'
          ? activeTabTotal
          : 0;

      const newOrder: Order = {
        invoiceNumber: nextInvoiceNum,
        createdAt: new Date(),
        customerPhone: phone,
        customerName:
          name || (activeTab.invoiceMode === 'self_service' ? 'مهمان سلف سرویس' : ''),
        customerSubscriptionCode: subscriptionCode,
        customerAddress: address,
        items: finalItems,
        subtotal: activeTabSubtotal,
        discountType: activeTab.discountType,
        discountValue: activeTab.discountValue,
        taxEnabled: activeTab.taxEnabled,
        taxPercentage: settings?.taxPercentage || 0,
        taxAmount,
        total: activeTabTotal,
        status: 'paid',
        invoiceMode: activeTab.invoiceMode,
        selfServiceGuests:
          activeTab.invoiceMode === 'self_service' ? clampedGuests : undefined,
        selfServiceUnitPrice:
          activeTab.invoiceMode === 'self_service'
            ? activeTab.selfServiceUnitPrice
            : undefined,
        selfServiceDrinkNote:
          activeTab.invoiceMode === 'self_service'
            ? activeTab.selfServiceDrinkNote
            : undefined,
        paymentMethod: activeTab.paymentMethod,
        bankId:
          activeTab.paymentMethod === 'card' || activeTab.paymentMethod === 'split'
            ? selectedBank?.id
            : undefined,
        bankName:
          activeTab.paymentMethod === 'card' || activeTab.paymentMethod === 'split'
            ? selectedBank?.bankName
            : undefined,
        cashAmount: splitCash,
        cardAmount: splitCard,
      };

      // Deduct inventory via BOM & calculate COGS
      const cogsAmount = await processOrderInventoryAndCOGS(newOrder);
      newOrder.cogsAmount = cogsAmount;

      const orderId = await db.orders.add(newOrder);
      const savedOrder: Order = { ...newOrder, id: orderId as number };

      // Automatically generate balanced double-entry accounting voucher
      const voucherLines: JournalLine[] = [];

      // Debit side (Settlement method)
      if (activeTab.paymentMethod === 'cash') {
        voucherLines.push({
          accountCode: '101',
          accountName: 'صندوق نقدی رستوران',
          debit: activeTabTotal,
          credit: 0,
          description: `دریافت نقدی فاکتور #${nextInvoiceNum}`,
        });
      } else if (activeTab.paymentMethod === 'credit') {
        voucherLines.push({
          accountCode: '103',
          accountName: 'حساب‌های دریافتنی (مشتریان و نسیه)',
          personName: name || phone || 'مشتری نسیه',
          debit: activeTabTotal,
          credit: 0,
          description: `فروش نسیه فاکتور #${nextInvoiceNum}`,
        });
      } else if (activeTab.paymentMethod === 'split') {
        if (splitCash > 0) {
          voucherLines.push({
            accountCode: '101',
            accountName: 'صندوق نقدی رستوران',
            debit: splitCash,
            credit: 0,
            description: `بخش نقدی فاکتور #${nextInvoiceNum}`,
          });
        }
        if (splitCard > 0) {
          voucherLines.push({
            accountCode: '102',
            accountName: 'موجودی بانک‌ها و کارتخوان‌ها',
            debit: splitCard,
            credit: 0,
            description: `بخش کارتخوان (${selectedBank?.bankName || ''}) فاکتور #${nextInvoiceNum}`,
          });
        }
      } else {
        voucherLines.push({
          accountCode: '102',
          accountName: 'موجودی بانک‌ها و کارتخوان‌ها',
          debit: activeTabTotal,
          credit: 0,
          description: `دریافت کارتخوان (${selectedBank?.bankName || ''}) فاکتور #${nextInvoiceNum}`,
        });
      }

      // Discount debit (contra-revenue)
      if (discountAmount > 0) {
        voucherLines.push({
          accountCode: '403',
          accountName: 'تخفیفات نقدی فروش',
          debit: discountAmount,
          credit: 0,
          description: `تخفیف فاکتور #${nextInvoiceNum}`,
        });
      }

      // Credit side (Revenue & Tax)
      if (activeTab.invoiceMode === 'self_service') {
        const selfServicePortion = clampedGuests * activeTab.selfServiceUnitPrice;
        voucherLines.push({
          accountCode: '402',
          accountName: 'درآمد فیش سلف سرویس و نوشابه',
          debit: 0,
          credit: selfServicePortion,
          description: `فیش سلف سرویس (${clampedGuests} نفر) #${nextInvoiceNum}`,
        });
        if (extraMenuSubtotal > 0) {
          voucherLines.push({
            accountCode: '401',
            accountName: 'درآمد فروش غذا و منو',
            debit: 0,
            credit: extraMenuSubtotal,
            description: `آیتم‌های اضافی فاکتور #${nextInvoiceNum}`,
          });
        }
      } else {
        voucherLines.push({
          accountCode: '401',
          accountName: 'درآمد فروش غذا و منو',
          debit: 0,
          credit: activeTabSubtotal,
          description: `فروش منو فاکتور #${nextInvoiceNum}`,
        });
      }

      if (taxAmount > 0) {
        voucherLines.push({
          accountCode: '203',
          accountName: 'مالیات بر ارزش افزوده پرداختنی',
          debit: 0,
          credit: taxAmount,
          description: `مالیات فاکتور #${nextInvoiceNum}`,
        });
      }

      // COGS & Inventory double entry
      if (cogsAmount > 0) {
        voucherLines.push({
          accountCode: '501',
          accountName: 'بهای تمام شده غذای فروش رفته (مصرف مواد و تولید)',
          debit: cogsAmount,
          credit: 0,
          description: `بهای تمام شده اتوماتیک فاکتور #${nextInvoiceNum}`,
        });
        voucherLines.push({
          accountCode: '105',
          accountName: 'موجودی مواد اولیه انبار',
          debit: 0,
          credit: cogsAmount,
          description: `خروج مواد اولیه مصرفی فاکتور #${nextInvoiceNum}`,
        });
      }

      await recordJournalVoucher({
        date: new Date(),
        description:
          activeTab.invoiceMode === 'self_service'
            ? `سند اتوماتیک فیش سلف سرویس #${nextInvoiceNum} (${clampedGuests} نفر)`
            : `سند اتوماتیک فروش فاکتور #${nextInvoiceNum}`,
        type: 'auto_sale',
        referenceId: nextInvoiceNum,
        bankId:
          activeTab.paymentMethod === 'card' || activeTab.paymentMethod === 'split'
            ? selectedBank?.id
            : undefined,
        bankName: selectedBank?.bankName,
        lines: voucherLines,
      });

      // Show immediate visual Receipt Preview modal (and let user trigger thermal print)
      setPreviewOrder(savedOrder);
      setOrderToPrint(savedOrder);

      // Reset tab
      updateActiveTab({
        customerPhone: '',
        customerName: '',
        customerSubscriptionCode: '',
        customerAddress: '',
        items: [],
        discountType: 'none',
        discountValue: 0,
        taxEnabled: settings?.taxEnabled ?? false,
        cashAmount: 0,
      });
      setShowCartOnMobile(false);
    } catch (err) {
      console.error('Error saving order', err);
    }
  };

  const handleCloseCashRegister = async () => {
    const todaySum = cashierStats.todaySummary;
    const actualCash =
      actualCashCounted.trim() !== ''
        ? Number(actualCashCounted)
        : todaySum.totalCash;
    const discrepancy = actualCash - todaySum.totalCash;

    await db.cashClosures.add({
      closedAt: new Date(),
      dateLabel: format(new Date(), 'yyyy/MM/dd HH:mm'),
      cashierName: cashierNameInput.trim() || 'صندوقدار شیفت',
      totalSales: todaySum.totalSales,
      orderCount: todaySum.orderCount,
      selfServiceCount: todaySum.selfServiceOrderCount,
      expectedCash: todaySum.totalCash,
      actualCash,
      cashDiscrepancy: discrepancy,
      totalCard: todaySum.totalCard,
      totalCredit: todaySum.totalCredit,
      bankBreakdown: todaySum.byBank,
      notes: closureNotes.trim(),
    });

    setClosureSuccessMsg('بستن صندوق پایان روز و تطبیق حساب بانک‌ها با موفقیت ثبت شد.');
    setTimeout(() => setClosureSuccessMsg(''), 4000);
  };

  return (
    <div className="flex-1 min-w-0 max-w-full flex flex-col h-full bg-slate-50 relative overflow-hidden">
      {/* Hidden Receipt for Thermal Printer */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }} className="print:block">
        {orderToPrint && settings && <Receipt ref={receiptRef} order={orderToPrint} settings={settings} />}
      </div>

      {/* Top Bar: Open Order Tabs + Live Cashier Summary Strip */}
      <div className="bg-white border-b border-slate-200 flex flex-wrap items-center justify-between px-3 pt-2 pb-1.5 gap-2 shrink-0 shadow-xs z-10">
        {/* Order Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {openTabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl cursor-pointer min-w-[130px] transition-colors border ${
                activeTabId === tab.id
                  ? 'bg-blue-50 text-blue-700 border-blue-200 font-bold'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span className="text-xs whitespace-nowrap">{tab.title}</span>
              <span className="bg-white px-1.5 py-0.5 rounded text-[11px] font-mono font-bold border border-slate-200">
                {tab.invoiceMode === 'self_service' ? `${tab.selfServiceGuests}نفر` : tab.items.length}
              </span>
              <button
                type="button"
                aria-label={`بستن ${tab.title}`}
                onClick={(e) => handleCloseTab(tab.id, e)}
                className="hover:bg-red-100 hover:text-red-600 rounded p-0.5 transition-colors"
              >
                <X size={13} />
              </button>
            </div>
          ))}
          <button
            type="button"
            aria-label="تب سفارش جدید"
            onClick={handleNewTab}
            className="flex items-center justify-center p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors shrink-0 border border-dashed border-blue-200"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* Live Daily / Weekly / Monthly Cashier Summary & Z-Report Button */}
        <div className="flex items-center gap-2 overflow-x-auto">
          <div className="hidden xl:flex items-center gap-4 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <div>
              <span className="text-slate-500 ml-1">فروش امروز:</span>
              <span className="font-bold text-slate-900 font-mono tabular-nums">
                {formatCurrency(cashierStats.todaySummary.totalSales)}
              </span>
            </div>
            <span className="text-slate-300">|</span>
            <div>
              <span className="text-slate-500 ml-1">این هفته:</span>
              <span className="font-bold text-slate-800 font-mono tabular-nums">
                {formatCurrency(cashierStats.weekSummary.totalSales)}
              </span>
            </div>
            <span className="text-slate-300">|</span>
            <div>
              <span className="text-slate-500 ml-1">این ماه:</span>
              <span className="font-bold text-blue-700 font-mono tabular-nums">
                {formatCurrency(cashierStats.monthSummary.totalSales)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowCashierModal(true)}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Lock size={14} />
            <span>گزارش صندوق و بستن حساب روزانه</span>
          </button>
        </div>
      </div>

      {/* Main Content Split */}
      <div className="flex-1 flex overflow-hidden min-w-0 max-w-full">
        {/* Left/Main Area: Menu Selection OR Self-Service Big Selector */}
        <div
          className={`flex-1 flex flex-col min-w-0 overflow-hidden ${
            showCartOnMobile ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Self-Service Quick Banner & Direct Checkout when in Mode 2 */}
          {activeTab.invoiceMode === 'self_service' ? (
            <div className="flex-1 p-4 md:p-6 overflow-y-auto space-y-4 max-w-4xl mx-auto w-full">
              <div className="bg-white border-2 border-teal-600 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Users className="text-teal-700" size={24} />
                      <h2 className="text-base md:text-lg font-extrabold text-slate-900">
                        صدور فیش سلف سرویس و دریافت نوشابه (حداکثر ۴ نفر)
                      </h2>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      تعداد نفرات را انتخاب کنید (سقف هر فیش ۴ نفر است). به ازای هر نفر ۱ عدد نوشابه و مجوز استفاده از بار سلف در فیش درج می‌شود.
                    </p>
                  </div>

                  {/* 1 to 4 Person Buttons */}
                  <div className="flex items-center gap-2 w-full md:w-auto">
                    {[1, 2, 3, 4].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => updateActiveTab({ selfServiceGuests: num })}
                        className={`flex-1 md:w-20 py-3 px-3 rounded-xl font-bold text-sm transition-all border flex flex-col items-center justify-center ${
                          activeTab.selfServiceGuests === num
                            ? 'bg-teal-600 text-white border-teal-700 shadow-sm scale-[1.02]'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-teal-50 hover:border-teal-300'
                        }`}
                      >
                        <span className="text-base font-black font-mono">{num} نفر</span>
                        <span className="text-[10px] opacity-85">{num} نوشابه</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      قیمت سلف و نوشابه به ازای هر نفر (تومان)
                    </label>
                    <input
                      type="number"
                      value={activeTab.selfServiceUnitPrice || ''}
                      onChange={(e) =>
                        updateActiveTab({ selfServiceUnitPrice: Math.max(0, Number(e.target.value)) })
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono font-bold text-left outline-none focus:ring-2 focus:ring-teal-600"
                      dir="ltr"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      شرح نوشیدنی و خدمات فیش سلف
                    </label>
                    <input
                      type="text"
                      value={activeTab.selfServiceDrinkNote || ''}
                      onChange={(e) => updateActiveTab({ selfServiceDrinkNote: e.target.value })}
                      placeholder="مثال: نوشابه قوطی + استفاده از بار سلف سرویس"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                </div>
              </div>

              {/* Navigation prompt to checkout panel on mobile screens only */}
              <div className="lg:hidden bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-right">
                  <span className="text-xs text-slate-500 block">مبلغ قابل پرداخت فیش سلف ({activeTab.selfServiceGuests} نفر):</span>
                  <span className="text-xl font-black text-teal-700 font-mono tabular-nums">
                    {formatCurrency(activeTabTotal)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCartOnMobile(true)}
                  className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer"
                >
                  <span>مرحله بعد: انتخاب بانک، تخفیف و تسویه</span>
                  <ArrowLeft size={16} />
                </button>
              </div>

              {/* Mobile floating bar for quick checkout */}
              {!showCartOnMobile && canCheckout && (
                <div className="lg:hidden p-3.5 bg-white border-t border-slate-200 flex justify-between items-center z-30 shrink-0 sticky bottom-0 shadow-lg rounded-2xl mt-4">
                  <div className="flex flex-col text-right">
                    <span className="text-[10px] text-slate-500">مبلغ قابل پرداخت:</span>
                    <span className="font-bold text-teal-700 text-base font-mono">
                      {formatCurrency(activeTabTotal)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCartOnMobile(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2"
                  >
                    <span>مشاهده فاکتور و تسویه</span>
                    <ArrowLeft size={15} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Search & Categories */}
              <div className="p-4 bg-white border-b border-slate-200 shrink-0 mt-2">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="text"
                      placeholder="جستجوی سریع نام غذا یا نوشیدنی..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pr-9 pl-4 py-2.5 bg-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                    />
                  </div>

                  {!searchQuery && (
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {categories?.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setActiveCategoryId(cat.id!)}
                          className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                            activeCategoryId === cat.id
                              ? 'bg-slate-900 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Menu Items Grid */}
              <div className="flex-1 p-4 overflow-y-auto">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
                  {displayedMenuItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleAddItem(item)}
                      className="bg-white rounded-2xl border border-slate-200 hover:border-blue-500 hover:shadow-md transition-all text-right flex flex-col h-44 overflow-hidden group"
                    >
                      <div className="h-24 w-full bg-slate-100 shrink-0">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300">
                            <Utensils size={28} />
                          </div>
                        )}
                      </div>
                      <div className="p-3 flex flex-col flex-1 w-full">
                        <span className="font-bold text-xs text-slate-800 line-clamp-2 leading-snug">
                          {item.name}
                        </span>
                        <span className="mt-auto text-blue-600 font-bold text-xs font-mono tabular-nums">
                          {formatCurrency(item.price)}
                        </span>
                      </div>
                    </button>
                  ))}
                  {displayedMenuItems.length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-400">
                      <ReceiptIcon size={44} className="mx-auto mb-3 opacity-20" />
                      <p className="text-sm">آیتمی در این دسته‌بندی یافت نشد.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Floating Mobile Cart summary bar */}
              {!showCartOnMobile && canCheckout && (
                <div className="lg:hidden p-3.5 bg-white border-t border-slate-200 flex justify-between items-center z-30 shrink-0">
                  <div className="flex flex-col text-right">
                    <span className="text-[10px] text-slate-500">مبلغ قابل پرداخت:</span>
                    <span className="font-bold text-blue-600 text-base font-mono">
                      {formatCurrency(activeTabTotal)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCartOnMobile(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2"
                  >
                    <span>مشاهده فاکتور و تسویه</span>
                    <ArrowLeft size={15} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Area: Cart, Mode Switch (Standard vs Self-Service), Payment Method & Bank Selection */}
        <div
          className={`w-full lg:w-[360px] xl:w-[390px] bg-white border-r border-slate-200 flex flex-col shrink-0 z-20 ${
            showCartOnMobile ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Header & Invoice Mode Switcher (Mode 1 vs Mode 2) */}
          <div className="p-3 border-b border-slate-200 shrink-0 space-y-2.5 bg-slate-50/60">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-extrabold text-slate-800">
                فاکتور فروش ({activeTab.title})
              </h2>
              <button
                type="button"
                onClick={() => setShowCartOnMobile(false)}
                className="lg:hidden bg-slate-200 hover:bg-slate-300 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1"
              >
                <ArrowRight size={13} />
                <span>منو</span>
              </button>
            </div>

            {/* Mode Lock Notice */}
            {modeLockNotice && (
              <div className="p-2 bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-bold rounded-lg flex items-center gap-1.5 animate-pulse">
                <Lock size={14} className="text-amber-700 shrink-0" />
                <span>{modeLockNotice}</span>
              </div>
            )}

            {/* Dual Invoice Mode Selector */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-200/80 rounded-xl relative">
              <button
                type="button"
                onClick={() => {
                  if (settings?.lockSelfServiceMode) {
                    setModeLockNotice('حالت صندوق از بخش تنظیمات بر روی «سلف سرویس» قفل شده است.');
                    setTimeout(() => setModeLockNotice(null), 4000);
                  } else {
                    updateActiveTab({ invoiceMode: 'standard' });
                  }
                }}
                className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all whitespace-nowrap ${
                  activeTab.invoiceMode === 'standard'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 opacity-80'
                }`}
              >
                <Utensils size={14} />
                <span>۱. فاکتور منو</span>
                {settings?.lockSelfServiceMode && <Lock size={12} className="text-amber-600" />}
              </button>
              <button
                type="button"
                onClick={() =>
                  updateActiveTab({
                    invoiceMode: 'self_service',
                    selfServiceGuests: clampSelfServiceGuests(activeTab.selfServiceGuests),
                  })
                }
                className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all whitespace-nowrap ${
                  activeTab.invoiceMode === 'self_service'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users size={14} />
                <span>۲. فیش سلف سرویس</span>
                {settings?.lockSelfServiceMode && (
                  <span className="text-[9px] bg-teal-800 text-teal-100 px-1 rounded font-bold">قفل</span>
                )}
              </button>
            </div>

            {/* Customer Phone Input */}
            <div className="relative">
              <input
                type="text"
                placeholder={`موبایل یا اشتراک مشتری ${
                  settings?.requireCustomerPhone ? '(اجباری)' : '(اختیاری)'
                }`}
                value={activeTab.customerPhone}
                onChange={(e) => {
                  updateActiveTab({ customerPhone: e.target.value });
                  setShowCustomerDropdown(true);
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                className={`w-full px-3 py-1.5 bg-white border ${
                  settings?.requireCustomerPhone && !activeTab.customerPhone
                    ? 'border-red-300 focus:ring-red-500'
                    : 'border-slate-200 focus:ring-blue-500'
                } rounded-lg outline-none focus:ring-2 transition-all text-left font-mono text-xs`}
                dir="ltr"
              />

              {showCustomerDropdown && matchingCustomers.length > 0 && (
                <div className="absolute right-0 left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-44 overflow-y-auto divide-y divide-slate-100">
                  {matchingCustomers.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => {
                        updateActiveTab({
                          customerPhone: customer.phone,
                          customerName: customer.name,
                          customerSubscriptionCode: customer.subscriptionCode,
                          customerAddress: customer.address,
                        });
                        setShowCustomerDropdown(false);
                      }}
                      className="w-full text-right px-3 py-2 hover:bg-slate-50 transition-colors flex flex-col gap-0.5"
                    >
                      <div className="flex justify-between items-center w-full">
                        <span className="font-bold text-slate-800 text-xs">
                          {customer.name || 'مشتری بدون نام'}
                        </span>
                        {customer.subscriptionCode && (
                          <span className="text-amber-700 text-[10px] font-bold">
                            اشتراک: {customer.subscriptionCode}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono flex justify-between">
                        <span>{customer.phone}</span>
                        {customer.address && (
                          <span className="truncate max-w-[140px] text-slate-500">
                            {customer.address}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {activeTab.customerPhone.trim() && (
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  placeholder="نام مشتری"
                  value={activeTab.customerName || ''}
                  onChange={(e) => updateActiveTab({ customerName: e.target.value })}
                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs text-right"
                />
                <input
                  type="text"
                  placeholder="آدرس بیرون‌بر"
                  value={activeTab.customerAddress || ''}
                  onChange={(e) => updateActiveTab({ customerAddress: e.target.value })}
                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs text-right"
                />
              </div>
            )}
          </div>

          {/* Cart Items & Self-Service Summary Card */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {/* Self-Service Line Card inside Cart */}
            {activeTab.invoiceMode === 'self_service' && (
              <div className="bg-teal-50/70 border border-teal-200 p-3 rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-extrabold text-teal-900 text-xs">
                    فیش سلف سرویس و نوشابه (سقف ۴ نفر)
                  </span>
                  <span className="text-xs font-mono font-black text-teal-800">
                    {activeTab.selfServiceGuests} نفر
                  </span>
                </div>

                {/* Compact 1..4 selector inside cart too */}
                <div className="grid grid-cols-4 gap-1">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => updateActiveTab({ selfServiceGuests: n })}
                      className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        activeTab.selfServiceGuests === n
                          ? 'bg-teal-600 text-white'
                          : 'bg-white text-slate-700 border border-teal-200 hover:bg-teal-100'
                      }`}
                    >
                      {n} نفر
                    </button>
                  ))}
                </div>

                <div className="flex justify-between items-center text-[11px] text-teal-800 pt-1 border-t border-teal-200/60">
                  <span>سهمیه نوشابه: {activeTab.selfServiceGuests} عدد</span>
                  <span className="font-bold font-mono">
                    {formatCurrency(selfServiceCalc.selfServiceTotal)}
                  </span>
                </div>
              </div>
            )}

            {/* Menu Items in Cart */}
            {activeTab.items.map((item) => (
              <div key={item.menuItemId} className="bg-slate-50 border border-slate-200/80 p-2.5 rounded-xl">
                <div className="flex justify-between items-start gap-1.5 mb-1">
                  <span className="font-bold text-slate-800 text-xs leading-tight flex-1">
                    {item.name}
                  </span>
                  <button
                    type="button"
                    aria-label={`حذف ${item.name}`}
                    onClick={() => handleRemoveItem(item.menuItemId)}
                    className="text-slate-400 hover:text-red-500 p-0.5 shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    {editingPriceId === item.menuItemId ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={tempPrice}
                          onChange={(e) => setTempPrice(e.target.value)}
                          className="w-20 px-1.5 py-0.5 text-xs border border-slate-300 rounded outline-none font-mono"
                          autoFocus
                          dir="ltr"
                          onKeyDown={(e) => e.key === 'Enter' && handleSavePrice(item.menuItemId)}
                        />
                        <button
                          type="button"
                          onClick={() => handleSavePrice(item.menuItemId)}
                          className="p-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200"
                        >
                          <Check size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 group">
                        <span className="text-blue-600 font-semibold text-xs font-mono">
                          {formatCurrency(item.price)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleStartPriceEdit(item)}
                          className="p-0.5 text-slate-400 hover:text-blue-600 rounded"
                          title="ویرایش فی"
                        >
                          <Edit3 size={11} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 bg-white rounded-lg border border-slate-200 p-0.5">
                    <button
                      type="button"
                      onClick={() => handleAdjustQuantity(item.menuItemId, -1)}
                      className="w-6 h-6 flex items-center justify-center rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                    >
                      <Minus size={11} />
                    </button>
                    <span className="font-bold text-xs w-5 text-center font-mono">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAdjustQuantity(item.menuItemId, 1)}
                      className="w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-900 text-white"
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {activeTab.invoiceMode === 'standard' && activeTab.items.length === 0 && (
              <div className="flex flex-col items-center justify-center h-36 text-slate-400 py-6">
                <ReceiptIcon size={36} className="mb-2 opacity-30" />
                <p className="text-xs">آیتمی از منو انتخاب نشده است.</p>
              </div>
            )}
          </div>

          {/* Payment Method & Bank POS Selection + Tax/Discount */}
          <div className="px-3 py-2.5 bg-slate-50 border-t border-slate-200 shrink-0 space-y-2">
            {/* Payment Method (نحوه تسویه و انتخاب بانک کارتخوان) */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] font-bold text-slate-700">نحوه تسویه صندوق:</span>
                {activeTab.paymentMethod === 'card' || activeTab.paymentMethod === 'split' ? (
                  <span className="text-[10px] text-blue-700 font-semibold">
                    ثبت سند اتوماتیک در بانک انتخابی
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { id: 'card', label: 'کارتخوان' },
                  { id: 'cash', label: 'نقدی' },
                  { id: 'split', label: 'ترکیبی' },
                  { id: 'credit', label: 'نسیه' },
                ].map((pm) => (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => updateActiveTab({ paymentMethod: pm.id as any })}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-all whitespace-nowrap ${
                      activeTab.paymentMethod === pm.id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {pm.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bank Account Selector when Card or Split is active */}
            {(activeTab.paymentMethod === 'card' || activeTab.paymentMethod === 'split') && (
              <div className="flex items-center gap-2">
                <Building2 size={14} className="text-blue-600 shrink-0" />
                <select
                  aria-label="انتخاب بانک کارتخوان"
                  value={activeTab.bankId || defaultBank?.id || ''}
                  onChange={(e) => updateActiveTab({ bankId: Number(e.target.value) })}
                  className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-bold text-slate-800 outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {activeBanks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bankName} ({b.cardNumber})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Split Cash input */}
            {activeTab.paymentMethod === 'split' && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-600 whitespace-nowrap">سهم نقد (تومان):</span>
                <input
                  type="number"
                  value={activeTab.cashAmount || ''}
                  onChange={(e) => updateActiveTab({ cashAmount: Number(e.target.value) })}
                  placeholder="مبلغ نقد..."
                  className="flex-1 px-2 py-1 bg-white border border-slate-300 rounded-lg font-mono text-left"
                  dir="ltr"
                />
                <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">
                  کارت: {formatCurrency(Math.max(0, activeTabTotal - (activeTab.cashAmount || 0)))}
                </span>
              </div>
            )}

            {/* Tax & Discount Row */}
            <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-200/70">
              <button
                type="button"
                onClick={() => updateActiveTab({ taxEnabled: !activeTab.taxEnabled })}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border shrink-0 ${
                  activeTab.taxEnabled
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
                }`}
              >
                <span>مالیات ({settings?.taxPercentage || 0}%)</span>
              </button>

              <div className="flex items-center gap-1 flex-1 justify-end">
                <select
                  aria-label="نوع تخفیف"
                  value={activeTab.discountType}
                  onChange={(e) =>
                    updateActiveTab({ discountType: e.target.value as any, discountValue: 0 })
                  }
                  className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg outline-none font-medium text-slate-700"
                >
                  <option value="none">تخفیف: ندارد</option>
                  <option value="percent">تخفیف درصدی (%)</option>
                  <option value="amount">تخفیف مبلغی</option>
                </select>

                {activeTab.discountType !== 'none' && (
                  <input
                    type="number"
                    value={activeTab.discountValue || ''}
                    onChange={(e) => updateActiveTab({ discountValue: Number(e.target.value) })}
                    className="w-20 px-1.5 py-1 text-xs bg-white border border-slate-300 rounded-lg outline-none text-left font-mono font-bold"
                    dir="ltr"
                    placeholder={activeTab.discountType === 'percent' ? '%' : 'مبلغ'}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Checkout Block */}
          <div className="p-3 bg-white border-t border-slate-200 shrink-0 z-10 space-y-2">
            <div className="space-y-1 text-xs text-slate-600">
              <div className="flex justify-between items-center">
                <span>جمع کل:</span>
                <span className="font-semibold text-slate-800 font-mono tabular-nums">
                  {formatCurrency(activeTabSubtotal)}
                </span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between items-center text-emerald-600 font-medium">
                  <span>تخفیف:</span>
                  <span className="font-mono">-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              {taxAmount > 0 && (
                <div className="flex justify-between items-center text-rose-600 font-medium">
                  <span>مالیات ({settings?.taxPercentage || 0}%):</span>
                  <span className="font-mono">+{formatCurrency(taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-1.5 border-t border-slate-100">
                <span className="text-slate-900 font-bold text-sm">قابل پرداخت:</span>
                <span className="text-lg font-black text-blue-600 font-mono tabular-nums">
                  {formatCurrency(activeTabTotal)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCheckout}
              disabled={!canCheckout}
              className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-xs text-white disabled:bg-slate-300 disabled:cursor-not-allowed ${
                activeTab.invoiceMode === 'self_service'
                  ? 'bg-teal-600 hover:bg-teal-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <CreditCard size={18} />
              <span>
                {activeTab.invoiceMode === 'self_service'
                  ? `ثبت و صدور فیش سلف سرویس (${activeTab.selfServiceGuests} نفر)`
                  : 'ثبت فاکتور، سند حسابداری و چاپ فیش'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Receipt Preview & Print Modal */}
      {previewOrder && settings && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
                <CheckCircle2 size={18} />
                <span>فاکتور #{previewOrder.invoiceNumber} و سند حسابداری ثبت شد</span>
              </div>
              <button
                type="button"
                aria-label="بستن پیش‌نمایش فیش"
                onClick={() => setPreviewOrder(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto my-3 p-3 bg-slate-100 rounded-xl border border-slate-200">
              <Receipt order={previewOrder} settings={settings} />
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setOrderToPrint(previewOrder);
                  setTimeout(() => handlePrint(), 100);
                }}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <Printer size={16} />
                <span>چاپ روی فیش‌پرینتر</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewOrder(null)}
                className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold text-xs"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cashier Z-Report & End-of-Day Register Closure Modal */}
      {showCashierModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden">
            <div className="flex justify-between items-center pb-4 border-b border-slate-200 shrink-0">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">
                  مدیریت صندوق، تفکیک کارتخوان بانک‌ها و بستن حساب پایان روز
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  بررسی جمع فروش روزانه، هفتگی و ماهانه به تفکیک نقد، نسیه و هر بانک کارتخوان
                </p>
              </div>
              <button
                type="button"
                aria-label="بستن پنجره گزارش صندوق"
                onClick={() => setShowCashierModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl border border-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-6">
              {/* Top Period Summary Cards (Today / Week / Month) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  {
                    id: 'today',
                    title: 'جمع فروش امروز',
                    sum: cashierStats.todaySummary,
                  },
                  {
                    id: 'week',
                    title: 'جمع فروش این هفته',
                    sum: cashierStats.weekSummary,
                  },
                  {
                    id: 'month',
                    title: 'جمع فروش این ماه',
                    sum: cashierStats.monthSummary,
                  },
                ].map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setCashierPeriod(card.id as any)}
                    className={`p-4 rounded-xl border text-right transition-all ${
                      cashierPeriod === card.id
                        ? 'bg-blue-50/70 border-blue-500 shadow-xs'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex justify-between items-center text-xs text-slate-500 mb-1">
                      <span className="font-bold text-slate-700">{card.title}</span>
                      <span>{card.sum.orderCount} فاکتور</span>
                    </div>
                    <div className="text-xl font-black text-slate-900 font-mono tabular-nums">
                      {formatCurrency(card.sum.totalSales)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 flex justify-between">
                      <span>عادی: {card.sum.standardOrderCount}</span>
                      <span>سلف سرویس: {card.sum.selfServiceOrderCount}</span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Breakdown by Payment Method & By Bank for Selected Period */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2">
                    تفکیک نحوه تسویه ({cashierPeriod === 'today' ? 'امروز' : cashierPeriod === 'week' ? 'این هفته' : 'این ماه'})
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center py-1.5 px-3 bg-white rounded-lg border border-slate-200">
                      <span className="font-semibold text-slate-700">دریافتی نقدی (صندوق):</span>
                      <span className="font-bold font-mono text-emerald-700">
                        {formatCurrency(selectedPeriodSummary.totalCash)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 px-3 bg-white rounded-lg border border-slate-200">
                      <span className="font-semibold text-slate-700">مجموع کارتخوان‌ها (پوز بانکی):</span>
                      <span className="font-bold font-mono text-blue-700">
                        {formatCurrency(selectedPeriodSummary.totalCard)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 px-3 bg-white rounded-lg border border-slate-200">
                      <span className="font-semibold text-slate-700">فروش نسیه / اعتباری:</span>
                      <span className="font-bold font-mono text-amber-700">
                        {formatCurrency(selectedPeriodSummary.totalCredit)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bank-by-Bank POS Breakdown */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2">
                    جمع کارت کشیده شده به تفکیک هر بانک
                  </h3>
                  <div className="space-y-2 text-xs">
                    {selectedPeriodSummary.byBank.map((b) => (
                      <div
                        key={b.bankId}
                        className="flex justify-between items-center py-2 px-3 bg-white rounded-lg border border-slate-200"
                      >
                        <div>
                          <span className="font-bold text-slate-800">{b.bankName}</span>
                          <span className="text-[10px] text-slate-500 mr-2">
                            ({b.txCount} تراکنش)
                          </span>
                        </div>
                        <span className="font-black font-mono text-blue-700 tabular-nums">
                          {formatCurrency(b.amount)}
                        </span>
                      </div>
                    ))}
                    {selectedPeriodSummary.byBank.length === 0 && (
                      <p className="text-slate-400 text-center py-4">
                        تراکنش کارتخوانی در این بازه ثبت نشده است.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* End of Day Register Closure Form */}
              <div className="bg-white p-4 rounded-xl border-2 border-slate-800 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-extrabold text-slate-900">
                    بستن صندوق در پایان روز (تطبیق موجودی نقدی و رسید پوز بانک‌ها)
                  </h3>
                  <span className="text-xs font-mono text-slate-500">
                    تاریخ: {format(new Date(), 'yyyy/MM/dd')}
                  </span>
                </div>

                {closureSuccessMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold">
                    {closureSuccessMsg}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">نام صندوقدار شیفت</label>
                    <input
                      type="text"
                      value={cashierNameInput}
                      onChange={(e) => setCashierNameInput(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      موجودی نقد شمارش شده در کشو (تومان)
                    </label>
                    <input
                      type="number"
                      placeholder={`مورد انتظار سیستم: ${cashierStats.todaySummary.totalCash}`}
                      value={actualCashCounted}
                      onChange={(e) => setActualCashCounted(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-left"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">توضیحات بستن صندوق</label>
                    <input
                      type="text"
                      placeholder="مثال: رسید پوز بانک ملت و سامان تطبیق داده شد"
                      value={closureNotes}
                      onChange={(e) => setClosureNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleCloseCashRegister}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-2"
                  >
                    <CheckCircle2 size={16} />
                    <span>تأیید و ثبت بستن صندوق پایان روز</span>
                  </button>
                </div>
              </div>

              {/* History of Closed Shifts */}
              {cashClosures.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700">سوابق بستن صندوق روزهای گذشته:</h4>
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3">زمان بستن</th>
                          <th className="py-2 px-3">صندوقدار</th>
                          <th className="py-2 px-3">فروش کل</th>
                          <th className="py-2 px-3">نقد شمارش شده</th>
                          <th className="py-2 px-3">جمع کارتخوان‌ها</th>
                          <th className="py-2 px-3">تفکیک بانک‌ها</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {cashClosures.slice(0, 5).map((cl) => (
                          <tr key={cl.id}>
                            <td className="py-2 px-3 font-mono" dir="ltr">
                              {cl.dateLabel}
                            </td>
                            <td className="py-2 px-3 font-bold">{cl.cashierName}</td>
                            <td className="py-2 px-3 font-mono font-bold">
                              {formatCurrency(cl.totalSales)}
                            </td>
                            <td className="py-2 px-3 font-mono">
                              {formatCurrency(cl.actualCash)}
                            </td>
                            <td className="py-2 px-3 font-mono text-blue-700">
                              {formatCurrency(cl.totalCard)}
                            </td>
                            <td className="py-2 px-3">
                              {cl.bankBreakdown
                                ?.map((b) => `${b.bankName}: ${formatCurrency(b.amount)}`)
                                .join(' | ') || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
