import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Account,
  BankAccount,
  Cheque,
  JournalVoucher,
  RawMaterial,
  Order,
  db,
  recordJournalVoucher,
} from '../../lib/db';
import {
  computeProfitAndLoss,
  classifyChequeDueStatus,
} from '../../lib/accountingEngine';
import { formatCurrency } from '../../lib/utils';
import InvoiceEditDeleteModal from '../Common/InvoiceEditDeleteModal';
import { format } from 'date-fns-jalali';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Building2,
  Package,
  FileText,
  ArrowLeft,
  Receipt,
  Edit2,
  Trash2,
  Search,
} from 'lucide-react';

interface Props {
  accounts: Account[];
  vouchers: JournalVoucher[];
  cheques: Cheque[];
  banks: BankAccount[];
  materials: RawMaterial[];
  onNavigateSubTab: (tab: string) => void;
}

export default function PnLAndOverviewTab({
  accounts,
  vouchers,
  cheques,
  banks,
  materials,
  onNavigateSubTab,
}: Props) {
  const orders = useLiveQuery(() => db.orders.orderBy('createdAt').reverse().toArray()) || [];
  const [selectedOrderForModal, setSelectedOrderForModal] = useState<Order | null>(null);
  const [invoiceSearch, setInvoiceSearch] = useState('');

  const filteredOrders = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    if (!q) return orders.slice(0, 50);
    return orders.filter(
      (o) =>
        String(o.invoiceNumber).includes(q) ||
        (o.customerName && o.customerName.toLowerCase().includes(q)) ||
        (o.customerPhone && o.customerPhone.includes(q))
    );
  }, [orders, invoiceSearch]);

  const allLines = useMemo(() => vouchers.flatMap((v) => v.lines), [vouchers]);

  const pnl = useMemo(() => {
    return computeProfitAndLoss({
      accounts,
      journalLines: allLines,
    });
  }, [accounts, allLines]);

  const chequeAlerts = useMemo(() => {
    const now = new Date();
    return cheques
      .filter((c) => c.status === 'pending')
      .map((c) => ({
        cheque: c,
        ...classifyChequeDueStatus(c, now),
      }))
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [cheques]);

  const urgentCheques = chequeAlerts.filter(
    (c) => c.urgency === 'overdue' || c.urgency === 'due_today' || c.urgency === 'upcoming'
  );

  const lowStockMaterials = useMemo(
    () => materials.filter((m) => m.currentQty <= m.minQty),
    [materials]
  );

  const totalInventoryValue = useMemo(
    () => materials.reduce((sum, m) => sum + Math.round(m.currentQty * m.avgCost), 0),
    [materials]
  );

  const handleClearChequeQuick = async (cheque: Cheque) => {
    if (!cheque.id) return;
    await db.cheques.update(cheque.id, {
      status: 'cleared',
      clearedAt: new Date(),
    });

    if (cheque.type === 'issued') {
      await recordJournalVoucher({
        date: new Date(),
        description: `پاس شدن چک پرداختی شماره ${cheque.chequeNumber} در وجه ${cheque.personName} از ${cheque.bankName}`,
        type: 'auto_cheque',
        bankId: cheque.bankId,
        bankName: cheque.bankName,
        lines: [
          {
            accountCode: '202',
            accountName: 'اسناد پرداختنی (چک‌های صادره)',
            personId: cheque.personId,
            personName: cheque.personName,
            debit: cheque.amount,
            credit: 0,
            description: `پاس شدن چک ${cheque.chequeNumber}`,
          },
          {
            accountCode: '102',
            accountName: 'موجودی بانک‌ها و کارتخوان‌ها',
            debit: 0,
            credit: cheque.amount,
            description: `کسر مبلغ چک از ${cheque.bankName}`,
          },
        ],
      });
    } else {
      await recordJournalVoucher({
        date: new Date(),
        description: `وصول چک دریافتی شماره ${cheque.chequeNumber} از ${cheque.personName} به ${cheque.bankName}`,
        type: 'auto_cheque',
        bankId: cheque.bankId,
        bankName: cheque.bankName,
        lines: [
          {
            accountCode: '102',
            accountName: 'موجودی بانک‌ها و کارتخوان‌ها',
            debit: cheque.amount,
            credit: 0,
            description: `واریز چک دریافتی به ${cheque.bankName}`,
          },
          {
            accountCode: '104',
            accountName: 'اسناد دریافتنی (چک‌های مشتریان)',
            personId: cheque.personId,
            personName: cheque.personName,
            debit: 0,
            credit: cheque.amount,
            description: `وصول چک ${cheque.chequeNumber}`,
          },
        ],
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Cheque Due-Date Alert Banner (هشدار روز سررسید چک‌ها) */}
      {urgentCheques.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-900 font-extrabold text-sm">
              <AlertTriangle className="text-amber-600 shrink-0" size={20} />
              <span>
                هشدار سررسید چک‌ها ({urgentCheques.length} فقره چک در سررسید امروز یا نزدیک به سررسید)
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSubTab('persons_cheques')}
              className="text-xs font-bold text-amber-900 hover:underline flex items-center gap-1"
            >
              <span>مدیریت دفتر چک</span>
              <ArrowLeft size={14} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {urgentCheques.map(({ cheque, urgency, daysRemaining }) => (
              <div
                key={cheque.id}
                className="bg-white border border-amber-200 rounded-xl p-3 flex items-center justify-between gap-3"
              >
                <div className="space-y-0.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-extrabold ${
                        urgency === 'overdue'
                          ? 'text-red-700'
                          : urgency === 'due_today'
                          ? 'text-rose-600'
                          : 'text-amber-700'
                      }`}
                    >
                      {urgency === 'overdue'
                        ? `سررسید گذشته (${Math.abs(daysRemaining)} روز قبل)`
                        : urgency === 'due_today'
                        ? '🔔 سررسید امروز!'
                        : `سررسید تا ${daysRemaining} روز دیگر`}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-bold text-slate-800">
                      {cheque.type === 'issued' ? 'چک پرداختی' : 'چک دریافتی'} #{cheque.chequeNumber}
                    </span>
                  </div>
                  <div className="text-slate-600">
                    شخص: <strong>{cheque.personName}</strong> · بانک: <strong>{cheque.bankName}</strong>
                  </div>
                  <div className="font-mono font-black text-slate-900 text-sm">
                    {formatCurrency(cheque.amount)}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleClearChequeQuick(cheque)}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shrink-0 flex items-center gap-1"
                >
                  <CheckCircle2 size={14} />
                  <span>پاس کردن چک</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <span className="text-xs font-medium text-slate-500">فروش خالص کل (منو + سلف)</span>
          <div className="text-xl font-black text-slate-900 font-mono tabular-nums mt-1">
            {formatCurrency(pnl.netSales)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            منو: {formatCurrency(pnl.grossMenuSales)} · سلف: {formatCurrency(pnl.grossSelfServiceSales)}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <span className="text-xs font-medium text-slate-500">بهای تمام شده غذا (COGS)</span>
          <div className="text-xl font-black text-rose-700 font-mono tabular-nums mt-1">
            {formatCurrency(pnl.totalCOGS)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            سود ناخالص: {formatCurrency(pnl.grossProfit)} ({pnl.grossMarginPercent}%)
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <span className="text-xs font-medium text-slate-500">جمع هزینه‌های عملیاتی رستوران</span>
          <div className="text-xl font-black text-amber-700 font-mono tabular-nums mt-1">
            {formatCurrency(pnl.totalOperatingExpenses)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            حقوق، اجاره، قبوض، پیک و سایر هزینه‌ها
          </div>
        </div>

        <div
          className={`p-4 rounded-2xl border ${
            pnl.netProfit >= 0
              ? 'bg-emerald-50/70 border-emerald-300'
              : 'bg-rose-50/70 border-rose-300'
          }`}
        >
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-700">سود (زیان) خالص ویژه</span>
            {pnl.netProfit >= 0 ? (
              <TrendingUp size={18} className="text-emerald-600" />
            ) : (
              <TrendingDown size={18} className="text-rose-600" />
            )}
          </div>
          <div
            className={`text-xl font-black font-mono tabular-nums mt-1 ${
              pnl.netProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'
            }`}
          >
            {formatCurrency(pnl.netProfit)}
          </div>
          <div className="text-[11px] font-semibold text-slate-600 mt-1">
            حاشیه سود خالص: {pnl.netMarginPercent}%
          </div>
        </div>
      </div>

      {/* Main Grid: Standard Profit & Loss Statement + Banks & Inventory Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Standard Accounting Profit & Loss Statement (صورت سود و زیان استاندارد حسابداری) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                صورت سود و زیان استاندارد حسابداری (Profit & Loss Statement)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                محاسبه لحظه‌ای بر اساس اسناد دوبل فروش، فرمول تولید (BOM) و هزینه‌های ثبت شده
              </p>
            </div>
            <FileText className="text-slate-400" size={20} />
          </div>

          <div className="p-5 space-y-4 text-xs">
            {/* Section 1: Revenue */}
            <div className="space-y-2">
              <div className="font-extrabold text-slate-800 text-sm border-b border-slate-100 pb-1">
                ۱. درآمدهای عملیاتی فروش
              </div>
              <div className="flex justify-between items-center py-1 px-2 hover:bg-slate-50 rounded">
                <span className="text-slate-700">درآمد فروش غذا و منو (کد ۴۰۱)</span>
                <span className="font-mono font-bold text-slate-900">
                  {formatCurrency(pnl.grossMenuSales)}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 px-2 hover:bg-slate-50 rounded">
                <span className="text-slate-700">درآمد فیش سلف سرویس و نوشابه (کد ۴۰۲)</span>
                <span className="font-mono font-bold text-slate-900">
                  {formatCurrency(pnl.grossSelfServiceSales)}
                </span>
              </div>
              {pnl.salesDiscounts > 0 && (
                <div className="flex justify-between items-center py-1 px-2 text-rose-600">
                  <span>کسر می‌شود: تخفیفات نقدی فروش (کد ۴۰۳)</span>
                  <span className="font-mono font-bold">({formatCurrency(pnl.salesDiscounts)})</span>
                </div>
              )}
              <div className="flex justify-between items-center py-2 px-3 bg-slate-100 rounded-xl font-extrabold text-slate-900">
                <span>فروش خالص (Net Sales)</span>
                <span className="font-mono text-sm">{formatCurrency(pnl.netSales)}</span>
              </div>
            </div>

            {/* Section 2: Cost of Goods Sold (COGS) */}
            <div className="space-y-2">
              <div className="font-extrabold text-slate-800 text-sm border-b border-slate-100 pb-1">
                ۲. بهای تمام شده کالای فروش رفته (قیمت تمام شده تولید)
              </div>
              <div className="flex justify-between items-center py-1 px-2 text-rose-700">
                <span>کسر می‌شود: بهای تمام شده مواد مصرفی، دستمزد پخت و سربار (کد ۵۰۱)</span>
                <span className="font-mono font-bold">({formatCurrency(pnl.totalCOGS)})</span>
              </div>
              <div className="flex justify-between items-center py-2.5 px-3 bg-blue-50 border border-blue-200 rounded-xl font-extrabold text-blue-900">
                <span>سود (زیان) ناخالص (Gross Profit)</span>
                <div className="text-left font-mono">
                  <span className="text-sm">{formatCurrency(pnl.grossProfit)}</span>
                  <span className="text-[11px] mr-2 text-blue-700">
                    (حاشیه سود ناخالص: {pnl.grossMarginPercent}%)
                  </span>
                </div>
              </div>
            </div>

            {/* Section 3: Operating Expenses */}
            <div className="space-y-2">
              <div className="font-extrabold text-slate-800 text-sm border-b border-slate-100 pb-1">
                ۳. هزینه‌های عملیاتی، اداری و عمومی رستوران (گروه ۶۰۰)
              </div>
              {pnl.operatingExpensesByCategory.map((exp) => (
                <div
                  key={exp.code}
                  className="flex justify-between items-center py-1 px-2 hover:bg-slate-50 rounded text-slate-700"
                >
                  <span>
                    {exp.name} (کد {exp.code})
                  </span>
                  <span className="font-mono font-semibold text-rose-700">
                    ({formatCurrency(exp.amount)})
                  </span>
                </div>
              ))}
              {pnl.operatingExpensesByCategory.length === 0 && (
                <div className="text-slate-400 py-2 px-2">هزینه‌ای در این دوره ثبت نشده است.</div>
              )}
              <div className="flex justify-between items-center py-1.5 px-3 bg-slate-100 rounded-xl font-bold text-slate-800">
                <span>جمع کل هزینه‌های عملیاتی</span>
                <span className="font-mono text-rose-700">
                  ({formatCurrency(pnl.totalOperatingExpenses)})
                </span>
              </div>
            </div>

            {/* Section 4: Net Profit / Loss */}
            <div
              className={`flex justify-between items-center p-4 rounded-xl border-2 font-black text-sm ${
                pnl.netProfit >= 0
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-950'
                  : 'bg-rose-50 border-rose-500 text-rose-950'
              }`}
            >
              <div>
                <div className="text-base">
                  {pnl.netProfit >= 0 ? 'سود خالص ویژه دوره (Net Profit)' : 'زیان خالص دوره (Net Loss)'}
                </div>
                <div className="text-[11px] font-normal opacity-80 mt-0.5">
                  پس از کسر بهای تمام شده واقعی تولید و کلیه هزینه‌های رستوران
                </div>
              </div>
              <div className="text-left font-mono">
                <div className="text-lg">{formatCurrency(pnl.netProfit)}</div>
                <div className="text-xs">نسبت سود خالص: {pnl.netMarginPercent}%</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Registered Banks Live Balances & Inventory Status */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2 font-extrabold text-slate-800 text-sm">
                <Building2 size={18} className="text-blue-600" />
                <span>موجودی بانک‌ها و کارتخوان‌ها</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigateSubTab('expenses_bank')}
                className="text-xs text-blue-600 font-bold hover:underline"
              >
                پرداخت / مدیریت
              </button>
            </div>

            <div className="space-y-2 text-xs">
              {banks.map((b) => (
                <div
                  key={b.id}
                  className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex justify-between items-center"
                >
                  <div>
                    <div className="font-bold text-slate-800">{b.bankName}</div>
                    <div className="text-[10px] text-slate-400 font-mono" dir="ltr">
                      {b.cardNumber}
                    </div>
                  </div>
                  <span className="font-mono font-extrabold text-blue-700 tabular-nums">
                    {formatCurrency(b.currentBalance)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2 font-extrabold text-slate-800 text-sm">
                <Package size={18} className="text-teal-600" />
                <span>وضعیت موجودی انبار مواد اولیه</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigateSubTab('inventory')}
                className="text-xs text-teal-700 font-bold hover:underline"
              >
                کاردکس و خرید
              </button>
            </div>

            <div className="p-3 bg-teal-50/70 border border-teal-200 rounded-xl flex justify-between items-center text-xs">
              <span className="font-bold text-teal-900">ارزش ریالی کل موجودی انبار:</span>
              <span className="font-mono font-black text-teal-900">
                {formatCurrency(totalInventoryValue)}
              </span>
            </div>

            {lowStockMaterials.length > 0 ? (
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-rose-600 block">
                  کالاهای نیازمند شارژ مجدد (کمتر از حد مجاز):
                </span>
                {lowStockMaterials.map((m) => (
                  <div
                    key={m.id}
                    className="flex justify-between items-center text-xs p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-900"
                  >
                    <span className="font-bold">{m.name}</span>
                    <span className="font-mono">
                      مانده: {m.currentQty} {m.unit}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-emerald-700 font-medium">
                ✅ موجودی تمامی مواد اولیه انبار بالاتر از نقطه سفارش است.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Sales Invoices Management Table (مدیریت، ویرایش و حذف فاکتورهای فروش) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Receipt size={18} className="text-blue-600" />
              <span>مدیریت، ویرایش و حذف فاکتورهای فروش ({orders.length} فاکتور ثبت شده)</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              ویرایش یا حذف هر فاکتور فروش به صورت خودکار سند حسابداری و موجودی بانک مربوطه را اصلاح می‌کند.
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute right-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="جستجوی شماره فاکتور یا نام مشتری..."
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
              className="w-full pr-8 pl-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0">
              <tr>
                <th className="py-2.5 px-4">شماره فاکتور</th>
                <th className="py-2.5 px-4">تاریخ و ساعت</th>
                <th className="py-2.5 px-4">مشتری</th>
                <th className="py-2.5 px-4">نوع فاکتور</th>
                <th className="py-2.5 px-4">نحوه تسویه</th>
                <th className="py-2.5 px-4">مبلغ کل</th>
                <th className="py-2.5 px-4 text-center">ویرایش / حذف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.map((ord) => (
                <tr key={ord.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-mono font-black text-blue-700">
                    #{ord.invoiceNumber}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600" dir="ltr">
                    {ord.createdAt ? format(new Date(ord.createdAt), 'yyyy/MM/dd HH:mm') : '-'}
                  </td>
                  <td className="py-2.5 px-4 font-bold text-slate-800">
                    {ord.customerName || 'مهمان عمومی'}
                    {ord.customerPhone && (
                      <span className="block text-[10px] font-mono text-slate-400" dir="ltr">
                        {ord.customerPhone}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        ord.invoiceMode === 'self_service'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}
                    >
                      {ord.invoiceMode === 'self_service' ? 'فیش سلف سرویس' : 'منوی عادی'}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-semibold text-slate-700">
                    {ord.paymentMethod === 'cash'
                      ? 'نقدی'
                      : ord.paymentMethod === 'credit'
                      ? 'نسیه'
                      : ord.bankName || 'کارتخوان'}
                  </td>
                  <td className="py-2.5 px-4 font-mono font-black text-slate-900">
                    {formatCurrency(ord.total)}
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    <button
                      type="button"
                      onClick={() => setSelectedOrderForModal(ord)}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg font-bold inline-flex items-center gap-1.5 text-[11px] cursor-pointer"
                    >
                      <Edit2 size={13} />
                      <span>ویرایش / حذف</span>
                    </button>
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    هیچ فاکتور فروشی یافت نشد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Edit / Delete Modal */}
      {selectedOrderForModal && (
        <InvoiceEditDeleteModal
          order={selectedOrderForModal}
          canEdit={true}
          canDelete={true}
          onClose={() => setSelectedOrderForModal(null)}
        />
      )}
    </div>
  );
}
