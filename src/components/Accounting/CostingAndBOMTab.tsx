import React, { useState, useEffect, useMemo } from 'react';
import {
  MenuItem,
  RawMaterial,
  ProductionRecipe,
  ProductionRecipeItem,
  db,
} from '../../lib/db';
import { calculateRecipeCost } from '../../lib/accountingEngine';
import { formatCurrency, getCurrencyLabel } from '../../lib/utils';
import FormattedNumberInput from '../Common/FormattedNumberInput';
import {
  Calculator,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  Utensils,
} from 'lucide-react';

interface Props {
  menuItems: MenuItem[];
  materials: RawMaterial[];
  recipes: ProductionRecipe[];
}

export default function CostingAndBOMTab({ menuItems, materials, recipes }: Props) {
  const [selectedMenuItemId, setSelectedMenuItemId] = useState<number | null>(null);
  const [ingredients, setIngredients] = useState<ProductionRecipeItem[]>([]);
  const [laborCost, setLaborCost] = useState<number>(12000);
  const [overheadCost, setOverheadCost] = useState<number>(8000);
  const [packagingCost, setPackagingCost] = useState<number>(6000);
  const [notes, setNotes] = useState<string>('');
  const [sellingPriceInput, setSellingPriceInput] = useState<number>(0);
  const [saveMessage, setSaveMessage] = useState<string>('');
  const currencyLabel = getCurrencyLabel();

  // New ingredient form state
  const [newMatId, setNewMatId] = useState<number>(0);
  const [newQty, setNewQty] = useState<string>('0.15');
  const [newWaste, setNewWaste] = useState<string>('3');

  useEffect(() => {
    if (menuItems.length > 0 && selectedMenuItemId === null) {
      setSelectedMenuItemId(menuItems[0].id!);
    }
  }, [menuItems, selectedMenuItemId]);

  useEffect(() => {
    if (materials.length > 0 && !newMatId) {
      setNewMatId(materials[0].id!);
    }
  }, [materials, newMatId]);

  const selectedMenuItem = useMemo(
    () => menuItems.find((m) => m.id === selectedMenuItemId),
    [menuItems, selectedMenuItemId]
  );

  // Load existing recipe when selectedMenuItemId changes
  useEffect(() => {
    if (!selectedMenuItemId) return;
    const item = menuItems.find((m) => m.id === selectedMenuItemId);
    if (item) {
      setSellingPriceInput(item.price);
    }

    const existing = recipes.find((r) => r.menuItemId === selectedMenuItemId);
    if (existing) {
      setIngredients(existing.ingredients || []);
      setLaborCost(existing.laborCost || 0);
      setOverheadCost(existing.overheadCost || 0);
      setPackagingCost(existing.packagingCost || 0);
      setNotes(existing.notes || '');
    } else {
      setIngredients([]);
      setLaborCost(10000);
      setOverheadCost(6000);
      setPackagingCost(5000);
      setNotes('');
    }
  }, [selectedMenuItemId, recipes, menuItems]);

  const matMap = useMemo(() => {
    const map = new Map<number, RawMaterial>();
    materials.forEach((m) => {
      if (m.id !== undefined) map.set(m.id, m);
    });
    return map;
  }, [materials]);

  // Live BOM Cost Calculation
  const costResult = useMemo(() => {
    return calculateRecipeCost({
      ingredients: ingredients.map((ing) => {
        const liveMat = matMap.get(ing.materialId);
        return {
          materialId: ing.materialId,
          materialName: liveMat?.name || ing.materialName,
          unit: liveMat?.unit || ing.unit,
          quantity: ing.quantity,
          unitCost: liveMat?.avgCost || 0,
          wastePercent: ing.wastePercent || 0,
        };
      }),
      laborCost,
      overheadCost,
      packagingCost,
      sellingPrice: sellingPriceInput,
    });
  }, [ingredients, matMap, laborCost, overheadCost, packagingCost, sellingPriceInput]);

  // Summary table for all menu items
  const allMenuCostSummary = useMemo(() => {
    return menuItems.map((item) => {
      const rec = recipes.find((r) => r.menuItemId === item.id);
      if (!rec) {
        return {
          item,
          hasRecipe: false,
          unitCost: 0,
          profit: item.price,
          marginPct: 0,
          foodCostPct: 0,
        };
      }
      const calc = calculateRecipeCost({
        ingredients: rec.ingredients.map((ing) => {
          const m = matMap.get(ing.materialId);
          return {
            materialId: ing.materialId,
            materialName: m?.name || ing.materialName,
            unit: m?.unit || ing.unit,
            quantity: ing.quantity,
            unitCost: m?.avgCost || 0,
            wastePercent: ing.wastePercent || 0,
          };
        }),
        laborCost: rec.laborCost,
        overheadCost: rec.overheadCost,
        packagingCost: rec.packagingCost,
        sellingPrice: item.price,
      });
      return {
        item,
        hasRecipe: true,
        unitCost: calc.totalUnitCost,
        profit: calc.netProfitPerUnit,
        marginPct: calc.profitMarginPercent,
        foodCostPct: calc.foodCostPercent,
      };
    });
  }, [menuItems, recipes, matMap]);

  const handleAddIngredient = () => {
    const mat = matMap.get(Number(newMatId));
    const qty = Number(newQty);
    const waste = Math.max(0, Number(newWaste) || 0);
    if (!mat || !mat.id || isNaN(qty) || qty <= 0) return;

    const existingIdx = ingredients.findIndex((i) => i.materialId === mat.id);
    if (existingIdx >= 0) {
      const updated = [...ingredients];
      updated[existingIdx] = {
        ...updated[existingIdx],
        quantity: Number((updated[existingIdx].quantity + qty).toFixed(4)),
        wastePercent: waste,
      };
      setIngredients(updated);
    } else {
      setIngredients([
        ...ingredients,
        {
          materialId: mat.id,
          materialName: mat.name,
          unit: mat.unit,
          quantity: qty,
          wastePercent: waste,
        },
      ]);
    }
  };

  const handleRemoveIngredient = (materialId: number) => {
    setIngredients(ingredients.filter((i) => i.materialId !== materialId));
  };

  const handleUpdateIngredient = (
    materialId: number,
    patch: { quantity?: number; wastePercent?: number }
  ) => {
    setIngredients((prev) =>
      prev.map((ing) =>
        ing.materialId === materialId
          ? {
              ...ing,
              quantity:
                patch.quantity !== undefined
                  ? Math.max(0.0001, Number(patch.quantity) || 0)
                  : ing.quantity,
              wastePercent:
                patch.wastePercent !== undefined
                  ? Math.max(0, Number(patch.wastePercent) || 0)
                  : ing.wastePercent,
            }
          : ing
      )
    );
  };

  const handleDeleteRecipe = async () => {
    if (!selectedMenuItemId || !selectedMenuItem) return;
    const existing = await db.productionRecipes
      .where('menuItemId')
      .equals(selectedMenuItemId)
      .first();
    if (!existing || !existing.id) {
      setIngredients([]);
      return;
    }
    if (
      !window.confirm(
        `آیا از حذف کامل فرمول تولید (BOM) غذای «${selectedMenuItem.name}» اطمینان دارید؟`
      )
    ) {
      return;
    }
    await db.productionRecipes.delete(existing.id);
    setIngredients([]);
    setSaveMessage(`فرمول تولید «${selectedMenuItem.name}» به طور کامل حذف شد.`);
    setTimeout(() => setSaveMessage(''), 3500);
  };

  const handleSaveRecipe = async () => {
    if (!selectedMenuItemId || !selectedMenuItem) return;

    const existing = await db.productionRecipes
      .where('menuItemId')
      .equals(selectedMenuItemId)
      .first();

    const payload: ProductionRecipe = {
      menuItemId: selectedMenuItemId,
      menuItemName: selectedMenuItem.name,
      ingredients,
      laborCost: Number(laborCost) || 0,
      overheadCost: Number(overheadCost) || 0,
      packagingCost: Number(packagingCost) || 0,
      notes,
      updatedAt: new Date(),
    };

    if (existing?.id) {
      await db.productionRecipes.put({ ...payload, id: existing.id });
    } else {
      await db.productionRecipes.add(payload);
    }

    if (sellingPriceInput > 0 && sellingPriceInput !== selectedMenuItem.price) {
      await db.menuItems.update(selectedMenuItemId, { price: sellingPriceInput });
    }

    setSaveMessage('فرمول تولید (BOM) و محاسبه قیمت تمام شده با موفقیت ذخیره شد.');
    setTimeout(() => setSaveMessage(''), 3500);
  };

  return (
    <div className="space-y-4">
      {/* Top Explanation Banner */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-sm md:text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Calculator className="text-blue-600" size={19} />
            <span>مهندسی منو، تعریف فرمول تولید (BOM) و محاسبه دقیق قیمت تمام شده</span>
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            مواد اولیه مصرفی هر پرس غذا را وارد کنید تا سیستم بر اساس آخرین قیمت خرید انبار، قیمت تمام شده و سود خالص هر پرس را محاسبه کند.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left 1 Col: Select Menu Item & Overview Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-3 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-800">
            انتخاب غذای منو جهت فرمول‌دهی
          </div>
          <div className="divide-y divide-slate-100 max-h-48 lg:max-h-[540px] overflow-y-auto">
            {allMenuCostSummary.map(({ item, hasRecipe, unitCost, profit, marginPct }) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedMenuItemId(item.id!)}
                className={`w-full p-3 text-right transition-colors flex flex-col gap-1 ${
                  selectedMenuItemId === item.id
                    ? 'bg-blue-50 border-r-4 border-blue-600'
                    : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-xs text-slate-900">{item.name}</span>
                  <span className="text-[11px] font-mono text-slate-600">
                    فروش: {formatCurrency(item.price)}
                  </span>
                </div>
                {hasRecipe ? (
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-rose-700 font-mono">
                      تمام شده: {formatCurrency(unitCost)}
                    </span>
                    <span
                      className={`font-bold font-mono ${
                        profit >= 0 ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      سود: {formatCurrency(profit)} ({marginPct}%)
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] text-amber-600 font-medium">
                    فاقد فرمول تولید (برای تعریف کلیک کنید)
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Right 2 Cols: Recipe Builder & Live Cost Breakdown */}
        <div className="lg:col-span-2 space-y-4">
          {selectedMenuItem ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-100">
                <div>
                  <span className="text-xs text-blue-600 font-bold">فرمول تولید ۱ پرس:</span>
                  <h3 className="text-base md:text-lg font-black text-slate-900">
                    {selectedMenuItem.name}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-700">
                    قیمت فروش در منو ({currencyLabel}):
                  </label>
                  <FormattedNumberInput
                    value={sellingPriceInput || ''}
                    onValueChange={(val) => setSellingPriceInput(val)}
                    className="w-36 px-3 py-1.5 border border-slate-300 rounded-xl font-mono font-bold text-sm text-left"
                  />
                </div>
              </div>

              {saveMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  <span>{saveMessage}</span>
                </div>
              )}

              {/* Add Ingredient Row */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                <div className="text-xs font-bold text-slate-800">
                  افزودن ماده اولیه مصرفی از انبار (برای ۱ پرس)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-600 mb-1">ماده اولیه انبار</label>
                    <select
                      value={newMatId}
                      onChange={(e) => setNewMatId(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                    >
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} (واحد: {m.unit} - فی: {formatCurrency(m.avgCost)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      مقدار مصرف (مثلاً 0.2 کیلو)
                    </label>
                    <FormattedNumberInput
                      allowDecimal
                      value={newQty}
                      onValueChange={(_, raw) => setNewQty(raw)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-left"
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <div className="flex-1">
                      <label className="block text-[11px] text-slate-600 mb-1">پرت پخت (%)</label>
                      <FormattedNumberInput
                        allowDecimal
                        value={newWaste}
                        onValueChange={(_, raw) => setNewWaste(raw)}
                        className="w-full px-2 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-center"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddIngredient}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shrink-0 self-end cursor-pointer"
                    >
                      <Plus size={15} />
                      <span>افزودن</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Ingredients Table (with Inline Edit & Delete) */}
              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">نام ماده اولیه</th>
                      <th className="py-2 px-3">مقدار خالص (قابل ویرایش)</th>
                      <th className="py-2 px-3">درصد پرت (قابل ویرایش)</th>
                      <th className="py-2 px-3">فی واحد انبار</th>
                      <th className="py-2 px-3">هزینه در ۱ پرس</th>
                      <th className="py-2 px-3 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ingredients.map((ing) => {
                      const liveMat = matMap.get(ing.materialId);
                      const unitCost = liveMat?.avgCost || 0;
                      const effectiveQty = ing.quantity * (1 + (ing.wastePercent || 0) / 100);
                      const lineCost = Math.round(effectiveQty * unitCost);
                      return (
                        <tr key={ing.materialId} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-bold text-slate-800">
                            {liveMat?.name || ing.materialName}
                          </td>
                          <td className="py-2 px-3 font-mono">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                step="0.01"
                                min="0.001"
                                value={ing.quantity}
                                onChange={(e) =>
                                  handleUpdateIngredient(ing.materialId, {
                                    quantity: Number(e.target.value),
                                  })
                                }
                                className="w-20 px-2 py-1 border border-slate-300 rounded-lg font-mono text-left bg-white font-bold"
                                dir="ltr"
                              />
                              <span className="text-[11px] text-slate-500">
                                {liveMat?.unit || ing.unit}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-500">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                step="1"
                                min="0"
                                value={ing.wastePercent || 0}
                                onChange={(e) =>
                                  handleUpdateIngredient(ing.materialId, {
                                    wastePercent: Number(e.target.value),
                                  })
                                }
                                className="w-16 px-2 py-1 border border-slate-300 rounded-lg font-mono text-center bg-white"
                                dir="ltr"
                              />
                              <span>%</span>
                            </div>
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-600">
                            {formatCurrency(unitCost)}
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-slate-900">
                            {formatCurrency(lineCost)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveIngredient(ing.materialId)}
                              className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                              title="حذف ماده اولیه از فرمول"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {ingredients.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400">
                          هنوز ماده اولیه‌ای برای این غذا اضافه نشده است.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Direct Labor, Overhead, Packaging Inputs (3-digit live separated) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    دستمزد مستقیم پخت هر پرس ({currencyLabel})
                  </label>
                  <FormattedNumberInput
                    value={laborCost || ''}
                    onValueChange={(val) => setLaborCost(Math.max(0, val))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-left"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    سربار انرژی و استهلاک هر پرس ({currencyLabel})
                  </label>
                  <FormattedNumberInput
                    value={overheadCost || ''}
                    onValueChange={(val) => setOverheadCost(Math.max(0, val))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-left"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    هزینه ظرف و بسته‌بندی هر پرس ({currencyLabel})
                  </label>
                  <FormattedNumberInput
                    value={packagingCost || ''}
                    onValueChange={(val) => setPackagingCost(Math.max(0, val))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-left"
                  />
                </div>
              </div>

              {/* Live Costing Summary Box */}
              <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="p-2.5 bg-slate-800 rounded-xl">
                    <span className="text-slate-400 block text-[10px]">هزینه مواد اولیه:</span>
                    <span className="font-mono font-bold text-sm mt-0.5 block">
                      {formatCurrency(costResult.ingredientsCost)}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-800 rounded-xl">
                    <span className="text-slate-400 block text-[10px]">
                      قیمت تمام شده ۱ پرس:
                    </span>
                    <span className="font-mono font-black text-amber-400 text-sm mt-0.5 block">
                      {formatCurrency(costResult.totalUnitCost)}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-800 rounded-xl">
                    <span className="text-slate-400 block text-[10px]">سود خالص هر پرس:</span>
                    <span
                      className={`font-mono font-black text-sm mt-0.5 block ${
                        costResult.netProfitPerUnit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {formatCurrency(costResult.netProfitPerUnit)}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-800 rounded-xl">
                    <span className="text-slate-400 block text-[10px]">
                      حاشیه سود / Food Cost:
                    </span>
                    <span className="font-mono font-bold text-blue-300 text-xs mt-1 block">
                      سود: {costResult.profitMarginPercent}% | بهای تمام شده: {costResult.foodCostPercent}%
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pt-2 border-t border-slate-800 text-xs">
                  <div className="text-slate-300">
                    پیشنهاد هوشمند قیمت فروش (برای حاشیه سود استاندارد ۴۰٪):{' '}
                    <strong className="font-mono text-emerald-400">
                      {formatCurrency(costResult.suggestedPriceFor40Margin)}
                    </strong>
                    {costResult.suggestedPriceFor40Margin > 0 && (
                      <button
                        type="button"
                        onClick={() => setSellingPriceInput(costResult.suggestedPriceFor40Margin)}
                        className="mr-2 text-[11px] text-blue-400 hover:underline cursor-pointer"
                      >
                        (اعمال این قیمت)
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleDeleteRecipe}
                      className="px-3.5 py-2.5 bg-rose-600/90 hover:bg-rose-600 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                      title="حذف کامل فرمول تولید این غذا"
                    >
                      <Trash2 size={15} />
                      <span>حذف فرمول</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveRecipe}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer"
                    >
                      <Save size={16} />
                      <span>ذخیره فرمول تولید و قیمت تمام شده</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
              <Utensils size={48} className="mx-auto mb-3 opacity-20" />
              <p>یک غذا را از لیست سمت راست انتخاب کنید.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
