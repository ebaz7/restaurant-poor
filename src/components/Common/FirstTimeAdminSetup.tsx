import React, { useState } from 'react';
import {
  ShieldCheck,
  UserCheck,
  KeyRound,
  Store,
  Coins,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { db, ALL_PERMISSIONS, AppSettings } from '../../lib/db';
import { setGlobalCurrencyUnit } from '../../lib/utils';
import { pushToCentralServer } from '../../lib/networkSync';

interface Props {
  settings?: AppSettings;
  onCompleted: (adminUserId: number) => void;
}

export default function FirstTimeAdminSetup({ settings, onCompleted }: Props) {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('admin');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [currencyUnit, setCurrencyUnit] = useState<'toman' | 'rial'>('toman');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fullName.trim()) {
      setError('لطفاً نام و نام خانوادگی مدیر را وارد فرمایید.');
      return;
    }
    if (!username.trim()) {
      setError('لطفاً یک نام کاربری وارد فرمایید.');
      return;
    }
    if (!pin.trim()) {
      setError('لطفاً رمز عبور یا کد پین ورود را وارد فرمایید.');
      return;
    }
    if (pin.trim().length < 4) {
      setError('رمز عبور / پین باید حداقل ۴ رقم یا کاراکتر باشد.');
      return;
    }
    if (pin.trim() !== confirmPin.trim()) {
      setError('تکرار رمز عبور با رمز وارد شده مطابقت ندارد.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Create first administrator user with 100% permissions
      const newUserId = (await db.appUsers.add({
        username: username.trim(),
        fullName: fullName.trim(),
        pin: pin.trim(),
        roleLabel: 'مدیر کل سیستم',
        isAdmin: true,
        permissions: [...ALL_PERMISSIONS],
        isActive: true,
        createdAt: new Date(),
      })) as number;

      // 2. Set currency unit globally
      setGlobalCurrencyUnit(currencyUnit);

      // 3. Update settings if restaurantName or currency is entered
      const existingSetting = await db.settings.toCollection().first();
      const updates: Partial<AppSettings> = {
        currencyUnit,
        isRawInitialized: true, // system is 100% raw without sample data
        selfServicePricePerPerson: 0,
        selfServiceTitle: '',
        defaultInvoiceMode: 'self_service',
        lockSelfServiceMode: false,
      };
      if (restaurantName.trim()) {
        updates.restaurantName = restaurantName.trim();
      }

      if (existingSetting?.id) {
        await db.settings.update(existingSetting.id, updates);
      } else {
        await db.settings.add({
          restaurantName: restaurantName.trim(),
          phone: '',
          address: '',
          website: '',
          instagram: '',
          telegram: '',
          logoUrl: '',
          taxEnabled: false,
          taxPercentage: 0,
          requireCustomerPhone: false,
          currencyUnit,
          selfServicePricePerPerson: 0,
          selfServiceTitle: '',
          defaultInvoiceMode: 'self_service',
          lockSelfServiceMode: false,
          autoBackupEnabled: false,
          autoBackupIntervalHours: 1,
          telegramBotToken: '',
          telegramChatId: '',
          baleBotToken: '',
          baleChatId: '',
          isRawInitialized: true,
          requireLoginOnStart: false,
          autoBackupBeforeUpdate: true,
          hideCostPriceFromKitchen: false,
        });
      }

      // 4. Save session storage
      try {
        window.sessionStorage.setItem('arka_active_user_id', String(newUserId));
        window.localStorage.removeItem('arka_raw_mode');
      } catch {
        // ignore storage errors
      }

      // 5. Notify central server
      try {
        pushToCentralServer(false);
      } catch {
        // ignore network error
      }

      onCompleted(newUserId);
    } catch (err: any) {
      console.error('Setup error:', err);
      setError('خطا در ثبت اطلاعات مدیر: ' + (err?.message || 'نامشخص'));
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
      dir="rtl"
    >
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl border border-slate-200 space-y-6 my-auto">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-teal-600 text-white flex items-center justify-center mx-auto shadow-lg">
            <Sparkles size={32} />
          </div>
          <div className="inline-block px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-extrabold">
            ✨ سیستم آماده راه‌اندازی جدید یا اتصال شبکه
          </div>
          <h1 className="text-xl font-black text-slate-900">
            تعریف مدیر سیستم یا اتصال به سرور مرکزی
          </h1>
          <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
            اگر این دستگاه قرار است مستقل کار کند اطلاعات زیر را تکمیل فرمایید. اگر قرار است به عنوان کلاینت/گوشی به سرور دیگری متصل شود از آدرس سرور استفاده فرمایید:
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                نام و نام خانوادگی مدیر <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="مثال: مهندس حسینی"
                  className="w-full pl-3 pr-9 py-2.5 rounded-xl border border-slate-300 font-bold focus:border-teal-600 focus:ring-2 focus:ring-teal-100 outline-hidden"
                />
                <UserCheck size={16} className="absolute right-3 top-3 text-slate-400" />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                نام کاربری (شناسه ورود) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-mono font-bold text-left focus:border-teal-600 focus:ring-2 focus:ring-teal-100 outline-hidden"
                dir="ltr"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                رمز عبور / پین ورود <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="حداقل ۴ رقم"
                  className="w-full pl-3 pr-9 py-2.5 rounded-xl border border-slate-300 font-mono text-center tracking-widest font-bold focus:border-teal-600 focus:ring-2 focus:ring-teal-100 outline-hidden"
                  dir="ltr"
                />
                <KeyRound size={16} className="absolute right-3 top-3 text-slate-400" />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                تکرار رمز عبور <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                required
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder="تکرار رمز عبور"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-mono text-center tracking-widest font-bold focus:border-teal-600 focus:ring-2 focus:ring-teal-100 outline-hidden"
                dir="ltr"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1 border-t border-slate-100">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                نام فروشگاه / رستوران (اختیاری)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  placeholder="مثال: رستوران فودمیکس"
                  className="w-full pl-3 pr-9 py-2 rounded-xl border border-slate-300 font-bold focus:border-teal-600 focus:ring-2 focus:ring-teal-100 outline-hidden"
                />
                <Store size={16} className="absolute right-3 top-2.5 text-slate-400" />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                واحد پول پیش‌فرض سیستم
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCurrencyUnit('toman')}
                  className={`py-2 rounded-xl border font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1 ${
                    currencyUnit === 'toman'
                      ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  <Coins size={14} />
                  <span>تومان</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrencyUnit('rial')}
                  className={`py-2 rounded-xl border font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1 ${
                    currencyUnit === 'rial'
                      ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  <Coins size={14} />
                  <span>ریال</span>
                </button>
              </div>
            </div>
          </div>

          <div className="pt-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:bg-slate-300 text-white rounded-xl font-black text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 size={18} />
              <span>
                {isSubmitting
                  ? 'در حال ایجاد حساب مدیر و ورود به سیستم...'
                  : 'تأیید و ایجاد اولین مدیر کل و ورود به نرم‌افزار'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
