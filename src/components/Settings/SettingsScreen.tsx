import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  AppSettings,
  AppUser,
  PermissionKey,
  ALL_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  resetDatabaseToRaw,
  convertDatabaseCurrencyUnit,
} from '../../lib/db';
import {
  exportDB,
  importDB,
  sendBackupToMessengers,
  syncBackupToServer,
  setGlobalCurrencyUnit,
  getCurrencyLabel,
  optimizeDatabaseStorage,
} from '../../lib/utils';
import { notifyRawResetToCentralServer, pushToCentralServer } from '../../lib/networkSync';
import FormattedNumberInput from '../Common/FormattedNumberInput';
import { PWAInstallButton } from '../Common/PWAInstallButton';
import {
  Save,
  Download,
  Upload,
  Check,
  AlertTriangle,
  RotateCcw,
  Bot,
  Send,
  UserPlus,
  Edit3,
  Trash2,
  Lock,
  KeyRound,
  ShieldCheck,
  Clock,
  Coins,
  Receipt,
  Eye,
  EyeOff,
  Sparkles,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  Users,
  Smartphone,
  Store,
  Shield,
} from 'lucide-react';

const ROLE_PRESETS: Array<{
  label: string;
  isAdmin: boolean;
  permissions: PermissionKey[];
}> = [
  {
    label: 'مدیر کل',
    isAdmin: true,
    permissions: [...ALL_PERMISSIONS],
  },
  {
    label: 'صندوق‌دار',
    isAdmin: false,
    permissions: ['pos'],
  },
  {
    label: 'صندوق‌دار ارشد',
    isAdmin: false,
    permissions: ['pos', 'pos_discount', 'pos_cancel', 'customers', 'reports'],
  },
  {
    label: 'سرآشپز / مسئول تولید',
    isAdmin: false,
    permissions: ['kitchen', 'menu'],
  },
  {
    label: 'حسابدار و انباردار',
    isAdmin: false,
    permissions: ['accounting', 'reports', 'pos', 'pos_cancel'],
  },
];

