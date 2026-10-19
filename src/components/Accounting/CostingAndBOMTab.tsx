import React, { useState, useEffect, useMemo } from 'react';
import {
  MenuItem,
  RawMaterial,
  ProductionRecipe,
  ProductionRecipeItem,
  db,
} from '../../lib/db';
import {
  calculateRecipeCost,
  convertRecipeQtyToStockUnit,
  ALL_MEASUREMENT_UNITS,
} from '../../lib/accountingEngine';
import { formatCurrency, getCurrencyLabel, getGlobalCurrencyUnit } from '../../lib/utils';
import FormattedNumberInput from '../Common/FormattedNumberInput';
import {
  Calculator,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  Utensils,
  Sparkles,
  Scale,
} from 'lucide-react';

interface Props {
  menuItems: MenuItem[];
  materials: RawMaterial[];
  recipes: ProductionRecipe[];
}

export default function CostingAndBOMTab({ menuItems, materials, recipes }: Props) {
  const currencyLabel = getCurrencyLabel();
  const isRial = getGlobalCurrencyUnit() === 'rial';

  const [selectedMenuItemId, setSelectedMenuItemId] = useState<number | null>(null);
  const [ingredients, setIngredients] = useState<ProductionRecipeItem[]>([]);
  const [laborCost, setLaborCost] = useState<number>(isRial ? 120000 : 12000);
  const [overheadCost, setOverheadCost] = useState<number>(isRial ? 80000 : 8000);
  const [packagingCost, setPackagingCost] = useState<number>(isRial ? 60000 : 6000);
  const [notes, setNotes] = useState<string>('');
  const [sellingPriceInput, setSellingPriceInput] = useState<number>(0);
  const [saveMessage, setSaveMessage] = useState<string>('');

  // Add mode: 'warehouse' (کالای انبار با تبدیل خودکار واحد) or 'misc' (کالای متفرقه خارج از انبار با فی دستی)
  const [addMode, setAddMode] = useState<'warehouse' | 'misc'>('warehouse');

  // Warehouse ingredient form state
  const [newMatId, setNewMatId] = useState<number>(0);
  const [newRecipeUnit, setNewRecipeUnit] = useState<string>('گرم');
  const [newUnitsPerPackage, setNewUnitsPerPackage] = useState<string>('24');
  const [newQty, setNewQty] = useState<string>('150');
  const [newWaste, setNewWaste] = useState<string>('3');

  // Miscellaneous (متفرقه - خارج از انبار) ingredient form state
  const [miscName, setMiscName] = useState<string>('کالای متفرقه (ادویه / دورچین)');
  const [miscUnit, setMiscUnit] = useState<string>('پرس');
  const [miscQty, setMiscQty] = useState<string>('1');
  const [miscUnitPrice, setMiscUnitPrice] = useState<number>(isRial ? 50000 : 5000);
  const [miscWaste, setMiscWaste] = useState<string>('0');

  useEffect(() => {
    if (menuItems.length > 0 && selectedMenuItemId === null) {
      setSelectedMenuItemId(menuItems[0].id!);
    }
  }, [menuItems, selectedMenuItemId]);

  const matMap = useMemo(() => {
    const map = new Map<number, RawMaterial>();
    materials.forEach((m) => {
      if (m.id !== undefined) map.set(m.id, m);
    });
    return map;
  }, [materials]);

  useEffect(() => {
    if (materials.length > 0 && !newMatId) {
      const first = materials[0];
      setNewMatId(first.id!);
      if (first.unit === 'کیلوگرم') {
        setNewRecipeUnit('گرم');
        setNewQty('150');
      } else {
        setNewRecipeUnit(first.unit);
        setNewQty('1');
      }
    }
  }, [materials, newMatId]);

  const selectedWarehouseMat = useMemo(() => matMap.get(Number(newMatId)), [matMap, newMatId]);

  const handleSelectWarehouseMaterial = (matId: number) => {
    setNewMatId(matId);
    const mat = matMap.get(matId);
    if (!mat) return;
    if (mat.unit === 'کیلوگرم') {
      setNewRecipeUnit('گرم');
      setNewQty('150');
    } else if (mat.unit === 'لیتر') {
      setNewRecipeUnit('سی‌سی');
      setNewQty('100');
    } else if (mat.unit === 'کارتن' || mat.unit === 'بسته') {
      setNewRecipeUnit('عدد');
      setNewQty('1');
      if (mat.unitsPerPackage) setNewUnitsPerPackage(String(mat.unitsPerPackage));
    } else {
      setNewRecipeUnit(mat.unit);
      setNewQty('1');
    }
  };

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
      setIngredients(
        (existing.ingredients || []).map((ing, idx) => ({
          ...ing,
          rowKey: ing.rowKey || `${ing.materialId}_${idx}_${Date.now()}`,
        }))
      );
      setLaborCost(existing.laborCost || 0);
      setOverheadCost(existing.overheadCost || 0);
      setPackagingCost(existing.packagingCost || 0);
      setNotes(existing.notes || '');
    } else {
      setIngredients([]);
      setLaborCost(isRial ? 100000 : 10000);
      setOverheadCost(isRial ? 60000 : 6000);
      setPackagingCost(isRial ? 50000 : 5000);
      setNotes('');
    }
  }, [selectedMenuItemId, recipes, menuItems, isRial]);

  // Live BOM Cost Calculation
  const costResult = useMemo(() => {
    return calculateRecipeCost({
      ingredients: ingredients.map((ing) => {
        const isMisc = Boolean(ing.isMisc || ing.materialId < 0);
        const liveMat = isMisc ? undefined : matMap.get(ing.materialId);
        const stockUnit = isMisc ? ing.recipeUnit || ing.unit || 'عدد' : liveMat?.unit || ing.unit;
        return {
          materialId: ing.materialId,
          materialName: isMisc ? ing.materialName || 'کالای متفرقه' : liveMat?.name || ing.materialName,
          unit: stockUnit,
          recipeUnit: ing.recipeUnit || stockUnit,
          unitsPerPackage: ing.unitsPerPackage || liveMat?.unitsPerPackage,
          quantity: ing.quantity,
          unitCost: isMisc ? Number(ing.customUnitPrice) || 0 : liveMat?.avgCost || 0,
          wastePercent: ing.wastePercent || 0,
          isMisc,
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
          const isMisc = Boolean(ing.isMisc || ing.materialId < 0);
          const m = isMisc ? undefined : matMap.get(ing.materialId);
          const stockUnit = isMisc ? ing.recipeUnit || ing.unit || 'عدد' : m?.unit || ing.unit;
          return {
            materialId: ing.materialId,
            materialName: isMisc ? ing.materialName || 'کالای متفرقه' : m?.name || ing.materialName,
            unit: stockUnit,
            recipeUnit: ing.recipeUnit || stockUnit,
            unitsPerPackage: ing.unitsPerPackage || m?.unitsPerPackage,
            quantity: ing.quantity,
            unitCost: isMisc ? Number(ing.customUnitPrice) || 0 : m?.avgCost || 0,
            wastePercent: ing.wastePercent || 0,
            isMisc,
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

  // Live preview of warehouse conversion before adding
  const liveAddPreview = useMemo(() => {
    if (addMode === 'misc') {
      const q = Math.max(0, Number(miscQty) || 0);
      const w = Math.max(0, Number(miscWaste) || 0);
      const eff = q * (1 + w / 100);
      const cost = Math.round(eff * (Number(miscUnitPrice) || 0));
      return {
        stockEquiv: eff,
        stockUnit: miscUnit,
        lineCost: cost,
      };
    }
    if (!selectedWarehouseMat) return null;
    const q = Math.max(0, Number(newQty) || 0);
    const w = Math.max(0, Number(newWaste) || 0);
    const effRecipeQty = q * (1 + w / 100);
    const stockEquiv = convertRecipeQtyToStockUnit({
      quantity: effRecipeQty,
      recipeUnit: newRecipeUnit || selectedWarehouseMat.unit,
      stockUnit: selectedWarehouseMat.unit,
      unitsPerPackage: Number(newUnitsPerPackage) || selectedWarehouseMat.unitsPerPackage,
    });
    const cost = Math.round(stockEquiv * (selectedWarehouseMat.avgCost || 0));
    return {
      stockEquiv: Number(stockEquiv.toFixed(4)),
      stockUnit: selectedWarehouseMat.unit,
      lineCost: cost,
    };
  }, [
    addMode,
    miscQty,
    miscWaste,
    miscUnitPrice,
    miscUnit,
    selectedWarehouseMat,
    newQty,
    newWaste,
    newRecipeUnit,
    newUnitsPerPackage,
  ]);

  const needsPackageRatio = useMemo(() => {
    if (addMode === 'misc' || !selectedWarehouseMat) return false;
    const sUnit = selectedWarehouseMat.unit;
    const rUnit = newRecipeUnit;
    if (sUnit === rUnit) return false;
    return (
      sUnit === 'کارتن' ||
      sUnit === 'بسته' ||
      rUnit === 'کارتن' ||
      rUnit === 'بسته'
    );
  }, [addMode, selectedWarehouseMat, newRecipeUnit]);

  const handleAddIngredient = () => {
    if (addMode === 'misc') {
      const qty = Number(miscQty);
      const waste = Math.max(0, Number(miscWaste) || 0);
      const price = Math.max(0, Number(miscUnitPrice) || 0);
      if (isNaN(qty) || qty <= 0) return;

      const miscId = -Math.floor(Date.now() % 100000000) - Math.floor(Math.random() * 1000);
      setIngredients([
        ...ingredients,
        {
          rowKey: `misc_${miscId}_${Date.now()}`,
          materialId: miscId,
          materialName: miscName.trim() || 'کالای متفرقه',
          unit: miscUnit || 'عدد',
          recipeUnit: miscUnit || 'عدد',
          quantity: qty,
          wastePercent: waste,
          isMisc: true,
          customUnitPrice: price,
        },
      ]);
      return;
    }

    const mat = matMap.get(Number(newMatId));
    const qty = Number(newQty);
    const waste = Math.max(0, Number(newWaste) || 0);
    const packRatio = Number(newUnitsPerPackage) || undefined;
    if (!mat || !mat.id || isNaN(qty) || qty <= 0) return;

    const chosenUnit = newRecipeUnit || mat.unit;
    const existingIdx = ingredients.findIndex(
      (i) => !i.isMisc && i.materialId === mat.id && (i.recipeUnit || i.unit) === chosenUnit
    );

    if (existingIdx >= 0) {
      const updated = [...ingredients];
      updated[existingIdx] = {
        ...updated[existingIdx],
        quantity: Number((updated[existingIdx].quantity + qty).toFixed(4)),
        wastePercent: waste,
        unitsPerPackage: packRatio || updated[existingIdx].unitsPerPackage,
      };
      setIngredients(updated);
    } else {
      setIngredients([
        ...ingredients,
        {
          rowKey: `mat_${mat.id}_${Date.now()}`,
          materialId: mat.id,
          materialName: mat.name,
          unit: mat.unit,
          recipeUnit: chosenUnit,
          unitsPerPackage: packRatio,
          quantity: qty,
          wastePercent: waste,
          isMisc: false,
        },
      ]);
    }
  };

  const handleRemoveIngredient = (index: number) => {
    setIngredients((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateIngredient = (
    index: number,
    patch: Partial<ProductionRecipeItem>
  ) => {
    setIngredients((prev) =>
      prev.map((ing, idx) => {
        if (idx !== index) return ing;
        return {
          ...ing,
          ...patch,
          quantity:
            patch.quantity !== undefined
              ? Math.max(0.0001, Number(patch.quantity) || 0)
              : ing.quantity,
          wastePercent:
            patch.wastePercent !== undefined
              ? Math.max(0, Number(patch.wastePercent) || 0)
              : ing.wastePercent,
          customUnitPrice:
            patch.customUnitPrice !== undefined
              ? Math.max(0, Number(patch.customUnitPrice) || 0)
              : ing.customUnitPrice,
        };
      })
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
            <span>مهندسی منو، تعریف فرمول تولید (BOM) با تبدیل واحد خودکار و کالای متفرقه</span>
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            مواد اولیه را با هر واحدی (گرم، کیلو، کارتن، بسته، عدد، لیتر...) وارد کنید تا سیستم به صورت خودکار نسبت به واحد خرید انبار محاسبه کند؛ یا «کالای متفرقه» (خارج از انبار) با فی دستی ثبت نمایید.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left 1 Col: Select Menu Item & Overview Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-3 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-800">
            انتخاب غذای منو جهت فرمول‌دهی
          </div>
          <div className="divide-y divide-slate-100 max-h-48 lg:max-h-[600px] overflow-y-auto">
            {allMenuCostSummary.map(({ item, hasRecipe, unitCost, profit, marginPct }) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedMenuItemId(item.id!)}
                className={`w-full p-3 text-right transition-colors flex flex-col gap-1 cursor-pointer ${
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

              {/* Add Ingredient Box (Supports Both Warehouse Multi-Unit & Non-Inventory Miscellaneous) */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                    <Scale size={15} className="text-blue-600" />
                    <span>افزودن ردیف به فرمول تولید (برای ۱ پرس)</span>
                  </div>

                  {/* Mode Switcher: Warehouse vs Miscellaneous */}
                  <div className="flex items-center gap-1 bg-slate-200 p-1 rounded-xl text-xs">
                    <button
                      type="button"
                      onClick={() => setAddMode('warehouse')}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                        addMode === 'warehouse'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      ۱. کالای انبار (با تبدیل واحد خودکار)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddMode('misc')}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                        addMode === 'misc'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Sparkles size={13} />
                      <span>۲. کالای متفرقه (خارج از انبار - فی دستی)</span>
                    </button>
                  </div>
                </div>

                {addMode === 'warehouse' ? (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                      <div className="sm:col-span-4">
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          انتخاب کالا از انبار
                        </label>
                        <select
                          value={newMatId}
                          onChange={(e) => handleSelectWarehouseMaterial(Number(e.target.value))}
                          className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                        >
                          {materials.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} (خرید انبار: هر {m.unit} {formatCurrency(m.avgCost)})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          واحد مصرف در فرمول
                        </label>
                        <select
                          value={newRecipeUnit}
                          onChange={(e) => setNewRecipeUnit(e.target.value)}
                          className="w-full px-2 py-2 bg-white border border-blue-400 rounded-lg text-xs font-bold text-blue-900"
                        >
                          {ALL_MEASUREMENT_UNITS.map((u) => (
                            <option key={u} value={u}>
                              بر حسب {u}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          مقدار ({newRecipeUnit})
                        </label>
                        <FormattedNumberInput
                          allowDecimal
                          value={newQty}
                          onValueChange={(_, raw) => setNewQty(raw)}
                          className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-left"
                        />
                      </div>

                      {needsPackageRatio && (
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold text-amber-800 mb-1">
                            هر کارتن/بسته چند {newRecipeUnit === 'کارتن' || newRecipeUnit === 'بسته' ? selectedWarehouseMat?.unit : newRecipeUnit} است؟
                          </label>
                          <FormattedNumberInput
                            allowDecimal
                            value={newUnitsPerPackage}
                            onValueChange={(_, raw) => setNewUnitsPerPackage(raw)}
                            className="w-full px-2 py-2 bg-amber-50 border border-amber-300 rounded-lg text-xs font-mono font-bold text-center"
                          />
                        </div>
                      )}

                      <div className={needsPackageRatio ? 'sm:col-span-2 flex gap-1.5' : 'sm:col-span-4 flex gap-1.5'}>
                        <div className="w-20 shrink-0">
                          <label className="block text-[11px] text-slate-600 mb-1">پرت (%)</label>
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
                          className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 self-end cursor-pointer"
                        >
                          <Plus size={15} />
                          <span>افزودن</span>
                        </button>
                      </div>
                    </div>

                    {selectedWarehouseMat && liveAddPreview && (
                      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-900">
                        <div>
                          <span>محاسبه خودکار تبدیل واحد: </span>
                          <strong className="font-mono">
                            {newQty || 0} {newRecipeUnit}
                          </strong>
                          {Number(newWaste) > 0 ? ` (+${newWaste}% پرت)` : ''} معادل{' '}
                          <strong className="font-mono text-blue-700">
                            {liveAddPreview.stockEquiv} {liveAddPreview.stockUnit}
                          </strong>{' '}
                          از انبار (با فی واحد {formatCurrency(selectedWarehouseMat.avgCost)} در هر {selectedWarehouseMat.unit})
                        </div>
                        <div className="font-bold">
                          سهم در قیمت تمام شده ۱ پرس:{' '}
                          <span className="font-mono font-black text-emerald-700">
                            {formatCurrency(liveAddPreview.lineCost)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-lg text-[11px] text-purple-900">
                      <strong>کالای متفرقه (خارج از انبار):</strong> این آیتم در کاردکس و موجودی انبار ثبت یا کسر نمی‌شود، اما مبلغ آن مستقیماً با فی دستی شما روی <strong>قیمت تمام شده و بهای پخت هر پرس</strong> محاسبه می‌گردد.
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                      <div className="sm:col-span-4">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          عنوان کالای متفرقه
                        </label>
                        <input
                          type="text"
                          value={miscName}
                          onChange={(e) => setMiscName(e.target.value)}
                          placeholder="مثلاً: متفرقه / سبزی و دورچین / ادویه"
                          className="w-full px-2.5 py-2 bg-white border border-purple-300 rounded-lg text-xs font-bold"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          واحد شمارش
                        </label>
                        <select
                          value={miscUnit}
                          onChange={(e) => setMiscUnit(e.target.value)}
                          className="w-full px-2 py-2 bg-white border border-purple-300 rounded-lg text-xs font-bold"
                        >
                          {ALL_MEASUREMENT_UNITS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          مقدار ({miscUnit})
                        </label>
                        <FormattedNumberInput
                          allowDecimal
                          value={miscQty}
                          onValueChange={(_, raw) => setMiscQty(raw)}
                          className="w-full px-2.5 py-2 bg-white border border-purple-300 rounded-lg text-xs font-mono font-bold text-left"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-bold text-purple-800 mb-1">
                          فی دستی هر {miscUnit} ({currencyLabel})
                        </label>
                        <FormattedNumberInput
                          value={miscUnitPrice || ''}
                          onValueChange={(val) => setMiscUnitPrice(val)}
                          className="w-full px-2.5 py-2 bg-white border border-purple-400 rounded-lg text-xs font-mono font-bold text-left text-purple-900"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <button
                          type="button"
                          onClick={handleAddIngredient}
                          className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Plus size={15} />
                          <span>افزودن متفرقه</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Ingredients Table (with Inline Edit for Qty, Unit, Manual Price & Delete) */}
              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-2.5">نام کالا / متفرقه</th>
                      <th className="py-2 px-2.5">مقدار و واحد در فرمول</th>
                      <th className="py-2 px-2.5">معادل کسر از انبار</th>
                      <th className="py-2 px-2.5">پرت (%)</th>
                      <th className="py-2 px-2.5">فی واحد (انبار / دستی)</th>
                      <th className="py-2 px-2.5">هزینه در ۱ پرس</th>
                      <th className="py-2 px-2 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ingredients.map((ing, idx) => {
                      const isMisc = Boolean(ing.isMisc || ing.materialId < 0);
                      const liveMat = isMisc ? undefined : matMap.get(ing.materialId);
                      const stockUnit = isMisc
                        ? ing.recipeUnit || ing.unit || 'عدد'
                        : liveMat?.unit || ing.unit;
                      const recipeUnit = ing.recipeUnit || stockUnit;
                      const unitCost = isMisc
                        ? Number(ing.customUnitPrice) || 0
                        : liveMat?.avgCost || 0;

                      const effectiveRecipeQty =
                        ing.quantity * (1 + (ing.wastePercent || 0) / 100);
                      const stockEquivQty = isMisc
                        ? effectiveRecipeQty
                        : convertRecipeQtyToStockUnit({
                            quantity: effectiveRecipeQty,
                            recipeUnit,
                            stockUnit,
                            unitsPerPackage: ing.unitsPerPackage || liveMat?.unitsPerPackage,
                          });
                      const lineCost = Math.round(stockEquivQty * unitCost);

                      return (
                        <tr
                          key={ing.rowKey || `${ing.materialId}_${idx}`}
                          className={isMisc ? 'bg-purple-50/50 hover:bg-purple-50' : 'hover:bg-slate-50'}
                        >
                          <td className="py-2 px-2.5 font-bold text-slate-800">
                            {isMisc ? (
                              <div className="flex flex-col gap-1">
                                <input
                                  type="text"
                                  value={ing.materialName}
                                  onChange={(e) =>
                                    handleUpdateIngredient(idx, { materialName: e.target.value })
                                  }
                                  className="px-2 py-1 border border-purple-300 rounded-lg bg-white text-xs font-bold text-purple-900 w-36"
                                />
                                <span className="text-[10px] text-purple-700 font-semibold">
                                  ★ متفرقه (خارج از انبار)
                                </span>
                              </div>
                            ) : (
                              <div>
                                <div>{liveMat?.name || ing.materialName}</div>
                                <span className="text-[10px] text-slate-400">
                                  واحد خرید انبار: {stockUnit}
                                </span>
                              </div>
                            )}
                          </td>

                          <td className="py-2 px-2.5 font-mono">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                step="any"
                                min="0.0001"
                                value={ing.quantity}
                                onChange={(e) =>
                                  handleUpdateIngredient(idx, {
                                    quantity: Number(e.target.value),
                                  })
                                }
                                className="w-20 px-2 py-1 border border-slate-300 rounded-lg font-mono text-left bg-white font-bold"
                                dir="ltr"
                              />
                              <select
                                value={recipeUnit}
                                onChange={(e) =>
                                  handleUpdateIngredient(idx, {
                                    recipeUnit: e.target.value,
                                    unit: isMisc ? e.target.value : ing.unit,
                                  })
                                }
                                className="px-1.5 py-1 border border-slate-300 rounded-lg bg-white text-[11px] font-bold text-slate-700"
                              >
                                {ALL_MEASUREMENT_UNITS.map((u) => (
                                  <option key={u} value={u}>
                                    {u}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>

                          <td className="py-2 px-2.5 font-mono text-[11px]">
                            {isMisc ? (
                              <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-sans font-bold">
                                کسر از انبار ندارد
                              </span>
                            ) : (
                              <div className="flex flex-col">
                                <span className="font-bold text-blue-800">
                                  {Number(stockEquivQty.toFixed(4))} {stockUnit}
                                </span>
                                {(stockUnit === 'کارتن' ||
                                  stockUnit === 'بسته' ||
                                  recipeUnit === 'کارتن' ||
                                  recipeUnit === 'بسته') &&
                                  stockUnit !== recipeUnit && (
                                    <div className="flex items-center gap-1 mt-1 font-sans text-[10px] text-slate-500">
                                      <span>ضریب بسته:</span>
                                      <input
                                        type="number"
                                        step="any"
                                        min="1"
                                        value={ing.unitsPerPackage || 24}
                                        onChange={(e) =>
                                          handleUpdateIngredient(idx, {
                                            unitsPerPackage: Number(e.target.value),
                                          })
                                        }
                                        className="w-12 px-1 py-0.5 border border-amber-300 rounded bg-amber-50 font-mono text-center"
                                      />
                                    </div>
                                  )}
                              </div>
                            )}
                          </td>

                          <td className="py-2 px-2.5 font-mono text-slate-500">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                step="1"
                                min="0"
                                value={ing.wastePercent || 0}
                                onChange={(e) =>
                                  handleUpdateIngredient(idx, {
                                    wastePercent: Number(e.target.value),
                                  })
                                }
                                className="w-14 px-1.5 py-1 border border-slate-300 rounded-lg font-mono text-center bg-white"
                                dir="ltr"
                              />
                              <span>%</span>
                            </div>
                          </td>

                          <td className="py-2 px-2.5 font-mono text-slate-600">
                            {isMisc ? (
                              <div className="flex items-center gap-1">
                                <FormattedNumberInput
                                  value={ing.customUnitPrice || ''}
                                  onValueChange={(val) =>
                                    handleUpdateIngredient(idx, { customUnitPrice: val })
                                  }
                                  className="w-28 px-2 py-1 border border-purple-400 rounded-lg font-mono font-bold text-left bg-white text-purple-900"
                                />
                                <span className="text-[10px] font-sans text-purple-700">دستی</span>
                              </div>
                            ) : (
                              <div>
                                <span>{formatCurrency(unitCost)}</span>
                                <span className="block text-[10px] font-sans text-slate-400">
                                  هر {stockUnit}
                                </span>
                              </div>
                            )}
                          </td>

                          <td className="py-2 px-2.5 font-mono font-bold text-slate-900">
                            {formatCurrency(lineCost)}
                          </td>

                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveIngredient(idx)}
                              className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                              title="حذف این ردیف از فرمول"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {ingredients.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-400">
                          هنوز ماده اولیه یا کالای متفرقه‌ای برای این غذا اضافه نشده است.
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
                    <span className="text-slate-400 block text-[10px]">
                      مواد انبار + متفرقه:
                    </span>
                    <span className="font-mono font-bold text-sm mt-0.5 block">
                      {formatCurrency(costResult.ingredientsCost)}
                    </span>
                    {costResult.miscIngredientsCost > 0 && (
                      <span className="text-[10px] text-purple-300 block mt-0.5">
                        (شامل {formatCurrency(costResult.miscIngredientsCost)} متفرقه)
                      </span>
                    )}
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

