import React, { useState, useMemo } from 'react';
import {
  Account,
  Person,
  JournalVoucher,
  db,
  recordJournalVoucher,
} from '../../lib/db';
import {
  AccountType,
  JournalLine,
  validateDoubleEntryLines,
} from '../../lib/accountingEngine';
import { formatCurrency, getCurrencyLabel } from '../../lib/utils';
import AccountAutocompleteSelect from '../Common/AccountAutocompleteSelect';
import FormattedNumberInput from '../Common/FormattedNumberInput';
import { format } from 'date-fns-jalali';
import {
  BookOpen,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Layers,
  FilePlus2,
  Search,
  Code2,
} from 'lucide-react';

interface Props {
  accounts: Account[];
  persons: Person[];
  vouchers: JournalVoucher[];
}

export default function ChartAndJournalTab({ accounts, persons, vouchers }: Props) {
  const [subView, setSubView] = useState<'new_voucher' | 'ledger' | 'chart'>('new_voucher');
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Manual Double-Entry Voucher Builder
  const [voucherDesc, setVoucherDesc] = useState('');
  const [lines, setLines] = useState<JournalLine[]>([
    {
      accountCode: '609',
      accountName: 'سایر هزینه‌های عمومی و تنخواه',
      debit: 500000,
      credit: 0,
      description: 'ردیف بدهکار',
    },
    {
      accountCode: '101',
      accountName: 'صندوق نقدی رستوران',
      debit: 0,
      credit: 500000,
      description: 'ردیف بستانکار',
    },
  ]);

  // New Account in Chart of Accounts
  const [newAccLevel, setNewAccLevel] = useState<'general' | 'subsidiary' | 'detailed'>('subsidiary');
  const [newAccCode, setNewAccCode] = useState('');
  const [newAccName, setNewAccName] = useState('');
  const [newAccType, setNewAccType] = useState<AccountType>('expense');
  const [newAccDesc, setNewAccDesc] = useState('');

  // Search Filter in Chart of Accounts
  const [chartSearchQuery, setChartSearchQuery] = useState('');

  const validation = useMemo(() => validateDoubleEntryLines(lines), [lines]);
  const currencyLabel = getCurrencyLabel();

  // Compute account balances across all vouchers
  const accountBalances = useMemo(() => {
    const map = new Map<string, { debit: number; credit: number }>();
    for (const v of vouchers) {
      for (const l of v.lines) {
        const cur = map.get(l.accountCode) || { debit: 0, credit: 0 };
        cur.debit += Number(l.debit) || 0;
        cur.credit += Number(l.credit) || 0;
        map.set(l.accountCode, cur);
      }
    }
    return map;
  }, [vouchers]);

  const filteredChartAccounts = useMemo(() => {
    const q = chartSearchQuery.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.description && a.description.toLowerCase().includes(q))
    );
  }, [accounts, chartSearchQuery]);

  const handleUpdateLine = (idx: number, patch: Partial<JournalLine>) => {
    const copy = [...lines];
    const updated = { ...copy[idx], ...patch };
    if (patch.accountCode) {
      const found = accounts.find((a) => a.code === patch.accountCode);
      if (found) updated.accountName = found.name;
    }
    if (patch.personId !== undefined) {
      const p = persons.find((per) => per.id === Number(patch.personId));
      updated.personName = p?.name;
    }
    copy[idx] = updated;
    setLines(copy);
  };

  const handleAddLine = () => {
    const firstAcc = accounts[0] || { code: '101', name: 'صندوق' };
    setLines([
      ...lines,
      {
        accountCode: firstAcc.code,
        accountName: firstAcc.name,
        debit: 0,
        credit: 0,
        description: '',
      },
    ]);
  };

  const handleRemoveLine = (idx: number) => {
    if (lines.length <= 2) return;
    setLines(lines.filter((_, i) => i !== idx));
  };

  const handleSaveManualVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!validation.isValid) {
      setErrorMsg(validation.error || 'سند تراز نیست.');
      return;
    }

    await recordJournalVoucher({
      date: new Date(),
      description: voucherDesc.trim() || 'سند حسابداری دوبل دستی',
      type: 'manual',
      lines,
    });

    setVoucherDesc('');
    setFeedback('سند حسابداری دوبل با موفقیت در دفتر روزنامه و کل ثبت شد.');
    setTimeout(() => setFeedback(''), 4000);
  };

  const handleTypeChange = (type: AccountType) => {
    setNewAccType(type);
    // Auto suggest next code
    const prefixMap: Record<AccountType, string> = {
      asset: '10',
      liability: '20',
      equity: '30',
      revenue: '40',
      cogs: '50',
      expense: '60',
    };
    const prefix = prefixMap[type] || '60';
    const sameGroup = accounts.filter((a) => a.type === type || a.code.startsWith(prefix));
    let nextNum = sameGroup.length + 1;
    let suggestedCode = `${prefix}${nextNum < 10 ? '0' + nextNum : nextNum}`;
    while (accounts.some((a) => a.code === suggestedCode)) {
      nextNum++;
      suggestedCode = `${prefix}${nextNum < 10 ? '0' + nextNum : nextNum}`;
    }
    setNewAccCode(suggestedCode);
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const code = newAccCode.trim();
    const name = newAccName.trim();
    if (!code || !name) {
      setErrorMsg('وارد کردن کد و عنوان سرفصل الزامی است.');
      return;
    }
    const exists = accounts.some((a) => a.code === code);
    if (exists) {
      setErrorMsg(`کد حساب «${code}» قبلاً در کدینگ حسابداری ثبت شده است.`);
      return;
    }
    await db.accounts.add({
      code,
      name,
      type: newAccType,
      isSystem: false,
      description: newAccDesc.trim() || `سطح ${newAccLevel === 'general' ? 'کل' : newAccLevel === 'subsidiary' ? 'معین' : 'تفصیلی'} - ${typeLabel(newAccType)}`,
    });
    setNewAccCode('');
    setNewAccName('');
    setNewAccDesc('');
    setFeedback(`سرفصل جدید «${code} - ${name}» به جدول کدینگ استاندارد حسابداری اضافه شد.`);
    setTimeout(() => setFeedback(''), 4000);
  };

  const typeLabel = (t: AccountType) => {
    switch (t) {
      case 'asset':
        return 'دارایی‌ها (۱۰۰)';
      case 'liability':
        return 'بدهی‌ها (۲۰۰)';
      case 'equity':
        return 'سرمایه (۳۰۰)';
      case 'revenue':
        return 'درآمد و فروش (۴۰۰)';
      case 'cogs':
        return 'بهای تمام شده (۵۰۰)';
      case 'expense':
        return 'هزینه عملیاتی (۶۰۰)';
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-view Switcher */}
      <div className="bg-white p-2 sm:p-2.5 rounded-2xl border border-slate-200 flex items-center gap-1.5 overflow-x-auto no-scrollbar scrollbar-none w-full shadow-2xs">
        <button
          type="button"
          onClick={() => setSubView('new_voucher')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
            subView === 'new_voucher'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <FilePlus2 size={15} />
          <span>۱. صدور سند دوبل (جستجوی آنی سرفصل)</span>
        </button>
        <button
          type="button"
          onClick={() => setSubView('ledger')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
            subView === 'ledger'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <BookOpen size={15} />
          <span>۲. دفتر روزنامه اسناد ({vouchers.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setSubView('chart')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
            subView === 'chart'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Layers size={15} />
          <span>۳. تعریف کدینگ و سرفصل‌های حسابداری ({accounts.length})</span>
        </button>
      </div>

      {feedback && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
          <CheckCircle2 size={16} />
          <span>{feedback}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {subView === 'new_voucher' && (
        <form
          onSubmit={handleSaveManualVoucher}
          className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 space-y-4 shadow-2xs"
        >
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                صدور سند حسابداری دوبل (تایپ مستقیم نام/کد سرفصل یا انتخاب از منو)
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                در هر ردیف می‌توانید نام یا کد سرفصل را تایپ کنید تا درجا پیدا شود، یا روی فلش منو کلیک کنید. مبالغ حین تایپ ۳ رقم ۳ رقم جدا می‌شوند.
              </p>
            </div>
            <input
              type="text"
              placeholder="شرح کلی سند حسابداری..."
              value={voucherDesc}
              onChange={(e) => setVoucherDesc(e.target.value)}
              className="w-full sm:w-72 px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold"
            />
          </div>

          <div className="space-y-2.5">
            {lines.map((line, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-xl bg-slate-50/70 border border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-2 items-center"
              >
                <div className="md:col-span-4">
                  <label className="block md:hidden text-[10px] font-bold text-slate-500 mb-1">
                    سرفصل حسابداری (تایپ یا انتخاب):
                  </label>
                  <AccountAutocompleteSelect
                    accounts={accounts}
                    selectedCode={line.accountCode}
                    onSelect={(acc) =>
                      handleUpdateLine(idx, {
                        accountCode: acc.code,
                        accountName: acc.name,
                      })
                    }
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block md:hidden text-[10px] font-bold text-slate-500 mb-1">
                    شخص تفصیلی:
                  </label>
                  <select
                    value={line.personId || 0}
                    onChange={(e) =>
                      handleUpdateLine(idx, {
                        personId: Number(e.target.value) || undefined,
                      })
                    }
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg bg-white text-xs font-bold text-slate-700"
                  >
                    <option value={0}>- بدون شخص -</option>
                    {persons.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block md:hidden text-[10px] font-bold text-slate-500 mb-1">
                    شرح ردیف:
                  </label>
                  <input
                    type="text"
                    value={line.description || ''}
                    onChange={(e) => handleUpdateLine(idx, { description: e.target.value })}
                    placeholder="شرح آرتیکل..."
                    className="w-full px-2.5 py-1.5 border border-slate-200 bg-white rounded-lg text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 md:col-span-3">
                  <div>
                    <label className="block text-[10px] font-bold text-blue-700 mb-0.5">
                      بدهکار ({currencyLabel})
                    </label>
                    <FormattedNumberInput
                      value={line.debit || ''}
                      onValueChange={(val) =>
                        handleUpdateLine(idx, {
                          debit: Math.max(0, val),
                          credit: val > 0 ? 0 : line.credit,
                        })
                      }
                      placeholder="0"
                      ariaLabel={`مبلغ بدهکار ردیف ${idx + 1}`}
                      className="w-full px-2.5 py-1.5 border border-blue-200 bg-white rounded-lg font-mono text-xs font-black text-blue-800 text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-rose-700 mb-0.5">
                      بستانکار ({currencyLabel})
                    </label>
                    <FormattedNumberInput
                      value={line.credit || ''}
                      onValueChange={(val) =>
                        handleUpdateLine(idx, {
                          credit: Math.max(0, val),
                          debit: val > 0 ? 0 : line.debit,
                        })
                      }
                      placeholder="0"
                      ariaLabel={`مبلغ بستانکار ردیف ${idx + 1}`}
                      className="w-full px-2.5 py-1.5 border border-rose-200 bg-white rounded-lg font-mono text-xs font-black text-rose-800 text-left focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                </div>

                <div className="md:col-span-1 flex justify-end md:justify-center">
                  <button
                    type="button"
                    onClick={() => handleRemoveLine(idx)}
                    disabled={lines.length <= 2}
                    className="text-slate-400 hover:text-rose-600 disabled:opacity-30 p-1.5 rounded-lg"
                    title="حذف ردیف"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
            <button
              type="button"
              onClick={handleAddLine}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold flex items-center gap-1"
            >
              <Plus size={14} />
              <span>افزودن ردیف جدید به سند</span>
            </button>

            <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
              <span className="text-blue-700 font-bold">
                جمع بدهکار: {formatCurrency(validation.totalDebit)}
              </span>
              <span className="text-rose-700 font-bold">
                جمع بستانکار: {formatCurrency(validation.totalCredit)}
              </span>
              <span
                className={`px-2.5 py-1 rounded-lg font-bold ${
                  validation.isValid
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-rose-50 text-rose-600 border border-rose-200'
                }`}
              >
                {validation.isValid
                  ? '✅ سند تراز است'
                  : `⚠️ اختلاف: ${formatCurrency(validation.difference)}`}
              </span>
            </div>

            <button
              type="submit"
              disabled={!validation.isValid}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl font-bold shadow-xs cursor-pointer"
            >
              ثبت نهایی سند دوبل
            </button>
          </div>
        </form>
      )}

      {subView === 'ledger' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-xs md:text-sm font-extrabold text-slate-900">
              دفتر روزنامه اسناد حسابداری (کلیه اسناد اتوماتیک صندوق، آشپزخانه، بانک، انبار و دستی)
            </h3>
            <span className="text-xs font-mono font-bold text-slate-600">
              {vouchers.length} سند
            </span>
          </div>
          <div className="divide-y divide-slate-200 max-h-[60vh] overflow-y-auto">
            {[...vouchers].reverse().map((v) => (
              <div key={v.id} className="p-3.5 space-y-2 hover:bg-slate-50/50">
                <div className="flex flex-wrap justify-between items-center gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-blue-700">
                      سند #{v.voucherNumber}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-bold text-slate-900">{v.description}</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-500 font-mono text-[11px]">
                    <span>{format(new Date(v.date), 'yyyy/MM/dd HH:mm')}</span>
                    <span className="font-bold text-slate-800">
                      تراز: {formatCurrency(v.totalAmount)}
                    </span>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl border border-slate-200/80 overflow-x-auto">
                  <table className="w-full text-right text-[11px]">
                    <thead className="text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-1.5 px-3">کد و نام حساب</th>
                        <th className="py-1.5 px-3">تفصیلی / شرح</th>
                        <th className="py-1.5 px-3">بدهکار</th>
                        <th className="py-1.5 px-3">بستانکار</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {v.lines.map((l, i) => (
                        <tr key={i}>
                          <td className="py-1.5 px-3 font-bold text-slate-800">
                            {l.accountCode} - {l.accountName}
                          </td>
                          <td className="py-1.5 px-3 text-slate-600">
                            {l.personName ? `${l.personName} · ` : ''}
                            {l.description}
                          </td>
                          <td className="py-1.5 px-3 font-mono text-blue-700 font-semibold">
                            {l.debit > 0 ? formatCurrency(l.debit) : '-'}
                          </td>
                          <td className="py-1.5 px-3 font-mono text-rose-700 font-semibold">
                            {l.credit > 0 ? formatCurrency(l.credit) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 3: Chart of Accounts (ایجاد کد جدید و کدینگ حسابداری) */}
      {subView === 'chart' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form
            onSubmit={handleAddAccount}
            className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 space-y-3.5 h-fit shadow-2xs"
          >
            <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-2.5 flex items-center gap-2">
              <Code2 size={18} className="text-blue-600" />
              <span>ایجاد استاندارد کد جدید حسابداری</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">سطح حساب در کدینگ</label>
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl font-bold text-[11px]">
                  <button
                    type="button"
                    onClick={() => setNewAccLevel('general')}
                    className={`py-1.5 rounded-lg ${
                      newAccLevel === 'general' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    حساب کل
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewAccLevel('subsidiary')}
                    className={`py-1.5 rounded-lg ${
                      newAccLevel === 'subsidiary' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    حساب معین
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewAccLevel('detailed')}
                    className={`py-1.5 rounded-lg ${
                      newAccLevel === 'detailed' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    تفصیلی
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">گروه اصلی حساب (ماهیت)</label>
                <select
                  value={newAccType}
                  onChange={(e) => handleTypeChange(e.target.value as AccountType)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold text-slate-800"
                >
                  <option value="asset">۱۰۰ - دارایی‌ها (صندوق، بانک، انبار، تجهیزات)</option>
                  <option value="liability">۲۰۰ - بدهی‌ها و حساب‌های پرداختنی</option>
                  <option value="equity">۳۰۰ - سرمایه اولیه و جاری شرکا</option>
                  <option value="revenue">۴۰۰ - درآمدها و فروش غذا و نوشیدنی</option>
                  <option value="cogs">۵۰۰ - بهای تمام شده مواد اولیه و غذا</option>
                  <option value="expense">۶۰۰ - هزینه‌های جاری و عملیاتی رستوران</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">کد جدید حساب *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثلاً 610"
                    value={newAccCode}
                    onChange={(e) => setNewAccCode(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold text-left focus:ring-2 focus:ring-blue-500"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">عنوان سرفصل *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: هزینه بازاریابی"
                    value={newAccName}
                    onChange={(e) => setNewAccName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">توضیح و کاربرد حساب</label>
                <input
                  type="text"
                  placeholder="شرح مختصر کاربرد سرفصل..."
                  value={newAccDesc}
                  onChange={(e) => setNewAccDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-xs cursor-pointer"
            >
              افزودن کد جدید به کدینگ حسابداری
            </button>
          </form>

          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <h3 className="text-xs md:text-sm font-extrabold text-slate-900">
                جدول کدینگ استاندارد حسابداری و تراز آزمایشی سرفصل‌ها ({filteredChartAccounts.length})
              </h3>
              <div className="relative w-full sm:w-56">
                <Search size={14} className="absolute right-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="جستجوی کد یا نام سرفصل..."
                  value={chartSearchQuery}
                  onChange={(e) => setChartSearchQuery(e.target.value)}
                  className="w-full pr-8 pl-3 py-1.5 border border-slate-300 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">کد حساب</th>
                    <th className="py-2.5 px-3">عنوان سرفصل</th>
                    <th className="py-2.5 px-3">ماهیت / گروه</th>
                    <th className="py-2.5 px-3">جمع بدهکار</th>
                    <th className="py-2.5 px-3">جمع بستانکار</th>
                    <th className="py-2.5 px-3">مانده حساب</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredChartAccounts.map((acc) => {
                    const bal = accountBalances.get(acc.code) || { debit: 0, credit: 0 };
                    const net = Math.abs(bal.debit - bal.credit);
                    return (
                      <tr key={acc.code} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono font-black text-blue-700" dir="ltr">
                          {acc.code}
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                            <span>{acc.name}</span>
                            {acc.isSystem && (
                              <span className="px-1.5 py-0.2 bg-slate-100 text-slate-500 text-[10px] rounded font-semibold">
                                سیستم
                              </span>
                            )}
                          </div>
                          {acc.description && (
                            <div className="text-[10px] text-slate-500">{acc.description}</div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-600 font-semibold">{typeLabel(acc.type)}</td>
                        <td className="py-2 px-3 font-mono">{formatCurrency(bal.debit)}</td>
                        <td className="py-2 px-3 font-mono">{formatCurrency(bal.credit)}</td>
                        <td className="py-2 px-3 font-mono font-extrabold text-slate-900">
                          {formatCurrency(net)}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredChartAccounts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-semibold">
                        سرفصل حسابداری با کد یا عنوان وارد شده یافت نشد.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

