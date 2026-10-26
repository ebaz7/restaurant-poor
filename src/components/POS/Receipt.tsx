import React from 'react';
import { formatCurrency } from '../../lib/utils';
import { Order, AppSettings } from '../../lib/db';
import { format } from 'date-fns-jalali';

interface ReceiptProps {
  order: Order;
  settings: AppSettings;
}

export const Receipt = React.forwardRef<HTMLDivElement, ReceiptProps>(({ order, settings }, ref) => {
  const isSelfService = order.invoiceMode === 'self_service';

  const paymentLabel = () => {
    if (order.paymentMethod === 'cash') return 'نقدی (صندوق)';
    if (order.paymentMethod === 'credit') return 'نسیه / حساب مشتری';
    if (order.paymentMethod === 'split') {
      return `ترکیبی (نقد: ${formatCurrency(order.cashAmount || 0)} + کارت ${order.bankName || ''}: ${formatCurrency(order.cardAmount || 0)})`;
    }
    return `کارتخوان (${order.bankName || 'پوز بانکی'})`;
  };

  const is58mm = settings?.printerPaperWidth === '58mm';

  return (
    <div
      ref={ref}
      className={`receipt-print-wrapper w-full ${is58mm ? 'max-w-[48mm]' : 'max-w-[66mm]'} mx-auto bg-white text-black font-sans box-border select-none`}
      dir="rtl"
      style={{ fontSize: is58mm ? '10px' : '11px', lineHeight: '1.4', padding: '2mm 1.5mm' }}
    >
      {/* Header */}
      <div className="text-center mb-2.5 border-b border-dashed border-black pb-2">
        {settings.logoUrl && (
          <img
            src={settings.logoUrl}
            alt="Logo"
            referrerPolicy="no-referrer"
            className="w-10 h-10 mx-auto mb-1.5 grayscale object-contain"
          />
        )}
        <h1 className="text-[15px] font-bold mb-0.5 tracking-tight">
          {settings.restaurantName || 'رستوران و سلف سرویس آرکا'}
        </h1>
        {isSelfService && (
          <div className="mt-1 inline-block border-2 border-black px-2 py-0.5 font-black text-[11px] rounded">
            ویژه خط سلف سرویس و دریافت نوشابه
          </div>
        )}
        {settings.phone && (
          <p className="text-[10px] text-gray-800 mt-1">
            تلفن: <span dir="ltr" className="font-semibold">{settings.phone}</span>
          </p>
        )}
        {settings.address && (
          <p className="text-[10px] text-gray-800 mt-0.5 whitespace-pre-wrap leading-tight">
            {settings.address}
          </p>
        )}
      </div>

      {/* Meta */}
      <div className="mb-2.5 text-[10.5px] border-b border-dashed border-black pb-2 space-y-1">
        <div className="flex justify-between items-center font-medium">
          <p>
            شماره فیش: <span className="font-bold font-mono">#{order.invoiceNumber || '---'}</span>
          </p>
          <p dir="ltr" className="text-[10px] font-mono">
            {(() => {
              try {
                if (!order.createdAt) return '--:--';
                const d = new Date(order.createdAt);
                return !isNaN(d.getTime()) ? format(d, 'yyyy/MM/dd HH:mm') : '--:--';
              } catch {
                return '--:--';
              }
            })()}
          </p>
        </div>

        <div className="flex justify-between items-center text-[10px]">
          <span>نوع فاکتور:</span>
          <span className="font-bold">
            {isSelfService ? 'حالت دوم: فیش سلف سرویس' : 'حالت اول: فاکتور عادی منو'}
          </span>
        </div>

        <div className="flex justify-between items-center text-[10px]">
          <span>نحوه تسویه:</span>
          <span className="font-bold">{paymentLabel()}</span>
        </div>

        {order.customerPhone && (
          <div className="bg-gray-50 border border-gray-200 p-1.5 rounded space-y-0.5 mt-1 text-[10px]">
            {order.customerName && (
              <p>
                <strong>نام مشتری:</strong> {order.customerName}
              </p>
            )}
            <p>
              <strong>تلفن:</strong>{' '}
              <span dir="ltr" className="font-mono font-semibold">
                {order.customerPhone}
              </span>
            </p>
            {order.customerSubscriptionCode && (
              <p>
                <strong>کد اشتراک:</strong> {order.customerSubscriptionCode}
              </p>
            )}
            {order.customerAddress && (
              <p className="mt-0.5 leading-tight whitespace-normal border-t border-gray-200 pt-0.5">
                <strong>آدرس:</strong> {order.customerAddress}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Dedicated Self-Service Voucher Box (Mode 2) */}
      {isSelfService && (
        <div className="mb-2.5 border-2 border-black rounded p-2 bg-gray-50 text-center space-y-1">
          <div className="text-[12px] font-black border-b border-black pb-1">
            کوپن استفاده از سلف سرویس و نوشابه
          </div>
          <div className="flex justify-around items-center py-1">
            <div>
              <div className="text-[9.5px] text-gray-700">تعداد کل نفرات</div>
              <div className="text-[15px] font-black font-mono">
                {(order.selfServiceGuests || 0) + (order.selfServiceHalfPriceGuests || 0)} نفر
              </div>
              {((order.selfServiceHalfPriceGuests || 0) > 0 || (order.selfServiceGuests || 0) > 0) && (
                <div className="text-[8.5px] text-gray-600 font-medium">
                  {[
                    order.selfServiceGuests ? `${order.selfServiceGuests} تمام‌بها` : '',
                    order.selfServiceHalfPriceGuests ? `${order.selfServiceHalfPriceGuests} نیم‌بها / کودک` : '',
                  ]
                    .filter(Boolean)
                    .join(' + ')}
                </div>
              )}
            </div>
            <div className="h-7 border-r border-black" />
            <div>
              <div className="text-[9.5px] text-gray-700">سهمیه کل نوشابه</div>
              <div className="text-[15px] font-black font-mono">
                {(order.selfServiceGuests || 0) + (order.selfServiceHalfPriceGuests || 0)} عدد
              </div>
            </div>
          </div>
          <div className="text-[10px] font-semibold border-t border-dashed border-gray-400 pt-1 flex justify-around">
            <span>فی تمام‌بها: {formatCurrency(order.selfServiceUnitPrice || 0)}</span>
            {(order.selfServiceHalfPriceGuests || 0) > 0 && (
              <span>
                فی نیم‌بها:{' '}
                {formatCurrency(
                  order.selfServiceHalfPriceUnitPrice ||
                    Math.round((order.selfServiceUnitPrice || 0) / 2)
                )}
              </span>
            )}
          </div>
          {order.selfServiceDrinkNote && (
            <div className="text-[9.5px] text-gray-700">توضیحات: {order.selfServiceDrinkNote}</div>
          )}
        </div>
      )}

      {/* Items */}
      {Array.isArray(order.items) && order.items.length > 0 && (
        <div className="mb-2.5 border-b border-dashed border-black pb-2.5">
          <table className="w-full table-fixed text-[11px] border-collapse">
            <thead className="border-b border-black">
              <tr>
                <th className="text-right py-1 w-[48%] font-bold pr-0.5">شرح</th>
                <th className="text-center py-1 w-[16%] font-bold">تعداد</th>
                <th className="text-left py-1 w-[36%] font-bold pl-0.5">مبلغ</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, index) => (
                <tr key={index} className="border-b border-gray-200 border-dashed">
                  <td className="py-1.5 pr-0.5 text-right align-top break-words whitespace-normal w-[48%]">
                    <div className="font-bold leading-tight text-[11px]">{item?.name || 'کالا'}</div>
                    <div className="text-[9.5px] text-gray-600 mt-0.5 font-mono">
                      فی: {new Intl.NumberFormat('fa-IR').format(item?.price || 0)}
                    </div>
                  </td>
                  <td className="py-1.5 text-center align-top font-bold text-[11px] w-[16%] font-mono">
                    {item?.quantity || 1}
                  </td>
                  <td className="py-1.5 pl-0.5 text-left align-top font-bold text-[11px] w-[36%] whitespace-nowrap font-mono">
                    {new Intl.NumberFormat('fa-IR').format((item?.price || 0) * (item?.quantity || 1))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Totals */}
      <div className="mb-3 space-y-1 text-[11px] px-0.5">
        <div className="flex justify-between items-center">
          <span>جمع کل:</span>
          <span className="font-semibold font-mono">{formatCurrency(order.subtotal || order.total || 0)}</span>
        </div>
        {(order.discountValue || 0) > 0 && (
          <div className="flex justify-between items-center">
            <span>تخفیف {order.discountType === 'percent' ? `(${order.discountValue}%)` : ''}:</span>
            <span className="font-semibold font-mono">
              {order.discountType === 'percent'
                ? formatCurrency(((order.subtotal || order.total || 0) * order.discountValue) / 100)
                : formatCurrency(order.discountValue || 0)}
            </span>
          </div>
        )}
        {(order.taxAmount || 0) > 0 && (
          <div className="flex justify-between items-center">
            <span>مالیات ({order.taxPercentage || 0}%):</span>
            <span className="font-semibold font-mono">{formatCurrency(order.taxAmount || 0)}</span>
          </div>
        )}
        <div className="flex justify-between items-center font-bold text-[12.5px] border-t border-black pt-1.5 mt-1">
          <span>قابل پرداخت:</span>
          <span className="font-mono">{formatCurrency(order.finalAmount || order.total || 0)}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-[9.5px] mt-2.5 space-y-1 border-t border-dashed border-gray-300 pt-2">
        <p className="font-bold text-[11px] mb-1">
          {isSelfService
            ? 'لطفاً این فیش را جهت دریافت نوشابه و سلف سرویس به مسئول خط ارائه دهید.'
            : 'از خرید شما متشکریم! نوش جان'}
        </p>
        {settings.website && (
          <p dir="ltr" className="font-mono">
            {settings.website}
          </p>
        )}
        <div className="flex flex-col items-center justify-center gap-0.5 mt-1 text-[9px]" dir="ltr">
          {settings.instagram && <span>IG: {settings.instagram}</span>}
          {settings.telegram && <span>TG: {settings.telegram}</span>}
        </div>
      </div>
    </div>
  );
});

Receipt.displayName = 'Receipt';
