import React, { useState, useMemo, useEffect } from 'react';
import {
  Person,
  PersonRole,
  Cheque,
  BankAccount,
  JournalVoucher,
  db,
  recordJournalVoucher,
  deleteJournalVoucherAndSyncBanks,
  syncStaffMonthlySalaries,
  calculateStaffSalaryPeriods,
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
  Save,
  Wallet,
  Sparkles,
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
  const [editingCheque, setEditingCheque] = useState<Cheque | null>(null);
  const [quickCreditPerson, setQuickCreditPerson] = useState<Person | null>(null);
  const [quickTxMode, setQuickTxMode] = useState<'credit_accrual' | 'payment'>('credit_accrual');
  const [quickTxAmount, setQuickTxAmount] = useState<number>(0);
  const [quickTxBankId, setQuickTxBankId] = useState<number>(banks[0]?.id || 0);
  const [quickTxDesc, setQuickTxDesc] = useState<string>('');
  const [feedback, setFeedback] = useState('');

  // Date Range for Ledger/Statement
  const [dateRangePreset, setDateRangePreset] = useState<'all' | '30days' | 'thisMonth'>('all');
  const [customFromDate, setCustomFromDate] = useState('');
  const [customToDate, setCustomToDate] = useState('');

  // New Person Form
  const [pName, setPName] = useState('');
  const [pRole, setPRole] = useState<PersonRole>('staff');
  const [pPhone, setPPhone] = useState('');
  const [pCode, setPCode] = useState('');
  const [pDesc, setPDesc] = useState('');
  const [pMonthlySalary, setPMonthlySalary] = useState<number>(0);
  const [pEmploymentStartDate, setPEmploymentStartDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [pAccrueAtStart, setPAccrueAtStart] = useState<boolean>(true);
  const [pInitCreditAmount, setPInitCreditAmount] = useState<number>(0);

  // Automatically sync staff monthly salaries on mount or when persons change
  useEffect(() => {
    syncStaffMonthlySalaries();
  }, [persons.length]);

  const setStartDateMonthsAgo = (monthsAgo: number, isEditMode: boolean = false) => {
    const d = new Date();
    d.setMonth(d.getMonth() - monthsAgo);
    const iso = d.toISOString().split('T')[0];
    if (isEditMode && editingPerson) {
      setEditingPerson({ ...editingPerson, employmentStartDate: new Date(iso) });
    } else {
      setPEmploymentStartDate(iso);
    }
  };

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
          voucherId?: number;
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
            voucherId: v.id,
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
    const startDate = pEmploymentStartDate ? new Date(pEmploymentStartDate) : new Date();
    const salary = pRole === 'staff' ? Math.max(0, Math.round(Number(pMonthlySalary) || 0)) : 0;

    const newPersonId = await db.persons.add({
      name: pName.trim(),
      role: pRole,
      phone: pPhone.trim(),
      code: pCode.trim() || undefined,
      description: pDesc.trim(),
      initialBalance: 0,
      monthlySalary: salary > 0 ? salary : undefined,
      employmentStartDate: pRole === 'staff' ? startDate : undefined,
      accrueCurrentMonthImmediately: pAccrueAtStart,
      createdAt: new Date(),
    });

    // If an additional initial credit (طلب اول دوره) was entered for supplier/staff
    const initCredit = Math.max(0, Math.round(Number(pInitCreditAmount) || 0));
    if (initCredit > 0) {
      await recordJournalVoucher({
        date: startDate,
        description: `ثبت طلب اول دوره / کارکرد قبلی - ${pName.trim()}`,
        type: 'manual',
        referenceId: Number(newPersonId),
        lines: [
          {
            accountCode: pRole === 'staff' ? '601' : '301',
            accountName:
              pRole === 'staff' ? 'هزینه حقوق و دستمزد پرسنل' : 'سرمایه اولیه و موجودی اول دوره',
            debit: initCredit,
            credit: 0,
            description: `شناسایی طلب اولیه ${pName.trim()}`,
          },
          {
            accountCode: '201',
            accountName: 'حساب‌های پرداختنی (تأمین‌کنندگان و پرسنل)',
            personId: Number(newPersonId),
            personName: pName.trim(),
            debit: 0,
            credit: initCredit,
            description: `طلب اول دوره ${pName.trim()}`,
          },
        ],
      });
    }

    // Automatically generate monthly salary credit vouchers from employmentStartDate up to now
    const accruedCount = await syncStaffMonthlySalaries();

    setPName('');
    setPPhone('');
    setPCode('');
    setPDesc('');
    setPMonthlySalary(0);
    setPInitCreditAmount(0);
    showToast(
      salary > 0
        ? `پرسنل «${pName.trim()}» با حقوق ماهیانه ${formatCurrency(salary)} ثبت شد و ${accruedCount} سند طلب حقوق ماهانه اتوماتیک صادر گردید.`
        : `شخص «${pName.trim()}» با موفقیت در سیستم حسابداری ثبت شد.`
    );
  };

  const handleUpdatePerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPerson || !editingPerson.id) return;
    const salary =
      editingPerson.role === 'staff'
        ? Math.max(0, Math.round(Number(editingPerson.monthlySalary) || 0))
        : 0;
    const startDate = editingPerson.employmentStartDate
      ? new Date(editingPerson.employmentStartDate)
      : editingPerson.createdAt || new Date();

    await db.persons.update(editingPerson.id, {
      name: editingPerson.name.trim(),
      role: editingPerson.role,
      phone: editingPerson.phone?.trim() || '',
      code: editingPerson.code?.trim() || '',
      description: editingPerson.description?.trim() || '',
      monthlySalary: salary > 0 ? salary : undefined,
      employmentStartDate: editingPerson.role === 'staff' ? startDate : undefined,
      accrueCurrentMonthImmediately: editingPerson.accrueCurrentMonthImmediately !== false,
    });

    // Re-sync monthly salary vouchers so any updated salary or start date takes effect immediately
    await syncStaffMonthlySalaries();

    showToast(
      `اطلاعات «${editingPerson.name}» به‌روزرسانی شد و اسناد حقوق ماهیانه اتوماتیک همگام‌سازی گردید.`
    );
    setEditingPerson(null);
  };

  const handleQuickPersonTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCreditPerson || !quickCreditPerson.id) return;
    const amt = Math.max(1, Math.round(Number(quickTxAmount) || 0));
    if (amt <= 0) return;

    if (quickTxMode === 'credit_accrual') {
      const desc =
        quickTxDesc.trim() ||
        (quickCreditPerson.role === 'staff'
          ? `ثبت طلب حقوق / کارکرد و پاداش - ${quickCreditPerson.name}`
          : `ثبت طلب بابت خرید یا خدمات - ${quickCreditPerson.name}`);
      await recordJournalVoucher({
        date: new Date(),
        description: desc,
        type: 'auto_expense',
        referenceId: quickCreditPerson.id,
        lines: [
          {
            accountCode: quickCreditPerson.role === 'staff' ? '601' : '609',
            accountName:
              quickCreditPerson.role === 'staff'
                ? 'هزینه حقوق و دستمزد پرسنل'
                : 'سایر هزینه‌های عمومی و تنخواه',
            debit: amt,
            credit: 0,
            description: desc,
          },
          {
            accountCode: '201',
            accountName: 'حساب‌های پرداختنی (تأمین‌کنندگان و پرسنل)',
            personId: quickCreditPerson.id,
            personName: quickCreditPerson.name,
            debit: 0,
            credit: amt,
            description: `ثبت طلب (بستانکار) برای ${quickCreditPerson.name}`,
          },
        ],
      });
      showToast(
        `مبلغ ${formatCurrency(amt)} به عنوان طلب (بستانکار) در حساب «${quickCreditPerson.name}» ثبت شد.`
      );
    } else {
      const selectedBank = banks.find((b) => b.id === Number(quickTxBankId)) || banks[0];
      const desc =
        quickTxDesc.trim() ||
        `پرداخت حقوق / تسویه حساب به ${quickCreditPerson.name} از ${selectedBank?.bankName || 'بانک'}`;
      await recordJournalVoucher({
        date: new Date(),
        description: desc,
        type: 'auto_payment',
        bankId: selectedBank?.id,
        bankName: selectedBank?.bankName,
        lines: [
          {
            accountCode: '201',
            accountName: 'حساب‌های پرداختنی (تأمین‌کنندگان و پرسنل)',
            personId: quickCreditPerson.id,
            personName: quickCreditPerson.name,
            debit: amt,
            credit: 0,
            description: `پرداخت وجه به ${quickCreditPerson.name}`,
          },
          {
            accountCode: '102',
            accountName: 'موجودی بانک‌ها و کارتخوان‌ها',
            debit: 0,
            credit: amt,
            description: `کسر از ${selectedBank?.bankName || 'بانک'}`,
          },
        ],
      });
      showToast(
        `مبلغ ${formatCurrency(amt)} پرداخت شد و از طلب «${quickCreditPerson.name}» کسر گردید.`
      );
    }

    setQuickCreditPerson(null);
    setQuickTxAmount(0);
    setQuickTxDesc('');
  };

  const handleDeletePerson = async (person: Person) => {
    if (!person.id) return;
    const relatedVouchers = vouchers.filter((v) => v.lines.some((l) => l.personId === person.id));
    if (relatedVouchers.length > 0) {
      if (
        !confirm(
          `شخص «${person.name}» دارای ${relatedVouchers.length} سند حسابداری است.\nآیا مطمئن هستید که می‌خواهید این شخص و اسناد مرتبط با او را حذف کنید؟`
        )
      ) {
        return;
      }
      for (const rv of relatedVouchers) {
        if (rv.id) {
          await deleteJournalVoucherAndSyncBanks(rv.id);
        }
      }
    } else {
      if (!confirm(`آیا از حذف شخص «${person.name}» اطمینان دارید؟`)) return;
    }
    await db.persons.delete(person.id);
    showToast(`شخص «${person.name}» با موفقیت حذف گردید.`);
  };

  const handleUpdateCheque = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCheque || !editingCheque.id) return;
    const bank = banks.find((b) => b.id === Number(editingCheque.bankId));
    const person = persons.find((p) => p.id === Number(editingCheque.personId));

    await db.cheques.update(editingCheque.id, {
      chequeNumber: editingCheque.chequeNumber.trim(),
      type: editingCheque.type,
      amount: Math.max(0, Number(editingCheque.amount) || 0),
      dueDate: new Date(editingCheque.dueDate),
      bankId: bank?.id || editingCheque.bankId,
      bankName: bank?.bankName || editingCheque.bankName,
      personId: person?.id || editingCheque.personId,
      personName: person?.name || editingCheque.personName,
      description: editingCheque.description || '',
      status: editingCheque.status,
    });
    showToast(`اطلاعات چک شماره ${editingCheque.chequeNumber} با موفقیت ویرایش شد.`);
    setEditingCheque(null);
  };

  const handleDeleteCheque = async (ch: Cheque) => {
    if (!ch.id) return;
    if (
      !confirm(
        `آیا از حذف چک شماره «${ch.chequeNumber}» به مبلغ ${formatCurrency(ch.amount)} و اسناد حسابداری مرتبط با آن اطمینان دارید؟`
      )
    ) {
      return;
    }

    // Delete any journal vouchers referencing this cheque number
    const relatedVouchers = vouchers.filter(
      (v) => v.type === 'auto_cheque' && v.description.includes(ch.chequeNumber)
    );
    for (const rv of relatedVouchers) {
      if (rv.id) {
        await deleteJournalVoucherAndSyncBanks(rv.id);
      }
    }

    await db.cheques.delete(ch.id);
    showToast(`چک شماره ${ch.chequeNumber} و اسناد مرتبط با آن حذف شد.`);
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

              {pRole === 'staff' && (
                <div className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-xl space-y-3">
                  <div className="font-extrabold text-purple-900 flex items-center gap-1.5 text-xs">
                    <Sparkles size={14} className="text-purple-600" />
                    <span>تنظیم حقوق ماهیانه و صدور خودکار سند طلب هر ماه</span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      مبلغ حقوق ماهیانه توافقی ({getCurrencyLabel()})
                    </label>
                    <FormattedNumberInput
                      placeholder="مثلاً 10,000,000"
                      value={pMonthlySalary || ''}
                      onValueChange={(val) => setPMonthlySalary(val)}
                      className="w-full px-3 py-2 border border-purple-300 bg-white rounded-xl font-mono font-bold text-left"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block font-bold text-slate-700">
                        تاریخ روز اول کاری (شروع به کار)
                      </label>
                      <div className="flex gap-1">
                        {[
                          { label: 'امروز', m: 0 },
                          { label: '۱ ماه قبل', m: 1 },
                          { label: '۲ ماه قبل', m: 2 },
                          { label: '۳ ماه قبل', m: 3 },
                        ].map((btn) => (
                          <button
                            key={btn.m}
                            type="button"
                            onClick={() => setStartDateMonthsAgo(btn.m, false)}
                            className="px-1.5 py-0.5 bg-white hover:bg-purple-100 text-purple-700 border border-purple-200 rounded text-[10px] font-bold cursor-pointer"
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      type="date"
                      value={pEmploymentStartDate}
                      onChange={(e) => setPEmploymentStartDate(e.target.value)}
                      className="w-full px-3 py-2 border border-purple-300 bg-white rounded-xl font-mono text-left"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pAccrueAtStart}
                      onChange={(e) => setPAccrueAtStart(e.target.checked)}
                      className="rounded text-purple-600 focus:ring-purple-500"
                    />
                    <span>ثبت اتوماتیک طلب حقوق در ابتدای هر ماه کاری (شامل ماه اول/جاری)</span>
                  </label>

                  {pMonthlySalary > 0 && (
                    <div className="p-2 bg-white/90 border border-purple-200 rounded-lg text-[11px] text-purple-900 leading-relaxed">
                      {(() => {
                        const periods = calculateStaffSalaryPeriods(
                          pEmploymentStartDate || new Date(),
                          pAccrueAtStart
                        );
                        const totalAccrued = periods.length * pMonthlySalary;
                        return (
                          <span>
                            ✅ بر اساس تاریخ شروع به کار، <strong>{periods.length} دوره ماهانه</strong> (جمعاً{' '}
                            <strong className="font-mono">{formatCurrency(totalAccrued)}</strong> طلب بستانکار) به صورت اتوماتیک در حساب این پرسنل سند می‌خورد و هر ماه بعد نیز خودکار شارژ می‌شود.
                          </span>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  ثبت طلب اول دوره / مانده طلب قبلی ({getCurrencyLabel()} - اختیاری)
                </label>
                <FormattedNumberInput
                  placeholder="0 (در صورت داشتن طلب از قبل وارد کنید)"
                  value={pInitCreditAmount || ''}
                  onValueChange={(val) => setPInitCreditAmount(val)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-left"
                />
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
              <span>ثبت شخص و صدور خودکار سند طلب</span>
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
                    <th className="py-3 px-4">نام و مشخصات حقوق / قرارداد</th>
                    <th className="py-3 px-4">نقش</th>
                    <th className="py-3 px-4">گردش بدهکار (دریافتی)</th>
                    <th className="py-3 px-4">گردش بستانکار (طلب)</th>
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
                          {p.role === 'staff' && p.monthlySalary && p.monthlySalary > 0 ? (
                            <div className="mt-1 inline-flex flex-wrap items-center gap-1.5 px-2 py-0.5 bg-purple-50 text-purple-800 border border-purple-200 rounded-md text-[10px] font-bold">
                              <span>حقوق ماهانه: {formatCurrency(p.monthlySalary)}</span>
                              {p.employmentStartDate && (
                                <span className="text-purple-600">
                                  · شروع کار: {format(new Date(p.employmentStartDate), 'yyyy/MM/dd')}
                                </span>
                              )}
                            </div>
                          ) : null}
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
                              {formatCurrency(bal.netBalance)} (بدهکار به ما)
                            </span>
                          ) : (
                            <span className="text-rose-700 font-black">
                              {formatCurrency(Math.abs(bal.netBalance))} (بستانکار / طلبکار)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setQuickCreditPerson(p);
                                setQuickTxMode('credit_accrual');
                                setQuickTxAmount(p.monthlySalary || 0);
                                setQuickTxDesc('');
                              }}
                              className="px-2 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg font-bold inline-flex items-center gap-1 text-[11px] cursor-pointer"
                              title="ثبت سریع طلب (کارکرد/حقوق) یا پرداخت وجه"
                            >
                              <Wallet size={13} />
                              <span>ثبت طلب / پرداخت</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedPersonForLedger(p)}
                              className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-bold inline-flex items-center gap-1 text-[11px] cursor-pointer"
                              title="مشاهده صورتحساب و کاردکس تفصیلی"
                            >
                              <FileText size={13} />
                              <span>صورتحساب</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingPerson({ ...p })}
                              className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 cursor-pointer"
                              title="ویرایش مشخصات و حقوق ماهیانه"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePerson(p)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 cursor-pointer"
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
                            <button
                              type="button"
                              onClick={() => setEditingCheque({ ...ch })}
                              className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 cursor-pointer"
                              title="ویرایش چک"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCheque(ch)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer"
                              title="حذف چک و سند حسابداری"
                            >
                              <Trash2 size={14} />
                            </button>
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
              {editingPerson.role === 'staff' && (
                <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl space-y-2.5">
                  <div className="font-extrabold text-purple-900 text-xs">
                    تنظیمات حقوق ماهیانه و روز اول کاری
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      حقوق ماهیانه توافقی ({getCurrencyLabel()})
                    </label>
                    <FormattedNumberInput
                      value={editingPerson.monthlySalary || ''}
                      onValueChange={(val) =>
                        setEditingPerson({ ...editingPerson, monthlySalary: val })
                      }
                      placeholder="مثلاً 10,000,000"
                      className="w-full px-3 py-2 border border-purple-300 bg-white rounded-xl font-mono font-bold text-left"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block font-bold text-slate-700">
                        تاریخ روز اول کاری (شروع به کار)
                      </label>
                      <div className="flex gap-1">
                        {[
                          { label: 'امروز', m: 0 },
                          { label: '۱ ماه قبل', m: 1 },
                          { label: '۲ ماه قبل', m: 2 },
                          { label: '۳ ماه قبل', m: 3 },
                        ].map((btn) => (
                          <button
                            key={btn.m}
                            type="button"
                            onClick={() => setStartDateMonthsAgo(btn.m, true)}
                            className="px-1.5 py-0.5 bg-white hover:bg-purple-100 text-purple-700 border border-purple-200 rounded text-[10px] font-bold cursor-pointer"
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      type="date"
                      value={
                        editingPerson.employmentStartDate
                          ? new Date(editingPerson.employmentStartDate).toISOString().split('T')[0]
                          : editingPerson.createdAt
                          ? new Date(editingPerson.createdAt).toISOString().split('T')[0]
                          : ''
                      }
                      onChange={(e) =>
                        setEditingPerson({
                          ...editingPerson,
                          employmentStartDate: e.target.value
                            ? new Date(e.target.value)
                            : editingPerson.employmentStartDate,
                        })
                      }
                      className="w-full px-3 py-2 border border-purple-300 bg-white rounded-xl font-mono text-left"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingPerson.accrueCurrentMonthImmediately !== false}
                      onChange={(e) =>
                        setEditingPerson({
                          ...editingPerson,
                          accrueCurrentMonthImmediately: e.target.checked,
                        })
                      }
                      className="rounded text-purple-600 focus:ring-purple-500"
                    />
                    <span>شناسایی اتوماتیک طلب حقوق در ابتدای هر ماه کاری</span>
                  </label>
                </div>
              )}

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
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl cursor-pointer"
                >
                  ذخیره تغییرات و همگام‌سازی حقوق
                </button>
                <button
                  type="button"
                  onClick={() => setEditingPerson(null)}
                  className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK CREDIT / SALARY ACCRUAL OR PAYMENT MODAL */}
      {quickCreditPerson && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">
                ثبت طلب (کارکرد/حقوق) یا پرداخت وجه: {quickCreditPerson.name}
              </h3>
              <button
                type="button"
                onClick={() => setQuickCreditPerson(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleQuickPersonTx} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setQuickTxMode('credit_accrual')}
                  className={`py-2 rounded-lg font-bold cursor-pointer ${
                    quickTxMode === 'credit_accrual'
                      ? 'bg-white text-purple-700 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  ۱. ثبت طلب (بستانکار شدن شخص)
                </button>
                <button
                  type="button"
                  onClick={() => setQuickTxMode('payment')}
                  className={`py-2 rounded-lg font-bold cursor-pointer ${
                    quickTxMode === 'payment'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  ۲. پرداخت وجه (تسویه / مساعده)
                </button>
              </div>

              {quickTxMode === 'credit_accrual' ? (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-[11px] text-purple-900">
                  با ثبت طلب، حساب «{quickCreditPerson.name}» به این مبلغ <strong>بستانکار (طلبکار از ما)</strong> شده و سرفصل هزینه مربوطه بدهکار می‌گردد.
                </div>
              ) : (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900">
                  با ثبت پرداخت، مبلغ از بانک انتخابی کسر شده و حساب «{quickCreditPerson.name}» <strong>بدهکار (تسویه طلب)</strong> می‌گردد.
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  مبلغ ({getCurrencyLabel()}) *
                </label>
                <FormattedNumberInput
                  required
                  value={quickTxAmount || ''}
                  onValueChange={(val) => setQuickTxAmount(val)}
                  placeholder="مثلاً 10,000,000"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold text-left"
                />
              </div>

              {quickTxMode === 'payment' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">پرداخت از حساب بانکی</label>
                  <select
                    value={quickTxBankId || banks[0]?.id || ''}
                    onChange={(e) => setQuickTxBankId(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold"
                  >
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bankName} (موجودی: {formatCurrency(b.currentBalance)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">شرح سند</label>
                <input
                  type="text"
                  placeholder={
                    quickTxMode === 'credit_accrual'
                      ? 'مثال: بابت طلب حقوق ماه جاری یا پاداش...'
                      : 'مثال: پرداخت حقوق یا مساعده...'
                  }
                  value={quickTxDesc}
                  onChange={(e) => setQuickTxDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className={`flex-1 py-2.5 text-white font-bold rounded-xl cursor-pointer ${
                    quickTxMode === 'credit_accrual'
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {quickTxMode === 'credit_accrual'
                    ? 'ثبت طلب و صدور سند دوبل'
                    : 'ثبت پرداخت و کسر از بانک'}
                </button>
                <button
                  type="button"
                  onClick={() => setQuickCreditPerson(null)}
                  className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT CHEQUE MODAL */}
      {editingCheque && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">
                ویرایش چک شماره #{editingCheque.chequeNumber}
              </h3>
              <button
                type="button"
                onClick={() => setEditingCheque(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleUpdateCheque} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">شماره صیادی / سریال</label>
                  <input
                    type="text"
                    required
                    value={editingCheque.chequeNumber}
                    onChange={(e) =>
                      setEditingCheque({ ...editingCheque, chequeNumber: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-left"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">نوع چک</label>
                  <select
                    value={editingCheque.type}
                    onChange={(e) =>
                      setEditingCheque({
                        ...editingCheque,
                        type: e.target.value as 'issued' | 'received',
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold"
                  >
                    <option value="issued">پرداختی ما</option>
                    <option value="received">دریافتی از مشتری</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  مبلغ چک ({getCurrencyLabel()})
                </label>
                <FormattedNumberInput
                  required
                  value={editingCheque.amount}
                  onValueChange={(val) => setEditingCheque({ ...editingCheque, amount: val })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold text-left"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">شخص طرف حساب</label>
                  <select
                    value={editingCheque.personId || ''}
                    onChange={(e) =>
                      setEditingCheque({ ...editingCheque, personId: Number(e.target.value) })
                    }
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
                  <label className="block font-bold text-slate-700 mb-1">بانک مربوطه</label>
                  <select
                    value={editingCheque.bankId || ''}
                    onChange={(e) =>
                      setEditingCheque({ ...editingCheque, bankId: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold"
                  >
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bankName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">وضعیت چک</label>
                  <select
                    value={editingCheque.status}
                    onChange={(e) =>
                      setEditingCheque({
                        ...editingCheque,
                        status: e.target.value as Cheque['status'],
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold"
                  >
                    <option value="pending">در جریان (پاس نشده)</option>
                    <option value="cleared">پاس شده</option>
                    <option value="bounced">برگشت خورده</option>
                    <option value="cancelled">لغو شده</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">تاریخ سررسید</label>
                  <input
                    type="date"
                    value={
                      editingCheque.dueDate
                        ? new Date(editingCheque.dueDate).toISOString().split('T')[0]
                        : ''
                    }
                    onChange={(e) =>
                      setEditingCheque({
                        ...editingCheque,
                        dueDate: e.target.value ? new Date(e.target.value) : editingCheque.dueDate,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-left"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">بابت / شرح</label>
                <input
                  type="text"
                  value={editingCheque.description || ''}
                  onChange={(e) =>
                    setEditingCheque({ ...editingCheque, description: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Save size={15} />
                  <span>ذخیره تغییرات چک</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCheque(null)}
                  className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl cursor-pointer"
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
                    <th className="py-3 px-3 text-center">حذف سند</th>
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
                      <td className="py-2.5 px-3 text-center">
                        {line.voucherId && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (
                                confirm(
                                  `آیا از حذف سند حسابداری #${line.voucherNumber} و اصلاح مانده اطمینان دارید؟`
                                )
                              ) {
                                await deleteJournalVoucherAndSyncBanks(line.voucherId!);
                                showToast(`سند #${line.voucherNumber} حذف شد.`);
                              }
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer"
                            title="حذف این سند حسابداری"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {selectedPersonLedger.filteredLines.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400 font-semibold">
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

