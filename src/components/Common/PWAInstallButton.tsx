import React, { useState } from 'react';
import { Download, Smartphone, X, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'badge' | 'full' | 'compact';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  variant = 'badge',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else if (isIOS) {
      setShowIOSGuide(true);
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      {variant === 'compact' ? (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-[11px] font-bold shadow-xs hover:shadow transition-all cursor-pointer ${className}`}
          title="نصب مستقیم اپلیکیشن آرکا روی دسکتاپ و موبایل"
        >
          <Download size={13} className="animate-bounce" />
          <span>نصب اپلیکیشن</span>
        </button>
      ) : variant === 'badge' ? (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition cursor-pointer ${className}`}
        >
          <Smartphone size={15} className="text-blue-600" />
          <span>نصب برنامه روی گوشی / سیستم</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-extrabold shadow-sm transition cursor-pointer ${className}`}
        >
          <Download size={16} />
          <span>نصب اپلیکیشن آرکا (PWA)</span>
        </button>
      )}

      {/* iOS Safari Installation Guide Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 text-right space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-blue-600 font-extrabold text-sm">
                <Smartphone size={18} />
                <span>نصب در آیفون / آیپد (iOS)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>
            <div className="text-xs text-slate-600 space-y-2.5 leading-relaxed">
              <p>برای نصب سامانه روی آیفون در مرورگر Safari مراحل زیر را انجام دهید:</p>
              <ol className="list-decimal list-inside space-y-1.5 font-medium text-slate-700">
                <li>در نوار پایین مرورگر Safari دکمه <strong className="text-blue-700">Share</strong> (اشتراک‌گذاری) را بزنید.</li>
                <li>منو را به پایین بکشید و گزینه <strong className="text-blue-700">Add to Home Screen</strong> را انتخاب کنید.</li>
                <li>در بالا دکمه <strong className="text-blue-700">Add</strong> را بزنید تا آیکون آرکا به صفحه گوشی اضافه شود.</li>
              </ol>
            </div>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold"
            >
              متوجه شدم
            </button>
          </div>
        </div>
      )}

      {/* Desktop Chrome / Android Guide Modal if browser hasn't fired prompt yet */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 md:p-6 shadow-2xl border border-slate-200 text-right space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-blue-600 font-extrabold text-sm">
                <Download size={18} />
                <span>راهنمای نصب اپلیکیشن در کروم و اندروید</span>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>
            <div className="text-xs text-slate-600 space-y-3 leading-relaxed">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-blue-800">
                <p className="font-bold mb-1">💡 شرط مهم برای فعال شدن خودکار آیکون نصب:</p>
                <p>سایت بایدحتماً با آدرس امن <strong className="dir-ltr inline-block">https://...</strong> (دارای قفل سبز SSL) باز شود.</p>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-800">در سیستم / کامپیوتر (Chrome & Edge):</h4>
                <p className="text-slate-600">در سمت راست نوار آدرس مرورگر (کمی سمت چپ آیکون بوکمارک)، علامت <strong className="text-blue-700 font-bold">دانلود / Install</strong> وجود دارد. همچنین می‌توانید از منوی سه نقطه کروم گزینه <strong className="text-blue-700 font-bold">Save and Share ➔ Install Arka System</strong> را بزنید.</p>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-800">در گوشی‌های اندروید (Chrome Mobile):</h4>
                <p className="text-slate-600">منوی ۳ نقطه بالای کروم را بزنید و گزینه <strong className="text-blue-700 font-bold">Install app</strong> یا <strong className="text-blue-700 font-bold">افزودن به صفحه اصلی (Add to Home screen)</strong> را انتخاب کنید.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
            >
              بستن
            </button>
          </div>
        </div>
      )}
    </>
  );
};
