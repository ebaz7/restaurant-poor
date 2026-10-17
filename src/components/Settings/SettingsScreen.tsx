import React, { useState, useEffect, useRef } from 'react';
import { db, AppSettings } from '../../lib/db';
import {
  exportDB,
  importDB,
  sendBackupToMessengers,
  setGlobalCurrencyUnit,
  getCurrencyLabel,
} from '../../lib/utils';
import FormattedNumberInput from '../Common/FormattedNumberInput';
import { PWAInstallButton } from '../Common/PWAInstallModal';
import {
  Save,
  Download,
  Upload,
  Send,
  Bot,
  CheckCircle2,
  AlertCircle,
  Clock,
  Users,
  Coins,
  Smartphone,
  Store,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';

export default function SettingsScreen() {
  const settings = useLiveQuery(() => db.settings.toCollection().first());

  const [activeTab, setActiveTab] = useState<'general' | 'backup'>('general');
  const [formData, setFormData] = useState<Partial<AppSettings>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingBot, setIsSendingBot] = useState(false);
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
    setTimeout(() => setStatusMessage(null), 5000);
  };

  const handleCurrencyChange = async (unit: 'toman' | 'rial') => {
    setGlobalCurrencyUnit(unit);
    const next = { ...formData, currencyUnit: unit };
    setFormData(next);
    if (settings?.id) {
      await db.settings.update(settings.id, { currencyUnit: unit });
    }
    showNotice(
      'success',
      `واحد پول کل سامانه به «${unit === 'rial' ? 'ریال' : 'تومان'}» تغییر یافت و تمام اعداد ۳ رقم ۳ رقم نمایش داده می‌شوند.`
    );
  };

  const handleSave = async () => {
    if (!settings?.id) return;
    setIsSaving(true);
    if (formData.currencyUnit) {
      setGlobalCurrencyUnit(formData.currencyUnit);
    }
    await db.settings.update(settings.id, formData);
    setIsSaving(false);
    showNotice('success', 'تنظیمات فروشگاه، واحد پول، سلف سرویس و ربات بکاپ با موفقیت ذخیره شد.');
  };

  const handleTestAndSendBotBackup = async () => {
    if (!settings?.id) return;
    await db.settings.update(settings.id, formData);
    setIsSendingBot(true);
    const res = await sendBackupToMessengers(formData, 'تست و ارسال دستی از تنظیمات');
    setIsSendingBot(false);
    showNotice(res.success ? 'success' : 'error', res.messages.join(' | '));
  };

  const handleExport = async () => {
    const json = await exportDB();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_arka_pos_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotice('success', 'فایل پشتیبان کامل (شامل منو، فاکتورها، آشپزخانه و حسابداری) دانلود شد.');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const jsonString = event.target?.result as string;
        await importDB(jsonString);
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

  const currencyLabel = getCurrencyLabel(formData.currencyUnit || 'toman');

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Compact Header + Tab Switcher */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-3 shrink-0">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-base md:text-xl font-extrabold text-slate-900">
              تنظیمات کسب‌وکار، واحد پول (ریال/تومان)، سلف سرویس و بکاپ خودکار
            </h1>
            <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
              تعیین واحد پول، تعرفه سلف سرویس، نصب وب‌اپلیکیشن (PWA) و اتصال ربات بله و تلگرام
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                activeTab === 'general'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              <Store size={14} />
              <span>۱. واحد پول، سلف و فروشگاه</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('backup')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                activeTab === 'backup'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              <Bot size={14} />
              <span>۲. بات بله/تلگرام و بکاپ</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 md:p-6">
        <div className="max-w-4xl mx-auto space-y-4">
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
                      className={`py-2 rounded-lg text-xs font-extrabold transition ${
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
                      className={`py-2 rounded-lg text-xs font-extrabold transition ${
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
                          className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
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
                          className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
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
                        value={formData.selfServicePricePerPerson ?? 220000}
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
                        value={formData.selfServiceTitle || 'ورودی بار سلف سرویس + نوشابه'}
                        onChange={handleChange}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300"
                      />
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
            </div>
          )}

          {activeTab === 'backup' && (
            <div className="space-y-4">
              {/* Hourly Auto-Backup via Bale & Telegram Bots */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-200">
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                      <Bot className="text-indigo-600" size={19} />
                      <span>ارسال اتوماتیک بکاپ ساعتی به بات بله (Bale) و تلگرام (Telegram)</span>
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      با فعال‌سازی این بخش، فایل پشتیبان کامل حسابداری و فروش در بازه زمانی انتخابی به بات بله و تلگرام ارسال می‌شود.
                    </p>
                  </div>

                  <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={formData.autoBackupEnabled || false}
                      onChange={(e) =>
                        setFormData({ ...formData, autoBackupEnabled: e.target.checked })
                      }
                      className="w-4 h-4 accent-indigo-600"
                    />
                    <span className="text-xs font-extrabold text-indigo-900">
                      فعال‌سازی بکاپ خودکار ساعتی
                    </span>
                  </label>
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

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleTestAndSendBotBackup}
                      disabled={isSendingBot}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Send size={14} />
                      <span>
                        {isSendingBot ? 'در حال ارسال...' : 'تست و ارسال فوری بکاپ به بات‌ها'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Save size={14} />
                      <span>ذخیره</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Local File Backup & Restore */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">
                    پشتیبان‌گیری و بازیابی فایل روی دستگاه
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    دانلود مستقیم کل دیتابیس (فروش، آشپزخانه، انبار و حسابداری) یا بازگردانی از فایل JSON
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
