import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { summarizeCashierSettlements } from '../../lib/accountingEngine';
import { formatCurrency } from '../../lib/utils';
import {
  format,
  startOfDay,
  endOfDay,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
} from 'date-fns-jalali';
import { TrendingUp, Receipt, Users, Building2, Wallet } from 'lucide-react';
import DatePicker from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import DateObject from 'react-date-object';

type DatePreset = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';

export default function ReportsScreen() {
  const [preset, setPreset] = useState<DatePreset>('today');

  const [customRange, setCustomRange] = useState<DateObject[]>([
    new DateObject({ calendar: persian }).subtract(7, 'days'),
    new DateObject({ calendar: persian }),
  ]);

  const orders = useLiveQuery(() => db.orders.toArray());

  const filteredOrders = useMemo(() => {
    if (!orders) return [];

    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (preset) {
      case 'today':
        startDate = startOfDay(now);
        endDate = endOfDay(now);
        break;
      case 'yesterday': {
        const yesterday = subDays(now, 1);
        startDate = startOfDay(yesterday);
        endDate = endOfDay(yesterday);
        break;
      }
      case 'this_week':
        startDate = startOfWeek(now);
        endDate = endOfWeek(now);
        break;
      case 'this_month':
        startDate = startOfMonth(now);
        endDate = endOfMonth(now);
        break;
      case 'custom':
        if (customRange.length === 2 && customRange[0] && customRange[1]) {
          startDate = startOfDay(customRange[0].toDate());
          endDate = endOfDay(customRange[1].toDate());
        } else {
          startDate = new Date(0);
          endDate = new Date();
        }
        break;
      default:
        startDate = startOfDay(now);
        endDate = endOfDay(now);
    }

    return orders.filter((order) => {
      if (order.status !== 'paid') return false;
      return isWithinInterval(new Date(order.createdAt), { start: startDate, end: endDate });
    });
  }, [orders, preset, customRange]);

  const settlementSummary = useMemo(
    () => summarizeCashierSettlements(filteredOrders),
    [filteredOrders]
  );

  // Calculate item breakdown
  const itemSales = useMemo(() => {
    const counts: Record<string, { qty: number; revenue: number }> = {};
    filteredOrders.forEach((order) => {
      order.items.forEach((item) => {
        if (!counts[item.name]) {
          counts[item.name] = { qty: 0, revenue: 0 };
        }
        counts[item.name].qty += item.quantity;
        counts[item.name].revenue += item.price * item.quantity;
      });
    });
    return Object.entries(counts)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.qty - a.qty);
  }, [filteredOrders]);

  const totalGuestsCount = useMemo(() => {
    let guests = 0;
    filteredOrders.forEach((order) => {
      if (order.invoiceMode === 'self_service') {
        guests += order.selfServiceGuests || 1;
      } else {
        guests += 1;
      }
    });
    return guests;
  }, [filteredOrders]);

  const totalSelfServiceGuests = useMemo(() => {
    let guests = 0;
    filteredOrders.forEach((order) => {
      if (order.invoiceMode === 'self_service') {
        guests += order.selfServiceGuests || 0;
      }
    });
    return guests;
  }, [filteredOrders]);

  return (
    <div className="flex-1 overflow-y-auto p-2.5 sm:p-6 bg-slate-50">
      <div className="max-w-6xl mx-auto space-y-3 sm:space-y-6">
        {/* Header & Filters */}
        <div className="bg-white p-3.5 sm:p-6 rounded-2xl border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-6">
          <div>
            <h1 className="text-base sm:text-2xl font-extrabold text-slate-900">
              گزارشات فروش و تفکیک بانک‌ها
            </h1>
            <p className="hidden sm:block text-xs text-slate-500 mt-1">
              آمار فروش روزانه، هفتگی و ماهانه به تفکیک کارتخوان هر بانک، نقدی و نوع فاکتور
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as DatePreset)}
              className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="today">فروش امروز</option>
              <option value="yesterday">فروش دیروز</option>
              <option value="this_week">فروش این هفته</option>
              <option value="this_month">فروش این ماه</option>
              <option value="custom">بازه سفارشی...</option>
            </select>

            {preset === 'custom' && (
              <div className="flex items-center gap-2">
                <DatePicker
                  range
                  calendar={persian}
                  locale={persian_fa}
                  value={customRange}
                  onChange={(dateObjects: any) => setCustomRange(dateObjects)}
                  inputClass="px-4 py-2.5 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500 text-center w-64 text-sm"
                />
              </div>
            )}
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">جمع کل فروش دوره</p>
              <h3 className="text-lg font-black text-slate-900 font-mono tabular-nums mt-0.5">
                {formatCurrency(settlementSummary.totalSales)}
              </h3>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Receipt size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">تعداد فاکتورها</p>
              <h3 className="text-lg font-black text-slate-900 font-mono mt-0.5">
                {settlementSummary.orderCount} فاکتور
              </h3>
              <p className="text-[10px] text-slate-500">
                عادی: {settlementSummary.standardOrderCount} · سلف: {settlementSummary.selfServiceOrderCount}
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <Users size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">تعداد کل نفرات (مشتریان)</p>
              <h3 className="text-lg font-black text-slate-900 font-mono mt-0.5">
                {totalGuestsCount} نفر
              </h3>
              <p className="text-[10px] text-slate-500">
                سلف: {totalSelfServiceGuests} نفر · عادی: {settlementSummary.standardOrderCount} فاکتور
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
              <Building2 size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">جمع کارتخوان‌ها (کارت)</p>
              <h3 className="text-lg font-black text-blue-700 font-mono tabular-nums mt-0.5">
                {formatCurrency(settlementSummary.totalCard)}
              </h3>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Wallet size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">جمع دریافتی نقدی</p>
              <h3 className="text-lg font-black text-emerald-700 font-mono tabular-nums mt-0.5">
                {formatCurrency(settlementSummary.totalCash)}
              </h3>
            </div>
          </div>
        </div>

        {/* Bank-by-Bank Breakdown Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h2 className="text-sm font-extrabold text-slate-900">
            تفکیک فروش کارتخوان‌ها بر اساس هر بانک
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {settlementSummary.byBank.map((b) => (
              <div
                key={b.bankId}
                className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center text-xs"
              >
                <div>
                  <span className="font-bold text-slate-800 block">{b.bankName}</span>
                  <span className="text-[10px] text-slate-500">{b.txCount} تراکنش موفق</span>
                </div>
                <span className="font-mono font-black text-blue-700 text-sm">
                  {formatCurrency(b.amount)}
                </span>
              </div>
            ))}
            {settlementSummary.byBank.length === 0 && (
              <div className="col-span-full text-xs text-slate-400 py-2">
                تراکنش کارتی در این بازه زمانی ثبت نشده است.
              </div>
            )}
          </div>
        </div>

        {/* Detailed Sales Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Selling Items */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-96">
            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <h2 className="text-sm font-extrabold text-slate-800">
                پرفروش‌ترین غذاها و فیش‌های سلف سرویس
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <table className="w-full text-right text-xs">
                <thead className="text-slate-500 sticky top-0 bg-white border-b border-slate-100">
                  <tr>
                    <th className="py-2.5 px-3 font-medium">شرح آیتم</th>
                    <th className="py-2.5 px-3 font-medium">تعداد فروش</th>
                    <th className="py-2.5 px-3 font-medium">درآمد حاصل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itemSales.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-slate-800">{item.name}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{item.qty} عدد</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        {formatCurrency(item.revenue)}
                      </td>
                    </tr>
                  ))}
                  {itemSales.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-slate-400">
                        داده‌ای برای نمایش وجود ندارد.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Invoices list */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-96">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h2 className="text-sm font-extrabold text-slate-800">
                ریز فاکتورها و نحوه تسویه
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <table className="w-full text-right text-xs">
                <thead className="text-slate-500 sticky top-0 bg-white border-b border-slate-100">
                  <tr>
                    <th className="py-2.5 px-3 font-medium">شماره</th>
                    <th className="py-2.5 px-3 font-medium">نوع</th>
                    <th className="py-2.5 px-3 font-medium">نحوه تسویه / بانک</th>
                    <th className="py-2.5 px-3 font-medium">مبلغ کل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...filteredOrders].reverse().map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        #{order.invoiceNumber}
                      </td>
                      <td className="py-2.5 px-3">
                        {order.invoiceMode === 'self_service' ? (
                          <span className="text-teal-700 font-bold">
                            سلف ({order.selfServiceGuests} نفر)
                          </span>
                        ) : (
                          <span className="text-slate-600">منو عادی</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 font-medium">
                        {order.paymentMethod === 'cash'
                          ? 'نقدی'
                          : order.paymentMethod === 'credit'
                          ? 'نسیه'
                          : order.bankName || 'کارتخوان'}
                      </td>
                      <td className="py-2.5 px-3 text-blue-600 font-mono font-bold">
                        {formatCurrency(order.total)}
                      </td>
                    </tr>
                  ))}
                  {filteredOrders.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400">
                        داده‌ای برای نمایش وجود ندارد.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
