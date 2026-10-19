import React, { useState, useMemo } from 'react';
import {
  RawMaterial,
  InventoryTransaction,
  Person,
  BankAccount,
  db,
  recordJournalVoucher,
  recalculateMaterialKardex,
} from '../../lib/db';
import { calculateWeightedAveragePurchase } from '../../lib/accountingEngine';
import { formatCurrency, getCurrencyLabel } from '../../lib/utils';
import FormattedNumberInput from '../Common/FormattedNumberInput';
import { format } from 'date-fns-jalali';
import {
  Package,
  Plus,
  ShoppingCart,
  FileSpreadsheet,
  CheckCircle2,
  MinusCircle,
  Edit2,
  Trash2,
  X,
  Save,
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

  // Edit Raw Material / Initial Stock Modal State
  const [editingMaterial, setEditingMaterial] = useState<RawMaterial | null>(null);
  const [editMatName, setEditMatName] = useState('');
  const [editMatUnit, setEditMatUnit] = useState<RawMaterial['unit']>('کیلوگرم');
  const [editMatCurrentQty, setEditMatCurrentQty] = useState('0');
  const [editMatMinQty, setEditMatMinQty] = useState('5');
  const [editMatAvgCost, setEditMatAvgCost] = useState('0');

  // Edit Inventory Transaction / Purchase Invoice Modal State
  const [editingTx, setEditingTx] = useState<InventoryTransaction | null>(null);
  const [editTxQty, setEditTxQty] = useState('0');
  const [editTxUnitPrice, setEditTxUnitPrice] = useState('0');
  const [editTxSupplierId, setEditTxSupplierId] = useState<number>(0);
  const [editTxPaymentMethod, setEditTxPaymentMethod] = useState<'bank' | 'cash' | 'credit'>('bank');
  const [editTxDesc, setEditTxDesc] = useState('');

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

  const purchaseInvoices = useMemo(() => {
    return transactions
      .filter((t) => t.type === 'in_purchase' || t.type === 'in_initial')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions]);

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

  const openEditMaterialModal = (mat: RawMaterial) => {
    setEditingMaterial(mat);
    setEditMatName(mat.name);
    setEditMatUnit(mat.unit);
    setEditMatCurrentQty(String(mat.currentQty));
    setEditMatMinQty(String(mat.minQty));
    setEditMatAvgCost(String(mat.avgCost));
  };

  const handleSaveMaterialEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaterial || !editingMaterial.id) return;

    const newName = editMatName.trim() || editingMaterial.name;
    const newQty = Math.max(0, Number(editMatCurrentQty) || 0);
    const newMin = Math.max(0, Number(editMatMinQty) || 0);
    const newCost = Math.max(0, Number(editMatAvgCost) || 0);

    await db.rawMaterials.update(editingMaterial.id, {
      name: newName,
      unit: editMatUnit,
      currentQty: newQty,
      minQty: newMin,
      avgCost: newCost,
      lastPurchasePrice: newCost,
      updatedAt: new Date(),
    });

    // Update initial stock transaction if present
    const matTxs = await db.inventoryTransactions
      .where('materialId')
      .equals(editingMaterial.id)
      .toArray();
    const initTx = matTxs.find((t) => t.type === 'in_initial');

    if (initTx && initTx.id && matTxs.length === 1) {
      await db.inventoryTransactions.update(initTx.id, {
        materialName: newName,
        unit: editMatUnit,
        quantity: newQty,
        unitPrice: newCost,
        totalPrice: Math.round(newQty * newCost),
        balanceQtyAfter: newQty,
        balanceValueAfter: Math.round(newQty * newCost),
      });
    } else if (matTxs.length === 0 && newQty > 0) {
      await db.inventoryTransactions.add({
        materialId: editingMaterial.id,
        materialName: newName,
        unit: editMatUnit,
        date: new Date(),
        type: 'in_initial',
        quantity: newQty,
        unitPrice: newCost,
        totalPrice: Math.round(newQty * newCost),
        balanceQtyAfter: newQty,
        balanceValueAfter: Math.round(newQty * newCost),
        description: 'ثبت / اصلاح موجودی اول دوره انبار',
      });
    } else {
      // Update materialName and unit across all transactions of this material
      for (const tx of matTxs) {
        if (tx.id) {
          await db.inventoryTransactions.update(tx.id, {
            materialName: newName,
            unit: editMatUnit,
          });
        }
      }
    }

    setEditingMaterial(null);
    showToast(`اطلاعات و موجودی «${newName}» با موفقیت ویرایش شد.`);
  };

  const handleDeleteMaterial = async (mat: RawMaterial) => {
    if (!mat.id) return;
    if (
      !window.confirm(
        `آیا از حذف کامل ماده اولیه «${mat.name}» و سوابق کاردکس آن از انبار اطمینان دارید؟`
      )
    ) {
      return;
    }

    const matTxs = await db.inventoryTransactions.where('materialId').equals(mat.id).toArray();
    for (const tx of matTxs) {
      if (tx.id) await db.inventoryTransactions.delete(tx.id);
    }
    await db.rawMaterials.delete(mat.id);
    showToast(`ماده اولیه «${mat.name}» از انبار حذف شد.`);
  };

  const openEditTxModal = (tx: InventoryTransaction) => {
    setEditingTx(tx);
    setEditTxQty(String(tx.quantity));
    setEditTxUnitPrice(String(tx.unitPrice));
    setEditTxSupplierId(tx.personId || 0);
    setEditTxPaymentMethod(
      (tx.paymentMethod === 'cash' || tx.paymentMethod === 'credit' ? tx.paymentMethod : 'bank')
    );
    setEditTxDesc(tx.description || '');
  };

  const handleSaveTxEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx || !editingTx.id) return;

    const qty = Math.max(0.0001, Number(editTxQty) || 0);
    const unitPrice = Math.max(0, Number(editTxUnitPrice) || 0);
    const totalPrice = Math.round(qty * unitPrice);
    const supplier = persons.find((p) => p.id === Number(editTxSupplierId));

    await db.inventoryTransactions.update(editingTx.id, {
      quantity: qty,
      unitPrice,
      totalPrice,
      personId: supplier?.id,
      personName: supplier?.name || editingTx.personName,
      paymentMethod: editTxPaymentMethod,
      description: editTxDesc.trim() || editingTx.description,
    });

    await recalculateMaterialKardex(editingTx.materialId);
    setEditingTx(null);
    showToast('فاکتور / گردش انبار ویرایش شد و موجودی و میانگین موزون کاردکس بازمحاسبه گردید.');
  };

  const handleDeleteTx = async (tx: InventoryTransaction) => {
    if (!tx.id) return;
    if (
      !window.confirm(
        `آیا از حذف این گردش انبار (${tx.materialName} - مقدار: ${tx.quantity} ${tx.unit}) اطمینان دارید؟ موجودی انبار به صورت خودکار اصلاح خواهد شد.`
      )
    ) {
      return;
    }

    const mat = await db.rawMaterials.get(tx.materialId);
    await db.inventoryTransactions.delete(tx.id);

    const remainingTxs = await db.inventoryTransactions
      .where('materialId')
      .equals(tx.materialId)
      .count();

    if (remainingTxs > 0) {
      await recalculateMaterialKardex(tx.materialId);
    } else if (mat && mat.id) {
      const isIn = tx.type === 'in_initial' || tx.type === 'in_purchase';
      const newQty = isIn
        ? Math.max(0, Number((mat.currentQty - tx.quantity).toFixed(4)))
        : Number((mat.currentQty + tx.quantity).toFixed(4));
      await db.rawMaterials.update(mat.id, {
        currentQty: newQty,
        updatedAt: new Date(),
      });
    }

    showToast('گردش انبار / فاکتور خرید حذف شد و موجودی انبار بروزرسانی گردید.');
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
            <span>۱. موجودی اول دوره و تعریف مواد اولیه ({materials.length})</span>
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
            <span>۲. ثبت و ویرایش فاکتور خرید مواد ({purchaseInvoices.length})</span>
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
              تعریف ماده اولیه جدید و موجودی اول دوره
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
                    <option value="کارتن">کارتن</option>
                    <option value="بسته">بسته</option>
                    <option value="لیتر">لیتر</option>
                    <option value="سی‌سی">سی‌سی</option>
                    <option value="مثقال">مثقال</option>
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
                  <label className="block font-bold text-slate-700 mb-1">موجودی اول دوره</label>
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
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus size={15} />
              <span>ثبت ماده اولیه جدید</span>
            </button>
          </form>

          {/* Raw Materials Inventory Table */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-sm font-extrabold text-slate-900">
                لیست مواد اولیه و موجودی انبار (با قابلیت ویرایش موجودی اول دوره و حذف)
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
                    <th className="py-3 px-4 text-center">عملیات / ویرایش / حذف</th>
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
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedMaterialForKardex(m.id!);
                                setActiveView('kardex');
                              }}
                              className="px-2 py-1 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-lg font-bold text-[11px] cursor-pointer"
                            >
                              کاردکس
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditMaterialModal(m)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                              title="ویرایش موجودی اول دوره و مشخصات کالا"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteMaterial(m)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                              title="حذف ماده اولیه"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
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

      {/* VIEW 2: Purchase Material (Stock-In) & Manual Waste (Stock-Out) & Purchase Invoices List */}
      {activeView === 'purchase' && (
        <div className="space-y-6">
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
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
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
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs cursor-pointer"
              >
                ثبت خروج از انبار و منظور در هزینه ضایعات
              </button>
            </form>
          </div>

          {/* Purchase Invoices History Table with Edit & Delete */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  لیست فاکتورهای خرید و موجودی اول دوره ثبت شده (قابل ویرایش و حذف)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  با ویرایش یا حذف هر فاکتور خرید، موجودی انبار و قیمت میانگین موزون کالا به صورت خودکار بازمحاسبه می‌شود.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3">تاریخ</th>
                    <th className="py-3 px-3">نوع</th>
                    <th className="py-3 px-3">نام کالا</th>
                    <th className="py-3 px-3">مقدار خرید</th>
                    <th className="py-3 px-3">فی واحد</th>
                    <th className="py-3 px-3">مبلغ کل فاکتور</th>
                    <th className="py-3 px-3">تأمین‌کننده / تسویه</th>
                    <th className="py-3 px-3">شرح</th>
                    <th className="py-3 px-3 text-center">ویرایش / حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {purchaseInvoices.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono text-[11px]" dir="ltr">
                        {format(new Date(tx.date), 'yyyy/MM/dd HH:mm')}
                      </td>
                      <td className="py-2.5 px-3 font-bold">
                        {tx.type === 'in_initial' ? (
                          <span className="text-teal-700">موجودی اول دوره</span>
                        ) : (
                          <span className="text-blue-700">فاکتور خرید</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{tx.materialName}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                        {tx.quantity} {tx.unit}
                      </td>
                      <td className="py-2.5 px-3 font-mono">{formatCurrency(tx.unitPrice)}</td>
                      <td className="py-2.5 px-3 font-mono font-extrabold text-slate-900">
                        {formatCurrency(tx.totalPrice)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {tx.personName || 'مستقیم'}
                        {tx.paymentMethod && (
                          <span className="text-[10px] text-slate-500 block">
                            ({tx.paymentMethod === 'cash' ? 'نقدی' : tx.paymentMethod === 'credit' ? 'نسیه' : tx.bankName || 'بانک'})
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">{tx.description}</td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditTxModal(tx)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                            title="ویرایش فاکتور خرید / موجودی اولیه"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTx(tx)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                            title="حذف فاکتور خرید"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {purchaseInvoices.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        هیچ فاکتور خریدی ثبت نشده است.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: Standard Inventory Kardex (کاردکس استاندارد گردش انبار) */}
      {activeView === 'kardex' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                کاردکس استاندارد مقداری و ریالی انبار (همراه با ویرایش و حذف گردش‌ها)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                نمایش دقیق تمامی ورودها (خرید و اول دوره) و خروج‌ها (مصرف فرمول تولید یا ضایعات) با امکان اصلاح و حذف
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
                  <th className="py-3 px-3 text-center">ویرایش / حذف</th>
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
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditTxModal(tx)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                            title="ویرایش گردش انبار"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTx(tx)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                            title="حذف گردش انبار"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: Edit Raw Material & Initial Inventory Stock */}
      {editingMaterial && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">
                ویرایش کالا و موجودی انبار: {editingMaterial.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingMaterial(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveMaterialEdit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">نام ماده اولیه</label>
                <input
                  type="text"
                  required
                  value={editMatName}
                  onChange={(e) => setEditMatName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">واحد شمارش</label>
                  <select
                    value={editMatUnit}
                    onChange={(e) => setEditMatUnit(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold"
                  >
                    <option value="کیلوگرم">کیلوگرم</option>
                    <option value="گرم">گرم</option>
                    <option value="عدد">عدد</option>
                    <option value="کارتن">کارتن</option>
                    <option value="بسته">بسته</option>
                    <option value="لیتر">لیتر</option>
                    <option value="سی‌سی">سی‌سی</option>
                    <option value="مثقال">مثقال</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">حداقل موجودی هشدار</label>
                  <FormattedNumberInput
                    allowDecimal
                    value={editMatMinQty}
                    onValueChange={(_, raw) => setEditMatMinQty(raw)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-left"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    موجودی فعلی / اول دوره
                  </label>
                  <FormattedNumberInput
                    allowDecimal
                    value={editMatCurrentQty}
                    onValueChange={(_, raw) => setEditMatCurrentQty(raw)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold text-left"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    میانگین موزون فی ({getCurrencyLabel()})
                  </label>
                  <FormattedNumberInput
                    value={editMatAvgCost}
                    onValueChange={(val) => setEditMatAvgCost(String(val))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold text-left"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Save size={15} />
                  <span>ذخیره تغییرات</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingMaterial(null)}
                  className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit Purchase Invoice / Inventory Transaction */}
      {editingTx && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">
                ویرایش گردش انبار / فاکتور خرید: {editingTx.materialName}
              </h3>
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveTxEdit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    مقدار ({editingTx.unit})
                  </label>
                  <FormattedNumberInput
                    allowDecimal
                    required
                    value={editTxQty}
                    onValueChange={(_, raw) => setEditTxQty(raw)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold text-left"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    فی واحد ({getCurrencyLabel()})
                  </label>
                  <FormattedNumberInput
                    required
                    value={editTxUnitPrice}
                    onValueChange={(val) => setEditTxUnitPrice(String(val))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold text-left"
                  />
                </div>
              </div>

              {editingTx.type === 'in_purchase' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">تأمین‌کننده</label>
                    <select
                      value={editTxSupplierId}
                      onChange={(e) => setEditTxSupplierId(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold"
                    >
                      <option value={0}>خرید مستقیم بازار</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">نحوه تسویه</label>
                    <select
                      value={editTxPaymentMethod}
                      onChange={(e) => setEditTxPaymentMethod(e.target.value as any)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold"
                    >
                      <option value="bank">پرداخت از بانک</option>
                      <option value="cash">پرداخت نقدی</option>
                      <option value="credit">خرید نسیه</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">شرح گردش / فاکتور</label>
                <input
                  type="text"
                  value={editTxDesc}
                  onChange={(e) => setEditTxDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Save size={15} />
                  <span>ذخیره تغییرات و اصلاح موجودی</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTx(null)}
                  className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
