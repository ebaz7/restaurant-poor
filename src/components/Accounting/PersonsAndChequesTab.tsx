import React, { useState, useMemo } from 'react';
import {
  Person,
  PersonRole,
  Cheque,
  BankAccount,
  JournalVoucher,
  db,
  recordJournalVoucher,
} from '../../lib/db';
import { classifyChequeDueStatus } from '../../lib/accountingEngine';
import { formatCurrency, getCurrencyLabel } from '../../lib/utils';
import FormattedNumberInput from '../Common/FormattedNumberInput';
import { format } from 'date-fns-jalali';
import {
  Users,
  UserPlus,
  FileText,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Plus,
  X,
  Search,
  Edit2,
  Trash2,
  Printer,
  Calendar,
  Phone,
  UserCheck,
} from 'lucide-react';

interface Props {
  persons: Person[];
  cheques: Cheque[];
  banks: BankAccount[];
  vouchers: JournalVoucher[];
}

export default function PersonsAndChequesTab({
  persons,
  cheques,
  banks,
  vouchers,
}: Props) {
  const [section, setSection] = useState<'persons' | 'cheques'>('persons');
  const [roleFilter, setRoleFilter] = useState<'all' | PersonRole>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPersonForLedger, setSelectedPersonForLedger] = useState<Person | null>(null);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [feedback, setFeedback] = useState('');

  // Date Range for Ledger/Statement
  const [dateRangePreset, setDateRangePreset] = useState<'all' | '30days' | 'thisMonth'>('all');
  const [customFromDate, setCustomFromDate] = useState('');
  const [customToDate, setCustomToDate] = useState('');

  // New Person Form
  const [pName, setPName] = useState('');
  const [pRole, setPRole] = useState<PersonRole>('supplier');
  const [pPhone, setPPhone] = useState('');
  const [pCode, setPCode] = useState('');
  const [pDesc, setPDesc] = useState('');

  // New Cheque Form
  const [cNumber, setCNumber] = useState('');
  const [cType, setCType] = useState<'issued' | 'received'>('issued');
  const [cAmount, setCAmount] = useState('');
  const [cDaysUntilDue, setCDaysUntilDue] = useState('0'); // 0 = today
  const [cBankId, setCBankId] = useState<number>(banks[0]?.id || 0);
  const [cPersonId, setCPersonId] = useState<number>(persons[0]?.id || 0);
  const [cDesc, setCDesc] = useState('');

  const showToast = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 4000);
  };

  // Compute each person's ledger lines and running balance from all journal vouchers
  const personBalances = useMemo(() => {
    const map = new Map<
      number,
      {
        totalDebit: number;
        totalCredit: number;
        netBalance: number; // positive = بدهکار به ما, negative = بستانکار (طلبکار از ما)
        lines: Array<{
          date: Date;
          voucherNumber: number;
          description: string;
          accountName: string;
          debit: number;
          credit: number;
          runningBalance: number;
        }>;
      }
    >();

    persons.forEach((p) => {
      if (p.id !== undefined) {
        map.set(p.id, { totalDebit: 0, totalCredit: 0, netBalance: 0, lines: [] });
      }
    });

    const sortedVouchers = [...vouchers].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    for (const v of sortedVouchers) {
      for (const l of v.lines) {
        if (l.personId && map.has(l.personId)) {
          const entry = map.get(l.personId)!;
          const d = Number(l.debit) || 0;
          const c = Number(l.credit) || 0;
          entry.totalDebit += d;
          entry.totalCredit += c;
          entry.netBalance = entry.totalDebit - entry.totalCredit;
          entry.lines.push({
            date: v.date,
            voucherNumber: v.voucherNumber,
            description: l.description || v.description,
            accountName: l.accountName,
            debit: d,
            credit: c,
            runningBalance: entry.netBalance,
          });
        }
      }
    }

    return map;
  }, [persons, vouchers]);

  const filteredPersons = useMemo(() => {
    return persons.filter((p) => {
      const matchesRole = roleFilter === 'all' || p.role === roleFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.phone && p.phone.includes(q)) ||
        (p.code && p.code.toLowerCase().includes(q));
      return matchesRole && matchesQuery;
    });
  }, [persons, roleFilter, searchQuery]);

  // Selected Person Filtered Ledger Lines
  const selectedPersonLedger = useMemo(() => {
    if (!selectedPersonForLedger || !selectedPersonForLedger.id) return null;
    const raw = personBalances.get(selectedPersonForLedger.id);
    if (!raw) return null;

    let filteredLines = [...raw.lines];

    const now = new Date();
    if (dateRangePreset === '30days') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
      filteredLines = filteredLines.filter((l) => new Date(l.date) >= thirtyDaysAgo);
    } else if (dateRangePreset === 'thisMonth') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      filteredLines = filteredLines.filter((l) => new Date(l.date) >= startOfMonth);
    }

    if (customFromDate) {
      const from = new Date(customFromDate);
      filteredLines = filteredLines.filter((l) => new Date(l.date) >= from);
    }
    if (customToDate) {
      const to = new Date(customToDate);
      to.setHours(23, 59, 59, 999);
      filteredLines = filteredLines.filter((l) => new Date(l.date) <= to);
    }

    const filteredDebit = filteredLines.reduce((acc, l) => acc + l.debit, 0);
    const filteredCredit = filteredLines.reduce((acc, l) => acc + l.credit, 0);
    const filteredNet = filteredDebit - filteredCredit;

    return {
      allLines: raw.lines,
      filteredLines,
      totalDebit: filteredDebit,
      totalCredit: filteredCredit,
      netBalance: filteredNet,
      overallNetBalance: raw.netBalance,
    };
  }, [selectedPersonForLedger, personBalances, dateRangePreset, customFromDate, customToDate]);

  const handleAddPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pName.trim()) return;
    await db.persons.add({
      name: pName.trim(),
      role: pRole,
      phone: pPhone.trim(),
      code: pCode.trim() || undefined,
      description: pDesc.trim(),
      initialBalance: 0,
      createdAt: new Date(),
    });
    setPName('');
    setPPhone('');
    setPCode('');
    setPDesc('');
    showToast(`شخص «${pName.trim()}» با موفقیت در سیستم حسابداری ثبت شد.`);
  };

  const handleUpdatePerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPerson || !editingPerson.id) return;
    await db.persons.update(editingPerson.id, {
      name: editingPerson.name.trim(),
      role: editingPerson.role,
      phone: editingPerson.phone?.trim() || '',
      code: editingPerson.code?.trim() || '',
      description: editingPerson.description?.trim() || '',
    });
    showToast(`اطلاعات شخص «${editingPerson.name}» به‌روزرسانی شد.`);
    setEditingPerson(null);
  };

  const handleDeletePerson = async (person: Person) => {
    if (!person.id) return;
    const hasVouchers = vouchers.some((v) => v.lines.some((l) => l.personId === person.id));
    if (hasVouchers) {
      alert(`امکان حذف شخص «${person.name}» وجود ندارد زیرا دارای تراکنش و گردش حساب در اسناد حسابداری است.`);
      return;
    }
    if (confirm(`آیا از حذف شخص «${person.name}» اطمینان دارید؟`)) {
      await db.persons.delete(person.id);
      showToast(`شخص «${person.name}» با موفقیت حذف گردید.`);
    }
  };

  const handleAddCheque = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Math.round(Number(cAmount) || 0);
    if (!cNumber.trim() || amount <= 0) return;

    const bank = banks.find((b) => b.id === Number(cBankId)) || banks[0];
    const person = persons.find((p) => p.id === Number(cPersonId)) || persons[0];
    const daysOffset = Number(cDaysUntilDue) || 0;
    const dueDate = new Date(Date.now() + daysOffset * 86400000);

    await db.cheques.add({
      chequeNumber: cNumber.trim(),
      type: cType,
      amount,
      issueDate: new Date(),
      dueDate,
      bankId: bank?.id,
      bankName: bank?.bankName || 'بانک',
      personId: person?.id,
      personName: person?.name || 'شخص',
      description: cDesc.trim() || 'ثبت چک در دفتر چک',
      status: 'pending',
    });

    // Record automatic accounting entry for cheque issuance/receipt
    if (cType === 'issued') {
      await recordJournalVoucher({
        date: new Date(),
        description: `صدور چک پرداختی #${cNumber.trim()} در وجه ${person?.name || ''}`,
        type: 'auto_cheque',
        lines: [
          {
            accountCode: '201',
            accountName: 'حساب‌های پرداختنی (تأمین‌کنندگان و پرسنل)',
            personId: person?.id,
            personName: person?.name,
            debit: amount,
            credit: 0,
            description: `تحویل چک #${cNumber.trim()}`,
          },
          {
            accountCode: '202',
            accountName: 'اسناد پرداختنی (چک‌های صادره)',
            personId: person?.id,
            personName: person?.name,
            debit: 0,
            credit: amount,
            description: `چک سررسید ${format(dueDate, 'yyyy/MM/dd')}`,
          },
        ],
      });
    } else {
      await recordJournalVoucher({
        date: new Date(),
        description: `دریافت چک #${cNumber.trim()} از ${person?.name || ''}`,
        type: 'auto_cheque',
        lines: [
          {
            accountCode: '104',
            accountName: 'اسناد دریافتنی (چک‌های مشتریان)',
            personId: person?.id,
            personName: person?.name,
            debit: amount,
            credit: 0,
            description: `دریافت چک #${cNumber.trim()}`,
          },
          {
            accountCode: '103',
            accountName: 'حساب‌های دریافتنی (مشتریان و نسیه)',
            personId: person?.id,
            personName: person?.name,
            debit: 0,
            credit: amount,
            description: `بابت تسویه حساب ${person?.name || ''}`,
          },
        ],
      });
    }

    setCNumber('');
    setCAmount('');
    setCDesc('');
    showToast(`چک شماره ${cNumber.trim()} در دفتر چک ثبت و سند حسابداری آن صادر شد.`);
  };

  const handleClearCheque = async (cheque: Cheque) => {
    if (!cheque.id) return;
    await db.cheques.update(cheque.id, {
      status: 'cleared',
      clearedAt: new Date(),
    });

    if (cheque.type === 'issued') {
      await recordJournalVoucher({
        date: new Date(),
        description: `پاس شدن چک پرداختی #${cheque.chequeNumber} از ${cheque.bankName}`,
        type: 'auto_cheque',
        bankId: cheque.bankId,
        bankName: cheque.bankName,
        lines: [
          {
            accountCode: '202',
            accountName: 'اسناد پرداختنی (چک‌های صادره)',
            personId: cheque.personId,
            personName: cheque.personName,
            debit: cheque.amount,
            credit: 0,
            description: `پاس شدن چک #${cheque.chequeNumber}`,
          },
          {
            accountCode: '102',
            accountName: 'موجودی بانک‌ها و کارتخوان‌ها',
            debit: 0,
            credit: cheque.amount,
            description: `کسر از ${cheque.bankName}`,
          },
        ],
      });
    } else {
      await recordJournalVoucher({
        date: new Date(),
        description: `وصول چک دریافتی #${cheque.chequeNumber} به ${cheque.bankName}`,
        type: 'auto_cheque',
        bankId: cheque.bankId,
        bankName: cheque.bankName,
        lines: [
          {
            accountCode: '102',
            accountName: 'موجودی بانک‌ها و کارتخوان‌ها',
            debit: cheque.amount,
            credit: 0,
            description: `واریز به ${cheque.bankName}`,
          },
          {
            accountCode: '104',
            accountName: 'اسناد دریافتنی (چک‌های مشتریان)',
            personId: cheque.personId,
            personName: cheque.personName,
            debit: 0,
            credit: cheque.amount,
            description: `وصول چک #${cheque.chequeNumber}`,
          },
        ],
      });
    }

    showToast(`چک شماره ${cheque.chequeNumber} پاس شد و از موجودی بانک کسر/به بانک واریز گردید.`);
  };

  const roleBadgeLabel = (r: PersonRole) => {
    if (r === 'staff') return 'پرسنل رستوران';
    if (r === 'supplier') return 'تأمین‌کننده مواد';
    return 'مشتری';
  };

  return (
    <div className="space-y-6">
      {/* Section Switcher */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSection('persons')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              section === 'persons'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Users size={15} />
            <span>۱. تعریف اشخاص، پرسنل و صورتحساب (کاردکس)</span>
          </button>
          <button
            type="button"
            onClick={() => setSection('cheques')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              section === 'cheques'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <CreditCard size={15} />
            <span>۲. دفتر چک و هشدار سررسید ({cheques.length})</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
          <CheckCircle2 size={16} />
          <span>{feedback}</span>
        </div>
      )}

      {/* SECTION 1: Persons Definition, Management & Standard Accounting Ledger */}
      {section === 'persons' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Register Person Form */}
          <form
            onSubmit={handleAddPerson}
            className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4 h-fit shadow-2xs"
          >
            <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-2.5 flex items-center gap-2">
              <UserPlus size={18} className="text-blue-600" />
              <span>تعریف شخص جدید (پرسنل / تأمین‌کننده / مشتری)</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">نام و نام خانوادگی / شرکت *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: محمد امینی (پرسنل آشپزخانه)"
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">عنوان / نقش شخص</label>
                <select
                  value={pRole}
                  onChange={(e) => setPRole(e.target.value as PersonRole)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold text-slate-800"
                >
                  <option value="staff">پرسنل (آشپز، صندوقدار، پیک، سالن‌دار)</option>
                  <option value="supplier">تأمین‌کننده (فروشنده گوشت، مرغ و مواد اولیه)</option>
                  <option value="customer">مشتری (اعتباری / شرکتی / طرف‌حساب)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">شماره تماس</label>
                  <input
                    type="text"
                    placeholder="0912..."
                    value={pPhone}
                    onChange={(e) => setPPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-left"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">کد اختصاصی / پرسنلی</label>
                  <input
                    type="text"
                    placeholder="مثال: 104"
                    value={pCode}
                    onChange={(e) => setPCode(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-left"
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">توضیحات / شماره کارت بانک</label>
                <input
                  type="text"
                  placeholder="شماره شبای بانک یا توضیحات نحوه تسویه..."
                  value={pDesc}
                  onChange={(e) => setPDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus size={15} />
              <span>ثبت شخص در حسابداری</span>
            </button>
          </form>

          {/* Persons List & Standard Ledger Modal Trigger */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden space-y-3 shadow-2xs">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <UserCheck size={16} className="text-emerald-700" />
                  <span>فهرست اشخاص، پرسنل و مانده حساب تفصیلی ({filteredPersons.length})</span>
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-48">
                  <Search size={14} className="absolute right-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="جستجوی نام/تلفن..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pr-8 pl-3 py-1.5 border border-slate-300 rounded-xl text-xs"
                  />
                </div>
                <div className="flex gap-1">
                  {[
                    { id: 'all', label: 'همه' },
                    { id: 'staff', label: 'پرسنل' },
                    { id: 'supplier', label: 'تأمین‌کننده' },
                    { id: 'customer', label: 'مشتری' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setRoleFilter(f.id as any)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                        roleFilter === f.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-slate-600 border border-slate-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-3 px-4">نام و کد شخص</th>
                    <th className="py-3 px-4">نقش</th>
                    <th className="py-3 px-4">گردش بدهکار</th>
                    <th className="py-3 px-4">گردش بستانکار</th>
                    <th className="py-3 px-4">مانده نهایی و وضعیت</th>
                    <th className="py-3 px-4 text-center">عملیات & صورتحساب</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPersons.map((p) => {
                    const bal = personBalances.get(p.id!) || {
                      totalDebit: 0,
                      totalCredit: 0,
                      netBalance: 0,
                      lines: [],
                    };
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4">
                          <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                            <span>{p.name}</span>
                            {p.code && (
                              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] rounded font-mono">
                                #{p.code}
                              </span>
                            )}
                          </div>
                          {p.phone && (
                            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5" dir="ltr">
                              <Phone size={10} />
                              <span>{p.phone}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-700">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                              p.role === 'staff'
                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                : p.role === 'supplier'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            {roleBadgeLabel(p.role)}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-blue-700 font-semibold">
                          {formatCurrency(bal.totalDebit)}
                        </td>
                        <td className="py-3 px-4 font-mono text-rose-700 font-semibold">
                          {formatCurrency(bal.totalCredit)}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold">
                          {bal.netBalance === 0 ? (
                            <span className="text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md text-[11px]">
                              تسویه (۰)
                            </span>
                          ) : bal.netBalance > 0 ? (
                            <span className="text-blue-700 font-black">
                              {formatCurrency(bal.netBalance)} (بدهکار)
                            </span>
                          ) : (
                            <span className="text-rose-700 font-black">
                              {formatCurrency(Math.abs(bal.netBalance))} (بستانکار)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setSelectedPersonForLedger(p)}
                              className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-bold inline-flex items-center gap-1 text-[11px]"
                              title="مشاهده صورتحساب و کاردکس تفصیلی"
                            >
                              <FileText size={13} />
                              <span>صورتحساب</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingPerson({ ...p })}
                              className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100"
                              title="ویرایش مشخصات"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePerson(p)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100"
                              title="حذف شخص"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredPersons.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-semibold">
                        هیچ شخصی با مشخصات وارد شده یافت نشد.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: Cheque Book & Due-Date Alerts */}
      {section === 'cheques' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Register Cheque Form */}
          <form
            onSubmit={handleAddCheque}
            className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4 h-fit shadow-2xs"
          >
            <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-2">
              ثبت چک جدید (پرداختی یا دریافتی)
            </h3>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setCType('issued')}
                  className={`py-2 rounded-lg font-bold ${
                    cType === 'issued' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  چک پرداختی ما
                </button>
                <button
                  type="button"
                  onClick={() => setCType('received')}
                  className={`py-2 rounded-lg font-bold ${
                    cType === 'received' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  چک دریافتی از مشتری
                </button>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  شماره صیادی / سریال چک
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: 14030988776655"
                  value={cNumber}
                  onChange={(e) => setCNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-left"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  مبلغ چک ({getCurrencyLabel()})
                </label>
                <FormattedNumberInput
                  required
                  placeholder="مثلاً 15,000,000"
                  value={cAmount}
                  onValueChange={(val) => setCAmount(String(val))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold text-left"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">زمان سررسید چک</label>
                  <select
                    value={cDaysUntilDue}
                    onChange={(e) => setCDaysUntilDue(e.target.value)}
                    className="w-full px-2 py-2 border border-slate-300 rounded-xl bg-white font-bold"
                  >
                    <option value="0">سررسید امروز (هشدار فوری)</option>
                    <option value="1">فردا (۱ روز دیگر)</option>
                    <option value="3">۳ روز دیگر</option>
                    <option value="7">۱ هفته دیگر</option>
                    <option value="15">۱۵ روز دیگر</option>
                    <option value="30">۱ ماه دیگر</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">بانک مربوطه</label>
                  <select
                    value={cBankId || banks[0]?.id || ''}
                    onChange={(e) => setCBankId(Number(e.target.value))}
                    className="w-full px-2 py-2 border border-slate-300 rounded-xl bg-white"
                  >
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bankName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">شخص طرف حساب چک</label>
                <select
                  value={cPersonId || persons[0]?.id || ''}
                  onChange={(e) => setCPersonId(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold"
                >
                  {persons.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">بابت / شرح چک</label>
                <input
                  type="text"
                  placeholder="مثال: بابت خرید گوشت یا اجاره..."
                  value={cDesc}
                  onChange={(e) => setCDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shadow-xs cursor-pointer"
            >
              ثبت چک در دفتر چک و صدور سند
            </button>
          </form>

          {/* Cheque Book Table with Due Date Alert Badges */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-sm font-extrabold text-slate-900">
                دفتر چک و هشدار هوشمند سررسید
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3">شماره صیادی</th>
                    <th className="py-3 px-3">نوع</th>
                    <th className="py-3 px-3">شخص / بانک</th>
                    <th className="py-3 px-3">مبلغ</th>
                    <th className="py-3 px-3">تاریخ سررسید و هشدار</th>
                    <th className="py-3 px-3 text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cheques.map((ch) => {
                    const { urgency, daysRemaining } = classifyChequeDueStatus(ch, new Date());
                    return (
                      <tr key={ch.id} className="hover:bg-slate-50">
                        <td className="py-3 px-3 font-mono font-bold text-slate-800" dir="ltr">
                          {ch.chequeNumber}
                        </td>
                        <td className="py-3 px-3 font-bold">
                          <span
                            className={
                              ch.type === 'issued' ? 'text-rose-700' : 'text-emerald-700'
                            }
                          >
                            {ch.type === 'issued' ? 'پرداختی' : 'دریافتی'}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-800">{ch.personName}</div>
                          <div className="text-[10px] text-slate-500">{ch.bankName}</div>
                        </td>
                        <td className="py-3 px-3 font-mono font-extrabold text-slate-900">
                          {formatCurrency(ch.amount)}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-mono text-[11px]" dir="ltr">
                            {format(new Date(ch.dueDate), 'yyyy/MM/dd')}
                          </div>
                          {ch.status === 'cleared' ? (
                            <span className="text-emerald-700 font-bold text-[11px]">
                              ✅ پاس شده
                            </span>
                          ) : urgency === 'due_today' ? (
                            <span className="text-rose-600 font-extrabold text-[11px] flex items-center gap-1">
                              <AlertTriangle size={12} /> سررسید امروز!
                            </span>
                          ) : urgency === 'overdue' ? (
                            <span className="text-red-700 font-extrabold text-[11px]">
                              ⚠️ سررسید گذشته ({Math.abs(daysRemaining)} روز)
                            </span>
                          ) : (
                            <span className="text-amber-700 font-semibold text-[11px]">
                              ⏳ {daysRemaining} روز تا سررسید
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {ch.status === 'pending' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleClearCheque(ch)}
                                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px]"
                                >
                                  پاس کردن
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!ch.id) return;
                                    if (confirm(`آیا از برگشت خوردن چک شماره ${ch.chequeNumber} اطمینان دارید؟`)) {
                                      await db.cheques.update(ch.id, { status: 'bounced' });
                                      // Record reversal / bounce journal entry
                                      await recordJournalVoucher({
                                        date: new Date(),
                                        description: `برگشت خوردن چک #${ch.chequeNumber} (${ch.personName})`,
                                        type: 'auto_cheque',
                                        lines: [
                                          {
                                            accountCode: '103',
                                            accountName: 'حساب‌های دریافتنی (مشتریان و نسیه)',
                                            personId: ch.personId,
                                            personName: ch.personName,
                                            debit: ch.amount,
                                            credit: 0,
                                            description: `برگشت چک #${ch.chequeNumber}`,
                                          },
                                          {
                                            accountCode: '104',
                                            accountName: 'اسناد دریافتنی (چک‌های مشتریان)',
                                            personId: ch.personId,
                                            personName: ch.personName,
                                            debit: 0,
                                            credit: ch.amount,
                                            description: `برگشت چک صیادی`,
                                          },
                                        ],
                                      });
                                      showToast(`چک شماره ${ch.chequeNumber} برگشت خورد و سند حسابداری آن صادر شد.`);
                                    }
                                  }}
                                  className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-[11px]"
                                >
                                  برگشت چک
                                </button>
                              </>
                            ) : ch.status === 'cleared' ? (
                              <span className="text-emerald-700 font-bold text-[11px]">✅ پاس شده</span>
                            ) : ch.status === 'bounced' ? (
                              <span className="text-rose-700 font-extrabold text-[11px]">⚠️ برگشت خورده</span>
                            ) : (
                              <span className="text-slate-400">لغو شده</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* EDIT PERSON MODAL */}
      {editingPerson && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">
                ویرایش مشخصات: {editingPerson.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingPerson(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleUpdatePerson} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">نام و نام خانوادگی</label>
                <input
                  type="text"
                  required
                  value={editingPerson.name}
                  onChange={(e) => setEditingPerson({ ...editingPerson, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">نقش / گروه</label>
                <select
                  value={editingPerson.role}
                  onChange={(e) =>
                    setEditingPerson({ ...editingPerson, role: e.target.value as PersonRole })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold"
                >
                  <option value="staff">پرسنل (آشپز، صندوقدار، پیک، سالن‌دار)</option>
                  <option value="supplier">تأمین‌کننده مواد اولیه</option>
                  <option value="customer">مشتری اعتباری</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">شماره تماس</label>
                <input
                  type="text"
                  value={editingPerson.phone || ''}
                  onChange={(e) => setEditingPerson({ ...editingPerson, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-left"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">کد اختصاصی</label>
                <input
                  type="text"
                  value={editingPerson.code || ''}
                  onChange={(e) => setEditingPerson({ ...editingPerson, code: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-left"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">توضیحات</label>
                <input
                  type="text"
                  value={editingPerson.description || ''}
                  onChange={(e) =>
                    setEditingPerson({ ...editingPerson, description: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-blue-600 text-white font-bold rounded-xl"
                >
                  ذخیره تغییرات
                </button>
                <button
                  type="button"
                  onClick={() => setEditingPerson(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl"
                >
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Standard Accounting Person Statement Modal (صورتحساب استاندارد حسابداری اشخاص و پرسنل) */}
      {selectedPersonForLedger && selectedPersonLedger && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-2xl max-w-5xl w-full p-4 sm:p-6 shadow-xl border border-slate-200 flex flex-col max-h-[92vh]">
            <div className="flex justify-between items-center pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <FileText className="text-blue-600" size={20} />
                  <span>صورتحساب و کاردکس تفصیلی: {selectedPersonForLedger.name}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  عنوان: {roleBadgeLabel(selectedPersonForLedger.role)}{' '}
                  {selectedPersonForLedger.phone ? `· تلفن: ${selectedPersonForLedger.phone}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs flex items-center gap-1"
                >
                  <Printer size={14} />
                  <span>چاپ</span>
                </button>
                <button
                  type="button"
                  aria-label="بستن صورتحساب"
                  onClick={() => setSelectedPersonForLedger(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl border border-slate-200"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Date Range Filter Bar inside Modal */}
            <div className="my-3 p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <Calendar size={14} className="text-slate-500" />
                <span className="font-bold text-slate-700">فیلتر بازه زمانی:</span>
                {[
                  { id: 'all', label: 'کل دوره' },
                  { id: '30days', label: '۳۰ روز اخیر' },
                  { id: 'thisMonth', label: 'ماه جاری' },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setDateRangePreset(p.id as any)}
                    className={`px-2.5 py-1 rounded-lg font-bold ${
                      dateRangePreset === p.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-slate-600 border border-slate-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <label className="font-semibold text-slate-600">از:</label>
                <input
                  type="date"
                  value={customFromDate}
                  onChange={(e) => {
                    setDateRangePreset('all');
                    setCustomFromDate(e.target.value);
                  }}
                  className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs"
                />
                <label className="font-semibold text-slate-600">تا:</label>
                <input
                  type="date"
                  value={customToDate}
                  onChange={(e) => {
                    setDateRangePreset('all');
                    setCustomToDate(e.target.value);
                  }}
                  className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl text-xs">
                <span className="text-slate-500 font-bold block mb-0.5">جمع بدهکار (پرداختی/خرید)</span>
                <span className="text-sm font-mono font-black text-blue-800">
                  {formatCurrency(selectedPersonLedger.totalDebit)}
                </span>
              </div>
              <div className="p-3 bg-rose-50/80 border border-rose-200 rounded-xl text-xs">
                <span className="text-slate-500 font-bold block mb-0.5">جمع بستانکار (دریافتی/فروش)</span>
                <span className="text-sm font-mono font-black text-rose-800">
                  {formatCurrency(selectedPersonLedger.totalCredit)}
                </span>
              </div>
              <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-xs">
                <span className="text-slate-500 font-bold block mb-0.5">مانده نهایی حساب</span>
                <span className="text-sm font-mono font-black text-slate-900">
                  {selectedPersonLedger.overallNetBalance === 0 ? (
                    <span className="text-emerald-700">تسویه (۰)</span>
                  ) : selectedPersonLedger.overallNetBalance > 0 ? (
                    <span className="text-blue-700">
                      {formatCurrency(selectedPersonLedger.overallNetBalance)} (بدهکار به ما)
                    </span>
                  ) : (
                    <span className="text-rose-700">
                      {formatCurrency(Math.abs(selectedPersonLedger.overallNetBalance))} (بستانکار/طلبکار از ما)
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Ledger Transactions Table */}
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-3 px-3">تاریخ</th>
                    <th className="py-3 px-3">شماره سند</th>
                    <th className="py-3 px-3">سرفصل حساب</th>
                    <th className="py-3 px-3">شرح آرتیکل / عملیات</th>
                    <th className="py-3 px-3">بدهکار</th>
                    <th className="py-3 px-3">بستانکار</th>
                    <th className="py-3 px-3">مانده خط</th>
                    <th className="py-3 px-3">وضعیت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedPersonLedger.filteredLines.map((line, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono text-[11px]" dir="ltr">
                        {format(new Date(line.date), 'yyyy/MM/dd')}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        #{line.voucherNumber}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-700">
                        {line.accountName}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800">{line.description}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                        {line.debit > 0 ? formatCurrency(line.debit) : '-'}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-rose-700">
                        {line.credit > 0 ? formatCurrency(line.credit) : '-'}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-black text-slate-900">
                        {formatCurrency(Math.abs(line.runningBalance))}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-[11px]">
                        {line.runningBalance === 0 ? (
                          <span className="text-emerald-700">بی‌حساب</span>
                        ) : line.runningBalance > 0 ? (
                          <span className="text-blue-700">بدهکار</span>
                        ) : (
                          <span className="text-rose-700">بستانکار</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {selectedPersonLedger.filteredLines.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 font-semibold">
                        هیچ تراکنش یا گردش حسابی در این بازه زمانی یافت نشد.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-3">
              <button
                type="button"
                onClick={() => setSelectedPersonForLedger(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
              >
                بستن صورتحساب
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

