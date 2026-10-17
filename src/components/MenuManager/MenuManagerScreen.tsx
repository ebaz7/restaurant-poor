import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Category, MenuItem } from '../../lib/db';
import { formatCurrency, getCurrencyLabel } from '../../lib/utils';
import FormattedNumberInput from '../Common/FormattedNumberInput';
import {
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  Circle,
  UtensilsCrossed,
} from 'lucide-react';

export default function MenuManagerScreen() {
  const categories = useLiveQuery(() => db.categories.toArray());
  const menuItems = useLiveQuery(() => db.menuItems.toArray());

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);
  const currencyLabel = getCurrencyLabel();

  useEffect(() => {
    if (categories && categories.length > 0 && selectedCategoryId === null) {
      setSelectedCategoryId(categories[0].id!);
    }
  }, [categories, selectedCategoryId]);

  const activeItems = useMemo(() => {
    return menuItems?.filter((i) => i.categoryId === selectedCategoryId) || [];
  }, [menuItems, selectedCategoryId]);

  // Category Actions
  const handleSaveCategory = async () => {
    if (!editingCategory?.name?.trim()) return;
    if (editingCategory.id) {
      await db.categories.update(editingCategory.id, { name: editingCategory.name });
    } else {
      const id = (await db.categories.add({ name: editingCategory.name } as Category)) as number;
      setSelectedCategoryId(id);
    }
    setEditingCategory(null);
  };

  const handleDeleteCategory = async (id: number) => {
    await db.categories.delete(id);
    const itemsToDelete = await db.menuItems.where('categoryId').equals(id).toArray();
    const itemIds = itemsToDelete.map((i) => i.id).filter((i) => i !== undefined) as number[];
    await db.menuItems.bulkDelete(itemIds);
    if (selectedCategoryId === id) setSelectedCategoryId(null);
  };

  // Item Actions
  const handleSaveItem = async () => {
    if (!editingItem?.name?.trim() || !editingItem.price || !selectedCategoryId) return;

    if (editingItem.id) {
      await db.menuItems.update(editingItem.id, {
        name: editingItem.name,
        price: Number(editingItem.price),
        isActive: editingItem.isActive !== undefined ? editingItem.isActive : true,
        image: editingItem.image || '',
      });
    } else {
      await db.menuItems.add({
        categoryId: selectedCategoryId,
        name: editingItem.name,
        price: Number(editingItem.price),
        isActive: true,
        image: editingItem.image || '',
      } as MenuItem);
    }
    setEditingItem(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditingItem((prev) =>
          prev ? { ...prev, image: reader.result as string } : null
        );
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeleteItem = async (id: number) => {
    await db.menuItems.delete(id);
  };

  const toggleItemActive = async (item: MenuItem) => {
    if (item.id) {
      await db.menuItems.update(item.id, { isActive: !item.isActive });
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden">
      {/* Categories Bar (Horizontal on Mobile, Sidebar on Desktop) */}
      <div className="w-full md:w-72 lg:w-80 bg-white border-b md:border-b-0 md:border-l border-slate-200 flex flex-col shrink-0">
        <div className="p-3 md:p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-sm md:text-base font-extrabold text-slate-800">گروه‌های منو</h2>
          <button
            type="button"
            aria-label="افزودن گروه جدید"
            onClick={() => setEditingCategory({ name: '' })}
            className="px-2.5 py-1.5 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-200 transition-colors flex items-center gap-1 text-xs font-bold"
          >
            <Plus size={15} />
            <span>گروه جدید</span>
          </button>
        </div>

        <div className="flex md:flex-col overflow-x-auto md:overflow-y-auto p-2.5 md:p-3 gap-2">
          {categories?.map((cat) => (
            <div
              key={cat.id}
              className={`flex items-center justify-between px-3 py-2 md:p-3.5 rounded-xl cursor-pointer transition-all shrink-0 ${
                selectedCategoryId === cat.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 hover:border-blue-300'
              }`}
              onClick={() => setSelectedCategoryId(cat.id!)}
            >
              <span className="font-bold text-xs md:text-sm whitespace-nowrap">{cat.name}</span>
              <div className="flex items-center gap-1 mr-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingCategory(cat);
                  }}
                  className={`p-1 rounded-lg ${
                    selectedCategoryId === cat.id
                      ? 'hover:bg-blue-500'
                      : 'text-slate-400 hover:bg-slate-100 hover:text-blue-600'
                  }`}
                >
                  <Edit2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCategory(cat.id!);
                  }}
                  className={`p-1 rounded-lg ${
                    selectedCategoryId === cat.id
                      ? 'hover:bg-blue-500'
                      : 'text-slate-400 hover:bg-slate-100 hover:text-red-600'
                  }`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Menu Items Area */}
      <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
        {selectedCategoryId ? (
          <>
            <div className="p-3 md:p-5 bg-white border-b border-slate-200 flex justify-between items-center shrink-0">
              <div>
                <h1 className="text-sm md:text-lg font-extrabold text-slate-900">
                  {categories?.find((c) => c.id === selectedCategoryId)?.name}
                </h1>
                <p className="text-[11px] text-slate-500">
                  مدیریت محصولات و قیمت فروش ({activeItems.length} مورد)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem({ name: '', price: 0, isActive: true, image: '' })}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
              >
                <Plus size={16} />
                <span>افزودن آیتم جدید</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 md:p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {activeItems.map((item) => (
                  <div
                    key={item.id}
                    className={`bg-white rounded-2xl border p-3.5 transition-all flex flex-col justify-between ${
                      item.isActive
                        ? 'border-slate-200 shadow-2xs'
                        : 'border-slate-200 opacity-60 bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <h3 className="font-extrabold text-slate-800 text-sm">{item.name}</h3>
                        <button
                          type="button"
                          onClick={() => toggleItemActive(item)}
                          className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                            item.isActive
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {item.isActive ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                          {item.isActive ? 'فعال' : 'غیرفعال'}
                        </button>
                      </div>
                      <div className="text-blue-600 font-black font-mono text-sm mb-3">
                        {formatCurrency(item.price)}
                      </div>
                    </div>

                    <div className="flex justify-end gap-1.5 pt-2.5 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setEditingItem(item)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id!)}
                        className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}

                {activeItems.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center py-12 text-slate-400">
                    <UtensilsCrossed size={44} className="mb-2 opacity-20" />
                    <p className="text-xs">هنوز هیچ آیتمی در این گروه ثبت نشده است.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 flex-col">
            <UtensilsCrossed size={48} className="mb-3 opacity-10" />
            <p className="text-xs font-medium">یک گروه را انتخاب کنید.</p>
          </div>
        )}
      </div>

      {/* Category Modal */}
      {editingCategory !== null && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-xs p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-5">
            <h3 className="text-base font-bold text-slate-800 mb-3">
              {editingCategory.id ? 'ویرایش گروه' : 'گروه جدید'}
            </h3>
            <div className="mb-5">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">نام گروه</label>
              <input
                autoFocus
                type="text"
                value={editingCategory.name || ''}
                onChange={(e) =>
                  setEditingCategory({ ...editingCategory, name: e.target.value })
                }
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                placeholder="مثال: کباب‌ها"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="px-4 py-2 rounded-xl text-slate-600 text-xs font-bold hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleSaveCategory}
                className="px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
              >
                ذخیره
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Modal */}
      {editingItem !== null && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-xs p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-5">
            <h3 className="text-base font-bold text-slate-800 mb-3">
              {editingItem.id ? 'ویرایش آیتم منو' : 'افزودن آیتم جدید'}
            </h3>

            <div className="space-y-3.5 mb-5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">نام غذا / نوشیدنی</label>
                <input
                  autoFocus
                  type="text"
                  value={editingItem.name || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="مثال: جوجه کباب زعفرانی"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  قیمت فروش ({currencyLabel}) — ۳ رقم ۳ رقم
                </label>
                <FormattedNumberInput
                  value={editingItem.price || ''}
                  onValueChange={(val) => setEditingItem({ ...editingItem, price: val })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none font-mono font-bold text-left"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">تصویر غذا (اختیاری)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="w-full text-xs text-slate-600"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 rounded-xl text-slate-600 text-xs font-bold hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleSaveItem}
                className="px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
              >
                ذخیره
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
