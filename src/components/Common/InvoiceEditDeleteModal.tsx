import React, { useState, useEffect } from 'react';
import {
  X,
  Edit3,
  Trash2,
  Check,
  AlertTriangle,
  Receipt,
  User,
  Phone,
  CreditCard,
  Plus,
  Minus,
  Save,
  ShieldAlert,
} from 'lucide-react';
import {
  db,
  Order,
  OrderItem,
  BankAccount,
  deleteJournalVoucherAndSyncBanks,
  updateJournalVoucherAndSyncBanks,
} from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import { pushToCentralServer } from '../../lib/networkSync';

interface InvoiceEditDeleteModalProps {
  order: Order | null;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onOrderUpdated?: () => void;
}

export default function InvoiceEditDeleteModal({
  order,
  canEdit,
  canDelete,
  onClose,
  onOrderUpdated,
}: InvoiceEditDeleteModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Editable Form State
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'split' | 'credit'>('card');
  const [selectedBankId, setSelectedBankId] = useState<number | undefined>(undefined);
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'amount'>('none');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [selfServiceGuests, setSelfServiceGuests] = useState<number>(1);

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  useEffect(() => {
    db.bankAccounts.toArray().then((banks) => setBankAccounts(banks));
  }, []);

  useEffect(() => {
    if (order) {
      setCustomerName(order.customerName || '');
      setCustomerPhone(order.customerPhone || '');
      setPaymentMethod(order.paymentMethod || 'card');
      setSelectedBankId(order.bankId);
      setDiscountType(order.discountType || 'none');
      setDiscountValue(order.discountValue || 0);
      setItems(order.items ? order.items.map((i) => ({ ...i })) : []);
      setSelfServiceGuests(order.selfServiceGuests || 1);
    }
  }, [order]);

  if (!order) return null;

  // Calculate Subtotal & Total
  const calculateItemsSubtotal = () => {
    if (order.invoiceMode === 'self_service') {
      const baseGuests = selfServiceGuests * (order.selfServiceUnitPrice || 0);
      const extraItems = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      return baseGuests + extraItems;
    }
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  };

  const subtotal = calculateItemsSubtotal();

  let discountAmt = 0;
  if (discountType === 'percent') {
    discountAmt = Math.round((subtotal * discountValue) / 100);
  } else if (discountType === 'amount') {
    discountAmt = Math.min(subtotal, Math.round(discountValue));
  }

  const taxable = Math.max(0, subtotal - discountAmt);
  const taxAmt = order.taxEnabled ? Math.round((taxable * (order.taxPercentage || 0)) / 100) : 0;
  const newTotal = Math.max(0, taxable + taxAmt);

  // Handle Item Quantity Adjustment
  const handleItemQtyChange = (index: number, delta: number) => {
    setItems((prev) => {
      const copy = [...prev];
      const target = copy[index];
      if (!target) return prev;
      const newQty = target.quantity + delta;
      if (newQty <= 0) {
        copy.splice(index, 1);
      } else {
        copy[index] = { ...target, quantity: newQty };
      }
      return copy;
    });
  };

  // Handle Saving Edited Invoice
  const handleSaveChanges = async () => {
    if (!canEdit) {
      setErrorMsg('شما مجوز ویرایش فاکتورهای ثبت شده را ندارید.');
      return;
    }

    if (!order.id) return;

    setIsSaving(true);
    setErrorMsg('');

    try {
      const selectedBank =
        bankAccounts.find((b) => b.id === Number(selectedBankId)) || bankAccounts[0];

      const updatedOrderFields: Partial<Order> = {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        paymentMethod,
        bankId: paymentMethod === 'card' ? selectedBank?.id : undefined,
        bankName: paymentMethod === 'card' ? selectedBank?.bankName : undefined,
        discountType,
        discountValue,
        items,
        selfServiceGuests: order.invoiceMode === 'self_service' ? selfServiceGuests : undefined,
        subtotal,
        taxAmount: taxAmt,
        total: newTotal,
        cashAmount: paymentMethod === 'cash' ? newTotal : 0,
        cardAmount: paymentMethod === 'card' ? newTotal : 0,
      };

      await db.orders.update(order.id, updatedOrderFields);

      // Update associated accounting journal voucher
      const vouchers = await db.journalVouchers.toArray();
      const saleVoucher = vouchers.find(
        (v) =>
          (v.referenceId === order.id && v.type === 'auto_sale') ||
          (v.description && v.description.includes(`#${order.invoiceNumber}`))
      );
      if (saleVoucher && saleVoucher.id) {
        const debitAccCode =
          paymentMethod === 'cash' ? '101' : paymentMethod === 'credit' ? '103' : '102';
        const debitAccName =
          paymentMethod === 'cash'
            ? 'صندوق نقدی رستوران'
            : paymentMethod === 'credit'
            ? 'حساب‌های دریافتنی (مشتریان و نسیه)'
            : 'موجودی بانک‌ها و کارتخوان‌ها';
        const revAccCode = order.invoiceMode === 'self_service' ? '402' : '401';
        const revAccName =
          order.invoiceMode === 'self_service'
            ? 'درآمد فیش سلف سرویس و نوشابه'
            : 'درآمد فروش غذا و منو';

        await updateJournalVoucherAndSyncBanks(saleVoucher.id, {
          description: `فروش فاکتور #${order.invoiceNumber} (${customerName.trim() || 'مشتری'}) - ویرایش شده`,
          bankId: paymentMethod === 'card' ? selectedBank?.id : undefined,
          bankName: paymentMethod === 'card' ? selectedBank?.bankName : undefined,
          lines: [
            {
              accountCode: debitAccCode,
              accountName: debitAccName,
              debit: newTotal,
              credit: 0,
              description: `دریافت بابت فاکتور #${order.invoiceNumber}`,
            },
            {
              accountCode: revAccCode,
              accountName: revAccName,
              debit: 0,
              credit: newTotal,
              description: `درآمد فروش فاکتور #${order.invoiceNumber}`,
            },
          ],
        });
      }

      // Also sync and trigger callback
      await pushToCentralServer(false);
      if (onOrderUpdated) onOrderUpdated();
      setIsEditing(false);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'خطا در ذخیره تغییرات فاکتور');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Invoice Deletion
  const handleDeleteInvoice = async () => {
    if (!canDelete) {
      setErrorMsg('شما مجوز حذف کامل فاکتور را ندارید.');
      return;
    }

    if (!order.id) return;

    setIsSaving(true);
    try {
      // Remove order from IndexedDB
      await db.orders.delete(order.id);

      // Also cleanup associated journal voucher entries referencing invoice number and sync bank balances
      const vouchers = await db.journalVouchers.toArray();
      for (const v of vouchers) {
        if (
          (v.referenceId === order.id && v.type === 'auto_sale') ||
          (v.description && v.description.includes(`#${order.invoiceNumber}`))
        ) {
          if (v.id) await deleteJournalVoucherAndSyncBanks(v.id);
        }
      }

      await pushToCentralServer(false);
      if (onOrderUpdated) onOrderUpdated();
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'خطا در حذف فاکتور');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      dir="rtl"
    >
      <div className="bg-white rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
              <Receipt size={22} />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                مدیریت فاکتور شماره #{order.invoiceNumber}
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                زمان صدور:{' '}
                {order.createdAt ? new Date(order.createdAt).toLocaleString('fa-IR') : 'نامشخص'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto space-y-4 text-xs pr-1">
          {/* Status Badge & Mode */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200">
            <div>
              <span className="text-slate-500 font-bold block">نوع فاکتور:</span>
              <span className="font-extrabold text-slate-900">
                {order.invoiceMode === 'self_service' ? 'فیش سلف سرویس' : 'منوی عادی'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 font-bold block">مبلغ فعلی:</span>
              <span className="font-mono font-black text-blue-700 text-sm">
                {formatCurrency(order.total)}
              </span>
            </div>
          </div>

          {!isEditing ? (
            /* VIEW MODE */
            <div className="space-y-3">
              {/* Customer Info */}
              <div className="p-3 rounded-2xl border border-slate-200 bg-white space-y-1.5">
                <div className="flex items-center gap-1.5 text-slate-700 font-bold">
                  <User size={15} className="text-slate-400" />
                  <span>مشتری: {order.customerName || 'مهمان عمومی'}</span>
                </div>
                {order.customerPhone && (
                  <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                    <Phone size={14} className="text-slate-400" />
                    <span className="font-mono" dir="ltr">
                      {order.customerPhone}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-slate-700 font-bold pt-1 border-t border-slate-100">
                  <CreditCard size={15} className="text-slate-400" />
                  <span>
                    روش تسویه:{' '}
                    {order.paymentMethod === 'cash'
                      ? 'نقدی'
                      : order.paymentMethod === 'credit'
                      ? 'نسیه'
                      : order.bankName || 'کارتخوان'}
                  </span>
                </div>
              </div>

              {/* Items List */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="bg-slate-100 px-3 py-2 font-extrabold text-slate-800">
                  اقلام فاکتور ({order.items?.length || 0} قلم)
                </div>
                <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {order.invoiceMode === 'self_service' && (
                    <div className="p-2.5 flex justify-between items-center bg-amber-50/50">
                      <div>
                        <span className="font-bold text-slate-800">ورودی سلف سرویس</span>
                        <span className="text-[10px] text-slate-500 block">
                          {order.selfServiceGuests} نفر × {formatCurrency(order.selfServiceUnitPrice || 0)}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-slate-900">
                        {formatCurrency((order.selfServiceGuests || 1) * (order.selfServiceUnitPrice || 0))}
                      </span>
                    </div>
                  )}

                  {order.items?.map((it, idx) => (
                    <div key={idx} className="p-2.5 flex justify-between items-center">
                      <div>
                        <span className="font-bold text-slate-800">{it.name}</span>
                        <span className="text-[10px] text-slate-500 block">
                          {it.quantity} عدد × {formatCurrency(it.price)}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-slate-900">
                        {formatCurrency(it.price * it.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* EDIT FORM MODE */
            <div className="space-y-3.5 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
              <h3 className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5 text-blue-700">
                <Edit3 size={16} />
                <span>ویرایش مشخصات، اقلام و نحوه تسویه</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">نام مشتری:</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">شماره تماس:</label>
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-left"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Payment Method & Bank */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">نحوه تسویه:</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold"
                  >
                    <option value="card">کارتخوان بانکی</option>
                    <option value="cash">دریافت نقدی</option>
                    <option value="credit">نسیه / طرف حساب</option>
                  </select>
                </div>

                {paymentMethod === 'card' && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">بانک / دستگاه POS:</label>
                    <select
                      value={selectedBankId || ''}
                      onChange={(e) => setSelectedBankId(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold"
                    >
                      <option value="">انتخاب بانک...</option>
                      {bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bankName} ({b.accountNumber || 'اصلی'})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Self Service Guests Edit */}
              {order.invoiceMode === 'self_service' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">تعداد نفرات سلف:</label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSelfServiceGuests((g) => Math.max(1, g - 1))}
                      className="w-8 h-8 rounded-lg bg-slate-200 text-slate-800 font-bold flex items-center justify-center cursor-pointer"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="font-mono font-black text-base">{selfServiceGuests} نفر</span>
                    <button
                      type="button"
                      onClick={() => setSelfServiceGuests((g) => g + 1)}
                      className="w-8 h-8 rounded-lg bg-slate-200 text-slate-800 font-bold flex items-center justify-center cursor-pointer"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* Items Quantity Edit */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">اقلام غذا و نوشیدنی:</label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto bg-white p-2 rounded-xl border border-slate-200">
                  {items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-100 last:border-none">
                      <span className="font-bold text-slate-800">{item.name}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleItemQtyChange(idx, -1)}
                          className="w-6 h-6 rounded bg-rose-100 text-rose-700 flex items-center justify-center font-bold cursor-pointer"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="font-mono font-bold w-6 text-center">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => handleItemQtyChange(idx, 1)}
                          className="w-6 h-6 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold cursor-pointer"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div className="text-slate-400 text-[11px] py-1 text-center">آیتم اضافی ندارد</div>
                  )}
                </div>
              </div>

              {/* Recalculated Total Preview */}
              <div className="p-3 bg-blue-100/70 rounded-xl flex justify-between items-center">
                <span className="font-bold text-blue-900">مبلغ کل جدید فاکتور:</span>
                <span className="font-mono font-black text-blue-900 text-sm">
                  {formatCurrency(newTotal)}
                </span>
              </div>
            </div>
          )}

          {/* Delete Confirmation Warning */}
          {showConfirmDelete && (
            <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 space-y-3">
              <div className="flex items-start gap-2.5 text-rose-800">
                <ShieldAlert size={22} className="shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-black text-xs">آیا از حذف کامل این فاکتور اطمینان دارید؟</h4>
                  <p className="text-[11px] text-rose-700 mt-0.5 leading-relaxed">
                    با حذف فاکتور #{order.invoiceNumber}، اطلاعات این فاکتور و اسناد حسابداری
                    مرتبط با آن کلاً پاک شده و از آمار فروش حذف می‌شود.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowConfirmDelete(false)}
                  className="px-3 py-2 bg-slate-200 text-slate-800 rounded-xl font-bold hover:bg-slate-300 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="button"
                  onClick={handleDeleteInvoice}
                  disabled={isSaving}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 size={15} />
                  <span>تأیید و حذف فاکتور</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Action Buttons Footer */}
        <div className="border-t border-slate-100 pt-3 flex flex-wrap justify-between items-center gap-2 shrink-0">
          <div>
            {!canEdit && !canDelete && (
              <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-1 rounded-md font-bold">
                ⚠️ فقط مشاهده (عدم داشتن دسترسی ویرایش/حذف)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isEditing && !showConfirmDelete && (
              <>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => setShowConfirmDelete(true)}
                    className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Trash2 size={16} />
                    <span>حذف فاکتور</span>
                  </button>
                )}

                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-extrabold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                  >
                    <Edit3 size={16} />
                    <span>ویرایش فاکتور</span>
                  </button>
                )}
              </>
            )}

            {isEditing && (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="button"
                  onClick={handleSaveChanges}
                  disabled={isSaving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Save size={16} />
                  <span>ذخیره تغییرات</span>
                </button>
              </>
            )}

            {!isEditing && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 cursor-pointer"
              >
                بستن
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