export default function SettingsScreen() {
  const settings = useLiveQuery(() => db.settings.toCollection().first());
  const appUsers = useLiveQuery(() => db.appUsers.toArray()) || [];

  const [activeTab, setActiveTab] = useState<'general' | 'users' | 'backup'>('general');
  const [formData, setFormData] = useState<Partial<AppSettings>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingBot, setIsSendingBot] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const handleOptimizeDatabase = async () => {
    setIsOptimizing(true);
    try {
      const res = await optimizeDatabaseStorage();
      const freedKB = Math.round(res.freedBytesEstimate / 1024);
      showNotice(
        'success',
        `بهینه‌سازی و سبک‌سازی دیتابیس انجام شد: ${res.optimizedItems} تصویر فشرده گردید و ${res.cleanedVouchers} رکورد خالی پاکسازی شد (${freedKB} کیلوبایت فضای حافظه آزادسازی گردید).`
      );
    } catch {
      showNotice('error', 'خطا در بهینه‌سازی دیتابیس.');
    } finally {
      setIsOptimizing(false);
    }
  };
  const [confirmRawReset, setConfirmRawReset] = useState(false);
  const [isResettingRaw, setIsResettingRaw] = useState(false);

  // User Management Form State
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [userForm, setUserForm] = useState<{
    username: string;
    fullName: string;
    pin: string;
    roleLabel: string;
    isAdmin: boolean;
    permissions: PermissionKey[];
    isActive: boolean;
  }>({
    username: '',
    fullName: '',
    pin: '',
    roleLabel: 'صندوق‌دار',
    isAdmin: false,
    permissions: ['pos'],
    isActive: true,
  });

  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) {
      setFormData(settings);
      if (settings.currencyUnit) {
        setGlobalCurrencyUnit(settings.currencyUnit);
      }
    }
  }, [settings]);

  const showNotice = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 6000);
  };

  const handleCurrencyChange = async (unit: 'toman' | 'rial') => {
    setGlobalCurrencyUnit(unit);
    const res = await convertDatabaseCurrencyUnit(unit);
    const updatedSettings = await db.settings.toCollection().first();
    if (updatedSettings) {
      setFormData(updatedSettings);
      await syncBackupToServer(updatedSettings);
    } else {
      setFormData({ ...formData, currencyUnit: unit });
    }
    try {
      await pushToCentralServer(false);
    } catch {
      // ignore if offline
    }
    if (res.converted) {
      showNotice(
        'success',
        unit === 'toman'
          ? 'واحد پول کل سامانه به «تومان» تغییر یافت و به‌صورت اتوماتیک یک صفر از تمامی مبالغ، قیمت‌ها، فرمول‌های تولید، انبار و ثبت‌های قبلی کم شد (تبدیل ریال به تومان).'
          : 'واحد پول کل سامانه به «ریال» تغییر یافت و به‌صورت اتوماتیک یک صفر به تمامی مبالغ، قیمت‌ها، فرمول‌های تولید، انبار و ثبت‌های قبلی اضافه شد (تبدیل تومان به ریال).'
      );
    } else {
      showNotice(
        'success',
        `واحد پول کل سامانه بر روی «${unit === 'rial' ? 'ریال' : 'تومان'}» تنظیم و در تمام بخش‌های نرم‌افزار یکپارچه است.`
      );
    }
  };

  const handleSave = async () => {
    if (!settings?.id) return;
    setIsSaving(true);
    if (formData.currencyUnit) {
      setGlobalCurrencyUnit(formData.currencyUnit);
    }
    await db.settings.update(settings.id, formData);
    await syncBackupToServer(formData);
    setIsSaving(false);
    showNotice(
      'success',
      'تنظیمات فروشگاه، واحد پول، سلف سرویس و کانفیگ ربات بکاپ ذخیره و با سرور همگام‌سازی شد.'
    );
  };

  const handleTestAndSendBotBackup = async (customLabel?: string) => {
    if (!settings?.id) return;
    await db.settings.update(settings.id, formData);
    setIsSendingBot(true);
    const res = await sendBackupToMessengers(
      formData,
      customLabel || 'تست و ارسال دستی از تنظیمات'
    );
    setIsSendingBot(false);
    showNotice(res.success ? 'success' : 'error', res.messages.join(' | '));
  };

  const handleFactoryRawReset = async () => {
    setIsResettingRaw(true);
    try {
      // If Bale or Telegram bot is configured, attempt auto backup before wiping data
      const hasBots =
        Boolean(formData.baleBotToken?.trim() && formData.baleChatId?.trim()) ||
        Boolean(formData.telegramBotToken?.trim() && formData.telegramChatId?.trim());

      if (hasBots) {
        try {
          await Promise.race([
            sendBackupToMessengers(formData, 'بکاپ خودکار قبل از خام‌سازی ۱۰۰٪ نرم‌افزار'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
          ]);
        } catch (botErr) {
          console.warn('Bot backup before reset warning:', botErr);
        }
      }

      await resetDatabaseToRaw();

      const pristineRawSettings: AppSettings = {
        restaurantName: '',
        phone: '',
        address: '',
        website: '',
        instagram: '',
        telegram: '',
        logoUrl: '',
        taxEnabled: false,
        taxPercentage: 0,
        requireCustomerPhone: false,
        currencyUnit: formData.currencyUnit || 'toman',
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
        lastAutoBackupAt: '',
        lastAutoBackupStatus: '',
        isRawInitialized: true,
        requireLoginOnStart: false,
        autoBackupBeforeUpdate: true,
        hideCostPriceFromKitchen: false,
      };

      setFormData(pristineRawSettings);
      await notifyRawResetToCentralServer();
      await syncBackupToServer(pristineRawSettings);

      try {
        window.sessionStorage.clear();
        window.localStorage.removeItem('arka_active_user_id');
      } catch {
        // ignore
      }

      setConfirmRawReset(false);
      showNotice(
        'success',
        'نرم‌افزار ۱۰۰٪ خام شد! همه اطلاعات پاکسازی شده و سیستم آماده تعریف اولین کاربر مدیر کل می‌باشد.'
      );
    } catch (err: any) {
      console.error('Raw reset error:', err);
      showNotice('error', 'خطا در خام‌سازی دیتابیس.');
    } finally {
      setIsResettingRaw(false);
    }
  };

  const handleExport = async () => {
    await syncBackupToServer(formData);
    const json = await exportDB();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_arka_pos_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotice('success', 'فایل پشتیبان کامل (شامل منو، فاکتورها، کاربران و حسابداری) دانلود شد.');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const jsonString = event.target?.result as string;
        await importDB(jsonString);
        await syncBackupToServer();
        showNotice('success', 'بازیابی اطلاعات از فایل پشتیبان با موفقیت انجام شد.');
      } catch (err) {
        showNotice('error', 'خطا در بازیابی اطلاعات: فرمت فایل نامعتبر است.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'number' ? Number(value) : value,
    });
  };

  // --- User Management Handlers ---
  const handleApplyRolePreset = (preset: (typeof ROLE_PRESETS)[0]) => {
    setUserForm((prev) => ({
      ...prev,
      roleLabel: preset.label,
      isAdmin: preset.isAdmin,
      permissions: [...preset.permissions],
    }));
  };

  const handleTogglePermission = (perm: PermissionKey) => {
    setUserForm((prev) => {
      const exists = prev.permissions.includes(perm);
      const nextPerms = exists
        ? prev.permissions.filter((p) => p !== perm)
        : [...prev.permissions, perm];
      return {
        ...prev,
        isAdmin: nextPerms.length === ALL_PERMISSIONS.length,
        permissions: nextPerms,
      };
    });
  };

  const resetUserForm = () => {
    setEditingUserId(null);
    setUserForm({
      username: '',
      fullName: '',
      pin: '',
      roleLabel: 'صندوق‌دار',
      isAdmin: false,
      permissions: ['pos'],
      isActive: true,
    });
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = userForm.username.trim().toLowerCase();
    const cleanName = userForm.fullName.trim();
    const cleanPin = userForm.pin.trim();

    if (!cleanUsername || !cleanName || !cleanPin) {
      showNotice('error', 'لطفاً نام و نام خانوادگی، نام کاربری و رمز عبور (پین) را وارد کنید.');
      return;
    }

    if (userForm.permissions.length === 0 && !userForm.isAdmin) {
      showNotice('error', 'حداقل یک بخش دسترسی باید برای کاربر انتخاب شود.');
      return;
    }

    const finalPermissions: PermissionKey[] = userForm.isAdmin
      ? [...ALL_PERMISSIONS]
      : userForm.permissions;

    try {
      if (editingUserId !== null) {
        const duplicate = appUsers.find(
          (u) => u.username.toLowerCase() === cleanUsername && u.id !== editingUserId
        );
        if (duplicate) {
          showNotice('error', 'این نام کاربری قبلاً برای کاربر دیگری ثبت شده است.');
          return;
        }
        await db.appUsers.update(editingUserId, {
          username: cleanUsername,
          fullName: cleanName,
          pin: cleanPin,
          roleLabel: userForm.roleLabel || 'کاربر',
          isAdmin: userForm.isAdmin,
          permissions: finalPermissions,
          isActive: userForm.isActive,
        });
        showNotice('success', `اطلاعات و سطح دسترسی «${cleanName}» با موفقیت بروزرسانی شد.`);
      } else {
        const duplicate = appUsers.find((u) => u.username.toLowerCase() === cleanUsername);
        if (duplicate) {
          showNotice('error', 'این نام کاربری قبلاً ثبت شده است. نام کاربری دیگری انتخاب کنید.');
          return;
        }
        await db.appUsers.add({
          username: cleanUsername,
          fullName: cleanName,
          pin: cleanPin,
          roleLabel: userForm.roleLabel || 'کاربر',
          isAdmin: userForm.isAdmin,
          permissions: finalPermissions,
          isActive: userForm.isActive,
          createdAt: new Date(),
        });
        showNotice('success', `کاربر جدید «${cleanName}» با سطح دسترسی انتخاب‌شده ایجاد شد.`);
      }
      resetUserForm();
      await syncBackupToServer(formData);
    } catch (err) {
      showNotice('error', 'خطا در ذخیره اطلاعات کاربر.');
    }
  };

  const handleEditUser = (u: AppUser) => {
    setEditingUserId(u.id || null);
    setUserForm({
      username: u.username,
      fullName: u.fullName,
      pin: u.pin,
      roleLabel: u.roleLabel,
      isAdmin: u.isAdmin,
      permissions: [...(u.permissions || [])],
      isActive: u.isActive,
    });
  };

  const handleDeleteUser = async (u: AppUser) => {
    if (!u.id) return;
    const adminCount = appUsers.filter((item) => item.isAdmin && item.isActive).length;
    if (u.isAdmin && adminCount <= 1) {
      showNotice('error', 'امکان حذف تنها مدیر کل فعال سیستم وجود ندارد.');
      return;
    }
    await db.appUsers.delete(u.id);
    if (editingUserId === u.id) resetUserForm();
    showNotice('success', `کاربر «${u.fullName}» حذف شد.`);
  };

  const currencyLabel = getCurrencyLabel(formData.currencyUnit || 'toman');

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Compact Header + Tab Switcher */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-3 shrink-0">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-base md:text-xl font-extrabold text-slate-900">
              تنظیمات سیستم، سطوح دسترسی کاربران، بکاپ خودکار و خام‌سازی
            </h1>
            <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
              مدیریت کاربران و دسترسی بخش‌ها، واحد پول، سلف سرویس، بات بله/تلگرام و خام‌سازی ۱۰۰٪ نرم‌افزار
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'general'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              <Store size={14} />
              <span>۱. فروشگاه و خام‌سازی</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'users'
                  ? 'bg-white text-teal-700 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              <Shield size={14} />
              <span>۲. کاربران و سطح دسترسی</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('backup')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'backup'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              <Bot size={14} />
              <span>۳. بات بله/تلگرام و بکاپ</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 md:p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {statusMessage && (
            <div
              className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 size={17} />
              ) : (
                <AlertCircle size={17} />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* TAB 1: GENERAL & 100% RAW RESET */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              {/* Currency Unit (Toman vs Rial) + PWA Install Card */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs md:text-sm font-extrabold text-slate-900">
                    <Coins size={18} className="text-blue-600" />
                    <span>واحد پول سامانه (تومان یا ریال) و جداکننده ۳ رقمی</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    تمامی مبالغ هنگام تایپ و پس از ثبت به‌صورت ۳ رقم ۳ رقم جدا می‌شوند. واحد نمایشی را انتخاب کنید:
                  </p>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => handleCurrencyChange('toman')}
                      className={`py-2 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                        (formData.currencyUnit || 'toman') === 'toman'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-white/60'
                      }`}
                    >
                      تومان (Toman)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCurrencyChange('rial')}
                      className={`py-2 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                        formData.currencyUnit === 'rial'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-white/60'
                      }`}
                    >
                      ریال (Rial)
                    </button>
                  </div>
                </div>

                {/* PWA Install & Mobile Ergonomics Card */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs md:text-sm font-extrabold text-slate-900">
                        <Smartphone size={18} className="text-emerald-600" />
                        <span>نصب وب‌اپلیکیشن (PWA) روی گوشی و کامپیوتر</span>
                      </div>
                      <PWAInstallButton compact />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                      با نصب نسخه PWA، نرم‌افزار آرکا مانند یک اپلیکیشن بومی روی صفحه اصلی گوشی موبایل و دسکتاپ شما نصب شده و به‌صورت تمام‌صفحه و آفلاین اجرا می‌شود.
                    </p>
                  </div>
                </div>
              </div>

              {/* Restaurant Info & Self-Service Mode Settings */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      نام فروشگاه / رستوران
                    </label>
                    <input
                      name="restaurantName"
                      value={formData.restaurantName || ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                      placeholder="مثال: رستوران و سلف سرویس آرکا"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">شماره تماس</label>
                    <input
                      name="phone"
                      value={formData.phone || ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-left"
                      placeholder="021-88776655"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">آدرس</label>
                    <input
                      name="address"
                      value={formData.address || ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300"
                      placeholder="آدرس رستوران جهت درج در فیش"
                    />
                  </div>
                </div>

                {/* Self-Service (Mode 2) Default Pricing & Mode Lock Settings */}
                <div className="border-t border-slate-200 pt-4 space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <h3 className="text-xs md:text-sm font-extrabold text-teal-800 flex items-center gap-2">
                      <Users size={17} />
                      <span>تعیین حالت پیش‌فرض و قفل صندوق فروش روی سلف سرویس</span>
                    </h3>
                    <div className="bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg text-[11px] font-bold text-teal-800">
                      {(formData.defaultInvoiceMode || 'self_service') === 'self_service'
                        ? '🛡️ پیش‌فرض: سلف سرویس'
                        : '🛒 پیش‌فرض: منوی عادی'}
                    </div>
                  </div>

                  {/* Mode Selector & Lock Checkbox */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div>
                      <label className="block font-bold text-slate-800 mb-1.5">
                        حالت عملکرد اصلی صندوق فروش:
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              defaultInvoiceMode: 'self_service',
                            })
                          }
                          className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                            (formData.defaultInvoiceMode || 'self_service') === 'self_service'
                              ? 'bg-teal-600 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-200'
                          }`}
                        >
                          <Users size={14} />
                          <span>۱. سلف سرویس (پیش‌فرض)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              defaultInvoiceMode: 'standard',
                            })
                          }
                          className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                            formData.defaultInvoiceMode === 'standard'
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-200'
                          }`}
                        >
                          <Store size={14} />
                          <span>۲. منوی عادی</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center">
                      <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 p-2 bg-white rounded-lg border border-slate-200 w-full">
                        <input
                          type="checkbox"
                          checked={formData.lockSelfServiceMode ?? true}
                          onChange={(e) =>
                            setFormData({ ...formData, lockSelfServiceMode: e.target.checked })
                          }
                          className="w-4 h-4 accent-teal-600"
                        />
                        <div className="flex flex-col">
                          <span className="text-teal-900 font-extrabold">
                            🔒 قفل کردن صندوق بر روی حالت سلف سرویس
                          </span>
                          <span className="text-[10px] text-slate-500 font-normal">
                            جلوگیری از تغییر حالت صندوق به فاکتور عادی توسط صندوق‌دار
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        قیمت پیش‌فرض سلف سرویس + نوشابه به ازای هر نفر ({currencyLabel})
                      </label>
                      <FormattedNumberInput
                        value={formData.selfServicePricePerPerson ?? 0}
                        onValueChange={(val) =>
                          setFormData({ ...formData, selfServicePricePerPerson: val })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-left"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        عنوان چاپی روی فیش سلف سرویس
                      </label>
                      <input
                        type="text"
                        name="selfServiceTitle"
                        value={formData.selfServiceTitle || ''}
                        onChange={handleChange}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300"
                        placeholder="مثال: ورودی بار سلف سرویس + نوشابه"
                      />
                    </div>
                  </div>

                  {/* Default Beverage Unit Prices */}
                  <div className="border-t border-slate-100 pt-3">
                    <label className="block text-xs font-extrabold text-slate-900 mb-2">
                      🥤 تنظیم قیمت پیش‌فرض انواع نوشیدنی‌های اضافه ({currencyLabel}):
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          🥤 نوشابه قوطی اضافه:
                        </label>
                        <FormattedNumberInput
                          value={
                            formData.defaultSodaPrice ??
                            (formData.currencyUnit === 'rial' ? 150000 : 15000)
                          }
                          onValueChange={(val) =>
                            setFormData({ ...formData, defaultSodaPrice: val })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-left bg-white"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          🥛 دوغ بطری/لیوانی:
                        </label>
                        <FormattedNumberInput
                          value={
                            formData.defaultDoughPrice ??
                            (formData.currencyUnit === 'rial' ? 150000 : 15000)
                          }
                          onValueChange={(val) =>
                            setFormData({ ...formData, defaultDoughPrice: val })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-left bg-white"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          💧 آب معدنی:
                        </label>
                        <FormattedNumberInput
                          value={
                            formData.defaultWaterPrice ??
                            (formData.currencyUnit === 'rial' ? 100000 : 10000)
                          }
                          onValueChange={(val) =>
                            setFormData({ ...formData, defaultWaterPrice: val })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-left bg-white"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          🍺 دلستر / ماءالشعیر:
                        </label>
                        <FormattedNumberInput
                          value={
                            formData.defaultDelsterPrice ??
                            (formData.currencyUnit === 'rial' ? 200000 : 20000)
                          }
                          onValueChange={(val) =>
                            setFormData({ ...formData, defaultDelsterPrice: val })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-left bg-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tax & Customer Phone toggles */}
                <div className="border-t border-slate-200 pt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={formData.taxEnabled || false}
                        onChange={(e) =>
                          setFormData({ ...formData, taxEnabled: e.target.checked })
                        }
                        className="w-4 h-4 accent-blue-600"
                      />
                      <span>اعمال مالیات پیش‌فرض روی فاکتور</span>
                    </label>
                    <div className="flex items-center gap-1">
                      <FormattedNumberInput
                        value={formData.taxPercentage ?? 9}
                        onValueChange={(val) =>
                          setFormData({ ...formData, taxPercentage: val })
                        }
                        className="w-14 px-2 py-1 border border-slate-300 rounded-lg font-mono text-center bg-white"
                      />
                      <span>%</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={formData.requireCustomerPhone || false}
                        onChange={(e) =>
                          setFormData({ ...formData, requireCustomerPhone: e.target.checked })
                        }
                        className="w-4 h-4 accent-blue-600"
                      />
                      <span>اجباری بودن شماره موبایل مشتری</span>
                    </label>
                  </div>
                </div>

                {/* Kitchen Privacy: Hide COGS from Chef */}
                <div className="border-t border-slate-200 pt-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-amber-50/80 rounded-xl border border-amber-200">
                    <div className="flex items-start gap-2.5">
                      <EyeOff size={18} className="text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <label className="cursor-pointer font-extrabold text-amber-950 text-xs block">
                          مخفی‌سازی بهای تمام شده غذاها برای آشپز و پرسنل پخت
                        </label>
                        <span className="text-[11px] text-amber-800 leading-relaxed block mt-0.5">
                          با فعال بودن این گزینه، ارقام ریالی، مبالغ خرید مواد اولیه، دستمزد، سربار و بهای تمام شده در بخش آشپزخانه و پخت برای آشپز مخفی می‌گردد و سرآشپز فقط مقادیر مصرف مواد (کیلوگرم/گرم) و تعداد پرس را مشاهده می‌کند.
                        </span>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={formData.hideCostPriceFromKitchen || false}
                        onChange={(e) =>
                          setFormData({ ...formData, hideCostPriceFromKitchen: e.target.checked })
                        }
                        className="w-5 h-5 accent-amber-600 rounded cursor-pointer"
                      />
                    </label>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-xs transition cursor-pointer"
                  >
                    <Save size={16} />
                    <span>{isSaving ? 'در حال ذخیره...' : 'ذخیره تنظیمات'}</span>
                  </button>
                </div>
              </div>

              {/* 100% Factory Raw Reset Card */}
              <div className="bg-rose-50/70 rounded-2xl border-2 border-rose-200 p-4 md:p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-rose-900 flex items-center gap-2">
                      <RotateCcw size={18} className="text-rose-600" />
                      <span>خام‌سازی ۱۰۰٪ نرم‌افزار (حذف تمام اطلاعات پیش‌فرض و شروع از صفر)</span>
                    </h3>
                    <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                      با زدن این گزینه، تمامی فاکتورها، منوهای نمونه، مواد اولیه انبار، حساب‌های بانکی، چک‌ها، اشخاص و اسناد حسابداری به صورت کامل پاک شده و نرم‌افزار ۱۰۰٪ خام تحویل شما می‌شود (اطلاعات نمونه دیگر در رفرش‌های بعدی برنمی‌گردد).
                    </p>
                  </div>

                  {!confirmRawReset ? (
                    <button
                      type="button"
                      onClick={() => setConfirmRawReset(true)}
                      className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-extrabold text-xs flex items-center gap-1.5 shrink-0 shadow-xs transition cursor-pointer"
                    >
                      <RotateCcw size={15} />
                      <span>خام کردن ۱۰۰٪ کل نرم‌افزار</span>
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 shrink-0 bg-white p-2 rounded-xl border border-rose-300">
                      <span className="text-xs font-extrabold text-rose-800 px-1">
                        آیا از صفر کردن کل اطلاعات مطمئن هستید؟
                      </span>
                      <button
                        type="button"
                        onClick={handleFactoryRawReset}
                        disabled={isResettingRaw}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-extrabold cursor-pointer"
                      >
                        {isResettingRaw ? 'در حال خام‌سازی...' : 'بله، ۱۰۰٪ خام شود'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRawReset(false)}
                        className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold cursor-pointer"
                      >
                        انصراف
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: USERS & ROLE-BASED ACCESS CONTROL */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              {/* Require Login on Start Toggle */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <Lock size={18} className="text-teal-600" />
                    <span>تنظیمات امنیتی ورود کاربران و سطح‌بندی دسترسی‌ها</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    می‌توانید برای هر کارمند (صندوق‌دار، سرآشپز، حسابدار و...) حساب کاربری جداگانه تعریف کنید و مشخص نمایید دقیقاً به کدام بخش‌ها دسترسی داشته باشد.
                  </p>
                </div>

                <label className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-teal-50 border border-teal-200 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={formData.requireLoginOnStart || false}
                    onChange={async (e) => {
                      const checked = e.target.checked;
                      setFormData({ ...formData, requireLoginOnStart: checked });
                      if (settings?.id) {
                        await db.settings.update(settings.id, { requireLoginOnStart: checked });
                      }
                      showNotice(
                        'success',
                        checked
                          ? 'قفل ورود در ابتدای باز شدن برنامه فعال شد.'
                          : 'قفل ورود ابتدای برنامه غیرفعال شد (امکان تغییر کاربر از منوی کناری فعال است).'
                      );
                    }}
                    className="w-4 h-4 accent-teal-600"
                  />
                  <span className="text-xs font-extrabold text-teal-900">
                    الزام رمز عبور در ابتدای باز شدن نرم‌افزار
                  </span>
                </label>
              </div>

              {/* Add / Edit User Form */}
              <form
                onSubmit={handleSaveUser}
                className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <UserPlus size={18} className="text-blue-600" />
                    <span>
                      {editingUserId !== null ? 'ویرایش کاربر و سطح دسترسی' : 'تعریف کاربر جدید و تعیین سطح دسترسی'}
                    </span>
                  </h3>

                  {/* Quick Role Presets */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-500">قالب آماده نقش:</span>
                    {ROLE_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => handleApplyRolePreset(preset)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                          userForm.roleLabel === preset.label
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      نام و نام خانوادگی کاربر
                    </label>
                    <input
                      type="text"
                      value={userForm.fullName}
                      onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
                      placeholder="مثال: علی محمدی"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      نام کاربری (جهت ورود)
                    </label>
                    <input
                      type="text"
                      value={userForm.username}
                      onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                      placeholder="مثال: cashier1"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-left"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      رمز عبور / کد پین (PIN)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={userForm.pin}
                        onChange={(e) => setUserForm({ ...userForm, pin: e.target.value })}
                        placeholder="مثال: 1234"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-left"
                        dir="ltr"
                      />
                      <KeyRound
                        size={14}
                        className="absolute right-3 top-2.5 text-slate-400 pointer-events-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">عنوان سمت / نقش</label>
                    <input
                      type="text"
                      value={userForm.roleLabel}
                      onChange={(e) => setUserForm({ ...userForm, roleLabel: e.target.value })}
                      placeholder="مثال: صندوق‌دار شیفت صبح"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                    />
                  </div>
                </div>

                {/* Granular Permission Checkboxes */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-extrabold text-slate-800">
                      انتخاب دقیق بخش‌های مجاز برای این کاربر:
                    </label>
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() =>
                          setUserForm({
                            ...userForm,
                            isAdmin: true,
                            permissions: [...ALL_PERMISSIONS],
                          })
                        }
                        className="text-teal-700 font-bold hover:underline cursor-pointer"
                      >
                        انتخاب همه بخش‌ها
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() =>
                          setUserForm({
                            ...userForm,
                            isAdmin: false,
                            permissions: ['pos'],
                          })
                        }
                        className="text-slate-600 font-bold hover:underline cursor-pointer"
                      >
                        فقط صندوق فروش
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {PERMISSION_DEFINITIONS.map((perm) => {
                      const isChecked =
                        userForm.isAdmin || userForm.permissions.includes(perm.key);
                      return (
                        <label
                          key={perm.key}
                          onClick={() => handleTogglePermission(perm.key)}
                          className={`p-3 rounded-xl border text-xs cursor-pointer transition flex items-start gap-2.5 select-none ${
                            isChecked
                              ? 'bg-teal-50/70 border-teal-500 text-teal-950'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-md mt-0.5 flex items-center justify-center shrink-0 border ${
                              isChecked
                                ? 'bg-teal-600 border-teal-600 text-white'
                                : 'bg-white border-slate-300'
                            }`}
                          >
                            {isChecked && <Check size={12} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-extrabold flex items-center gap-1.5">
                              <span>{perm.title}</span>
                              {perm.category === 'action' && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold">
                                  عملیاتی
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                              {perm.description}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  {editingUserId !== null && (
                    <button
                      type="button"
                      onClick={resetUserForm}
                      className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
                    >
                      انصراف از ویرایش
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                  >
                    <Save size={15} />
                    <span>
                      {editingUserId !== null ? 'ذخیره تغییرات کاربر' : 'افزودن کاربر جدید'}
                    </span>
                  </button>
                </div>
              </form>

              {/* Users List Table / Cards */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 space-y-3">
                <h3 className="text-sm font-extrabold text-slate-900">
                  لیست کاربران سیستم ({appUsers.length} کاربر)
                </h3>

                <div className="space-y-2.5">
                  {appUsers.map((u) => (
                    <div
                      key={u.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-extrabold text-slate-900">
                            {u.fullName}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[11px] font-bold">
                            {u.roleLabel}
                          </span>
                          <span
                            className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 text-[11px] font-mono"
                            dir="ltr"
                          >
                            @{u.username} | PIN: {u.pin}
                          </span>
                          {u.isAdmin && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                              دسترسی کامل (مدیر کل)
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1 pt-1">
                          {PERMISSION_DEFINITIONS.filter(
                            (p) => u.isAdmin || (u.permissions || []).includes(p.key)
                          ).map((p) => (
                            <span
                              key={p.key}
                              className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-bold text-slate-700"
                            >
                              ✓ {p.title}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleEditUser(u)}
                          className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 size={13} />
                          <span>ویرایش دسترسی</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u)}
                          className="px-2.5 py-1.5 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 size={13} />
                          <span>حذف</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BALE & TELEGRAM BOT BACKUP & PRE-UPDATE SYNC */}
          {activeTab === 'backup' && (
            <div className="space-y-4">
              {/* Hourly + Pre-Update Auto-Backup via Bale & Telegram Bots */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-200">
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                      <Bot className="text-indigo-600" size={19} />
                      <span>ارسال اتوماتیک بکاپ به بات بله (Bale) و تلگرام (ساعتی و قبل از آپدیت)</span>
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      در صورت تنظیم بودن توکن بات بله یا تلگرام، هم در بازه زمانی انتخابی و هم به صورت اتوماتیک قبل از هر بار آپدیت سرور (`install.sh`)، فایل بکاپ به بله و تلگرام ارسال می‌شود.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.autoBackupEnabled || false}
                        onChange={(e) =>
                          setFormData({ ...formData, autoBackupEnabled: e.target.checked })
                        }
                        className="w-4 h-4 accent-indigo-600"
                      />
                      <span className="text-xs font-extrabold text-indigo-900">
                        بکاپ خودکار ساعتی
                      </span>
                    </label>

                    <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.autoBackupBeforeUpdate ?? true}
                        onChange={(e) =>
                          setFormData({ ...formData, autoBackupBeforeUpdate: e.target.checked })
                        }
                        className="w-4 h-4 accent-emerald-600"
                      />
                      <span className="text-xs font-extrabold text-emerald-900">
                        ارسال خودکار بکاپ قبل از آپدیت
                      </span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* Bale Bot Config */}
                  <div className="p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-200 space-y-2.5">
                    <div className="font-extrabold text-emerald-900 text-xs flex items-center gap-1.5">
                      <span>🟢 تنظیمات ربات پیام‌رسان بله (Bale Bot)</span>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        توکن بات بله (Bot Token)
                      </label>
                      <input
                        type="text"
                        name="baleBotToken"
                        placeholder="مثال: 192837465:AAH..."
                        value={formData.baleBotToken || ''}
                        onChange={handleChange}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-left"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        شناسه چت یا کانال بله (Chat ID)
                      </label>
                      <input
                        type="text"
                        name="baleChatId"
                        placeholder="مثال: 123456789 یا @channel"
                        value={formData.baleChatId || ''}
                        onChange={handleChange}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-left"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  {/* Telegram Bot Config */}
                  <div className="p-3.5 rounded-xl bg-sky-50/50 border border-sky-200 space-y-2.5">
                    <div className="font-extrabold text-sky-900 text-xs flex items-center gap-1.5">
                      <span>🔵 تنظیمات ربات تلگرام (Telegram Bot)</span>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        توکن بات تلگرام (Bot Token)
                      </label>
                      <input
                        type="text"
                        name="telegramBotToken"
                        placeholder="مثال: 712345678:AAF..."
                        value={formData.telegramBotToken || ''}
                        onChange={handleChange}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-left"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        شناسه چت یا ادمین تلگرام (Chat ID)
                      </label>
                      <input
                        type="text"
                        name="telegramChatId"
                        placeholder="مثال: 987654321"
                        value={formData.telegramChatId || ''}
                        onChange={handleChange}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-left"
                        dir="ltr"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-2">
                    <Clock size={15} className="text-slate-500" />
                    <span className="font-bold text-slate-700">فاصله زمانی ارسال خودکار:</span>
                    <select
                      name="autoBackupIntervalHours"
                      value={formData.autoBackupIntervalHours || 1}
                      onChange={handleChange}
                      className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-bold"
                    >
                      <option value={1}>هر ۱ ساعت یک‌بار (پیشنهادی)</option>
                      <option value={2}>هر ۲ ساعت یک‌بار</option>
                      <option value={4}>هر ۴ ساعت یک‌بار</option>
                      <option value={12}>هر ۱۲ ساعت یک‌بار</option>
                      <option value={24}>روزانه (هر ۲۴ ساعت)</option>
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleTestAndSendBotBackup('تست و ارسال فوری بکاپ (همگام با آپدیت سرور)')}
                      disabled={isSendingBot}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Send size={14} />
                      <span>
                        {isSendingBot ? 'در حال ارسال...' : 'تست و ارسال فوری بکاپ به بله و تلگرام'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Save size={14} />
                      <span>ذخیره و سینک با سرور</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Database Storage Optimization & Lightweight Management */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <HardDrive size={18} className="text-teal-600" />
                    <span>بهینه‌سازی، فشرده‌سازی و سبک‌سازی دیتابیس</span>
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    فشرده‌سازی تصاویر سنگین غذاها، پاکسازی لوگ‌ها و کدهای نامعتبر برای کاهش حجم حافظه و افزایش سرعت نرم‌افزار
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleOptimizeDatabase}
                  disabled={isOptimizing}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <Sparkles size={15} className={isOptimizing ? 'animate-spin' : ''} />
                  <span>{isOptimizing ? 'در حال سبک‌سازی...' : 'شروع بهینه‌سازی و سبک‌سازی دیتابیس'}</span>
                </button>
              </div>

              {/* Local File Backup & Restore */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">
                    پشتیبان‌گیری و بازیابی فایل روی دستگاه
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    دانلود مستقیم کل دیتابیس (فروش، آشپزخانه، انبار، کاربران و حسابداری) یا بازگردانی از فایل JSON
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleExport}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download size={15} />
                    <span>دانلود فایل پشتیبان (Export)</span>
                  </button>

                  <input
                    type="file"
                    accept=".json"
                    ref={fileInputRef}
                    onChange={handleImport}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload size={15} />
                    <span>بازیابی اطلاعات (Import)</span>
                  </button>
                </div>
              </div>

              {/* 100% Factory Raw Reset in Backup Tab as well */}
              <div className="bg-rose-50/70 rounded-2xl border-2 border-rose-200 p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-extrabold text-rose-900 flex items-center gap-2">
                    <RotateCcw size={17} className="text-rose-600" />
                    <span>خام‌سازی ۱۰۰٪ کل نرم‌افزار (حذف تمام داده‌های نمونه و شروع از صفر)</span>
                  </h2>
                  <p className="text-[11px] text-rose-700 mt-0.5">
                    در صورت تنظیم بودن بات بله یا تلگرام، قبل از خام‌سازی یک نسخه بکاپ به بات ارسال شده و سپس تمام جداول فروش، منو، انبار، بانک، چک و اسناد حسابداری ۱۰۰٪ خام می‌شوند.
                  </p>
                </div>

                {!confirmRawReset ? (
                  <button
                    type="button"
                    onClick={() => setConfirmRawReset(true)}
                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-extrabold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <RotateCcw size={15} />
                    <span>خام کردن ۱۰۰٪ نرم‌افزار</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 shrink-0 bg-white p-2 rounded-xl border border-rose-300">
                    <button
                      type="button"
                      onClick={handleFactoryRawReset}
                      disabled={isResettingRaw}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-extrabold cursor-pointer"
                    >
                      {isResettingRaw ? 'در حال خام‌سازی...' : 'تأیید خام‌سازی ۱۰۰٪'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRawReset(false)}
                      className="px-3 py-1.5 bg-slate-200 text-slate-800 rounded-lg text-xs font-bold cursor-pointer"
                    >
                      انصراف
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
