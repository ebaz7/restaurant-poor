import { useLiveQuery } from 'dexie-react-hooks';
import { db, Customer } from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import {
  Users,
  Search,
  Phone,
  Plus,
  Edit2,
  Trash2,
  MapPin,
  Hash,
  X,
  Save,
  UserPlus,
} from 'lucide-react';
import { useState, useMemo } from 'react';

export default function CustomersScreen() {
  const customersList = useLiveQuery(() => db.customers.toArray()) || [];
  const orders = useLiveQuery(() => db.orders.toArray()) || [];
  const [searchQuery, setSearchQuery] = useState('');

  // State for adding/editing customer
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Partial<Customer> | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Compute aggregated stats for customers based on phone number matching
  const customerStats = useMemo(() => {
    const map = new Map<string, { totalSpent: number; orderCount: number; lastOrderDate?: Date }>();

    orders.forEach((order) => {
      if (!order.customerPhone) return;
      const phone = order.customerPhone.trim();
      if (!map.has(phone)) {
        map.set(phone, { totalSpent: 0, orderCount: 0 });
      }
      const stats = map.get(phone)!;
      stats.totalSpent += order.total;
      stats.orderCount += 1;
      if (!stats.lastOrderDate || new Date(order.createdAt) > new Date(stats.lastOrderDate)) {
        stats.lastOrderDate = order.createdAt;
      }
    });

    return map;
  }, [orders]);

  // Combine customers list from database with their computed stats
  const processedCustomers = useMemo(() => {
    return customersList
      .map((customer) => {
        const stats = customerStats.get(customer.phone.trim()) || {
          totalSpent: 0,
          orderCount: 0,
        };
        return {
          ...customer,
          totalSpent: stats.totalSpent,
          orderCount: stats.orderCount,
          lastOrderDate: stats.lastOrderDate,
        };
      })
      .filter((c) => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return true;
        return (
          c.phone.includes(query) ||
          (c.name && c.name.toLowerCase().includes(query)) ||
          (c.subscriptionCode && c.subscriptionCode.toLowerCase().includes(query)) ||
          (c.address && c.address.toLowerCase().includes(query))
        );
      })
      .sort((a, b) => b.totalSpent - a.totalSpent);
  }, [customersList, customerStats, searchQuery]);

  const handleOpenAddModal = () => {
    setErrorMsg('');
    setEditingCustomer({
      phone: '',
      name: '',
      subscriptionCode: '',
      address: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (customer: Customer) => {
    setErrorMsg('');
    setEditingCustomer(customer);
    setIsModalOpen(true);
  };

  const handleSaveCustomer = async () => {
    if (!editingCustomer?.phone?.trim()) {
      setErrorMsg('لطفاً شماره موبایل مشتری را وارد کنید.');
      return;
    }

    const phone = editingCustomer.phone.trim();
    const name = editingCustomer.name?.trim() || '';
    const subscriptionCode = editingCustomer.subscriptionCode?.trim() || '';
    const address = editingCustomer.address?.trim() || '';

    const existing = await db.customers.where('phone').equals(phone).first();
    if (existing && existing.id !== editingCustomer.id) {
      setErrorMsg('این شماره موبایل قبلاً ثبت شده است.');
      return;
    }

    if (editingCustomer.id) {
      await db.customers.update(editingCustomer.id, {
        phone,
        name,
        subscriptionCode,
        address,
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

    setIsModalOpen(false);
    setEditingCustomer(null);
  };

  const handleDeleteCustomer = async (id: number) => {
    await db.customers.delete(id);
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-6 md:p-8 bg-slate-50">
      <div className="max-w-6xl mx-auto space-y-3.5 sm:space-y-6">
        {/* Header Section */}
        <div className="bg-white p-3.5 sm:p-6 rounded-2xl border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-3.5 md:gap-6">
          <div>
            <h1 className="text-base sm:text-2xl font-extrabold text-slate-900">
              باشگاه مشتریان و مشترکین
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-1">
              مدیریت مشخصات، کد اشتراک و آدرس بیرون‌بر مشتریان رستوران
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
            <div className="relative flex-1 md:w-72">
              <Search
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                type="text"
                placeholder="جستجو (نام، موبایل، اشتراک...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-9 pl-4 py-2.5 bg-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-right text-xs"
              />
            </div>
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shrink-0 text-xs cursor-pointer"
            >
              <UserPlus size={16} />
              <span>افزودن مشتری جدید</span>
            </button>
          </div>
        </div>

        {/* Customer Table List */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right whitespace-nowrap text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 font-medium text-slate-500">
                <tr>
                  <th className="py-3.5 px-5 text-right">مشخصات مشتری</th>
                  <th className="py-3.5 px-5 text-center">کد اشتراک</th>
                  <th className="py-3.5 px-5 text-center">تعداد خرید</th>
                  <th className="py-3.5 px-5 text-right">مجموع پرداختی</th>
                  <th className="py-3.5 px-5 text-right">آدرس بیرون‌بر</th>
                  <th className="py-3.5 px-5 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {processedCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                          {customer.name ? customer.name[0] : <Phone size={15} />}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800">
                            {customer.name || 'مشتری بدون نام'}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono" dir="ltr">
                            {customer.phone}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-5 text-center font-mono font-bold text-amber-700">
                      {customer.subscriptionCode ? `#${customer.subscriptionCode}` : '-'}
                    </td>

                    <td className="py-3.5 px-5 text-center text-slate-600 font-mono">
                      {customer.orderCount} بار
                    </td>

                    <td className="py-3.5 px-5 font-bold text-emerald-600 font-mono">
                      {formatCurrency(customer.totalSpent)}
                    </td>

                    <td className="py-3.5 px-5 text-slate-600 max-w-xs overflow-hidden text-ellipsis">
                      {customer.address || 'ثبت نشده'}
                    </td>

                    <td className="py-3.5 px-5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(customer)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="ویرایش اطلاعات"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => customer.id && handleDeleteCustomer(customer.id)}
                          className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="حذف"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {processedCustomers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <Users size={40} className="mx-auto mb-3 opacity-20" />
                      <p className="text-sm font-medium">مشتری با این مشخصات یافت نشد.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add / Edit Customer Modal */}
      {isModalOpen && editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 flex flex-col gap-5">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">
                {editingCustomer.id ? 'ویرایش مشخصات مشتری' : 'افزودن مشتری جدید'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingCustomer(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold">
                {errorMsg}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  شماره موبایل <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="09123456789"
                  value={editingCustomer.phone || ''}
                  onChange={(e) =>
                    setEditingCustomer({ ...editingCustomer, phone: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-left font-mono"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">نام و نام خانوادگی</label>
                <input
                  type="text"
                  placeholder="مثال: علی محمدی"
                  value={editingCustomer.name || ''}
                  onChange={(e) =>
                    setEditingCustomer({ ...editingCustomer, name: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-right"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">کد اشتراک</label>
                <input
                  type="text"
                  placeholder="1045"
                  value={editingCustomer.subscriptionCode || ''}
                  onChange={(e) =>
                    setEditingCustomer({
                      ...editingCustomer,
                      subscriptionCode: e.target.value,
                    })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-left font-mono"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  آدرس کامل جهت سفارش‌های بیرون‌بر
                </label>
                <textarea
                  placeholder="آدرس مشتری..."
                  value={editingCustomer.address || ''}
                  onChange={(e) =>
                    setEditingCustomer({ ...editingCustomer, address: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-right h-20 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-3 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingCustomer(null);
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleSaveCustomer}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5"
              >
                <Save size={15} />
                <span>ذخیره</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
