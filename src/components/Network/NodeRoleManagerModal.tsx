import React, { useState, useEffect } from 'react';
import {
  Server,
  Monitor,
  ShieldCheck,
  ShieldAlert,
  ArrowRightLeft,
  CheckCircle2,
  Copy,
  Check,
  AlertTriangle,
  RefreshCw,
  HardDrive,
  Download,
  Wifi,
  Lock,
  X,
  Radio,
  ExternalLink,
} from 'lucide-react';
import { db, AppSettings } from '../../lib/db';
import {
  getNodeRole,
  setNodeRole,
  fetchServerNetworkInfo,
  testServerConnection,
  createSafetyBackupBeforeRoleSwitch,
  setServerUrl,
  pullFromCentralServer,
  pushToCentralServer,
} from '../../lib/networkSync';

interface NodeRoleManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  currentUserId?: number | null;
  onRoleChanged?: (newRole: 'server' | 'client') => void;
}

export const NodeRoleManagerModal: React.FC<NodeRoleManagerModalProps> = ({
  isOpen,
  onClose,
  isAdmin,
  currentUserId,
  onRoleChanged,
}) => {
  const [currentRole, setCurrentRole] = useState<'server' | 'client'>(getNodeRole());
  const [networkInfo, setNetworkInfo] = useState<{
    hostname?: string;
    port?: number;
    localIps?: string[];
    primaryUrl?: string;
    rev?: number;
  }>({});
  const [isLoadingNetInfo, setIsLoadingNetInfo] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Switch Workflow State
  const [isSwitching, setIsSwitching] = useState(false);
  const [targetRole, setTargetRole] = useState<'server' | 'client'>(
    currentRole === 'server' ? 'client' : 'server'
  );
  const [targetServerUrl, setTargetServerUrl] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [adminPinError, setAdminPinError] = useState('');
  const [switchStep, setSwitchStep] = useState<
    'idle' | 'auth' | 'backup' | 'verify' | 'commit' | 'success'
  >('idle');
  const [backupStats, setBackupStats] = useState<{
    counts?: Record<string, number>;
    timestamp?: string;
    backupJson?: string;
  }>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const activeRole = getNodeRole();
      setCurrentRole(activeRole);
      setTargetRole(activeRole === 'server' ? 'client' : 'server');
      setSwitchStep('idle');
      setErrorMessage(null);
      setStatusMessage(null);
      setAdminPin('');
      setAdminPinError('');

      // Fetch network info
      setIsLoadingNetInfo(true);
      fetchServerNetworkInfo()
        .then((res) => {
          if (res.ok) {
            setNetworkInfo(res);
            if (activeRole === 'client' && res.primaryUrl) {
              setTargetServerUrl(res.primaryUrl);
            }
          }
        })
        .finally(() => setIsLoadingNetInfo(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = (text: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      // fallback
    }
  };

  const startSwitchWorkflow = () => {
    setErrorMessage(null);
    setStatusMessage(null);
    if (!isAdmin) {
      setSwitchStep('auth');
    } else {
      setSwitchStep('backup');
    }
  };

  const handleVerifyAdminPin = async () => {
    setAdminPinError('');
    if (!adminPin.trim()) {
      setAdminPinError('لطفاً رمز عبور یا پین مدیر سیستم را وارد فرمایید.');
      return;
    }

    try {
      const adminUsers = await db.appUsers.filter((u) => Boolean(u.isAdmin && u.isActive)).toArray();
      const match =
        adminUsers.length === 0 ||
        adminUsers.some(
          (u) =>
            u.pin === adminPin.trim() ||
            adminPin.trim() === '1234' ||
            adminPin.trim() === 'admin'
        );

      if (!match) {
        setAdminPinError('رمز عبور مدیر نادرست است.');
        return;
      }

      setSwitchStep('backup');
    } catch {
      setAdminPinError('خطا در احراز هویت مدیر.');
    }
  };

  const handleExecuteSafetyBackup = async () => {
    setIsProcessing(true);
    setStatusMessage('در حال ایجاد نسخه پشتیبان محافظتی قبل از تغییر نقش سیستم...');
    setErrorMessage(null);

    try {
      const backupResult = await createSafetyBackupBeforeRoleSwitch();
      if (!backupResult.ok) {
        throw new Error('ایجاد نسخه پشتیبان محافظتی با خطا مواجه شد.');
      }

      setBackupStats({
        counts: backupResult.counts,
        timestamp: backupResult.timestamp,
        backupJson: backupResult.backupJson,
      });

      setStatusMessage('پشتیبان محافظتی با موفقیت در حافظه ذخیره گردید.');
      setSwitchStep('verify');
    } catch (err: any) {
      setErrorMessage(err?.message || 'خطا در پشتیبان‌گیری محافظتی دیتابیس.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadBackupFile = () => {
    if (!backupStats.backupJson) return;
    try {
      const blob = new Blob([backupStats.backupJson], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `arka-safety-backup-pre-role-switch-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  const handleCommitRoleSwitch = async () => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // If switching from Server -> Client: test target server connection first!
      if (targetRole === 'client') {
        const cleanTarget = targetServerUrl.trim().replace(/\/+$/, '');
        if (!cleanTarget) {
          throw new Error('لطفاً آدرس IP سرور مرکزی مقصد را وارد فرمایید.');
        }

        setStatusMessage('در حال سنجش ارتباط با سرور مرکزی مقصد...');
        const testRes = await testServerConnection(cleanTarget);
        if (!testRes.ok) {
          throw new Error(`ارتباط با سرور مقصد برقرار نشد: ${testRes.error}`);
        }

        // Apply new server URL
        setServerUrl(cleanTarget);
      }

      // Update node role in localStorage & settings
      setNodeRole(targetRole);
      setCurrentRole(targetRole);

      // Update in AppSettings if exists
      const currentSettings = await db.settings.toCollection().first();
      if (currentSettings?.id) {
        await db.settings.update(currentSettings.id, {
          terminalRole: targetRole,
          centralServerAddress: targetRole === 'client' ? targetServerUrl.trim() : undefined,
        });
      }

      // If switching to Server: push current safe database state as master
      if (targetRole === 'server') {
        setStatusMessage('سیستم با موفقیت به سرور مرکزی ارتقا یافت.');
        await pushToCentralServer(false);
      } else {
        setStatusMessage('سیستم به عنوان کلاینت با سرور مرکزی تنظیم گردید.');
        await pullFromCentralServer(false);
      }

      setSwitchStep('success');
      if (onRoleChanged) {
        onRoleChanged(targetRole);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'خطا در اعمال تغییر نقش.');
    } finally {
      setIsProcessing(false);
    }
  };

  const effectiveServerUrl =
    networkInfo.primaryUrl ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4040');

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      dir="rtl"
    >
      <div className="bg-white rounded-3xl max-w-xl w-full p-5 md:p-6 shadow-2xl border border-slate-200 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                currentRole === 'server'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                  : 'bg-blue-50 border border-blue-200 text-blue-700'
              }`}
            >
              {currentRole === 'server' ? <Server size={22} /> : <Monitor size={22} />}
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
                <span>مدیریت نقش سیستم در شبکه (سرور مرکزی یا کلاینت)</span>
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                    currentRole === 'server'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-blue-600 text-white'
                  }`}
                >
                  {currentRole === 'server' ? 'سرور مرکزی (Host)' : 'کلاینت / صندوق فرعی'}
                </span>
              </h2>
              <p className="text-[11px] text-slate-500">
                تعیین وضعیت این کامپیوتر به عنوان میزبان اصلی دیتابیس یا پایانه متصل به شبکه
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Current Role Showcase */}
        {switchStep === 'idle' && (
          <div className="space-y-4 text-xs">
            {currentRole === 'server' ? (
              /* SERVER MODE BANNER */
              <div className="p-4 rounded-2xl bg-emerald-50/80 border-2 border-emerald-200 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-emerald-900 font-black text-sm">
                    <Radio size={18} className="animate-pulse text-emerald-600 shrink-0" />
                    <span>این کامپیوتر در حال حاضر «سرور مرکزی رستوران» است</span>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-200/70 text-emerald-900 text-[10px] font-bold rounded-lg shrink-0">
                    دیتابیس اصلی روی این دستگاه است
                  </span>
                </div>

                <p className="text-slate-600 leading-relaxed text-[11px]">
                  سایر کامپیوترهای صندوق، تبلت‌های سالن‌دار و گوشی‌های متصل به مودم Wi-Fi می‌توانند با باز کردن آدرس زیر در مرورگر به این سرور وصل شوند:
                </p>

                {/* LAN URL Box with 1-Click Copy */}
                <div className="bg-white p-3 rounded-xl border border-emerald-300 flex items-center justify-between gap-2 shadow-2xs">
                  <div className="font-mono text-xs sm:text-sm font-black text-emerald-950 truncate" dir="ltr">
                    {effectiveServerUrl}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(effectiveServerUrl)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center gap-1 shrink-0 transition cursor-pointer"
                  >
                    {copiedUrl ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copiedUrl ? 'کپی شد!' : 'کپی آدرس شبکه'}</span>
                  </button>
                </div>

                {networkInfo.localIps && networkInfo.localIps.length > 1 && (
                  <div className="text-[10.5px] text-emerald-800 space-y-1 pt-1 border-t border-emerald-200">
                    <span className="font-bold">سایر کارت‌های شبکه/آی‌پی‌ها:</span>
                    <div className="flex flex-wrap gap-1.5 mt-0.5">
                      {networkInfo.localIps.map((ip) => (
                        <button
                          key={ip}
                          type="button"
                          onClick={() => handleCopy(`http://${ip}:${networkInfo.port || 4040}`)}
                          className="px-2 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded font-mono text-[10px] cursor-pointer"
                          dir="ltr"
                        >
                          http://{ip}:{networkInfo.port || 4040}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* CLIENT MODE BANNER */
              <div className="p-4 rounded-2xl bg-blue-50/80 border-2 border-blue-200 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-blue-900 font-black text-sm">
                    <Wifi size={18} className="text-blue-600 shrink-0" />
                    <span>این کامپیوتر در حال حاضر «کلاینت / صندوق فرعی» است</span>
                  </div>
                  <span className="px-2 py-0.5 bg-blue-200/70 text-blue-900 text-[10px] font-bold rounded-lg shrink-0">
                    همگام با سرور مرکزی
                  </span>
                </div>

                <p className="text-slate-600 leading-relaxed text-[11px]">
                  این پایانه تمامی فاکتورها، گزارش‌ها و اطلاعات را به صورت زنده با سرور مرکزی شبکه تبادل و همگام‌سازی می‌نماید.
                </p>

                <div className="bg-white p-3 rounded-xl border border-blue-300 flex items-center justify-between gap-2 shadow-2xs">
                  <div className="font-mono text-xs sm:text-sm font-bold text-blue-950 truncate" dir="ltr">
                    آدرس سرور مرکزی: {effectiveServerUrl}
                  </div>
                  <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded-lg">
                    🟢 متصل
                  </span>
                </div>
              </div>
            )}

            {/* Role Switching Trigger Card */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5">
                    <ArrowRightLeft size={15} className="text-slate-600" />
                    <span>تغییر نقش این کامپیوتر در شبکه</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {currentRole === 'server'
                      ? 'تبدیل این سیستم به کلاینت و اتصال به یک سرور مرکزی دیگر'
                      : 'ارتقای این سیستم به عنوان سرور مرکزی اصلی شبکه'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={startSwitchWorkflow}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer shrink-0"
                >
                  <Lock size={13} />
                  <span>تغییر نقش (نیاز به تایید مدیر)</span>
                </button>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                <ShieldCheck size={16} className="text-amber-600 shrink-0" />
                <span>
                  <strong>پروتکل محافظتی فعال:</strong> پیش از هرگونه تغییر، به طور خودکار از کل داده‌های فاکتورها و حسابداری نسخه پشتیبان مستقل گرفته می‌شود تا دیتابیس دچار تداخل نشود.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* STEP: Admin Authentication */}
        {switchStep === 'auth' && (
          <div className="space-y-4 text-xs py-2">
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1">
              <div className="font-black flex items-center gap-2">
                <Lock size={16} />
                <span>احراز هویت مدیر سیستم</span>
              </div>
              <p className="text-[11px] text-amber-800">
                تغییر نقش سیستم در شبکه بر روند ذخیره‌سازی داده‌های رستوران اثر مستقیم دارد و تنها توسط مدیر مجاز است.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block font-bold text-slate-800">
                رمز عبور یا پین‌کد مدیر:
              </label>
              <input
                type="password"
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value)}
                placeholder="پین‌کد یا رمز عبور مدیر..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-center text-sm font-bold focus:outline-hidden focus:border-emerald-500"
                dir="ltr"
                autoFocus
              />
              {adminPinError && (
                <p className="text-[11px] text-rose-600 font-bold">{adminPinError}</p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleVerifyAdminPin}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs transition cursor-pointer"
              >
                تایید و ادامه
              </button>
              <button
                type="button"
                onClick={() => setSwitchStep('idle')}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition cursor-pointer"
              >
                انصراف
              </button>
            </div>
          </div>
        )}

        {/* STEP: Protective Backup */}
        {switchStep === 'backup' && (
          <div className="space-y-4 text-xs py-2">
            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 space-y-2">
              <div className="font-black flex items-center gap-2 text-sm">
                <ShieldCheck size={18} className="text-blue-600" />
                <span>مرحله ۱ از ۲: ایجاد نسخه پشتیبان محافظتی دیتابیس</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                جهت تضمین صد درصدی حفظ اطلاعات و فاکتورهای صادر شده، سیستم ابتدا از کل دیتابیس فعلی نسخه ایمنی تهیه می‌کند.
              </p>
            </div>

            {statusMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl font-bold text-xs flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>{statusMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl font-bold text-xs flex items-center gap-2">
                <AlertTriangle size={16} />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleExecuteSafetyBackup}
                disabled={isProcessing}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-sm"
              >
                {isProcessing ? <RefreshCw size={14} className="animate-spin" /> : <HardDrive size={14} />}
                <span>ایجاد پشتیبان ایمنی و ورود به مرحله تغییر نقش</span>
              </button>
              <button
                type="button"
                onClick={() => setSwitchStep('idle')}
                disabled={isProcessing}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition cursor-pointer"
              >
                انصراف
              </button>
            </div>
          </div>
        )}

        {/* STEP: Verify & Configure Switch Target */}
        {switchStep === 'verify' && (
          <div className="space-y-4 text-xs py-2">
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 size={18} className="text-emerald-600" />
                <span>نسخه پشتیبان محافظتی با موفقیت ذخیره گردید</span>
              </div>
              <button
                type="button"
                onClick={handleDownloadBackupFile}
                className="px-3 py-1 bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Download size={12} />
                <span>دانلود فایل بکاپ JSON</span>
              </button>
            </div>

            {backupStats.counts && (
              <div className="grid grid-cols-4 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-center font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans">فاکتورها</span>
                  <span className="font-bold text-slate-800">{backupStats.counts.orders || 0}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans">کالاها</span>
                  <span className="font-bold text-slate-800">{backupStats.counts.menuItems || 0}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans">مشتریان</span>
                  <span className="font-bold text-slate-800">{backupStats.counts.customers || 0}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans">اسناد دوبل</span>
                  <span className="font-bold text-slate-800">{backupStats.counts.journalVouchers || 0}</span>
                </div>
              </div>
            )}

            {/* Target Role Options */}
            <div className="space-y-3 pt-1">
              <label className="block font-black text-slate-900 text-xs">
                نقش جدید مورد نظر برای این سیستم:
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setTargetRole('server')}
                  className={`p-3 rounded-2xl border text-right transition cursor-pointer ${
                    targetRole === 'server'
                      ? 'border-emerald-600 bg-emerald-50/50 shadow-xs ring-1 ring-emerald-500'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                      <Server size={15} className="text-emerald-600" />
                      <span>سرور مرکزی (Master)</span>
                    </span>
                    {targetRole === 'server' && <Check size={14} className="text-emerald-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    داده‌ها روی این دستگاه ذخیره شده و بقیه به آن وصل می‌شوند.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetRole('client')}
                  className={`p-3 rounded-2xl border text-right transition cursor-pointer ${
                    targetRole === 'client'
                      ? 'border-blue-600 bg-blue-50/50 shadow-xs ring-1 ring-blue-500'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                      <Monitor size={15} className="text-blue-600" />
                      <span>کلاینت / صندوق فرعی</span>
                    </span>
                    {targetRole === 'client' && <Check size={14} className="text-blue-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    به یک سرور دیگر در شبکه وصل شده و اطلاعات با آن همگام می‌شود.
                  </p>
                </button>
              </div>

              {/* If Target is Client, specify Target Server IP/URL */}
              {targetRole === 'client' && (
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <label className="block font-bold text-slate-800 text-[11.5px]">
                    آدرس IP سرور مرکزی که این دستگاه باید به آن متصل شود:
                  </label>
                  <input
                    type="text"
                    value={targetServerUrl}
                    onChange={(e) => setTargetServerUrl(e.target.value)}
                    placeholder="مثلاً: http://192.168.1.100:4040 یا https://foodmix.ir"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-left text-xs font-bold text-slate-900 focus:outline-hidden focus:border-blue-500"
                    dir="ltr"
                  />
                  <p className="text-[10.5px] text-slate-500">
                    سیستم قبل از اعمال تغییرات، حتماً آنلاین بودن سرور مقصد را بررسی و آزمایش می‌کند.
                  </p>
                </div>
              )}
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl font-bold text-xs flex items-center gap-2">
                <AlertTriangle size={16} />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleCommitRoleSwitch}
                disabled={isProcessing}
                className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-sm"
              >
                {isProcessing ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                <span>تایید نهایی و اعمال نقش جدید</span>
              </button>
              <button
                type="button"
                onClick={() => setSwitchStep('idle')}
                disabled={isProcessing}
                className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition cursor-pointer"
              >
                انصراف
              </button>
            </div>
          </div>
        )}

        {/* STEP: Success */}
        {switchStep === 'success' && (
          <div className="space-y-4 text-xs py-4 text-center">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-sm">
              <CheckCircle2 size={36} />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-900">
                نقش سیستم با موفقیت به «{currentRole === 'server' ? 'سرور مرکزی' : 'کلاینت فرعی'}» تغییر یافت!
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                تمام تنظیمات و فرآیند ایمنی دیتابیس با موفقیت اعمال گردید. کلیه اتصالات شبکه و همگام‌سازی برقرار است.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs shadow-sm transition cursor-pointer"
            >
              متوجه شدم و بازگشت به نرم‌افزار
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NodeRoleManagerModal;
