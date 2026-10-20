import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, Copy, CheckCircle2, AlertCircle, KeyRound, Key, RefreshCw, Server, Wifi } from 'lucide-react';
import {
  getSystemCode,
  getLicenseStatus,
  activateApplication,
  getCentralServerBaseUrl,
  LicenseInfo,
} from '../../lib/licenseManager';
import { setServerUrl, pullFromCentralServer } from '../../lib/networkSync';

interface LicenseLockModalProps {
  isOpen: boolean;
  onClose?: () => void;
  isMandatory?: boolean; // If true, cannot close modal until valid license entered
  onSuccess?: () => void;
}

export const LicenseLockModal: React.FC<LicenseLockModalProps> = ({
  isOpen,
  onClose,
  isMandatory = false,
  onSuccess,
}) => {
  const [systemCode, setSystemCode] = useState<string>('در حال محاسبه...');
  const [licenseKeyInput, setLicenseKeyInput] = useState<string>('');
  const [licenseStatus, setLicenseStatus] = useState<LicenseInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // For network clients connecting to an already-activated Central Server
  const [centralServerUrlInput, setCentralServerUrlInput] = useState<string>(() => getCentralServerBaseUrl());
  const [isConnectingServer, setIsConnectingServer] = useState<boolean>(false);

  const loadStatus = async () => {
    setIsLoading(true);
    const status = await getLicenseStatus();
    setLicenseStatus(status);
    const sysCode = status.systemCode || (await getSystemCode());
    setSystemCode(sysCode);
    setIsLoading(false);

    if (status.isActivated && onSuccess) {
      onSuccess();
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCentralServerUrlInput(getCentralServerBaseUrl());
      loadStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopySystemCode = () => {
    if (navigator.clipboard && systemCode) {
      navigator.clipboard.writeText(systemCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKeyInput.trim()) {
      setFeedback({ type: 'error', text: 'لطفاً کد فعال‌سازی را وارد نمایید.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    const result = await activateApplication(licenseKeyInput);
    setIsSubmitting(false);

    if (result.success) {
      setFeedback({ type: 'success', text: result.message });
      await loadStatus();
      if (onSuccess) onSuccess();
      if (!isMandatory && onClose) {
        setTimeout(() => onClose(), 1500);
      }
    } else {
      setFeedback({ type: 'error', text: result.message });
    }
  };

  const handleConnectToCentralServer = async () => {
    if (!centralServerUrlInput.trim()) {
      setFeedback({ type: 'error', text: 'لطفاً آدرس IP و پورت سرور مرکزی را وارد کنید (مثلاً 192.168.1.100:8080).' });
      return;
    }

    setIsConnectingServer(true);
    setFeedback(null);

    try {
      let formattedUrl = centralServerUrlInput.trim().replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(formattedUrl)) {
        formattedUrl = `http://${formattedUrl}`;
      }
      if (/^http:\/\/\d+\.\d+\.\d+\.\d+$/i.test(formattedUrl) && window.location.port) {
        formattedUrl = `${formattedUrl}:${window.location.port}`;
      }

      setServerUrl(formattedUrl);
      setCentralServerUrlInput(formattedUrl);

      await pullFromCentralServer(true);
      const status = await getLicenseStatus();
      setLicenseStatus(status);
      if (status.systemCode) {
        setSystemCode(status.systemCode);
      }

      if (status.isActivated) {
        setFeedback({
          type: 'success',
          text: 'اتصال به سرور مرکزی برقرار شد و لایسنس سرور مرکزی به صورت خودکار روی این کلاینت فعال گردید!',
        });
        if (onSuccess) onSuccess();
        if (!isMandatory && onClose) {
          setTimeout(() => onClose(), 1200);
        }
      } else {
        setFeedback({
          type: 'error',
          text: 'اتصال به سرور برقرار شد اما سرور مرکزی هنوز فعال‌سازی نشده است. کد سرور مرکزی در بالا نمایش داده شد؛ با یک بار فعال‌سازی روی سرور، تمام کلاینت‌ها باز می‌شوند.',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        text: 'عدم ارتباط با آدرس سرور وارد شده. از روشن بودن سرور مرکزی و صحت آدرس IP مطمئن شوید.',
      });
    } finally {
      setIsConnectingServer(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
      dir="rtl"
    >
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative space-y-4 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-slate-900 via-teal-900 to-slate-900 border border-teal-500/30 text-teal-400 mx-auto flex items-center justify-center shadow-lg shadow-teal-900/20">
            {licenseStatus?.isActivated ? <ShieldCheck size={32} /> : <Lock size={32} />}
          </div>
          <div>
            <span className="inline-block px-3 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-black mb-1">
              {licenseStatus?.isActivated ? '🟢 لایسنس شبکه و سرور مرکزی فعال' : '🔒 تک‌لایسنس سرور مرکزی و شبکه'}
            </span>
            <h2 className="text-lg font-black text-slate-900">
              {licenseStatus?.isActivated ? 'لایسنس نرم‌افزار فعال است' : 'فعال‌سازی نرم‌افزار رستوران آرکا'}
            </h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              {licenseStatus?.isActivated
                ? 'سرور مرکزی و تمامی کلاینت‌های متصل در شبکه دارای لایسنس دائمی و معتبر می‌باشند.'
                : 'فقط یک بار فعال‌سازی روی سرور مرکزی کافی است؛ سایر کلاینت‌های متصل در شبکه به صورت خودکار فعال می‌شوند.'}
            </p>
          </div>
        </div>

        {/* System Code Display Box */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between text-xs font-extrabold text-slate-700">
            <span>شناسه سخت‌افزاری سرور مرکزی (System Code):</span>
            <span className="text-[10px] text-teal-700 font-bold">
              {licenseStatus?.serverHostname ? `سرور: ${licenseStatus.serverHostname}` : 'یکپارچه در شبکه'}
            </span>
          </div>

          <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-300">
            <span className="flex-1 font-mono font-black text-slate-900 text-sm md:text-base text-center tracking-wider" dir="ltr">
              {systemCode}
            </span>
            <button
              type="button"
              onClick={handleCopySystemCode}
              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer shrink-0"
            >
              {copiedCode ? <CheckCircle2 size={14} /> : <Copy size={14} />}
              <span>{copiedCode ? 'کپی شد!' : 'کپی کد'}</span>
            </button>
          </div>
        </div>

        {/* Feedback Message */}
        {feedback && (
          <div
            className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border border-rose-200 text-rose-800'
            }`}
          >
            {feedback.type === 'success' ? <CheckCircle2 size={16} className="shrink-0" /> : <AlertCircle size={16} className="shrink-0" />}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Input Activation Form */}
        {!licenseStatus?.isActivated ? (
          <div className="space-y-4">
            <form onSubmit={handleActivate} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                  <KeyRound size={15} className="text-teal-600" />
                  <span>کد فعال‌سازی سرور مرکزی (License Key):</span>
                </label>
                <input
                  type="text"
                  value={licenseKeyInput}
                  onChange={(e) => setLicenseKeyInput(e.target.value.toUpperCase())}
                  placeholder="مثلاً: E4C3-9C28-364F-9C8A"
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl font-mono text-center text-sm md:text-base font-black text-slate-900 focus:outline-hidden focus:border-teal-500 tracking-widest uppercase"
                  dir="ltr"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || isLoading}
                className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-md shadow-teal-600/20 transition cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>در حال بررسی و ثبت روی سرور مرکزی...</span>
                  </>
                ) : (
                  <>
                    <Key size={16} />
                    <span>فعال‌سازی سرور مرکزی و کل شبکه</span>
                  </>
                )}
              </button>
            </form>

            {/* Connect as Network Client to already-activated Central Server */}
            <div className="pt-3 border-t border-slate-200 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-700">
                <Server size={14} className="text-blue-600 shrink-0" />
                <span>آیا این دستگاه کلاینت است و سرور مرکزی قبلاً فعال شده؟</span>
              </div>
              <p className="text-[11px] text-slate-500">
                اگر روی سیستم دیگر (سرور مرکزی) فعال‌سازی را انجام داده‌اید، آدرس IP سرور مرکزی را وارد کنید تا بدون نیاز به کد جدید وصل شوید:
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={centralServerUrlInput}
                  onChange={(e) => setCentralServerUrlInput(e.target.value)}
                  placeholder="http://192.168.1.100:8080"
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs font-bold text-slate-800 text-left"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={handleConnectToCentralServer}
                  disabled={isConnectingServer}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {isConnectingServer ? <RefreshCw size={14} className="animate-spin" /> : <Wifi size={14} />}
                  <span>اتصال به سرور</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 text-xs leading-relaxed space-y-1">
              <div className="font-extrabold flex items-center gap-1.5">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span>
                  {licenseStatus.isFromCentralServer
                    ? 'لایسنس از طریق سرور مرکزی برای تمام کلاینت‌های شبکه فعال است.'
                    : 'دستگاه و سرور مرکزی شما به صورت دائمی فعال گردیده است.'}
                </span>
              </div>
              {licenseStatus.activatedAt && (
                <div className="text-[11px] text-emerald-700">
                  تاریخ فعال‌سازی: {new Date(licenseStatus.activatedAt).toLocaleDateString('fa-IR')}
                </div>
              )}
            </div>

            {!isMandatory && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-extrabold text-xs cursor-pointer"
              >
                بستن پنجره
              </button>
            )}
          </div>
        )}

        {/* Footer info */}
        <div className="text-center pt-2 border-t border-slate-100 text-[11px] text-slate-400">
          پشتیبانی سامانه آرکا سیستم | تک‌لایسنس یکپارچه سرور مرکزی و کلاینت‌های شبکه
        </div>
      </div>
    </div>
  );
};
