import React, { useState, useMemo } from 'react';
import {
  RawMaterial,
  InventoryTransaction,
  Person,
  BankAccount,
  db,
  recordJournalVoucher,
} from '../../lib/db';
import { calculateWeightedAveragePurchase, parseThreeDigitNumber } from '../../lib/accountingEngine';
import { formatCurrency, getCurrencyLabel } from '../../lib/utils';
import FormattedNumberInput from '../Common/FormattedNumberInput';
import { format } from 'date-fns-jalali';
import {
  Package,
  Plus,
  ShoppingCart,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  MinusCircle,
} from 'lucide-react';

interface Props {
  materials: RawMaterial[];
  transactions: InventoryTransaction[];
  persons: Person[];
  banks: BankAccount[];
}

export default function InventoryAndKardexTab({
  materials,
  transactions,
  persons,
  banks,
}: Props) {
  const [activeView, setActiveView] = useState<'materials' | 'purchase' | 'kardex'>('materials');
  const [selectedMaterialForKardex, setSelectedMaterialForKardex] = useState<number>(0);
  const [feedbackMsg, setFeedbackMsg] = useState<string>('');

  // New Raw Material Definition Form
  const [matName, setMatName] = useState('');
  const [matUnit, setMatUnit] = useState<RawMaterial['unit']>('کیلوگرم');
  const [matInitQty, setMatInitQty] = useState('0');
  const [matMinQty, setMatMinQty] = useState('5');
  const [matAvgCost, setMatAvgCost] = useState('');

  // Purchase (Stock In) Form
  const [buyMaterialId, setBuyMaterialId] = useState<number>(materials[0]?.id || 0);
  const [buyQty, setBuyQty] = useState<string>('10');
  const [buyUnitPrice, setBuyUnitPrice] = useState<string>('');
  const [buySupplierId, setBuySupplierId] = useState<number>(0);
  const [buyPaymentMethod, setBuyPaymentMethod] = useState<'bank' | 'cash' | 'credit'>('bank');
  const [buyBankId, setBuyBankId] = useState<number>(banks[0]?.id || 0);
  const [buyDescription, setBuyDescription] = useState<string>('');

  // Manual Waste / Outflow Form
  const [wasteMatId, setWasteMatId] = useState<number>(materials[0]?.id || 0);
  const [wasteQty, setWasteQty] = useState<string>('1');
  const [wasteReason, setWasteReason] = useState<string>('ضایعات یا مصرف آشپزخانه');

  const suppliers = useMemo(
    () => persons.filter((p) => p.role === 'supplier' || p.role === 'staff'),
    [persons]
  );

  const filteredKardex = useMemo(() => {
    const list =
      selectedMaterialForKardex > 0
        ? transactions.filter((t) => t.materialId === selectedMaterialForKardex)
        : transactions;
    return [...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, selectedMaterialForKardex]);

  const showToast = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(''), 4000);
  };

  const handleDefineMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matName.trim()) return;
    const initQty = Math.max(0, Number(matInitQty) || 0);
    const minQty = Math.max(0, Number(matMinQty) || 0);
    const unitCost = Math.max(0, Number(matAvgCost) || 0);

    const newId = (await db.rawMaterials.add({
      name: matName.trim(),
      unit: matUnit,
      currentQty: initQty,
      minQty,
      avgCost: unitCost,
      lastPurchasePrice: unitCost,
      updatedAt: new Date(),
    })) as number;

    if (initQty > 0) {
      await db.inventoryTransactions.add({
        materialId: newId,
        materialName: matName.trim(),
        unit: matUnit,
        date: new Date(),
        type: 'in_initial',
        quantity: initQty,
        unitPrice: unitCost,
        totalPrice: Math.round(initQty * unitCost),
        balanceQtyAfter: initQty,
        balanceValueAfter: Math.round(initQty * unitCost),
        description: 'موجودی اول دوره هنگام تعریف کالا',
      });
    }

    setMatName('');
    setMatInitQty('0');
    setMatAvgCost('');
    showToast('ماده اولیه جدید در انبار تعریف شد.');
  };

  const handleRecordPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetMatId = buyMaterialId || materials[0]?.id;
    const mat = materials.find((m) => m.id === Number(targetMatId));
    const qty = Number(buyQty);
    const unitPrice = Number(buyUnitPrice) || mat?.avgCost || 0;
    if (!mat || !mat.id || isNaN(qty) || qty <= 0 || unitPrice <= 0) return;

    const wAvg = calculateWeightedAveragePurchase({
      currentQty: mat.currentQty,
      currentAvgCost: mat.avgCost,
      purchaseQty: qty,
      purchaseUnitPrice: unitPrice,
    });

    const totalPurchasePrice = Math.round(qty * unitPrice);
    const supplier = persons.find((p) => p.id === Number(buySupplierId));
    const selectedBank = banks.find((b) => b.id === Number(buyBankId)) || banks[0];

    await db.rawMaterials.update(mat.id, {
      currentQty: wAvg.newQuantity,
      avgCost: wAvg.newAverageCost,
      lastPurchasePrice: unitPrice,
      updatedAt: new Date(),
    });

    await db.inventoryTransactions.add({
      materialId: mat.id,
      materialName: mat.name,
      unit: mat.unit,
      date: new Date(),
      type: 'in_purchase',
      quantity: qty,
      unitPrice,
      totalPrice: totalPurchasePrice,
      balanceQtyAfter: wAvg.newQuantity,
      balanceValueAfter: wAvg.totalInventoryValue,
      personId: supplier?.id,
      personName: supplier?.name || 'خرید مستقیم بازار',
      paymentMethod: buyPaymentMethod,
      bankName: buyPaymentMethod === 'bank' ? selectedBank?.bankName : undefined,
      description:
        buyDescription.trim() ||
        `خرید ${qty} ${mat.unit} ${mat.name} با فی ${formatCurrency(unitPrice)}`,
    });

    // Record automatic double-entry voucher
    if (buyPaymentMethod === 'bank' && selectedBank) {
      await recordJournalVoucher({
        date: new Date(),
        description: `فاکتور خرید انبار: ${qty} ${mat.unit} ${mat.name} (پرداخت از ${selectedBank.bankName})`,
        type: 'auto_purchase',
        bankId: selectedBank.id,
        bankName: selectedBank.bankName,
        lines: [
          {
            accountCode: '105',
            accountName: 'موجودی مواد اولیه انبار',
            debit: totalPurchasePrice,
            credit: 0,
            description: `ورود ${qty} ${mat.unit} ${mat.name} به انبار`,
          },
          {
            accountCode: '102',
            accountName: 'موجودی بانک‌ها و کارتخوان‌ها',
            debit: 0,
            credit: totalPurchasePrice,
            description: `پرداخت از ${selectedBank.bankName}`,
          },
        ],
      });
    } else if (buyPaymentMethod === 'cash') {
      await recordJournalVoucher({
        date: new Date(),
        description: `فاکتور خرید نقدی انبار: ${qty} ${mat.unit} ${mat.name}`,
        type: 'auto_purchase',
        lines: [
          {
            accountCode: '105',
            accountName: 'موجودی مواد اولیه انبار',
            debit: totalPurchasePrice,
            credit: 0,
            description: `ورود ${qty} ${mat.unit} ${mat.name} به انبار`,
          },
          {
            accountCode: '101',
            accountName: 'صندوق نقدی رستوران',
            debit: 0,
            credit: totalPurchasePrice,
            description: 'پرداخت از صندوق نقدی',
          },
        ],
      });
    } else {
      // Credit from supplier
      await recordJournalVoucher({
        date: new Date(),
        description: `فاکتور خرید نسیه انبار: ${qty} ${mat.unit} ${mat.name} از ${supplier?.name || 'تأمین‌کننده'}`,
        type: 'auto_purchase',
        lines: [
          {
            accountCode: '105',
            accountName: 'موجودی مواد اولیه انبار',
            debit: totalPurchasePrice,
            credit: 0,
            description: `ورود ${qty} ${mat.unit} ${mat.name} به انبار`,
          },
          {
            accountCode: '201',
            accountName: 'حساب‌های پرداختنی (تأمین‌کنندگان و پرسنل)',
            personId: supplier?.id,
            personName: supplier?.name || 'تأمین‌کننده',
            debit: 0,
            credit: totalPurchasePrice,
            description: `طلب تأمین‌کننده بابت خرید ${mat.name}`,
          },
        ],
      });
    }

    setBuyQty('10');
    setBuyUnitPrice('');
    setBuyDescription('');
    showToast(
      `خرید ${qty} ${mat.unit} ${mat.name} ثبت شد، میانگین موزون قیمت بروزرسانی گردید و سند حسابداری صادر شد.`
    );
  };

  const handleRecordWaste = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetMatId = wasteMatId || materials[0]?.id;
    const mat = materials.find((m) => m.id === Number(targetMatId));
    const qty = Number(wasteQty);
    if (!mat || !mat.id || isNaN(qty) || qty <= 0) return;

    const actualOut = Math.min(mat.currentQty, qty);
    if (actualOut <= 0) return;

    const newQty = Number((mat.currentQty - actualOut).toFixed(4));
    const totalCost = Math.round(actualOut * mat.avgCost);
    const newVal = Math.round(newQty * mat.avgCost);

    await db.rawMaterials.update(mat.id, {
      currentQty: newQty,
      updatedAt: new Date(),
    });

    await db.inventoryTransactions.add({
      materialId: mat.id,
      materialName: mat.name,
      unit: mat.unit,
      date: new Date(),
      type: 'out_manual_waste',
      quantity: actualOut,
      unitPrice: mat.avgCost,
      totalPrice: totalCost,
      balanceQtyAfter: newQty,
      balanceValueAfter: newVal,
      description: wasteReason || 'ثبت خروج دستی / ضایعات انبار',
    });

    await recordJournalVoucher({
      date: new Date(),
      description: `ثبت خروج / ضایعات انبار: ${actualOut} ${mat.unit} ${mat.name}`,
      type: 'auto_expense',
      lines: [
        {
          accountCode: '608',
          accountName: 'هزینه ضایعات و دورریز مواد غذایی',
          debit: totalCost,
          credit: 0,
          description: wasteReason,
        },
        {
          accountCode: '105',
          accountName: 'موجودی مواد اولیه انبار',
          debit: 0,
          credit: totalCost,
          description: `کسر ${actualOut} ${mat.unit} ${mat.name} از انبار`,
        },
      ],
    });

    showToast(`خروج ${actualOut} ${mat.unit} ${mat.name} در کاردکس و سند هزینه ضایعات ثبت شد.`);
  };

  return (
    <div className="space-y-6">
      {/* Sub-view Switcher */}
      <div className="flex items-center justify-between gap-2 bg-white p-2.5 sm:p-4 rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar scrollbar-none w-full pb-0.5">
          <button
            type="button"
            onClick={() => setActiveView('materials')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeView === 'materials'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Package size={15} />
            <span>۱. موجودی و تعریف مواد اولیه ({materials.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('purchase')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeView === 'purchase'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <ShoppingCart size={15} />
            <span>۲. ثبت خرید مواد و ورود به انبار</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('kardex')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeView === 'kardex'
                ? 'bg-teal-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FileSpreadsheet size={15} />
            <span>۳. کاردکس استاندارد گردش انبار ({transactions.length})</span>
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
          <CheckCircle2 size={16} />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* VIEW 1: Raw Materials List & Define New Material */}
      {activeView === 'materials' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Define New Material Form */}
          <form
            onSubmit={handleDefineMaterial}
            className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4 h-fit"
          >
            <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-2">
              تعریف ماده اولیه جدید در انبار
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">نام ماده اولیه</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: روغن سرخ‌کردنی حلبی"
                  value={matName}
                  onChange={(e) => setMatName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">واحد شمارش</label>
                  <select
                    value={matUnit}
                    onChange={(e) => setMatUnit(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                  >
                    <option value="کیلوگرم">کیلوگرم</option>
                    <option value="گرم">گرم</option>
                    <option value="عدد">عدد</option>
                    <option value="لیتر">لیتر</option>
                    <option value="بسته">بسته</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">حداقل موجودی (هشدار)</label>
                  <FormattedNumberInput
                    allowDecimal
                    value={matMinQty}
                    onValueChange={(_, raw) => setMatMinQty(raw)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-left"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">موجودی اولیه</label>
                  <FormattedNumberInput
                    allowDecimal
                    value={matInitQty}
                    onValueChange={(_, raw) => setMatInitQty(raw)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-left"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    فی واحد ({getCurrencyLabel()})
                  </label>
                  <FormattedNumberInput
                    required
                    placeholder="مثلاً 120,000"
                    value={matAvgCost}
                    onValueChange={(val) => setMatAvgCost(String(val))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-left"
                  />
                </div>
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5"
            >
              <Plus size={15} />
              <span>ثبت ماده اولیه جدید</span>
            </button>
          </form>

          {/* Raw Materials Inventory Table */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-sm font-extrabold text-slate-900">
                لیست مواد اولیه و موجودی لحظه‌ای انبار
              </h3>
              <span className="text-xs font-mono font-bold text-teal-800">
                ارزش کل انبار:{' '}
                {formatCurrency(
                  materials.reduce((s, m) => s + Math.round(m.currentQty * m.avgCost), 0)
                )}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">نام ماده اولیه</th>
                    <th className="py-3 px-4">موجودی فعلی</th>
                    <th className="py-3 px-4">میانگین موزون فی</th>
                    <th className="py-3 px-4">ارزش ریالی موجودی</th>
                    <th className="py-3 px-4 text-center">کاردکس</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {materials.map((m) => {
                    const isLow = m.currentQty <= m.minQty;
                    return (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-bold text-slate-800">
                          {m.name}
                          {isLow && (
                            <span className="mr-2 text-[10px] text-rose-600 font-bold">
                              (کمتر از حد مجاز!)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold">
                          {m.currentQty} {m.unit}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-700">
                          {formatCurrency(m.avgCost)}
                        </td>
                        <td className="py-3 px-4 font-mono font-extrabold text-blue-700">
                          {formatCurrency(Math.round(m.currentQty * m.avgCost))}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedMaterialForKardex(m.id!);
                              setActiveView('kardex');
                            }}
                            className="text-teal-700 hover:underline font-bold"
                          >
                            مشاهده کاردکس
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: Purchase Material (Stock-In) & Manual Waste (Stock-Out) */}
      {activeView === 'purchase' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Purchase Form */}
          <form
            onSubmit={handleRecordPurchase}
            className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4"
          >
            <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
              <ShoppingCart className="text-blue-600" size={18} />
              <span>ثبت فاکتور خرید مواد اولیه و ورود به انبار (با سند حسابداری اتوماتیک)</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">انتخاب ماده اولیه</label>
                <select
                  value={buyMaterialId || materials[0]?.id || ''}
                  onChange={(e) => setBuyMaterialId(Number(e.target.value))}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white font-bold"
                >
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} (موجودی: {m.currentQty} {m.unit} - آخرین فی: {formatCurrency(m.avgCost)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">مقدار خریداری شده</label>
                  <FormattedNumberInput
                    allowDecimal
                    required
                    value={buyQty}
                    onValueChange={(val) => setBuyQty(String(val))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-left"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    قیمت خرید هر واحد ({getCurrencyLabel()})
                  </label>
                  <FormattedNumberInput
                    required
                    placeholder="مثلاً 590,000"
                    value={buyUnitPrice}
                    onValueChange={(val) => setBuyUnitPrice(String(val))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-left"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    تأمین‌کننده / فروشنده (اختیاری)
                  </label>
                  <select
                    value={buySupplierId}
                    onChange={(e) => setBuySupplierId(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                  >
                    <option value={0}>خرید مستقیم از بازار</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">نحوه تسویه خرید</label>
                  <select
                    value={buyPaymentMethod}
                    onChange={(e) => setBuyPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold"
                  >
                    <option value="bank">پرداخت از بانک (کارت به کارت / پوز)</option>
                    <option value="cash">پرداخت نقدی از صندوق</option>
                    <option value="credit">خرید نسیه (بستانکار شدن تأمین‌کننده)</option>
                  </select>
                </div>
              </div>

              {buyPaymentMethod === 'bank' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">انتخاب بانک پرداخت‌کننده</label>
                  <select
                    value={buyBankId || banks[0]?.id || ''}
                    onChange={(e) => setBuyBankId(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold"
                  >
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bankName} (موجودی: {formatCurrency(b.currentBalance)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">توضیحات فاکتور خرید</label>
                <input
                  type="text"
                  placeholder="شماره فاکتور یا توضیح خرید..."
                  value={buyDescription}
                  onChange={(e) => setBuyDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2"
            >
              <CheckCircle2 size={16} />
              <span>ثبت ورود کالا به انبار و صدور سند حسابداری</span>
            </button>
          </form>

          {/* Manual Waste / Stock Out Form */}
          <form
            onSubmit={handleRecordWaste}
            className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4 h-fit"
          >
            <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
              <MinusCircle className="text-rose-600" size={18} />
              <span>ثبت خروج دستی کالا یا ضایعات مواد غذایی</span>
            </h3>
            <p className="text-xs text-slate-500">
              توجه: مصرف مواد برای غذاهای فروخته شده به صورت اتوماتیک هنگام ثبت فاکتور در صندوق از انبار کسر می‌شود. از این فرم فقط برای ثبت ضایعات یا مصرف متفرقه استفاده کنید.
            </p>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">انتخاب ماده اولیه</label>
                <select
                  value={wasteMatId || materials[0]?.id || ''}
                  onChange={(e) => setWasteMatId(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold"
                >
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} (موجودی: {m.currentQty} {m.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">مقدار خروج / ضایعات</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={wasteQty}
                  onChange={(e) => setWasteQty(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-left"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">علت خروج / شرح</label>
                <input
                  type="text"
                  value={wasteReason}
                  onChange={(e) => setWasteReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs"
            >
              ثبت خروج از انبار و منظور در هزینه ضایعات
            </button>
          </form>
        </div>
      )}

      {/* VIEW 3: Standard Inventory Kardex (کاردکس استاندارد گردش انبار) */}
      {activeView === 'kardex' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                کاردکس استاندارد مقداری و ریالی انبار (Inventory Kardex Ledger)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                نمایش دقیق تمامی ورودها (خرید) و خروج‌ها (مصرف اتوماتیک فرمول تولید در فروش یا ضایعات) به همراه مانده در خط
              </p>
            </div>

            <select
              value={selectedMaterialForKardex}
              onChange={(e) => setSelectedMaterialForKardex(Number(e.target.value))}
              className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold"
            >
              <option value={0}>همه مواد اولیه انبار</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  کاردکس اختصاصی: {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3">تاریخ و ساعت</th>
                  <th className="py-3 px-3">نام کالا</th>
                  <th className="py-3 px-3">نوع گردش</th>
                  <th className="py-3 px-3 text-emerald-700">مقدار وارده (+)</th>
                  <th className="py-3 px-3 text-rose-700">مقدار صادره (-)</th>
                  <th className="py-3 px-3">فی واحد</th>
                  <th className="py-3 px-3">مبلغ گردش</th>
                  <th className="py-3 px-3 font-black">مانده مقداری</th>
                  <th className="py-3 px-3 font-black">مانده ریالی</th>
                  <th className="py-3 px-3">شرح عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredKardex.map((tx) => {
                  const isIn = tx.type === 'in_purchase' || tx.type === 'in_initial';
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono text-[11px]" dir="ltr">
                        {format(new Date(tx.date), 'yyyy/MM/dd HH:mm')}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-800">{tx.materialName}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`font-bold ${
                            isIn ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {tx.type === 'in_initial'
                            ? 'موجودی اولیه'
                            : tx.type === 'in_purchase'
                            ? 'خرید و ورود'
                            : tx.type === 'out_sale_bom'
                            ? 'مصرف فروش (BOM)'
                            : 'خروج / ضایعات'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                        {isIn ? `+${tx.quantity} ${tx.unit}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-rose-700">
                        {!isIn ? `-${tx.quantity} ${tx.unit}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 font-mono">{formatCurrency(tx.unitPrice)}</td>
                      <td className="py-2.5 px-3 font-mono font-semibold">
                        {formatCurrency(tx.totalPrice)}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-black text-slate-900">
                        {tx.balanceQtyAfter} {tx.unit}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                        {formatCurrency(tx.balanceValueAfter)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate" title={tx.description}>
                        {tx.description}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
