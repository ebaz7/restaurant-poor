import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  KitchenProductionBatch,
  recordKitchenProductionBatch,
  updateKitchenProductionBatch,
  deleteKitchenProductionBatch,
} from '../../lib/db';
import { calculateKitchenBatchProduction } from '../../lib/accountingEngine';
import { formatCurrency, formatNumber } from '../../lib/utils';
import FormattedNumberInput from '../Common/FormattedNumberInput';
import { format } from 'date-fns-jalali';
import {
  ChefHat,
  Flame,
  PackageCheck,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Minus,
  History,
  Calculator,
  Utensils,
  RotateCcw,
  EyeOff,
  X,
  Edit3,
  Trash2,
} from 'lucide-react';

type MobileKitchenTab = 'input' | 'consumption' | 'history';

interface KitchenProductionScreenProps {
  canEditProduction?: boolean;
  canDeleteProduction?: boolean;
}

export default function KitchenProductionScreen({
  canEditProduction = true,
  canDeleteProduction = true,
}: KitchenProductionScreenProps) {
  const settings = useLiveQuery(() => db.settings.toCollection().first());
  const hideCostPrice = settings?.hideCostPriceFromKitchen ?? false;

  const menuItems = useLiveQuery(() => db.menuItems.toArray()) || [];
  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const recipes = useLiveQuery(() => db.productionRecipes.toArray()) || [];
  const materials = useLiveQuery(() => db.rawMaterials.toArray()) || [];
  const productionLogs =
    useLiveQuery(() => db.kitchenProductions.orderBy('createdAt').reverse().toArray()) || [];

  const [mobileTab, setMobileTab] = useState<MobileKitchenTab>('input');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'all'>('all');
  const [shiftLabel, setShiftLabel] = useState<string>('آماده‌سازی سلف سرویس');
  const [chefName, setChefName] = useState<string>('استاد رضا کمالی');
  const [notes, setNotes] = useState<string>('');
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [editingBatch, setEditingBatch] = useState<KitchenProductionBatch | null>(null);
  const [confirmDeleteBatchId, setConfirmDeleteBatchId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showNotice = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4500);
  };

  const recipeByMenuId = useMemo(() => {
    const map = new Map<number, (typeof recipes)[0]>();
    recipes.forEach((r) => map.set(r.menuItemId, r));
    return map;
  }, [recipes]);

  const filteredMenuItems = useMemo(() => {
    return menuItems.filter(
      (item) =>
        item.isActive &&
        (selectedCategoryId === 'all' || item.categoryId === selectedCategoryId)
    );
  }, [menuItems, selectedCategoryId]);

  const batchSummary = useMemo(() => {
    const items = menuItems
      .filter((m) => m.id !== undefined && (quantities[m.id] || 0) > 0)
      .map((m) => ({
        menuItemId: m.id!,
        menuItemName: m.name,
        quantityProduced: quantities[m.id!] || 0,
        sellingPrice: m.price,
      }));

    return calculateKitchenBatchProduction({
      items,
      recipes: recipes.map((r) => ({
        menuItemId: r.menuItemId,
        menuItemName: r.menuItemName,
        ingredients: r.ingredients,
        laborCost: r.laborCost,
        overheadCost: r.overheadCost,
        packagingCost: r.packagingCost,
      })),
      materials: materials
        .filter((m) => m.id !== undefined)
        .map((m) => ({
          id: m.id!,
          name: m.name,
          unit: m.unit,
          unitsPerPackage: m.unitsPerPackage,
          currentQty: m.currentQty,
          avgCost: m.avgCost,
        })),
    });
  }, [menuItems, quantities, recipes, materials]);

  // Aggregate today's produced counts per product
  const todayStats = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    let totalPortionsToday = 0;
    let totalCostToday = 0;
    const perProductMap = new Map<number, { name: string; count: number; cost: number }>();

    for (const log of productionLogs) {
      if (new Date(log.createdAt) >= startOfToday) {
        totalPortionsToday += log.totalPortions;
        totalCostToday += log.totalBatchCost;
        for (const it of log.items) {
          const cur = perProductMap.get(it.menuItemId) || {
            name: it.menuItemName,
            count: 0,
            cost: 0,
          };
          cur.count += it.quantityProduced;
          cur.cost += it.totalCost;
          perProductMap.set(it.menuItemId, cur);
        }
      }
    }

    return {
      totalPortionsToday,
      totalCostToday,
      perProduct: Array.from(perProductMap.values()).sort((a, b) => b.count - a.count),
    };
  }, [productionLogs]);

  const setItemQty = (menuItemId: number, newQty: number) => {
    const safe = Math.max(0, Math.round(newQty || 0));
    setQuantities((prev) => {
      const next = { ...prev };
      if (safe <= 0) {
        delete next[menuItemId];
      } else {
        next[menuItemId] = safe;
      }
      return next;
    });
  };

  const adjustItemQty = (menuItemId: number, delta: number) => {
    const cur = quantities[menuItemId] || 0;
    setItemQty(menuItemId, cur + delta);
  };

  const handleCancelSelectedProduction = () => {
    setQuantities({});
    setNotes('');
    if (editingBatch) {
      setEditingBatch(null);
      showNotice('success', 'ویرایش پارت تولید لغو شد.');
    } else {
      showNotice('success', 'تولید انتخاب شده کنسل و پاک شد.');
    }
  };

  const handleStartEditBatch = (batch: KitchenProductionBatch) => {
    if (!canEditProduction) {
      showNotice('error', 'شما مجوز ویرایش پارت‌های تولید آشپزخانه را ندارید.');
      return;
    }
    const nextQuantities: Record<number, number> = {};
    for (const it of batch.items) {
      if (it.quantityProduced > 0) {
        nextQuantities[it.menuItemId] = it.quantityProduced;
      }
    }
    setQuantities(nextQuantities);
    setShiftLabel(batch.shiftLabel || 'آماده‌سازی سلف سرویس');
    setChefName(batch.chefName || 'سرآشپز شیفت');
    setNotes(batch.notes || '');
    setEditingBatch(batch);
    setMobileTab('input');
    showNotice(
      'success',
      `پارت تولید #${batch.batchNumber} جهت ویرایش بارگذاری شد. مقادیر را تغییر داده و ذخیره کنید.`
    );
  };

  const handleDeleteBatch = async (batch: KitchenProductionBatch) => {
    if (!canDeleteProduction || !batch.id) {
      showNotice('error', 'شما مجوز حذف پارت تولید را ندارید.');
      return;
    }
    try {
      await deleteKitchenProductionBatch(batch.id);
      if (editingBatch?.id === batch.id) {
        setEditingBatch(null);
        setQuantities({});
        setNotes('');
      }
      setConfirmDeleteBatchId(null);
      showNotice(
        'success',
        `پارت تولید #${batch.batchNumber} حذف و ابطال شد؛ مواد اولیه مصرفی به موجودی انبار برگشت داده شد و سند حسابداری آن حذف گردید.`
      );
    } catch (err) {
      console.error(err);
      showNotice('error', 'خطا در حذف پارت تولید.');
    }
  };

  const handleRecordProduction = async () => {
    if (batchSummary.totalPortionsProduced <= 0) {
      showNotice('error', 'لطفاً ابتدا تعداد تولید حداقل یکی از محصولات منو را وارد کنید.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        shiftLabel,
        chefName: chefName.trim() || 'سرآشپز شیفت',
        notes: notes.trim() || undefined,
        items: batchSummary.productBreakdown.map((p) => ({
          menuItemId: p.menuItemId,
          menuItemName: p.menuItemName,
          quantityProduced: p.quantityProduced,
          unitCost: p.unitTotalCost,
          totalCost: p.batchTotalCost,
        })),
        materialConsumptions: batchSummary.materialConsumptions.map((mc) => ({
          materialId: mc.materialId,
          materialName: mc.materialName,
          unit: mc.unit,
          grossQuantityConsumed: mc.grossQuantityConsumed,
          unitCost: mc.unitCost,
          totalMaterialCost: mc.totalMaterialCost,
        })),
        totalPortions: batchSummary.totalPortionsProduced,
        totalMaterialsCost: batchSummary.totalMaterialsCost,
        totalLaborAndOverheadCost:
          batchSummary.totalLaborCost +
          batchSummary.totalOverheadCost +
          batchSummary.totalPackagingCost,
        totalBatchCost: batchSummary.totalBatchCost,
      };

      if (editingBatch && editingBatch.id) {
        await updateKitchenProductionBatch(editingBatch.id, payload);
        showNotice(
          'success',
          `ویرایش پارت تولید #${editingBatch.batchNumber} (${formatNumber(
            batchSummary.totalPortionsProduced
          )} پرس) با موفقیت ذخیره شد و موجودی انبار و سند حسابداری اصلاح گردید.`
        );
        setEditingBatch(null);
      } else {
        await recordKitchenProductionBatch(payload);
        showNotice(
          'success',
          `تولید ${formatNumber(
            batchSummary.totalPortionsProduced
          )} پرس غذا ثبت شد؛ مواد اولیه طبق فرمول از انبار کسر و سند حسابداری صادر گردید.`
        );
      }

      setQuantities({});
      setNotes('');
      setMobileTab('history');
    } catch (err) {
      console.error(err);
      showNotice('error', 'خطا در ثبت تولید آشپزخانه.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Compact Header + Mobile Sub-Tab Switcher */}
      <div className="bg-white border-b border-slate-200 px-3 md:px-6 py-2.5 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-orange-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <ChefHat size={20} />
              </div>
              <div>
                <h1 className="text-sm md:text-lg font-extrabold text-slate-900">
                  واحد آشپزخانه، ثبت تولید سلف سرویس و مصرف مواد اولیه
                </h1>
                <p className="hidden sm:block text-[11px] text-slate-500">
                  ثبت تعداد پخت روزانه از روی منو و کسر اتوماتیک مواد اولیه از انبار طبق فرمول تولید (BOM)
                </p>
              </div>
            </div>

            {/* Live Today Summary Badges */}
            <div className="flex items-center gap-2 text-xs">
              <div className="px-2.5 py-1.5 rounded-xl bg-orange-50 border border-orange-200 text-orange-900 font-bold">
                تولید امروز:{' '}
                <span className="font-mono font-black text-orange-700">
                  {formatNumber(todayStats.totalPortionsToday)} پرس
                </span>
              </div>
              {hideCostPrice ? (
                <div className="px-2.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-bold flex items-center gap-1.5">
                  <EyeOff size={13} className="text-amber-700" />
                  <span>قیمت تمام شده: محرمانه</span>
                </div>
              ) : (
                <div className="hidden sm:block px-2.5 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 font-bold">
                  بهای پخت امروز:{' '}
                  <span className="font-mono font-black text-slate-900">
                    {formatCurrency(todayStats.totalCostToday)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Zero-Scroll View Switcher */}
          <div className="flex md:hidden items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setMobileTab('input')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                mobileTab === 'input'
                  ? 'bg-white text-orange-700 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              <Utensils size={13} />
              <span>۱. ثبت پخت ({formatNumber(batchSummary.totalPortionsProduced)})</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('consumption')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                mobileTab === 'consumption'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              <Calculator size={13} />
              <span>۲. مصرف مواد ({batchSummary.materialConsumptions.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('history')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                mobileTab === 'history'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              <History size={13} />
              <span>۳. آمار و سوابق</span>
            </button>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`mx-3 md:mx-6 mt-2 p-2.5 rounded-xl border flex items-center gap-2 text-xs font-bold shrink-0 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Active Edit Mode Banner */}
      {editingBatch && (
        <div className="mx-3 md:mx-6 mt-2 p-2.5 rounded-xl bg-amber-50 border-2 border-amber-400 flex items-center justify-between gap-2 text-xs font-extrabold text-amber-950 shrink-0">
          <div className="flex items-center gap-2">
            <Edit3 size={16} className="text-amber-700 shrink-0" />
            <span>
              در حال ویرایش پارت تولید #{editingBatch.batchNumber} ({editingBatch.shiftLabel}) — مقادیر پخت را اصلاح کرده و دکمه ذخیره ویرایش را بزنید.
            </span>
          </div>
          <button
            type="button"
            onClick={handleCancelSelectedProduction}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <X size={13} />
            <span>انصراف از ویرایش</span>
          </button>
        </div>
      )}

      {/* Main Content Grid — Zero Page Scroll on Mobile & Desktop */}
      <div className="flex-1 overflow-hidden p-2.5 md:p-5 max-w-7xl w-full mx-auto grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Panel 1: Menu Items Quantity Input (Left/Right 5 cols on desktop) */}
        <div
          className={`md:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col h-full overflow-hidden ${
            mobileTab === 'input' ? 'flex' : 'hidden md:flex'
          }`}
        >
          <div className="p-3 border-b border-slate-100 bg-slate-50/70 space-y-2 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs md:text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                <Flame size={16} className="text-orange-600" />
                {editingBatch
                  ? `۱. ویرایش اقلام پارت تولید #${editingBatch.batchNumber}`
                  : '۱. انتخاب غذا و ثبت تعداد تولید آشپزخانه'}
              </h2>
              {(batchSummary.totalPortionsProduced > 0 || editingBatch) && (
                <button
                  type="button"
                  onClick={handleCancelSelectedProduction}
                  className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-[11px] font-bold text-rose-700 flex items-center gap-1 cursor-pointer transition"
                >
                  <RotateCcw size={12} />
                  <span>{editingBatch ? 'لغو ویرایش' : 'کنسل کردن تولید انتخابی'}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={shiftLabel}
                onChange={(e) => setShiftLabel(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
              >
                <option value="آماده‌سازی سلف سرویس">آماده‌سازی خط سلف سرویس</option>
                <option value="شیفت ظهر (ناهار)">پخت شیفت ظهر (ناهار)</option>
                <option value="شیفت شب (شام)">پخت شیفت شب (شام)</option>
              </select>
              <input
                type="text"
                value={chefName}
                onChange={(e) => setChefName(e.target.value)}
                placeholder="نام سرآشپز..."
                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
              />
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              <button
                type="button"
                onClick={() => setSelectedCategoryId('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition ${
                  selectedCategoryId === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-600'
                }`}
              >
                همه منو
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(cat.id!)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition ${
                    selectedCategoryId === cat.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-slate-200 text-slate-600'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {filteredMenuItems.map((item) => {
              const qty = quantities[item.id!] || 0;
              const recipe = recipeByMenuId.get(item.id!);
              return (
                <div
                  key={item.id}
                  className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                    qty > 0
                      ? 'bg-orange-50/70 border-orange-300 shadow-2xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-extrabold text-slate-900 truncate">
                      {item.name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {recipe ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                          فرمول تولید فعال ({recipe.ingredients.length} ماده اولیه)
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                          فاقد فرمول BOM
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quick Stepper + 3-digit Quantity Input + Cancel Item Button */}
                  <div className="flex items-center gap-1 shrink-0">
                    {qty > 0 && (
                      <button
                        type="button"
                        onClick={() => setItemQty(item.id!, 0)}
                        className="px-1.5 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 text-[10px] font-bold flex items-center gap-0.5 transition cursor-pointer"
                        title={`کنسل کردن تولید ${item.name}`}
                      >
                        <X size={12} />
                        <span>کنسل</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => adjustItemQty(item.id!, 10)}
                      className="px-2 py-1 rounded-lg bg-orange-100 hover:bg-orange-200 text-orange-800 text-[11px] font-black transition cursor-pointer"
                      title="افزودن ۱۰ پرس"
                    >
                      +۱۰
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustItemQty(item.id!, 1)}
                      className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center justify-center transition cursor-pointer"
                    >
                      <Plus size={14} />
                    </button>
                    <FormattedNumberInput
                      value={qty === 0 ? '' : qty}
                      onValueChange={(val) => setItemQty(item.id!, val)}
                      placeholder="0"
                      ariaLabel={`تعداد تولید ${item.name}`}
                      className="w-16 px-1.5 py-1 text-center font-mono text-xs font-black bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <button
                      type="button"
                      onClick={() => adjustItemQty(item.id!, -1)}
                      disabled={qty <= 0}
                      className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 flex items-center justify-center transition cursor-pointer"
                    >
                      <Minus size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile Quick Next Button */}
          {batchSummary.totalPortionsProduced > 0 && (
            <div className="p-2.5 border-t border-slate-200 bg-orange-50 flex md:hidden items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-orange-950">
                جمع انتخابی: {formatNumber(batchSummary.totalPortionsProduced)} پرس
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCancelSelectedProduction}
                  className="px-2.5 py-1.5 rounded-xl bg-rose-100 text-rose-700 text-xs font-bold"
                >
                  کنسل
                </button>
                <button
                  type="button"
                  onClick={() => setMobileTab('consumption')}
                  className="px-3.5 py-1.5 rounded-xl bg-orange-600 text-white text-xs font-bold"
                >
                  مشاهده مصرف مواد و ثبت نهایی ←
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Panel 2: Live Raw Material Consumption Breakdown & Submit (Center 4 cols on desktop) */}
        <div
          className={`md:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col h-full overflow-hidden ${
            mobileTab === 'consumption' ? 'flex' : 'hidden md:flex'
          }`}
        >
          <div className="p-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between shrink-0">
            <h2 className="text-xs md:text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
              <PackageCheck size={16} className="text-blue-600" />
              ۲. محاسبه دقیق مصرف مواد اولیه (BOM)
            </h2>
            <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
              {formatNumber(batchSummary.totalPortionsProduced)} پرس
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {batchSummary.totalPortionsProduced === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-4">
                <Calculator size={32} className="mb-2 opacity-30" />
                <p className="text-xs font-bold">
                  تعداد پخت محصولات را از ستون منو وارد کنید تا میزان دقیق مصرف گوشت، برنج، مرغ و...
                  طبق فرمول تولید محاسبه شود.
                </p>
              </div>
            ) : (
              <>
                {/* Selected Products Summary with per-item cancel button */}
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold text-slate-700">
                      خلاصه محصولات انتخاب شده برای پخت:
                    </span>
                    <button
                      type="button"
                      onClick={handleCancelSelectedProduction}
                      className="text-[10px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-0.5 cursor-pointer"
                    >
                      <X size={12} />
                      <span>کنسل همه</span>
                    </button>
                  </div>
                  {batchSummary.productBreakdown.map((prod) => (
                    <div
                      key={prod.menuItemId}
                      className="flex items-center justify-between gap-2 text-xs border-b border-slate-200/60 last:border-0 pb-1.5 last:pb-0"
                    >
                      <span className="font-bold text-slate-800 truncate">
                        {prod.menuItemName}{' '}
                        <span className="text-orange-600 font-mono font-black">
                          × {formatNumber(prod.quantityProduced)} پرس
                        </span>
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {!hideCostPrice && (
                          <span className="font-mono text-[11px] font-bold text-slate-700">
                            {formatCurrency(prod.batchTotalCost)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setItemQty(prod.menuItemId, 0)}
                          className="p-1 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-600 transition cursor-pointer"
                          title={`حذف ${prod.menuItemName} از لیست پخت`}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Raw Materials Consumption Table */}
                <div className="space-y-2">
                  <div className="text-[11px] font-extrabold text-slate-700">
                    ریزمصرف مواد اولیه از انبار (با احتساب ضریب پرت):
                  </div>
                  {batchSummary.materialConsumptions.map((mc) => (
                    <div
                      key={mc.materialId}
                      className={`p-2.5 rounded-xl border text-xs ${
                        mc.isShortage
                          ? 'bg-rose-50/70 border-rose-300'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between font-extrabold text-slate-900">
                        <span>{mc.materialName}</span>
                        <span className="font-mono text-blue-700">
                          مصرف کل: {formatNumber(mc.grossQuantityConsumed)} {mc.unit}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                        <span>
                          موجودی فعلی: {formatNumber(mc.availableStock)} {mc.unit}
                        </span>
                        <span
                          className={`font-mono font-bold ${
                            mc.isShortage ? 'text-rose-600' : 'text-emerald-700'
                          }`}
                        >
                          مانده پس از پخت: {formatNumber(mc.remainingStock)} {mc.unit}
                        </span>
                      </div>
                      {!hideCostPrice && (
                        <div className="flex items-center justify-between text-[11px] text-slate-600 mt-1 pt-1 border-t border-slate-100">
                          <span>ارزش ریالی مصرف این ماده:</span>
                          <span className="font-mono font-bold text-slate-900">
                            {formatCurrency(mc.totalMaterialCost)}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {batchSummary.hasAnyShortage && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2 text-[11px] font-bold text-amber-900">
                    <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                    <span>
                      موجودی برخی مواد اولیه در انبار کمتر از مقدار مصرف است (موجودی پس از ثبت صفر
                      خواهد شد).
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer Cost Breakdown & Submit / Cancel Buttons */}
          <div className="p-3 border-t border-slate-200 bg-slate-50 space-y-2 shrink-0">
            {hideCostPrice ? (
              <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-center flex items-center justify-center gap-1.5 text-[11px] font-bold text-amber-900">
                <EyeOff size={14} className="text-amber-700" />
                <span>قیمت تمام شده و مبالغ ریالی طبق تنظیمات مدیریت برای آشپز مخفی شده است.</span>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-bold">بهای مواد اولیه مصرفی:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatCurrency(batchSummary.totalMaterialsCost)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-bold">دستمزد، سربار و بسته‌بندی:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatCurrency(
                      batchSummary.totalLaborCost +
                        batchSummary.totalOverheadCost +
                        batchSummary.totalPackagingCost
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm font-black pt-1 border-t border-slate-200">
                  <span className="text-slate-900">بهای تمام شده کل پارت تولید:</span>
                  <span className="font-mono text-orange-600">
                    {formatCurrency(batchSummary.totalBatchCost)}
                  </span>
                </div>
              </>
            )}

            <div className="flex items-center gap-2">
              {(batchSummary.totalPortionsProduced > 0 || editingBatch) && (
                <button
                  type="button"
                  onClick={handleCancelSelectedProduction}
                  className="px-3 py-2.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1 transition cursor-pointer shrink-0"
                >
                  <X size={15} />
                  <span>{editingBatch ? 'انصراف' : 'کنسل تولید'}</span>
                </button>
              )}

              <button
                type="button"
                disabled={batchSummary.totalPortionsProduced === 0 || isSubmitting}
                onClick={handleRecordProduction}
                className={`flex-1 py-2.5 disabled:bg-slate-300 text-white rounded-xl font-bold text-xs md:text-sm shadow-xs transition flex items-center justify-center gap-2 cursor-pointer ${
                  editingBatch
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-orange-600 hover:bg-orange-700'
                }`}
              >
                <ChefHat size={17} />
                <span>
                  {editingBatch
                    ? `ذخیره ویرایش پارت تولید #${editingBatch.batchNumber}`
                    : 'ثبت تولید آشپزخانه و کسر اتوماتیک مواد از انبار'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Panel 3: Today's Production Per Item & Batch History (3 cols on desktop) */}
        <div
          className={`md:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col h-full overflow-hidden ${
            mobileTab === 'history' ? 'flex' : 'hidden md:flex'
          }`}
        >
          <div className="p-3 border-b border-slate-100 bg-slate-50/70 shrink-0">
            <h2 className="text-xs md:text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
              <History size={16} className="text-emerald-600" />
              ۳. آمار تولید هر محصول و سوابق پخت
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* Aggregated Per-Product Production Today */}
            <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-1.5">
              <div className="text-[11px] font-extrabold text-emerald-950">
                جمع تولید هر محصول در امروز:
              </div>
              {todayStats.perProduct.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  امروز هنوز پارت تولیدی در آشپزخانه ثبت نشده است.
                </p>
              ) : (
                todayStats.perProduct.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs bg-white px-2.5 py-1.5 rounded-lg border border-emerald-100"
                  >
                    <span className="font-bold text-slate-800 truncate">{p.name}</span>
                    <span className="font-mono font-black text-emerald-700 shrink-0">
                      {formatNumber(p.count)} پرس
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Batch Logs History */}
            <div className="space-y-2">
              <div className="text-[11px] font-extrabold text-slate-700">
                پارت‌های تولید ثبت شده ({formatNumber(productionLogs.length)} مورد):
              </div>
              {productionLogs.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">
                  سابقه‌ای ثبت نشده است.
                </p>
              ) : (
                productionLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-2.5 rounded-xl border space-y-1.5 text-xs transition ${
                      editingBatch?.id === log.id
                        ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20'
                        : 'border-slate-200 bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-extrabold text-slate-900">
                        پارت #{log.batchNumber} · {log.shiftLabel}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {format(new Date(log.createdAt), 'yyyy/MM/dd HH:mm')}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600">
                      سرآشپز: <strong>{log.chefName}</strong> · جمع پخت:{' '}
                      <strong className="text-orange-700 font-mono">
                        {formatNumber(log.totalPortions)} پرس
                      </strong>
                    </div>
                    <div className="text-[11px] text-slate-700 bg-white p-2 rounded-lg border border-slate-200/80 space-y-0.5">
                      {log.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>{it.menuItemName}</span>
                          <span className="font-mono font-bold">
                            {formatNumber(it.quantityProduced)} پرس
                          </span>
                        </div>
                      ))}
                    </div>
                    {!hideCostPrice && (
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200">
                        <span className="text-slate-500">بهای تمام شده پارت:</span>
                        <span className="font-mono font-black text-slate-900">
                          {formatCurrency(log.totalBatchCost)}
                        </span>
                      </div>
                    )}

                    {/* Permission-gated Edit & Delete/Cancel buttons */}
                    {(canEditProduction || canDeleteProduction) && (
                      <div className="pt-1.5 border-t border-slate-200/80">
                        {confirmDeleteBatchId === log.id ? (
                          <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 space-y-1.5">
                            <p className="text-[11px] font-bold text-rose-800">
                              آیا پارت #{log.batchNumber} حذف شود و مواد مصرفی به انبار برگردد؟
                            </p>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleDeleteBatch(log)}
                                className="flex-1 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-[11px] font-bold cursor-pointer"
                              >
                                تأیید حذف و برگشت به انبار
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteBatchId(null)}
                                className="px-2.5 py-1 bg-white border border-slate-300 text-slate-700 rounded-md text-[11px] font-bold cursor-pointer"
                              >
                                انصراف
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            {canEditProduction && (
                              <button
                                type="button"
                                onClick={() => handleStartEditBatch(log)}
                                className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                              >
                                <Edit3 size={12} />
                                <span>ویرایش تولید</span>
                              </button>
                            )}
                            {canDeleteProduction && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteBatchId(log.id!)}
                                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                              >
                                <Trash2 size={12} />
                                <span>حذف / ابطال</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
