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
  getDefaultQuickBeverages,
  QuickBeverageOption,
} from '../../lib/db';
import {
  clampSelfServiceGuests,
  calculateSelfServiceInvoice,
  summarizeCashierSettlements,
  JournalLine,
} from '../../lib/accountingEngine';
import { formatCurrency, getCurrencyLabel, setGlobalCurrencyUnit } from '../../lib/utils';
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
  History,
  FileText,
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { Receipt } from './Receipt';
import InvoiceEditDeleteModal from '../Common/InvoiceEditDeleteModal';
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
  selfServiceGuests: number; // 1, 2, 3, 4 or any custom higher count
  selfServiceHalfPriceGuests: number; // تعداد نفرات نیم‌بها / کودکان
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

interface POSScreenProps {
  key?: React.Key;
  canEditInvoice?: boolean;
  canDeleteInvoice?: boolean;
}

export default function POSScreen({
  canEditInvoice = true,
  canDeleteInvoice = true,
}: POSScreenProps) {
  const categories = useLiveQuery(() => db.categories.toArray());
  const allMenuItems = useLiveQuery(() => db.menuItems.toArray());
  const settings = useLiveQuery(() => db.settings.toCollection().first());
  if (settings?.currencyUnit) {
    setGlobalCurrencyUnit(settings.currencyUnit);
  }
  const currencyLabel = getCurrencyLabel(settings?.currencyUnit);
  const isRial = settings?.currencyUnit === 'rial';
  const defaultSodaPrice = settings?.defaultSodaPrice ?? (isRial ? 150000 : 15000);
  const defaultDoughPrice = settings?.defaultDoughPrice ?? (isRial ? 150000 : 15000);
  const defaultWaterPrice = settings?.defaultWaterPrice ?? (isRial ? 100000 : 10000);
  const defaultDelsterPrice = settings?.defaultDelsterPrice ?? (isRial ? 200000 : 20000);

  const quickBeveragesList = useMemo(() => {
    if (settings?.quickBeverages && settings.quickBeverages.length > 0) {
      return settings.quickBeverages.filter((b) => b.isActive !== false);
    }
    return getDefaultQuickBeverages(settings?.currencyUnit || 'toman');
  }, [settings?.quickBeverages, settings?.currencyUnit]);

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
      selfServiceGuests: 0,
      selfServiceHalfPriceGuests: 0,
      selfServiceUnitPrice: 0,
      selfServiceDrinkNote: '',
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
  const [lastPrintedOrder, setLastPrintedOrder] = useState<Order | null>(null);
  const [autoPrintNotice, setAutoPrintNotice] = useState<string | null>(null);

  // Cashier Daily/Weekly/Monthly Report & Close Register Modal
  const [showCashierModal, setShowCashierModal] = useState(false);
  const [cashierPeriod, setCashierPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [actualCashCounted, setActualCashCounted] = useState<string>('');
  const [cashierNameInput, setCashierNameInput] = useState<string>('صندوقدار شیفت');
  const [closureNotes, setClosureNotes] = useState<string>('');
  const [closureSuccessMsg, setClosureSuccessMsg] = useState<string>('');

  // Recent Sales & Instant Reprint Modal State
  const [showRecentOrdersModal, setShowRecentOrdersModal] = useState(false);
  const [recentOrderSearch, setRecentOrderSearch] = useState('');
  const [recentOrderTypeFilter, setRecentOrderTypeFilter] = useState<'all' | 'self_service' | 'standard'>('all');
  const [orderToEditDelete, setOrderToEditDelete] = useState<Order | null>(null);

  const todayOrders = useMemo(() => {
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    return allOrders
      .filter((o) => {
        if (!o || !o.createdAt) return false;
        try {
          const d = new Date(o.createdAt);
          if (isNaN(d.getTime())) return false;
          return isWithinInterval(d, { start: todayStart, end: todayEnd });
        } catch {
          return false;
        }
      })
      .sort((a, b) => (b.invoiceNumber || 0) - (a.invoiceNumber || 0));
  }, [allOrders]);

  const todaySalesTotal = useMemo(() => {
    return todayOrders.reduce((sum, o) => sum + (o.finalAmount || 0), 0);
  }, [todayOrders]);

  const selfServiceOrdersCount = useMemo(() => {
    return todayOrders.filter((o) => o.invoiceMode === 'self_service').length;
  }, [todayOrders]);

  const standardOrdersCount = useMemo(() => {
    return todayOrders.filter((o) => o.invoiceMode !== 'self_service').length;
  }, [todayOrders]);

  const filteredRecentOrders = useMemo(() => {
    return todayOrders.filter((o) => {
      if (recentOrderTypeFilter === 'self_service' && o.invoiceMode !== 'self_service') return false;
      if (recentOrderTypeFilter === 'standard' && o.invoiceMode === 'self_service') return false;
      if (!recentOrderSearch.trim()) return true;
      const q = recentOrderSearch.trim().toLowerCase();
      const numMatch = String(o.invoiceNumber).includes(q);
      const custMatch =
        (o.customerName || '').toLowerCase().includes(q) ||
        (o.customerPhone || '').includes(q) ||
        (o.table || '').toLowerCase().includes(q);
      return numMatch || custMatch;
    });
  }, [todayOrders, recentOrderTypeFilter, recentOrderSearch]);

  const activeTab = openTabs.find((t) => t.id === activeTabId) || openTabs[0];

  // Sync default settings & default bank into initial tab
  useEffect(() => {
    if (settings || defaultBank) {
      const defaultMode = settings?.defaultInvoiceMode || 'self_service';
      setOpenTabs((prev) =>
        prev.map((tab) => ({
          ...tab,
          invoiceMode: settings?.lockSelfServiceMode ? 'self_service' : (tab.invoiceMode || defaultMode),
          selfServiceUnitPrice: settings?.selfServicePricePerPerson ?? 0,
          selfServiceGuests:
            tab.selfServiceGuests === 0 && (settings?.selfServicePricePerPerson ?? 0) > 0
              ? 1
              : tab.selfServiceGuests,
          selfServiceDrinkNote: tab.selfServiceDrinkNote || settings?.selfServiceTitle || '',
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
      halfPriceGuestCount: activeTab.selfServiceHalfPriceGuests || 0,
      pricePerPerson: activeTab.selfServiceUnitPrice,
      extraItemsSubtotal: extraMenuSubtotal,
      discountType: activeTab.discountType,
      discountValue: activeTab.discountValue,
      taxEnabled: activeTab.taxEnabled,
      taxPercentage: settings?.taxPercentage || 0,
    });
  }, [
    activeTab.selfServiceGuests,
    activeTab.selfServiceHalfPriceGuests,
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
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekStart = startOfWeek(now);
    const weekEnd = endOfWeek(now);
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const isDateInInterval = (dateVal: any, start: Date, end: Date) => {
      if (!dateVal) return false;
      try {
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return false;
        return isWithinInterval(d, { start, end });
      } catch {
        return false;
      }
    };

    const todayOrders = allOrders.filter(
      (o) => o && o.status === 'paid' && isDateInInterval(o.createdAt, todayStart, todayEnd)
    );
    const weekOrders = allOrders.filter(
      (o) => o && o.status === 'paid' && isDateInInterval(o.createdAt, weekStart, weekEnd)
    );
    const monthOrders = allOrders.filter(
      (o) => o && o.status === 'paid' && isDateInInterval(o.createdAt, monthStart, monthEnd)
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
    onPrintError: (errorLocation, error) => {
      console.warn('Receipt print notice:', errorLocation, error);
    },
    onAfterPrint: () => {
      // Keep orderToPrint for a moment to prevent sudden unmount flicker
      setTimeout(() => setOrderToPrint(null), 500);
    },
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

  const triggerInstantPrint = (order: Order) => {
    if (!order) return;
    try {
      setOrderToPrint(order);
      setLastPrintedOrder(order);
      setAutoPrintNotice(`فیش #${order.invoiceNumber || ''} در حال ارسال به پرینتر...`);

      // Ensure the component has mounted in the hidden print wrapper
      requestAnimationFrame(() => {
        setTimeout(() => {
          try {
            handlePrint();
            setAutoPrintNotice(`فیش #${order.invoiceNumber || ''} با موفقیت چاپ شد.`);
            setTimeout(() => setAutoPrintNotice(null), 4000);
          } catch (err) {
            console.warn('Instant print trigger caught:', err);
          }
        }, 120);
      });
    } catch (err) {
      console.error('Trigger print failed:', err);
    }
  };


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
    const unitPrice = settings?.selfServicePricePerPerson ?? 0;
    setOpenTabs([
      ...openTabs,
      {
        id: newId,
        title: `سفارش ${openTabs.length + 1}`,
        invoiceMode: defaultInvoiceMode,
        selfServiceGuests: unitPrice > 0 ? 1 : 0,
        selfServiceHalfPriceGuests: 0,
        selfServiceUnitPrice: unitPrice,
        selfServiceDrinkNote: settings?.selfServiceTitle || '',
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
    const unitPrice = settings?.selfServicePricePerPerson ?? 0;
    if (openTabs.length === 1) {
      setOpenTabs([
        {
          id: Date.now().toString(),
          title: 'سفارش 1',
          invoiceMode: defaultInvoiceMode,
          selfServiceGuests: unitPrice > 0 ? 1 : 0,
          selfServiceHalfPriceGuests: 0,
          selfServiceUnitPrice: unitPrice,
          selfServiceDrinkNote: settings?.selfServiceTitle || '',
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

  const handleAddQuickBeverage = (drinkName: string, defaultPrice: number = 15000) => {
    const matched = allMenuItems?.find(
      (i) => i.name.trim() === drinkName.trim() || i.name.includes(drinkName)
    );
    const menuItemId =
      matched?.id ||
      100000 + Math.abs(drinkName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0));
    const price = matched?.price ?? defaultPrice;

    const existingItem = activeTab.items.find(
      (i) => i.menuItemId === menuItemId || i.name === drinkName
    );
    if (existingItem) {
      updateActiveTab({
        items: activeTab.items.map((i) =>
          i.menuItemId === existingItem.menuItemId ? { ...i, quantity: i.quantity + 1 } : i
        ),
      });
    } else {
      updateActiveTab({
        items: [
          ...activeTab.items,
          {
            menuItemId,
            name: matched?.name || drinkName,
            price,
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
      ? ((activeTab.selfServiceGuests >= 1 || (activeTab.selfServiceHalfPriceGuests || 0) >= 1) &&
          activeTab.selfServiceUnitPrice > 0) ||
        activeTab.items.length > 0
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

      // Build final items list (for self-service mode, include the self-service line item + half-price line item + any extra items)
      const clampedGuests = Math.max(0, Math.floor(Number(activeTab.selfServiceGuests) || 0));
      const halfGuests = Math.max(0, Math.floor(Number(activeTab.selfServiceHalfPriceGuests) || 0));
      const halfUnitPrice = Math.round(activeTab.selfServiceUnitPrice / 2);

      const finalItems: OrderItem[] =
        activeTab.invoiceMode === 'self_service'
          ? [
              ...(clampedGuests > 0
                ? [
                    {
                      menuItemId: -1,
                      name: `${settings?.selfServiceTitle || 'ورودی بار سلف سرویس + نوشابه'} (${clampedGuests} نفر تمام‌بها)`,
                      price: activeTab.selfServiceUnitPrice,
                      quantity: clampedGuests,
                    },
                  ]
                : []),
              ...(halfGuests > 0
                ? [
                    {
                      menuItemId: -2,
                      name: `ورودی نیم‌بها / کودکان (${halfGuests} نفر)`,
                      price: halfUnitPrice,
                      quantity: halfGuests,
                    },
                  ]
                : []),
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

      const isSelfServiceTicketIncluded =
        activeTab.invoiceMode === 'self_service' && (clampedGuests > 0 || halfGuests > 0);

      const newOrder: Order = {
        invoiceNumber: nextInvoiceNum,
        createdAt: new Date(),
        customerPhone: phone,
        customerName:
          name ||
          (activeTab.invoiceMode === 'self_service'
            ? isSelfServiceTicketIncluded
              ? 'مهمان سلف سرویس'
              : 'فروش نوشیدنی / متفرقه'
            : ''),
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
          activeTab.invoiceMode === 'self_service' && clampedGuests > 0 ? clampedGuests : 0,
        selfServiceUnitPrice:
          isSelfServiceTicketIncluded ? activeTab.selfServiceUnitPrice : undefined,
        selfServiceHalfPriceGuests:
          activeTab.invoiceMode === 'self_service' && halfGuests > 0 ? halfGuests : undefined,
        selfServiceHalfPriceUnitPrice:
          activeTab.invoiceMode === 'self_service' && halfGuests > 0 ? halfUnitPrice : undefined,
        selfServiceDrinkNote:
          isSelfServiceTicketIncluded ? activeTab.selfServiceDrinkNote : undefined,
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

      // Trigger instant automatic thermal printing without opening the preview modal
      if (settings?.autoPrintReceipt !== false) {
        triggerInstantPrint(savedOrder);
      }

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

      {/* Non-blocking Instant Print Confirmation Strip */}
      {autoPrintNotice && lastPrintedOrder && (
        <div className="bg-emerald-600 text-white px-4 py-2 flex items-center justify-between gap-3 text-xs font-bold shrink-0 z-20 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{autoPrintNotice}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (lastPrintedOrder) triggerInstantPrint(lastPrintedOrder);
              }}
              className="px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center gap-1 cursor-pointer transition"
            >
              <Printer size={13} />
              <span>چاپ مجدد</span>
            </button>
            <button
              type="button"
              onClick={() => setPreviewOrder(lastPrintedOrder)}
              className="px-2.5 py-1 rounded-lg bg-white text-emerald-800 hover:bg-emerald-50 flex items-center gap-1 cursor-pointer transition"
            >
              <Eye size={13} />
              <span>مشاهده فیش</span>
            </button>
            <button
              type="button"
              onClick={() => setAutoPrintNotice(null)}
              className="p-1 rounded-lg hover:bg-white/20 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Top Bar: Open Order Tabs + Live Cashier Summary Strip */}
      <div className="bg-white border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between px-2.5 sm:px-3 pt-1.5 pb-1.5 gap-1.5 shrink-0 shadow-xs z-10">
        <div className="flex items-center justify-between gap-2 w-full sm:w-auto">
          {/* Order Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1">
            {openTabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl cursor-pointer shrink-0 transition-colors border ${
                  activeTabId === tab.id
                    ? 'bg-blue-50 text-blue-700 border-blue-200 font-bold'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span className="text-xs whitespace-nowrap">{tab.title}</span>
                <span className="bg-white px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border border-slate-200">
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
              className="flex items-center justify-center p-1.5 sm:p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors shrink-0 border border-dashed border-blue-200"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Mobile Quick Action Buttons */}
          <div className="flex sm:hidden items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setShowRecentOrdersModal(true)}
              className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-xl text-[11px] font-bold flex items-center gap-1 shadow-xs"
            >
              <History size={13} />
              <span>فیش‌ها ({todayOrders.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setShowCashierModal(true)}
              className="px-2.5 py-1.5 bg-slate-900 text-white rounded-xl text-[11px] font-bold flex items-center gap-1"
            >
              <Lock size={13} />
              <span>صندوق</span>
            </button>
          </div>
        </div>

        {/* Live Daily / Weekly / Monthly Cashier Summary & Z-Report Button (Tablet/Desktop) */}
        <div className="hidden sm:flex items-center gap-2 overflow-x-auto">
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
            onClick={() => setShowRecentOrdersModal(true)}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-xs cursor-pointer shrink-0"
          >
            <History size={14} />
            <span>فروش‌های امروز و چاپ مجدد ({todayOrders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCashierModal(true)}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Lock size={14} />
            <span>گزارش صندوق و بستن حساب روزانه</span>
          </button>
        </div>

        {/* Mobile Segmented Switcher: Selection vs Invoice/Checkout */}
        <div className="grid lg:hidden grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl w-full">
          <button
            type="button"
            onClick={() => setShowCartOnMobile(false)}
            className={`py-1.5 px-2 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              !showCartOnMobile
                ? 'bg-teal-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Utensils size={14} />
            <span>۱. انتخاب نفرات و نوشیدنی</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCartOnMobile(true)}
            className={`py-1.5 px-2 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              showCartOnMobile
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <ReceiptIcon size={14} />
            <span>۲. فاکتور و تسویه</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                showCartOnMobile ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-800'
              }`}
            >
              {formatCurrency(activeTabTotal)}
            </span>
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
              <div className="bg-white border-2 border-teal-600 rounded-2xl p-4 md:p-5 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Users className="text-teal-700" size={24} />
                      <h2 className="text-base md:text-lg font-extrabold text-slate-900">
                        صدور فیش سلف سرویس و انتخاب نوشیدنی‌ها
                      </h2>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      تعداد نفرات مهمان سلف را انتخاب کرده و در صورت نیاز نوشیدنی‌های اضافی (نوشابه، دوغ، آب معدنی و...) به فاکتور بیافزایید.
                    </p>
                  </div>

                  {/* 0 to 4 Person Buttons + Plus/Minus Option for More Guests */}
                  <div className="flex flex-wrap items-stretch gap-2 w-full md:w-auto">
                    <button
                      type="button"
                      onClick={() =>
                        updateActiveTab({
                          selfServiceGuests: 0,
                          selfServiceHalfPriceGuests: 0,
                        })
                      }
                      className={`flex-1 sm:flex-initial min-w-[78px] md:w-24 py-2.5 px-2 rounded-xl font-bold text-sm transition-all border flex flex-col items-center justify-center cursor-pointer ${
                        activeTab.selfServiceGuests === 0 &&
                        (activeTab.selfServiceHalfPriceGuests || 0) === 0
                          ? 'bg-amber-600 text-white border-amber-700 shadow-sm scale-[1.02]'
                          : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100 hover:border-amber-300'
                      }`}
                      title="ثبت تک فاکتور نوشابه و نوشیدنی بدون ورودی سلف سرویس"
                    >
                      <span className="text-sm font-black font-mono">۰ نفر</span>
                      <span className="text-[10px] opacity-90">فقط نوشابه</span>
                    </button>

                    {[1, 2, 3, 4].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => updateActiveTab({ selfServiceGuests: num })}
                        className={`flex-1 sm:flex-initial min-w-[68px] md:w-20 py-2.5 px-2 rounded-xl font-bold text-sm transition-all border flex flex-col items-center justify-center cursor-pointer ${
                          activeTab.selfServiceGuests === num
                            ? 'bg-teal-600 text-white border-teal-700 shadow-sm scale-[1.02]'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-teal-50 hover:border-teal-300'
                        }`}
                      >
                        <span className="text-base font-black font-mono">{num} نفر</span>
                        <span className="text-[10px] opacity-85">{num} سلف</span>
                      </button>
                    ))}

                    {/* نفرات بیشتر یا صفر با دکمه + و - و قابلیت وارد کردن هر تعداد دلخواه */}
                    <div
                      className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl border transition-all ${
                        activeTab.selfServiceGuests > 4
                          ? 'bg-teal-600 text-white border-teal-700 shadow-sm scale-[1.01]'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-teal-300'
                      }`}
                    >
                      <div className="flex flex-col items-start pl-1">
                        <span
                          className={`text-[10px] font-extrabold whitespace-nowrap ${
                            activeTab.selfServiceGuests > 4 ? 'text-teal-100' : 'text-slate-500'
                          }`}
                        >
                          تعداد دلخواه
                        </span>
                        <span className="text-xs font-black font-mono whitespace-nowrap">
                          {activeTab.selfServiceGuests} نفر
                        </span>
                      </div>

                      <button
                        type="button"
                        title="کاهش تعداد نفرات (-)"
                        onClick={() =>
                          updateActiveTab({
                            selfServiceGuests: Math.max(0, (activeTab.selfServiceGuests ?? 0) - 1),
                          })
                        }
                        className={`w-8 h-8 rounded-lg font-bold flex items-center justify-center transition cursor-pointer ${
                          activeTab.selfServiceGuests > 4
                            ? 'bg-white/20 hover:bg-white/30 text-white'
                            : 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-200'
                        }`}
                      >
                        <Minus size={15} />
                      </button>

                      <input
                        type="number"
                        min={0}
                        aria-label="تعداد نفرات دلخواه سلف"
                        value={activeTab.selfServiceGuests ?? 0}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          updateActiveTab({
                            selfServiceGuests: Number.isFinite(val) && val >= 0 ? val : 0,
                          });
                        }}
                        className={`w-12 h-8 text-center rounded-lg font-mono font-black text-sm outline-none border ${
                          activeTab.selfServiceGuests > 4
                            ? 'bg-white text-teal-900 border-white'
                            : 'bg-white text-slate-900 border-slate-200 focus:border-teal-600'
                        }`}
                        dir="ltr"
                      />

                      <button
                        type="button"
                        title="افزایش تعداد نفرات (+)"
                        onClick={() =>
                          updateActiveTab({
                            selfServiceGuests: (activeTab.selfServiceGuests || 0) + 1,
                          })
                        }
                        className={`w-8 h-8 rounded-lg font-bold flex items-center justify-center transition cursor-pointer ${
                          activeTab.selfServiceGuests > 4
                            ? 'bg-white text-teal-700 hover:bg-teal-50 shadow-xs'
                            : 'bg-teal-600 hover:bg-teal-700 text-white shadow-xs'
                        }`}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* بخش ویژه کودکان و نیم‌بها با دکمه مثبت و منفی و نصف قیمت فیش */}
                <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-3 md:p-3.5 space-y-2.5">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold text-base shadow-xs shrink-0">
                        👶
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs md:text-sm font-extrabold text-amber-950">
                            ورودی نیم‌بها / کودکان (نصف قیمت فیش)
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-200 text-amber-900 border border-amber-300">
                            ۵۰٪ قیمت هر نفر
                          </span>
                        </div>
                        <p className="text-[11px] text-amber-800 mt-0.5">
                          به ازای هر کودک، نصف قیمت ورودی (
                          <span className="font-mono font-bold">
                            {formatCurrency(Math.round(activeTab.selfServiceUnitPrice / 2))}
                          </span>
                          ) محاسبه و به فاکتور و سهمیه نوشیدنی افزوده می‌شود.
                        </p>
                      </div>
                    </div>

                    {/* وضعیت فعال و مجموع نیم بها */}
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {(activeTab.selfServiceHalfPriceGuests || 0) > 0 && (
                        <div className="text-left bg-white px-2.5 py-1 rounded-lg border border-amber-300 shadow-2xs">
                          <span className="text-[10px] text-amber-800 block">جمع کل نیم‌بها:</span>
                          <span className="text-xs font-black font-mono text-amber-900">
                            {formatCurrency(
                              (activeTab.selfServiceHalfPriceGuests || 0) *
                                Math.round(activeTab.selfServiceUnitPrice / 2)
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* انتخابگر سریع و کلیدهای + و - برای کودکان نیم‌بها */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-amber-200/60">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-bold text-amber-900 ml-1">انتخاب سریع:</span>
                      {[0, 1, 2, 3].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => updateActiveTab({ selfServiceHalfPriceGuests: num })}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                            (activeTab.selfServiceHalfPriceGuests || 0) === num
                              ? 'bg-amber-600 text-white border-amber-700 shadow-xs scale-[1.02]'
                              : 'bg-white text-amber-900 border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          {num === 0 ? 'بدون کودک (۰ نفر)' : `${num} کودک نیم‌بها`}
                        </button>
                      ))}
                    </div>

                    {/* دکمه‌های مثبت و منفی و ورودی عددی مستقیم برای تعداد دلخواه */}
                    <div className="flex items-center gap-2 bg-white border border-amber-300 rounded-xl px-2.5 py-1.5 shadow-2xs">
                      <span className="text-xs font-extrabold text-amber-900">
                        تعداد کودکان / نیم‌بها:
                      </span>

                      <button
                        type="button"
                        title="کاهش تعداد کودک (-)"
                        onClick={() =>
                          updateActiveTab({
                            selfServiceHalfPriceGuests: Math.max(
                              0,
                              (activeTab.selfServiceHalfPriceGuests || 0) - 1
                            ),
                          })
                        }
                        className="w-8 h-8 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 flex items-center justify-center font-bold transition cursor-pointer"
                      >
                        <Minus size={15} />
                      </button>

                      <input
                        type="number"
                        min={0}
                        aria-label="تعداد کودکان نیم بها"
                        value={activeTab.selfServiceHalfPriceGuests ?? 0}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          updateActiveTab({
                            selfServiceHalfPriceGuests: Number.isFinite(val) && val >= 0 ? val : 0,
                          });
                        }}
                        className="w-12 h-8 text-center rounded-lg font-mono font-black text-sm outline-none border border-amber-200 bg-amber-50/50 text-amber-950 focus:border-amber-500 focus:bg-white"
                        dir="ltr"
                      />

                      <button
                        type="button"
                        title="افزایش تعداد کودک (+)"
                        onClick={() =>
                          updateActiveTab({
                            selfServiceHalfPriceGuests:
                              (activeTab.selfServiceHalfPriceGuests || 0) + 1,
                          })
                        }
                        className="w-8 h-8 rounded-lg bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center font-bold transition cursor-pointer shadow-xs"
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Beverage Quick Presets & Description Note */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-xs font-bold text-slate-800">
                      ۱. انتخاب سریع نوع نوشیدنی سلف:
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: '🥤 نوشابه قوطی', note: 'نوشابه قوطی + استفاده از بار سلف' },
                        { label: '🥛 دوغ بطری/لیوانی', note: 'دوغ + استفاده از بار سلف' },
                        { label: '💧 آب معدنی', note: 'آب معدنی + استفاده از بار سلف' },
                        { label: '🍺 دلستر / ماءالشعیر', note: 'دلستر + استفاده از بار سلف' },
                        { label: '🍊 آبمیوه / شربت', note: 'آبمیوه / شربت + استفاده از بار سلف' },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => updateActiveTab({ selfServiceDrinkNote: preset.note })}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                            activeTab.selfServiceDrinkNote === preset.note
                              ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        قیمت سلف و نوشیدنی به ازای هر نفر ({currencyLabel})
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

                {/* Quick Add Extra Beverages Panel */}
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-amber-900 flex items-center gap-1.5">
                      <span>
                        {activeTab.selfServiceGuests === 0 &&
                        (activeTab.selfServiceHalfPriceGuests || 0) === 0
                          ? '🥤 انتخاب نوشابه و نوشیدنی برای تک فاکتور (بدون فیش سلف):'
                          : '🥤 افزودن نوشیدنی یا نوشابه اضافه دستی (خارج از سهمیه سلف):'}
                      </span>
                      {activeTab.items.length > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-600 text-white font-mono text-[10px]">
                          {activeTab.items.reduce((sum, i) => sum + i.quantity, 0)} مورد اضافه شد
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-amber-800">
                      {activeTab.selfServiceGuests === 0 &&
                      (activeTab.selfServiceHalfPriceGuests || 0) === 0
                        ? 'فقط قیمت نوشیدنی‌های انتخابی در فیش محاسبه می‌شود'
                        : '(مثلاً ۳ نفر هستند اما ۴ نوشابه یا ۲ دوغ می‌خواهند)'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {quickBeveragesList.map((bev) => {
                      const colorClasses =
                        bev.color === 'emerald'
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : bev.color === 'blue'
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : bev.color === 'purple'
                          ? 'bg-purple-600 hover:bg-purple-700 text-white'
                          : bev.color === 'rose'
                          ? 'bg-rose-600 hover:bg-rose-700 text-white'
                          : bev.color === 'teal'
                          ? 'bg-teal-600 hover:bg-teal-700 text-white'
                          : bev.color === 'indigo'
                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                          : bev.color === 'slate'
                          ? 'bg-slate-700 hover:bg-slate-800 text-white'
                          : 'bg-amber-600 hover:bg-amber-700 text-white';

                      const isZeroGuests =
                        activeTab.selfServiceGuests === 0 &&
                        (activeTab.selfServiceHalfPriceGuests || 0) === 0;
                      const fullName = isZeroGuests
                        ? bev.name.replace(/\s*اضافه$/, '')
                        : bev.name.endsWith('اضافه')
                        ? bev.name
                        : `${bev.name} اضافه`;

                      return (
                        <button
                          key={bev.id || bev.name}
                          type="button"
                          onClick={() => handleAddQuickBeverage(fullName, bev.price)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs transition cursor-pointer ${colorClasses}`}
                        >
                          <Plus size={13} />
                          <span>۱+ {bev.name} ({formatCurrency(bev.price)})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Menu Beverage & Food Catalog Grid for Self-Service */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <h3 className="text-xs md:text-sm font-extrabold text-slate-800">
                    افزودن مستقیم انواع نوشیدنی و غذا از کاتالوگ منو به فاکتور سلف
                  </h3>

                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      placeholder="جستجوی نوشابه، دوغ، آب معدنی..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pr-8 pl-3 py-1.5 bg-slate-100 rounded-xl text-xs outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-60 overflow-y-auto pr-1">
                  {displayedMenuItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleAddItem(item)}
                      className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-teal-50 hover:border-teal-400 text-right transition flex flex-col justify-between cursor-pointer group"
                    >
                      <span className="font-bold text-xs text-slate-800 line-clamp-1 group-hover:text-teal-950">
                        {item.name}
                      </span>
                      <div className="flex justify-between items-center mt-2 pt-1 border-t border-slate-200/60">
                        <span className="text-[11px] font-mono font-bold text-teal-700">
                          {formatCurrency(item.price)}
                        </span>
                        <span className="p-1 rounded-lg bg-teal-600 text-white text-[10px] font-bold group-hover:scale-110 transition-transform">
                          <Plus size={12} />
                        </span>
                      </div>
                    </button>
                  ))}
                  {displayedMenuItems.length === 0 && (
                    <div className="col-span-full py-6 text-center text-slate-400 text-xs">
                      آیتمی یافت نشد.
                    </div>
                  )}
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
                    {activeTab.selfServiceGuests === 0 &&
                    (activeTab.selfServiceHalfPriceGuests || 0) === 0
                      ? 'فقط نوشابه و نوشیدنی (بدون فیش سلف)'
                      : 'فیش سلف سرویس و نوشابه'}
                  </span>
                  <span className="text-xs font-mono font-black text-teal-800">
                    {activeTab.selfServiceGuests} نفر
                  </span>
                </div>

                {/* Compact 0..4 selector + Plus/Minus stepper inside cart too */}
                <div className="grid grid-cols-5 gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      updateActiveTab({
                        selfServiceGuests: 0,
                        selfServiceHalfPriceGuests: 0,
                      })
                    }
                    className={`py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      activeTab.selfServiceGuests === 0 &&
                      (activeTab.selfServiceHalfPriceGuests || 0) === 0
                        ? 'bg-amber-600 text-white'
                        : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                    }`}
                    title="فقط نوشابه (بدون فیش سلف)"
                  >
                    ۰ نفر
                  </button>
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => updateActiveTab({ selfServiceGuests: n })}
                      className={`py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        activeTab.selfServiceGuests === n
                          ? 'bg-teal-600 text-white'
                          : 'bg-white text-slate-700 border border-teal-200 hover:bg-teal-100'
                      }`}
                    >
                      {n} نفر
                    </button>
                  ))}
                </div>

                {/* نفرات بیشتر یا صفر با + و - در ستون فاکتور */}
                <div className="flex items-center justify-between gap-2 bg-white border border-teal-200 rounded-lg px-2.5 py-1.5">
                  <span className="text-[11px] font-bold text-slate-700">
                    تعداد نفرات سلف:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        updateActiveTab({
                          selfServiceGuests: Math.max(0, (activeTab.selfServiceGuests ?? 0) - 1),
                        })
                      }
                      className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold cursor-pointer"
                    >
                      <Minus size={12} />
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={activeTab.selfServiceGuests ?? 0}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        updateActiveTab({
                          selfServiceGuests: Number.isFinite(val) && val >= 0 ? val : 0,
                        });
                      }}
                      className="w-11 text-center font-mono font-black text-xs text-teal-800 border border-slate-200 rounded py-0.5 outline-none focus:border-teal-600"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateActiveTab({
                          selfServiceGuests: (activeTab.selfServiceGuests || 0) + 1,
                        })
                      }
                      className="w-6 h-6 rounded-md bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center font-bold cursor-pointer"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>

                {/* کارت کودکان و نیم‌بها در ستون فاکتور */}
                <div className="bg-amber-50/90 border border-amber-300 rounded-lg px-2.5 py-1.5 space-y-1">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="font-extrabold text-amber-950 flex items-center gap-1">
                      <span>👶</span>
                      <span>کودکان / نیم‌بها:</span>
                    </span>
                    <span className="font-mono font-bold text-amber-900">
                      {formatCurrency(
                        (activeTab.selfServiceHalfPriceGuests || 0) *
                          Math.round(activeTab.selfServiceUnitPrice / 2)
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[10px] text-amber-800">
                      فی: {formatCurrency(Math.round(activeTab.selfServiceUnitPrice / 2))}
                    </span>
                    <div className="flex items-center gap-1 bg-white border border-amber-300 rounded-md px-1.5 py-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          updateActiveTab({
                            selfServiceHalfPriceGuests: Math.max(
                              0,
                              (activeTab.selfServiceHalfPriceGuests || 0) - 1
                            ),
                          })
                        }
                        className="w-5 h-5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 flex items-center justify-center font-bold cursor-pointer"
                        title="کاهش تعداد کودک (-)"
                      >
                        <Minus size={11} />
                      </button>
                      <input
                        type="number"
                        min={0}
                        value={activeTab.selfServiceHalfPriceGuests ?? 0}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          updateActiveTab({
                            selfServiceHalfPriceGuests: Number.isFinite(val) && val >= 0 ? val : 0,
                          });
                        }}
                        className="w-8 text-center font-mono font-black text-xs text-amber-950 outline-none"
                        dir="ltr"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateActiveTab({
                            selfServiceHalfPriceGuests:
                              (activeTab.selfServiceHalfPriceGuests || 0) + 1,
                          })
                        }
                        className="w-5 h-5 rounded bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center font-bold cursor-pointer"
                        title="افزایش تعداد کودک (+)"
                      >
                        <Plus size={11} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center text-[11px] text-teal-800 pt-1 border-t border-teal-200/60">
                  <span>
                    سهمیه کل نوشابه:{' '}
                    {(activeTab.selfServiceGuests || 0) + (activeTab.selfServiceHalfPriceGuests || 0)} عدد
                  </span>
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
                <span className="text-slate-600 whitespace-nowrap">سهم نقد ({currencyLabel}):</span>
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
                {/* Quick 50% Half Price discount shortcut */}
                <button
                  type="button"
                  onClick={() =>
                    updateActiveTab({
                      discountType:
                        activeTab.discountType === 'percent' && activeTab.discountValue === 50
                          ? 'none'
                          : 'percent',
                      discountValue:
                        activeTab.discountType === 'percent' && activeTab.discountValue === 50 ? 0 : 50,
                    })
                  }
                  className={`px-2 py-1 rounded-lg text-xs font-bold transition-all border shrink-0 cursor-pointer ${
                    activeTab.discountType === 'percent' && activeTab.discountValue === 50
                      ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                      : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                  }`}
                  title="اعمال ۵۰٪ تخفیف نیم‌بها روی کل فاکتور"
                >
                  ۵۰٪ نیم‌بها
                </button>

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
                  if (previewOrder) triggerInstantPrint(previewOrder);
                }}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
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
                      موجودی نقد شمارش شده در کشو ({currencyLabel})
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

      {/* Recent Orders & Instant Reprint Modal */}
      {showRecentOrdersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                  <History size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base flex items-center gap-2">
                    <span>فروش‌های امروز و چاپ مجدد فیش</span>
                    <span className="px-2 py-0.5 bg-emerald-600 text-white text-[11px] font-mono rounded-full">
                      {todayOrders.length} فاکتور
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    جمع کل فروش امروز: <span className="font-bold font-mono text-emerald-400">{formatCurrency(todaySalesTotal)}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowRecentOrdersModal(false)}
                className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Filter and Search Bar */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={recentOrderSearch}
                  onChange={(e) => setRecentOrderSearch(e.target.value)}
                  placeholder="جستجو با شماره فیش (#1004) یا نام و موبایل مشتری..."
                  className="w-full pl-3 pr-9 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:border-emerald-500"
                />
                {recentOrderSearch && (
                  <button
                    type="button"
                    onClick={() => setRecentOrderSearch('')}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 bg-slate-200/80 p-1 rounded-xl text-xs font-bold shrink-0">
                <button
                  type="button"
                  onClick={() => setRecentOrderTypeFilter('all')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    recentOrderTypeFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  همه ({todayOrders.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRecentOrderTypeFilter('self_service')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    recentOrderTypeFilter === 'self_service'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  سلف سرویس ({selfServiceOrdersCount})
                </button>
                <button
                  type="button"
                  onClick={() => setRecentOrderTypeFilter('standard')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    recentOrderTypeFilter === 'standard'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  سفارشات منو ({standardOrdersCount})
                </button>
              </div>
            </div>

            {/* Orders List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {filteredRecentOrders.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <FileText size={40} className="mx-auto mb-2 opacity-40 text-slate-400" />
                  <p className="text-xs font-bold">هیچ فاکتوری با شرایط جستجو یافت نشد.</p>
                </div>
              ) : (
                filteredRecentOrders.map((order) => {
                  if (!order) return null;
                  const isSelf = order.invoiceMode === 'self_service';
                  let timeStr = '--:--';
                  try {
                    if (order.createdAt) {
                      const d = new Date(order.createdAt);
                      if (!isNaN(d.getTime())) {
                        timeStr = format(d, 'HH:mm:ss');
                      }
                    }
                  } catch {
                    timeStr = '--:--';
                  }

                  const safeFinalAmount = Number.isFinite(order.finalAmount)
                    ? order.finalAmount
                    : Number.isFinite(order.total)
                    ? order.total
                    : 0;

                  return (
                    <div
                      key={order.id || order.invoiceNumber || Math.random()}
                      className="p-3 bg-white border border-slate-200 hover:border-slate-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs transition"
                    >
                      {/* Left: Info */}
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 font-mono font-black text-xs ${
                            isSelf
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          <span className="text-[10px] opacity-75">فیش</span>
                          <span>#{order.invoiceNumber || '---'}</span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-extrabold text-xs text-slate-900">
                              {isSelf ? `فیش سلف سرویس (${order.selfServiceGuests || 1} نفر)` : 'فاکتور سفارش غذا'}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-mono" dir="ltr">
                              {timeStr}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                order.paymentMethod === 'card'
                                  ? 'bg-blue-100 text-blue-800'
                                  : order.paymentMethod === 'cash'
                                  ? 'bg-amber-100 text-amber-800'
                                  : order.paymentMethod === 'split'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {order.paymentMethod === 'card'
                                ? `کارتخوان (${order.bankName || 'بانک'})`
                                : order.paymentMethod === 'cash'
                                ? 'نقدی'
                                : order.paymentMethod === 'split'
                                ? 'ترکیبی'
                                : 'نسیه'}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-600 mt-1 truncate">
                            {order.customerName ? (
                              <span className="font-bold ml-2">مشتری: {order.customerName} {order.customerPhone ? `(${order.customerPhone})` : ''}</span>
                            ) : null}
                            <span className="text-slate-500">
                              {(order.items || [])
                                .filter(Boolean)
                                .map((it) => `${it?.name || (it as any)?.menuItem?.name || 'کالا'} (${it?.quantity || 1})`)
                                .join('، ')}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Amount & Actions */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <div className="text-left font-mono">
                          <span className="text-[10px] text-slate-400 block">مبلغ فاکتور</span>
                          <span className="font-black text-sm text-slate-900 tabular-nums">
                            {formatCurrency(safeFinalAmount)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {/* Instant Reprint Button */}
                          <button
                            type="button"
                            onClick={() => triggerInstantPrint(order)}
                            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1 shadow-xs cursor-pointer transition"
                            title="چاپ آنی روی فیش‌پرینتر"
                          >
                            <Printer size={14} />
                            <span>چاپ مجدد</span>
                          </button>

                          {/* Preview Receipt Button */}
                          <button
                            type="button"
                            onClick={() => setPreviewOrder(order)}
                            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer transition"
                            title="مشاهده فیش"
                          >
                            <Eye size={15} />
                          </button>

                          {/* Edit / Delete Button (if permitted) */}
                          {(canEditInvoice || canDeleteInvoice) && (
                            <button
                              type="button"
                              onClick={() => setOrderToEditDelete(order)}
                              className="p-2 bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-800 rounded-xl cursor-pointer transition"
                              title="ویرایش یا حذف فاکتور"
                            >
                              <Edit3 size={15} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600 shrink-0">
              <span className="text-[11px] text-slate-500">
                با کلیک بر روی دکمه «چاپ مجدد»، فیش درجا و بدون وقفه به پرینتر ارسال می‌شود.
              </span>
              <button
                type="button"
                onClick={() => setShowRecentOrdersModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold cursor-pointer transition"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Edit & Delete Modal */}
      {orderToEditDelete && (
        <InvoiceEditDeleteModal
          order={orderToEditDelete}
          canEdit={canEditInvoice}
          canDelete={canDeleteInvoice}
          onClose={() => setOrderToEditDelete(null)}
          onOrderUpdated={() => setOrderToEditDelete(null)}
        />
      )}
    </div>
  );
}
