import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, Copy, CheckCircle2, AlertCircle, KeyRound, Key, RefreshCw } from 'lucide-react';
import {
  getSystemCode,
  getLicenseStatus,
  activateApplication,
  LicenseInfo,
} from '../../lib/licenseManager';

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

  const loadStatus = async () => {
    setIsLoading(true);
    const sysCode = await getSystemCode();
    setSystemCode(sysCode);
    const status = await getLicenseStatus();
    setLicenseStatus(status);
    setIsLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
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

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
      dir="rtl"
    >
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-slate-900 via-teal-900 to-slate-900 border border-teal-500/30 text-teal-400 mx-auto flex items-center justify-center shadow-lg shadow-teal-900/20">
            {licenseStatus?.isActivated ? <ShieldCheck size={32} /> : <Lock size={32} />}
          </div>
          <div>
            <span className="inline-block px-3 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-black mb-1">
              {licenseStatus?.isActivated ? '🟢 نسخه فعال و معتبر' : '🔒 قفل سخت‌افزاری آفلاین'}
            </span>
            <h2 className="text-lg font-black text-slate-900">
              {licenseStatus?.isActivated ? 'لایسنس نرم‌افزار فعال است' : 'فعال‌سازی نرم‌افزار رستوران آرکا'}
            </h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              {licenseStatus?.isActivated
                ? 'این دستگاه دارای لایسنس دائمی و معتبر برای استفاده در این مجموعه می‌باشد.'
                : 'برای استفاده از نرم‌افزار، کد دستگاه زیر را برای مدیریت ارسال کرده و کد فعال‌سازی را وارد کنید.'}
            </p>
          </div>
        </div>

        {/* System Code Display Box */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between text-xs font-extrabold text-slate-700">
            <span>شناسه سخت‌افزاری دستگاه (System Code):</span>
            <span className="text-[10px] text-teal-700 font-bold">منحصربه‌فرد این سیستم</span>
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
            {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Input Activation Form */}
        {!licenseStatus?.isActivated ? (
          <form onSubmit={handleActivate} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                <KeyRound size={15} className="text-teal-600" />
                <span>کد فعال‌سازی دریافت شده از مدیریت (License Key):</span>
              </label>
              <input
                type="text"
                value={licenseKeyInput}
                onChange={(e) => setLicenseKeyInput(e.target.value.toUpperCase())}
                placeholder="مثلاً: AK12-8F90-34CD-78AB"
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
                  <span>در حال بررسی لایسنس...</span>
                </>
              ) : (
                <>
                  <Key size={16} />
                  <span>فعال‌سازی نرم‌افزار</span>
                </>
              )}
            </button>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 text-xs leading-relaxed space-y-1">
              <div className="font-extrabold flex items-center gap-1.5">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span>دستگاه شما به صورت دائمی فعال گردیده است.</span>
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
          پشتیبانی سامانه آرکا سیستم | نسخه قفل آفلاین تائوری و ویندوز
        </div>
      </div>
    </div>
  );
};
