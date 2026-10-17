import React, { useState } from 'react';
import { usePWAInstall, useOnlineStatus } from '../../lib/usePWAInstall';
import { Download, Smartphone, Monitor, X, Share, PlusSquare, CheckCircle2, WifiOff } from 'lucide-react';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setShowGuide(true);
      }
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          compact
            ? 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 transition shadow-xs shrink-0'
            : 'flex flex-col items-center justify-center w-16 h-14 rounded-2xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-all gap-1 shrink-0'
        }
        title="نصب وب‌اپلیکیشن آرکا روی گوشی یا کامپیوتر (PWA)"
      >
        <Download size={compact ? 14 : 18} />
        <span className={compact ? 'text-[11px] font-bold' : 'text-[10px] font-extrabold'}>
          {compact ? 'نصب اپ (PWA)' : 'نصب اپ'}
        </span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-black">
                  <Download size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold">نصب وب‌اپلیکیشن آرکا (PWA)</h3>
                  <p className="text-[11px] text-slate-300">
                    نصب مستقیم روی صفحه اصلی گوشی موبایل و دسکتاپ بدون نیاز به اپ‌استور
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3 text-right">
              {isInstallable && (
                <button
                  type="button"
                  onClick={install}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm"
                >
                  <Download size={18} />
                  نصب مستقیم و خودکار روی دستگاه شما
                </button>
              )}

              <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2">
                <div className="flex items-center gap-2 text-xs font-extrabold text-blue-950">
                  <Smartphone size={16} className="text-blue-600 shrink-0" />
                  <span>راهنمای نصب روی موبایل (اندروید و آیفون iOS):</span>
                </div>
                {isIOS ? (
                  <ol className="text-xs text-slate-700 space-y-1.5 list-decimal list-inside leading-relaxed">
                    <li>
                      در مرورگر Safari دکمه اشتراک‌گذاری{' '}
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-white rounded border text-[10px] font-bold">
                        <Share size={11} /> Share
                      </span>{' '}
                      را در پایین صفحه لمس کنید.
                    </li>
                    <li>
                      گزینه{' '}
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-white rounded border text-[10px] font-bold">
                        <PlusSquare size={11} /> Add to Home Screen
                      </span>{' '}
                      را انتخاب کرده و دکمه <strong>Add</strong> را بزنید.
                    </li>
                  </ol>
                ) : (
                  <ol className="text-xs text-slate-700 space-y-1.5 list-decimal list-inside leading-relaxed">
                    <li>در مرورگر کروم (Chrome) گوشی، منوی سه نقطه بالا را باز کنید.</li>
                    <li>
                      گزینه <strong>«Install App» (نصب برنامه)</strong> یا{' '}
                      <strong>«Add to Home screen»</strong> را انتخاب کنید.
                    </li>
                    <li>در آیفون (Safari): دکمه Share و سپس Add to Home Screen را بزنید.</li>
                  </ol>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center gap-2 text-xs font-extrabold text-slate-900">
                  <Monitor size={16} className="text-slate-700 shrink-0" />
                  <span>راهنمای نصب روی کامپیوتر و لپ‌تاپ (ویندوز / مک):</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  در نوار آدرس مرورگر Chrome یا Edge (سمت راست یا چپ آدرس سایت)، روی آیکون{' '}
                  <strong>نصب (Install آرکا سیستم)</strong> کلیک کنید تا برنامه در پنجره اختصاصی و
                  روی دسکتاپ شما نصب شود.
                </p>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl font-bold">
                <CheckCircle2 size={15} className="shrink-0" />
                <span>پشتیبانی کامل از کارکرد آفلاین (بدون اینترنت) و ذخیره‌سازی امن در حافظه دستگاه</span>
              </div>

              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition"
              >
                متوجه شدم
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-16 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white shadow-lg">
      <WifiOff size={14} className="animate-pulse shrink-0" />
      <span>حالت آفلاین فعال است — اطلاعات در حافظه دستگاه ذخیره می‌شود</span>
    </div>
  );
};
