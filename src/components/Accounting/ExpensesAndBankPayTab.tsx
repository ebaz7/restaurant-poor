import React, { useState, useMemo } from 'react';
import {
  Account,
  BankAccount,
  Person,
  JournalVoucher,
  db,
  recordJournalVoucher,
  deleteJournalVoucherAndSyncBanks,
  updateJournalVoucherAndSyncBanks,
} from '../../lib/db';
import { formatCurrency, getCurrencyLabel } from '../../lib/utils';
import { pushToCentralServer } from '../../lib/networkSync';
import FormattedNumberInput from '../Common/FormattedNumberInput';
import AccountAutocompleteSelect from '../Common/AccountAutocompleteSelect';
import { format } from 'date-fns-jalali';
import {
  Building2,
  Send,
  Plus,
  CheckCircle2,
  Receipt,
  FileText,
  Calendar,
  Printer,
  Search,
  PieChart,
  Edit2,
  Trash2,
  X,
  Save,
} from 'lucide-react';

interface Props {
  accounts: Account[];
  banks: BankAccount[];
  persons: Person[];
  vouchers: JournalVoucher[];
}

export default function ExpensesAndBankPayTab({
  accounts,
  banks,
  persons,
  vouchers,
}: Props) {
  const [subMode, setSubMode] = useState<
    'expense' | 'bank_pay' | 'bank_statement' | 'expense_statement' | 'banks'
  >('expense');
  const [feedback, setFeedback] = useState('');
  const currencyLabel = getCurrencyLabel();

  // 1. Simple Restaurant Expense Form
  const expenseAccounts = useMemo(
    () => accounts.filter((a) => a.type === 'expense' || a.code.startsWith('6')),
    [accounts]
  );
  const [expCode, setExpCode] = useState<string>('601');
  const [expAmount, setExpAmount] = useState<number>(0);
  const [expPayFrom, setExpPayFrom] = useState<'bank' | 'cash' | 'credit'>('bank');
  const [expBankId, setExpBankId] = useState<number>(banks[0]?.id || 0);
  const [expPersonId, setExpPersonId] = useState<number>(0);
  const [expPersonLedgerMode, setExpPersonLedgerMode] = useState<'settle_credit' | 'both_accrue_and_pay'>('settle_credit');
  const [expDesc, setExpDesc] = useState<string>('');

  // 2. Fast Bank Payment to Person or Special Account Form
  const [payBankId, setPayBankId] = useState<number>(banks[0]?.id || 0);
  const [payTargetType, setPayTargetType] = useState<'person' | 'account'>('person');
  const [payPersonId, setPayPersonId] = useState<number>(persons[0]?.id || 0);
  const [payAccountCode, setPayAccountCode] = useState<string>('201');
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payDesc, setPayDesc] = useState<string>('');

  // 3. Add New Bank Account Form
  const [newBankName, setNewBankName] = useState('');
  const [newCardNum, setNewCardNum] = useState('');
  const [newInitBalance, setNewInitBalance] = useState<number>(0);
  const [newHasPos, setNewHasPos] = useState<boolean>(true);
  const [newHasChequeBook, setNewHasChequeBook] = useState<boolean>(false);
  const [newChequeSeries, setNewChequeSeries] = useState('');
  const [newChequePages, setNewChequePages] = useState<number>(50);

  // Edit Bank Modal State
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null);
  const [editBankName, setEditBankName] = useState('');
  const [editBankCard, setEditBankCard] = useState('');
  const [editBankInitBal, setEditBankInitBal] = useState<number>(0);
  const [editBankCurrBal, setEditBankCurrBal] = useState<number>(0);
  const [editBankHasPos, setEditBankHasPos] = useState<boolean>(true);
  const [editBankHasCheque, setEditBankHasCheque] = useState<boolean>(false);
  const [editBankChequeSeries, setEditBankChequeSeries] = useState('');
  const [editBankChequePages, setEditBankChequePages] = useState<number>(50);

  // Edit Voucher / Expense / Bank Tx Modal State
  const [editingVoucher, setEditingVoucher] = useState<JournalVoucher | null>(null);
  const [editVoucherAmount, setEditVoucherAmount] = useState<number>(0);
  const [editVoucherDesc, setEditVoucherDesc] = useState<string>('');

  // 4. Bank Statement Filters
  const [selectedBankIdForStatement, setSelectedBankIdForStatement] = useState<number>(
    banks[0]?.id || 0
  );
  const [bankDatePreset, setBankDatePreset] = useState<'all' | '30days' | 'thisMonth'>('all');
  const [bankFromDate, setBankFromDate] = useState('');
  const [bankToDate, setBankToDate] = useState('');

  // 5. Expense Statement Filters
  const [selectedExpenseCategoryCode, setSelectedExpenseCategoryCode] = useState<string>('all');
  const [expDatePreset, setExpDatePreset] = useState<'all' | '30days' | 'thisMonth'>('all');
  const [expFromDate, setExpFromDate] = useState('');
  const [expToDate, setExpToDate] = useState('');

  const showToast = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 4000);
  };

  const openEditBankModal = (bank: BankAccount) => {
    setEditingBank(bank);
    setEditBankName(bank.bankName);
    setEditBankCard(bank.cardNumber);
    setEditBankInitBal(bank.initialBalance || 0);
    setEditBankCurrBal(bank.currentBalance || 0);
    setEditBankHasPos(bank.hasPos !== false);
    setEditBankHasCheque(Boolean(bank.hasChequeBook));
    setEditBankChequeSeries(bank.chequeBookSeries || '');
    setEditBankChequePages(bank.chequeBookPages || 50);
  };

  const handleSaveEditBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBank || !editingBank.id) return;
    const updatedName = editBankName.trim() || editingBank.bankName;
    await db.bankAccounts.update(editingBank.id, {
      bankName: updatedName,
      cardNumber: editBankCard.trim() || '----',
      initialBalance: Math.round(Number(editBankInitBal) || 0),
      currentBalance: Math.round(Number(editBankCurrBal) || 0),
      hasPos: editBankHasPos,
      hasChequeBook: editBankHasCheque,
      chequeBookSeries: editBankChequeSeries.trim() || undefined,
      chequeBookPages: Number(editBankChequePages) || 50,
    });
    setEditingBank(null);
    await pushToCentralServer(false);
    showToast(`اطلاعات و موجودی «${updatedName}» با موفقیت ویرایش و در سرور مرکزی همگام‌سازی شد.`);
  };

  const handleDeleteBank = async (bank: BankAccount) => {
    if (!bank.id) return;
    if (!window.confirm(`آیا از حذف حساب بانکی «${bank.bankName}» اطمینان دارید؟`)) return;
    await db.bankAccounts.delete(bank.id);
    await pushToCentralServer(false);
    showToast(`حساب بانکی «${bank.bankName}» حذف شد.`);
  };

  const openEditVoucherModalByNumber = (voucherNumber: number) => {
    const v = vouchers.find((x) => x.voucherNumber === voucherNumber);
    if (!v) return;
    setEditingVoucher(v);
    setEditVoucherAmount(v.totalAmount);
    setEditVoucherDesc(v.description);
  };

  const handleSaveVoucherQuickEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVoucher || !editingVoucher.id) return;
    const newAmt = Math.max(1, Math.round(Number(editVoucherAmount) || 0));
    const ratio = editingVoucher.totalAmount > 0 ? newAmt / editingVoucher.totalAmount : 1;

    const updatedLines = editingVoucher.lines.map((l) => ({
      ...l,
      debit: l.debit > 0 ? (editingVoucher.lines.filter((x) => x.debit > 0).length === 1 ? newAmt : Math.round(l.debit * ratio)) : 0,
      credit: l.credit > 0 ? (editingVoucher.lines.filter((x) => x.credit > 0).length === 1 ? newAmt : Math.round(l.credit * ratio)) : 0,
    }));

    await updateJournalVoucherAndSyncBanks(editingVoucher.id, {
      description: editVoucherDesc.trim() || editingVoucher.description,
      lines: updatedLines,
    });
    setEditingVoucher(null);
    await pushToCentralServer(false);
    showToast(`سند شماره #${editingVoucher.voucherNumber} ویرایش شد و موجودی بانک اصلاح گردید.`);
  };

  const handleDeleteVoucherByNumber = async (voucherNumber: number) => {
    const v = vouchers.find((x) => x.voucherNumber === voucherNumber);
    if (!v || !v.id) return;
    if (
      !window.confirm(
        `آیا از حذف این تراکنش (سند #${v.voucherNumber} - ${v.description}) اطمینان دارید؟ موجودی بانک به صورت خودکار اصلاح می‌شود.`
      )
    ) {
      return;
    }
    await deleteJournalVoucherAndSyncBanks(v.id);
    await pushToCentralServer(false);
    showToast(`تراکنش سند #${v.voucherNumber} حذف شد و موجودی اصلاح گردید.`);
  };

  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Math.round(Number(expAmount) || 0);
    if (amount <= 0) return;

    const expAcc =
      accounts.find((a) => a.code === expCode) ||
      ({ code: '609', name: 'سایر هزینه‌های عمومی و تنخواه' } as Account);
    const selectedBank = banks.find((b) => b.id === Number(expBankId)) || banks[0];
    const person = persons.find((p) => p.id === Number(expPersonId));

    if (expPayFrom === 'credit' && !person) {
      alert('برای ثبت طلب (هزینه تعهدی بدون پرداخت آنی)، لطفاً شخص یا پرسنل مورد نظر را انتخاب کنید.');
      return;
    }

    const description =
      expDesc.trim() || `ثبت ${expAcc.name}${person ? ` (${person.name})` : ''}`;

    if (expPayFrom === 'credit' && person) {
      // Accrue expense and credit the person (ثبت طلب برای شخص / بستانکار شدن شخص)
      await recordJournalVoucher({
        date: new Date(),
        description: `${description} - ثبت طلب در حساب ${person.name}`,
        type: 'auto_expense',
        referenceId: person.id,
        lines: [
          {
            accountCode: expAcc.code,
            accountName: expAcc.name,
            debit: amount,
            credit: 0,
            description: `${description} (شناسایی هزینه)`,
          },
          {
            accountCode: '201',
            accountName: 'حساب‌های پرداختنی (تأمین‌کنندگان و پرسنل)',
            personId: person.id,
            personName: person.name,
            debit: 0,
            credit: amount,
            description: `ثبت طلب ${person.name} بابت ${expAcc.name}`,
          },
        ],
      });
      setExpAmount(0);
      setExpDesc('');
      await pushToCentralServer(false);
      showToast(
        `مبلغ ${formatCurrency(amount)} به عنوان طلب (بستانکار) در حساب «${person.name}» و سرفصل «${expAcc.name}» ثبت شد.`
      );
      return;
    }

    // Check if this is a salary payment to a staff member who already has automatic monthly salary
    const isStaffWithAutoSalary =
      person && person.role === 'staff' && (person.monthlySalary || 0) > 0 && expAcc.code === '601';

    // Determine lines based on whether person is selected and mode
    const buildDebitLines = () => {
      if (person && expPersonLedgerMode === 'both_accrue_and_pay') {
        // Record both the expense credit AND the payment debit in person's ledger
        return [
          {
            accountCode: expAcc.code,
            accountName: expAcc.name,
            debit: amount,
            credit: 0,
            description,
          },
          {
            accountCode: '201',
            accountName: 'حساب‌های پرداختنی (تأمین‌کنندگان و پرسنل)',
            personId: person.id,
            personName: person.name,
            debit: 0,
            credit: amount,
            description: `ثبت طلب بابت ${expAcc.name}`,
          },
          {
            accountCode: '201',
            accountName: 'حساب‌های پرداختنی (تأمین‌کنندگان و پرسنل)',
            personId: person.id,
            personName: person.name,
            debit: amount,
            credit: 0,
            description: `پرداخت وجه بابت ${expAcc.name}`,
          },
        ];
      }

      if (isStaffWithAutoSalary) {
        // Staff member already has 601 debited via automatic monthly salary voucher; debit 201 to settle their salary credit
        return [
          {
            accountCode: '201',
            accountName: 'حساب‌های پرداختنی (تأمین‌کنندگان و پرسنل)',
            personId: person.id,
            personName: person.name,
            debit: amount,
            credit: 0,
            description: `${description} (تسویه حقوق / مساعده)`,
          },
        ];
      }

      return [
        {
          accountCode: expAcc.code,
          accountName: expAcc.name,
          personId: person?.id,
          personName: person?.name,
          debit: amount,
          credit: 0,
          description,
        },
      ];
    };

    if (expPayFrom === 'bank' && selectedBank) {
      await recordJournalVoucher({
        date: new Date(),
        description: `${description} - پرداخت از ${selectedBank.bankName}`,
        type: 'auto_expense',
        bankId: selectedBank.id,
        bankName: selectedBank.bankName,
        lines: [
          ...buildDebitLines(),
          {
            accountCode: '102',
            accountName: 'موجودی بانک‌ها و کارتخوان‌ها',
            debit: 0,
            credit: amount,
            description: `کسر از ${selectedBank.bankName}`,
          },
        ],
      });
    } else {
      await recordJournalVoucher({
        date: new Date(),
        description: `${description} - پرداخت نقدی از صندوق`,
        type: 'auto_expense',
        lines: [
          ...buildDebitLines(),
          {
            accountCode: '101',
            accountName: 'صندوق نقدی رستوران',
            debit: 0,
            credit: amount,
            description: 'پرداخت از صندوق نقدی',
          },
        ],
      });
    }

    setExpAmount(0);
    setExpDesc('');
    await pushToCentralServer(false);
    showToast(`هزینه «${expAcc.name}» به مبلغ ${formatCurrency(amount)} ثبت و سند دوبل صادر شد.`);
  };

  const handleBankPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Math.round(Number(payAmount) || 0);
    if (amount <= 0) return;

    const selectedBank = banks.find((b) => b.id === Number(payBankId)) || banks[0];
    if (!selectedBank) return;

    if (payTargetType === 'person') {
      const person = persons.find((p) => p.id === Number(payPersonId)) || persons[0];
      if (!person) return;
      const desc =
        payDesc.trim() || `پرداخت وجه از ${selectedBank.bankName} به ${person.name}`;

      await recordJournalVoucher({
        date: new Date(),
        description: desc,
        type: 'auto_payment',
        bankId: selectedBank.id,
        bankName: selectedBank.bankName,
        lines: [
          {
            accountCode: '201',
            accountName: 'حساب‌های پرداختنی (تأمین‌کنندگان و پرسنل)',
            personId: person.id,
            personName: person.name,
            debit: amount,
            credit: 0,
            description: `پرداخت به ${person.name}`,
          },
          {
            accountCode: '102',
            accountName: 'موجودی بانک‌ها و کارتخوان‌ها',
            debit: 0,
            credit: amount,
            description: `انتقال از ${selectedBank.bankName}`,
          },
        ],
      });
      showToast(
        `مبلغ ${formatCurrency(amount)} از ${selectedBank.bankName} به حساب «${person.name}» منظور و سند اتوماتیک صادر شد.`
      );
    } else {
      const targetAcc = accounts.find((a) => a.code === payAccountCode) || accounts[0];
      const desc =
        payDesc.trim() || `پرداخت از ${selectedBank.bankName} به سرفصل ${targetAcc.name}`;

      await recordJournalVoucher({
        date: new Date(),
        description: desc,
        type: 'auto_payment',
        bankId: selectedBank.id,
        bankName: selectedBank.bankName,
        lines: [
          {
            accountCode: targetAcc.code,
            accountName: targetAcc.name,
            debit: amount,
            credit: 0,
            description: desc,
          },
          {
            accountCode: '102',
            accountName: 'موجودی بانک‌ها و کارتخوان‌ها',
            debit: 0,
            credit: amount,
            description: `برداشت از ${selectedBank.bankName}`,
          },
        ],
      });
      showToast(
        `سند پرداخت اتوماتیک از ${selectedBank.bankName} به سرفصل «${targetAcc.name}» صادر شد.`
      );
    }

    setPayAmount(0);
    setPayDesc('');
    await pushToCentralServer(false);
  };

  const handleAddBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBankName.trim()) return;
    const initBal = Math.round(Number(newInitBalance) || 0);

    const bankId = (await db.bankAccounts.add({
      bankName: newBankName.trim(),
      accountNumber: '',
      cardNumber: newCardNum.trim() || '----',
      hasPos: newHasPos,
      hasChequeBook: newHasChequeBook,
      chequeBookSeries: newChequeSeries.trim() || undefined,
      chequeBookPages: Number(newChequePages) || 50,
      initialBalance: initBal,
      currentBalance: initBal,
      isDefaultPos: false,
      isActive: true,
    })) as number;

    if (initBal > 0) {
      await recordJournalVoucher({
        date: new Date(),
        description: `موجودی اول دوره ${newBankName.trim()}`,
        type: 'manual',
        bankId,
        bankName: newBankName.trim(),
        lines: [
          {
            accountCode: '102',
            accountName: 'موجودی بانک‌ها و کارتخوان‌ها',
            debit: initBal,
            credit: 0,
            description: `موجودی اولیه ${newBankName.trim()}`,
          },
          {
            accountCode: '301',
            accountName: 'سرمایه اولیه و جاری شرکا',
            debit: 0,
            credit: initBal,
            description: 'تراز افتتاحیه بانک',
          },
        ],
      });
    }

    setNewBankName('');
    setNewCardNum('');
    setNewInitBalance(0);
    setNewHasPos(true);
    setNewHasChequeBook(false);
    setNewChequeSeries('');
    await pushToCentralServer(false);
    showToast('حساب بانکی، دستگاه پوز و دسته چک جدید اضافه و روی سرور مرکزی همگام‌سازی شد.');
  };

  // ---------------- Bank Statement Data Computation ----------------
  const targetBank = useMemo(() => {
    const curBankId = selectedBankIdForStatement || banks[0]?.id;
    return banks.find((b) => b.id === curBankId) || banks[0];
  }, [banks, selectedBankIdForStatement]);

  const bankStatementData = useMemo(() => {
    if (!targetBank) return { lines: [], totalDeposit: 0, totalWithdrawal: 0, currentBalance: 0 };

    const bankVouchers = vouchers
      .filter((v) => {
        // Linked via bankId or accountCode '102'
        const hasBankLink = v.bankId === targetBank.id;
        const has102Line = v.lines.some((l) => l.accountCode === '102');
        return hasBankLink || has102Line;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = targetBank.initialBalance || 0;
    const rawLines: Array<{
      date: Date;
      voucherNumber: number;
      description: string;
      personName?: string;
      deposit: number; // بدهکار بانک (واریز)
      withdrawal: number; // بستانکار بانک (برداشت)
      runningBalance: number;
    }> = [];

    let totalDeposit = 0;
    let totalWithdrawal = 0;

    for (const v of bankVouchers) {
      let dep = 0;
      let wd = 0;
      let lineDesc = v.description;
      let personName = '';

      for (const l of v.lines) {
        if (l.accountCode === '102') {
          dep += Number(l.debit) || 0;
          wd += Number(l.credit) || 0;
        } else {
          if (l.personName) personName = l.personName;
        }
      }

      // If bankId matches directly even if 102 line wasn't explicit
      if (v.bankId === targetBank.id && dep === 0 && wd === 0) {
        for (const l of v.lines) {
          if (l.credit > 0) dep += l.credit;
          else if (l.debit > 0) wd += l.debit;
        }
      }

      if (dep > 0 || wd > 0) {
        running += dep - wd;
        totalDeposit += dep;
        totalWithdrawal += wd;
        rawLines.push({
          date: v.date,
          voucherNumber: v.voucherNumber,
          description: lineDesc,
          personName,
          deposit: dep,
          withdrawal: wd,
          runningBalance: running,
        });
      }
    }

    let filtered = [...rawLines];
    const now = new Date();
    if (bankDatePreset === '30days') {
      const start = new Date(now.getTime() - 30 * 86400000);
      filtered = filtered.filter((l) => new Date(l.date) >= start);
    } else if (bankDatePreset === 'thisMonth') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      filtered = filtered.filter((l) => new Date(l.date) >= start);
    }

    if (bankFromDate) {
      const from = new Date(bankFromDate);
      filtered = filtered.filter((l) => new Date(l.date) >= from);
    }
    if (bankToDate) {
      const to = new Date(bankToDate);
      to.setHours(23, 59, 59, 999);
      filtered = filtered.filter((l) => new Date(l.date) <= to);
    }

    return {
      lines: filtered,
      totalDeposit,
      totalWithdrawal,
      currentBalance: targetBank.currentBalance ?? running,
    };
  }, [targetBank, vouchers, bankDatePreset, bankFromDate, bankToDate]);

  // ---------------- Expense Statement Data Computation ----------------
  const expenseStatementData = useMemo(() => {
    const rawLines: Array<{
      date: Date;
      voucherNumber: number;
      accountCode: string;
      accountName: string;
      description: string;
      personName?: string;
      amount: number;
    }> = [];

    const categoryTotals = new Map<string, { name: string; code: string; total: number }>();

    for (const v of vouchers) {
      for (const l of v.lines) {
        if (l.accountCode.startsWith('6') && l.debit > 0) {
          if (
            selectedExpenseCategoryCode === 'all' ||
            l.accountCode === selectedExpenseCategoryCode
          ) {
            rawLines.push({
              date: v.date,
              voucherNumber: v.voucherNumber,
              accountCode: l.accountCode,
              accountName: l.accountName,
              description: l.description || v.description,
              personName: l.personName,
              amount: l.debit,
            });
          }

          const curCat = categoryTotals.get(l.accountCode) || {
            name: l.accountName,
            code: l.accountCode,
            total: 0,
          };
          curCat.total += l.debit;
          categoryTotals.set(l.accountCode, curCat);
        }
      }
    }

    let filtered = [...rawLines].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const now = new Date();
    if (expDatePreset === '30days') {
      const start = new Date(now.getTime() - 30 * 86400000);
      filtered = filtered.filter((l) => new Date(l.date) >= start);
    } else if (expDatePreset === 'thisMonth') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      filtered = filtered.filter((l) => new Date(l.date) >= start);
    }

    if (expFromDate) {
      const from = new Date(expFromDate);
      filtered = filtered.filter((l) => new Date(l.date) >= from);
    }
    if (expToDate) {
      const to = new Date(expToDate);
      to.setHours(23, 59, 59, 999);
      filtered = filtered.filter((l) => new Date(l.date) <= to);
    }

    const filteredTotal = filtered.reduce((acc, l) => acc + l.amount, 0);

    return {
      lines: filtered,
      filteredTotal,
      categories: Array.from(categoryTotals.values()),
    };
  }, [
    vouchers,
    selectedExpenseCategoryCode,
    expDatePreset,
    expFromDate,
    expToDate,
  ]);

  return (
    <div className="space-y-4">
      {/* Sub-mode Switcher */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 flex items-center gap-1.5 overflow-x-auto no-scrollbar scrollbar-none shadow-2xs">
        <button
          type="button"
          onClick={() => setSubMode('expense')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
            subMode === 'expense' ? 'bg-rose-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Receipt size={15} />
          <span>۱. ثبت سریع هزینه</span>
        </button>
        <button
          type="button"
          onClick={() => setSubMode('bank_pay')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
            subMode === 'bank_pay' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Send size={15} />
          <span>۲. پرداخت از بانک به شخص/سرفصل</span>
        </button>
        <button
          type="button"
          onClick={() => setSubMode('bank_statement')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
            subMode === 'bank_statement'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <FileText size={15} />
          <span>۳. صورتحساب و گردش بانک‌ها</span>
        </button>
        <button
          type="button"
          onClick={() => setSubMode('expense_statement')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
            subMode === 'expense_statement'
              ? 'bg-purple-700 text-white shadow-xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <PieChart size={15} />
          <span>۴. صورتحساب و گزارش هزینه‌ها</span>
        </button>
        <button
          type="button"
          onClick={() => setSubMode('banks')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
            subMode === 'banks' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Building2 size={15} />
          <span>۵. مدیریت بانک‌ها ({banks.length})</span>
        </button>
      </div>

      {feedback && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
          <CheckCircle2 size={16} />
          <span>{feedback}</span>
        </div>
      )}

      {/* VIEW 1: Expense Registration */}
      {subMode === 'expense' && (
        <div className="max-w-2xl mx-auto">
          <form
            onSubmit={handleRecordExpense}
            className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 space-y-4 shadow-2xs"
          >
            <div className="border-b border-slate-100 pb-2.5">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Receipt className="text-rose-600" size={18} />
                <span>ثبت سریع هزینه‌های رستوران (صدور سند دوبل اتوماتیک)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                سرفصل هزینه را تایپ یا انتخاب کنید؛ سند حسابداری به صورت خودکار ثبت می‌گردد.
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  سرفصل هزینه رستوران (تایپ نام یا کد، یا انتخاب) *
                </label>
                <AccountAutocompleteSelect
                  accounts={expenseAccounts}
                  selectedCode={expCode}
                  onSelect={(acc) => setExpCode(acc.code)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    مبلغ هزینه ({currencyLabel}) *
                  </label>
                  <FormattedNumberInput
                    required
                    placeholder="مثلاً 2,500,000"
                    value={expAmount || ''}
                    onValueChange={(val) => setExpAmount(val)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold text-left focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">نحوه تسویه / ثبت طلب</label>
                  <select
                    value={expPayFrom}
                    onChange={(e) => setExpPayFrom(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold"
                  >
                    <option value="bank">پرداخت از بانک / کارتخوان</option>
                    <option value="cash">پرداخت نقدی از صندوق</option>
                    <option value="credit">ثبت طلب برای شخص (بستانکار شدن بدون پرداخت آنی)</option>
                  </select>
                </div>
              </div>

              {expPayFrom === 'bank' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">انتخاب بانک پرداخت‌کننده</label>
                  <select
                    value={expBankId || banks[0]?.id || ''}
                    onChange={(e) => setExpBankId(Number(e.target.value))}
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
                <label className="block font-bold text-slate-700 mb-1">
                  شخص مرتبط (پرسنل یا تأمین‌کننده) {expPayFrom === 'credit' ? '*' : '(اختیاری)'}
                </label>
                <select
                  value={expPersonId}
                  onChange={(e) => setExpPersonId(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold"
                >
                  <option value={0}>بدون شخص خاص (هزینه عمومی)</option>
                  {persons.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.role === 'staff' ? 'پرسنل' : p.role === 'supplier' ? 'تأمین‌کننده' : 'مشتری'})
                      {p.monthlySalary ? ` - حقوق ماهیانه: ${formatCurrency(p.monthlySalary)}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {expPersonId > 0 && expPayFrom !== 'credit' && (
                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1.5">
                  <label className="block font-extrabold text-blue-900 text-[11px]">
                    نحوه تأثیر این پرداخت بر مانده حساب شخص انتخاب‌شده:
                  </label>
                  <select
                    value={expPersonLedgerMode}
                    onChange={(e) => setExpPersonLedgerMode(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 border border-blue-300 rounded-lg bg-white font-bold text-slate-800 text-xs"
                  >
                    <option value="settle_credit">
                      کسر از طلب قبلی / پرداخت حقوق ماهانه ثبت‌شده (بدهکار شدن شخص)
                    </option>
                    <option value="both_accrue_and_pay">
                      ثبت همزمان طلب و تسویه آنی (بدهکار و بستانکار همزمان = مانده بی‌حساب)
                    </option>
                  </select>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">شرح هزینه / بابت</label>
                <input
                  type="text"
                  placeholder="مثال: پرداخت قبض گاز ماهانه یا کرایه پیک..."
                  value={expDesc}
                  onChange={(e) => setExpDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer"
            >
              <CheckCircle2 size={16} />
              <span>ثبت هزینه و صدور اتوماتیک سند حسابداری</span>
            </button>
          </form>
        </div>
      )}

      {/* VIEW 2: Bank Payment */}
      {subMode === 'bank_pay' && (
        <div className="max-w-2xl mx-auto">
          <form
            onSubmit={handleBankPayment}
            className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 space-y-4 shadow-2xs"
          >
            <div className="border-b border-slate-100 pb-2.5">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Send className="text-blue-600" size={18} />
                <span>سند اتوماتیک پرداخت از بانک به شخص یا سرفصل خاص</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                تسویه حساب با تأمین‌کنندگان، پرسنل یا واریز به هر سرفصل حسابداری از بانک انتخابی
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">از حساب بانکی مبدأ *</label>
                <select
                  value={payBankId || banks[0]?.id || ''}
                  onChange={(e) => setPayBankId(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold"
                >
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bankName} (موجودی: {formatCurrency(b.currentBalance)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setPayTargetType('person')}
                  className={`py-1.5 rounded-lg font-bold transition-colors ${
                    payTargetType === 'person'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  پرداخت به شخص (تأمین‌کننده/پرسنل)
                </button>
                <button
                  type="button"
                  onClick={() => setPayTargetType('account')}
                  className={`py-1.5 rounded-lg font-bold transition-colors ${
                    payTargetType === 'account'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  پرداخت به سرفصل خاص
                </button>
              </div>

              {payTargetType === 'person' ? (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">انتخاب شخص دریافت‌کننده *</label>
                  <select
                    value={payPersonId || persons[0]?.id || ''}
                    onChange={(e) => setPayPersonId(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold"
                  >
                    {persons.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.role === 'supplier' ? 'تأمین‌کننده' : p.role === 'staff' ? 'پرسنل' : 'مشتری'})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    انتخاب سرفصل حسابداری مقصد (تایپ یا انتخاب)
                  </label>
                  <AccountAutocompleteSelect
                    accounts={accounts}
                    selectedCode={payAccountCode}
                    onSelect={(acc) => setPayAccountCode(acc.code)}
                  />
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  مبلغ پرداختی ({currencyLabel}) *
                </label>
                <FormattedNumberInput
                  required
                  placeholder="مثلاً 5,000,000"
                  value={payAmount || ''}
                  onValueChange={(val) => setPayAmount(val)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold text-left focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">شرح پرداخت / شماره پیگیری</label>
                <input
                  type="text"
                  placeholder="مثال: تسویه فاکتور گوشت یا مساعده حقوق..."
                  value={payDesc}
                  onChange={(e) => setPayDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer"
            >
              <Send size={15} />
              <span>ثبت پرداخت از بانک و صدور سند دوبل</span>
            </button>
          </form>
        </div>
      )}

      {/* VIEW 3: Bank Account Statement & Kardex (صورتحساب بانک‌ها) */}
      {subMode === 'bank_statement' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden space-y-3 shadow-2xs p-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm md:text-base font-extrabold text-slate-900 flex items-center gap-2">
                <FileText className="text-emerald-700" size={18} />
                <span>صورتحساب و گردش ریز کارتخوان‌ها و بانک‌ها</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                مشاهده کامل واریزی‌ها، برداشت‌ها و مانده شناور هر حساب بانکی
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedBankIdForStatement}
                onChange={(e) => setSelectedBankIdForStatement(Number(e.target.value))}
                className="px-3 py-2 bg-slate-100 border border-slate-300 text-slate-900 rounded-xl text-xs font-extrabold"
              >
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bankName} (موجودی: {formatCurrency(b.currentBalance)})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs flex items-center gap-1"
              >
                <Printer size={14} />
                <span>چاپ صورتحساب</span>
              </button>
            </div>
          </div>

          {/* Date Filter Bar */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <Calendar size={14} className="text-slate-500" />
              <span className="font-bold text-slate-700">بازه زمانی:</span>
              {[
                { id: 'all', label: 'کل دوره' },
                { id: '30days', label: '۳۰ روز اخیر' },
                { id: 'thisMonth', label: 'ماه جاری' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setBankDatePreset(p.id as any)}
                  className={`px-2.5 py-1 rounded-lg font-bold ${
                    bankDatePreset === p.id
                      ? 'bg-emerald-700 text-white'
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
                value={bankFromDate}
                onChange={(e) => {
                  setBankDatePreset('all');
                  setBankFromDate(e.target.value);
                }}
                className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs"
              />
              <label className="font-semibold text-slate-600">تا:</label>
              <input
                type="date"
                value={bankToDate}
                onChange={(e) => {
                  setBankDatePreset('all');
                  setBankToDate(e.target.value);
                }}
                className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>

          {/* Bank Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <span className="text-slate-500 font-bold block mb-0.5">نام بانک / شماره کارت</span>
              <span className="text-xs font-bold text-slate-900 block truncate">
                {targetBank?.bankName || 'بانک'}
              </span>
              <span className="text-[10px] text-slate-400 font-mono" dir="ltr">
                {targetBank?.cardNumber}
              </span>
            </div>
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs">
              <span className="text-slate-500 font-bold block mb-0.5">کل واریزی‌ها (+ بدهکار)</span>
              <span className="text-sm font-mono font-black text-emerald-800">
                {formatCurrency(bankStatementData.totalDeposit)}
              </span>
            </div>
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs">
              <span className="text-slate-500 font-bold block mb-0.5">کل برداشت‌ها (- بستانکار)</span>
              <span className="text-sm font-mono font-black text-rose-800">
                {formatCurrency(bankStatementData.totalWithdrawal)}
              </span>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs">
              <span className="text-slate-500 font-bold block mb-0.5">موجودی زنده فعلی</span>
              <span className="text-sm font-mono font-black text-blue-900">
                {formatCurrency(bankStatementData.currentBalance)}
              </span>
            </div>
          </div>

          {/* Transactions Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-[60vh] overflow-y-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">تاریخ</th>
                  <th className="py-2.5 px-3">شماره سند</th>
                  <th className="py-2.5 px-3">شرح تراکنش</th>
                  <th className="py-2.5 px-3">طرف حساب</th>
                  <th className="py-2.5 px-3">واریزی (+)</th>
                  <th className="py-2.5 px-3">برداشت (-)</th>
                  <th className="py-2.5 px-3">مانده موجودی</th>
                  <th className="py-2.5 px-3 text-center">ویرایش / حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bankStatementData.lines.map((l, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono text-[11px]" dir="ltr">
                      {format(new Date(l.date), 'yyyy/MM/dd HH:mm')}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-slate-800">
                      #{l.voucherNumber}
                    </td>
                    <td className="py-2 px-3 text-slate-800 font-semibold">{l.description}</td>
                    <td className="py-2 px-3 text-slate-600">{l.personName || '-'}</td>
                    <td className="py-2 px-3 font-mono font-bold text-emerald-700">
                      {l.deposit > 0 ? formatCurrency(l.deposit) : '-'}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-rose-700">
                      {l.withdrawal > 0 ? formatCurrency(l.withdrawal) : '-'}
                    </td>
                    <td className="py-2 px-3 font-mono font-black text-slate-900">
                      {formatCurrency(l.runningBalance)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditVoucherModalByNumber(l.voucherNumber)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                          title="ویرایش تراکنش بانکی"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteVoucherByNumber(l.voucherNumber)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                          title="حذف تراکنش بانکی"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {bankStatementData.lines.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 font-semibold">
                      هیچ تراکنشی برای این حساب بانکی در این بازه ثبت نشده است.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 4: Expense Accounts Statement & Breakdown (صورتحساب هزینه‌ها) */}
      {subMode === 'expense_statement' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden space-y-3 shadow-2xs p-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm md:text-base font-extrabold text-slate-900 flex items-center gap-2">
                <PieChart className="text-purple-700" size={18} />
                <span>صورتحساب و تفکیک کلیه هزینه‌های رستوران</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                گزارش ریز هزینه‌های عمومی، حقوق، اجاره، قبوض، تعمیرات و به تفکیک سرفصل (با قابلیت ویرایش و حذف)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedExpenseCategoryCode}
                onChange={(e) => setSelectedExpenseCategoryCode(e.target.value)}
                className="px-3 py-2 bg-slate-100 border border-slate-300 text-slate-900 rounded-xl text-xs font-extrabold"
              >
                <option value="all">همه سرفصل‌های هزینه (کد 600)</option>
                {expenseAccounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} - {a.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs flex items-center gap-1"
              >
                <Printer size={14} />
                <span>چاپ</span>
              </button>
            </div>
          </div>

          {/* Date Filter Bar */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <Calendar size={14} className="text-slate-500" />
              <span className="font-bold text-slate-700">بازه زمانی:</span>
              {[
                { id: 'all', label: 'کل دوره' },
                { id: '30days', label: '۳۰ روز اخیر' },
                { id: 'thisMonth', label: 'ماه جاری' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setExpDatePreset(p.id as any)}
                  className={`px-2.5 py-1 rounded-lg font-bold ${
                    expDatePreset === p.id
                      ? 'bg-purple-700 text-white'
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
                value={expFromDate}
                onChange={(e) => {
                  setExpDatePreset('all');
                  setExpFromDate(e.target.value);
                }}
                className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs"
              />
              <label className="font-semibold text-slate-600">تا:</label>
              <input
                type="date"
                value={expToDate}
                onChange={(e) => {
                  setExpDatePreset('all');
                  setExpToDate(e.target.value);
                }}
                className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>

          {/* Expense Total Badge */}
          <div className="p-3.5 bg-purple-50 border border-purple-200 rounded-xl flex justify-between items-center text-xs">
            <div>
              <span className="font-extrabold text-purple-900 block">
                جمع کل هزینه‌ها در این بازه:
              </span>
              <span className="text-[11px] text-purple-700">
                {expenseStatementData.lines.length} مورد سند هزینه ثبت شده
              </span>
            </div>
            <span className="text-base font-mono font-black text-purple-900">
              {formatCurrency(expenseStatementData.filteredTotal)}
            </span>
          </div>

          {/* Expenses Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-[60vh] overflow-y-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">تاریخ</th>
                  <th className="py-2.5 px-3">شماره سند</th>
                  <th className="py-2.5 px-3">کد و عنوان سرفصل هزینه</th>
                  <th className="py-2.5 px-3">شرح هزینه</th>
                  <th className="py-2.5 px-3">شخص مرتبط</th>
                  <th className="py-2.5 px-3">مبلغ هزینه</th>
                  <th className="py-2.5 px-3 text-center">ویرایش / حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenseStatementData.lines.map((l, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono text-[11px]" dir="ltr">
                      {format(new Date(l.date), 'yyyy/MM/dd')}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-slate-800">
                      #{l.voucherNumber}
                    </td>
                    <td className="py-2 px-3 font-bold text-purple-800">
                      {l.accountCode} - {l.accountName}
                    </td>
                    <td className="py-2 px-3 text-slate-800">{l.description}</td>
                    <td className="py-2 px-3 text-slate-600">{l.personName || '-'}</td>
                    <td className="py-2 px-3 font-mono font-black text-rose-700">
                      {formatCurrency(l.amount)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditVoucherModalByNumber(l.voucherNumber)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                          title="ویرایش هزینه"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteVoucherByNumber(l.voucherNumber)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                          title="حذف هزینه"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {expenseStatementData.lines.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 font-semibold">
                      هیچ هزینه‌ای در این بازه زمانی ثبت نشده است.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 5: Bank Accounts Management Section */}
      {subMode === 'banks' && (
        <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 space-y-4 shadow-2xs">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <Building2 className="text-slate-700" size={18} />
            <span>حساب‌های بانکی، کارتخوان‌ها (POS) و دسته چک‌ها (با قابلیت ویرایش و حذف)</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {banks.map((b) => (
              <div
                key={b.id}
                className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-2.5"
              >
                <div>
                  <div className="font-extrabold text-slate-900 text-sm flex items-center justify-between">
                    <span>{b.bankName}</span>
                    <div className="flex items-center gap-1">
                      {b.hasPos !== false && (
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded font-bold">
                          دارای پوز
                        </span>
                      )}
                      {b.hasChequeBook && (
                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] rounded font-bold">
                          دسته چک
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditBankModal(b)}
                        className="p-1 text-blue-600 hover:bg-blue-100 rounded-lg cursor-pointer"
                        title="ویرایش حساب بانکی"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBank(b)}
                        className="p-1 text-rose-600 hover:bg-rose-100 rounded-lg cursor-pointer"
                        title="حذف حساب بانکی"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 font-mono mt-1" dir="ltr">
                    کارت: {b.cardNumber}
                  </div>
                  {b.hasChequeBook && (
                    <div className="text-[11px] text-slate-600 mt-1 font-mono">
                      سریال چک: {b.chequeBookSeries || 'تعریف نشده'} ({b.chequeBookPages || 50} برگ)
                    </div>
                  )}
                </div>
                <div className="pt-2 border-t border-slate-200/70 flex justify-between items-center text-xs">
                  <span className="text-slate-500">موجودی فعلی:</span>
                  <span className="font-mono font-black text-blue-700 text-sm">
                    {formatCurrency(b.currentBalance)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Add Bank Form */}
          <form
            onSubmit={handleAddBank}
            className="pt-4 border-t border-slate-100 space-y-3 text-xs"
          >
            <h4 className="font-extrabold text-slate-800">افزودن حساب بانکی جدید همراه با پوز و دسته چک</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">نام بانک *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: بانک سامان (پوز ۲)"
                  value={newBankName}
                  onChange={(e) => setNewBankName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">شماره کارت / حساب</label>
                <input
                  type="text"
                  placeholder="6219-8610-..."
                  value={newCardNum}
                  onChange={(e) => setNewCardNum(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-left"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  موجودی اولیه ({currencyLabel})
                </label>
                <FormattedNumberInput
                  placeholder="0"
                  value={newInitBalance || ''}
                  onValueChange={(val) => setNewInitBalance(val)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-left"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center pt-2">
              <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newHasPos}
                  onChange={(e) => setNewHasPos(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <span>دارای دستگاه پوز (نمایش در صندوق)</span>
              </label>

              <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newHasChequeBook}
                  onChange={(e) => setNewHasChequeBook(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                />
                <span>دارای دسته چک</span>
              </label>

              {newHasChequeBook && (
                <>
                  <div>
                    <input
                      type="text"
                      placeholder="سریال دسته چک..."
                      value={newChequeSeries}
                      onChange={(e) => setNewChequeSeries(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      placeholder="تعداد برگ (مثلاً 50)"
                      value={newChequePages || ''}
                      onChange={(e) => setNewChequePages(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono"
                      dir="ltr"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="py-2.5 px-6 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus size={15} />
                <span>ثبت و افزودن بانک جدید</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 1: EDIT BANK ACCOUNT */}
      {editingBank && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">
                ویرایش حساب بانکی: {editingBank.bankName}
              </h3>
              <button
                type="button"
                onClick={() => setEditingBank(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveEditBank} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">نام بانک</label>
                <input
                  type="text"
                  required
                  value={editBankName}
                  onChange={(e) => setEditBankName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">شماره کارت / حساب</label>
                <input
                  type="text"
                  value={editBankCard}
                  onChange={(e) => setEditBankCard(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-left"
                  dir="ltr"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    موجودی اول دوره ({currencyLabel})
                  </label>
                  <FormattedNumberInput
                    value={editBankInitBal || ''}
                    onValueChange={(val) => setEditBankInitBal(val)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-left"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    موجودی فعلی ({currencyLabel})
                  </label>
                  <FormattedNumberInput
                    value={editBankCurrBal || ''}
                    onValueChange={(val) => setEditBankCurrBal(val)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold text-left"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editBankHasPos}
                    onChange={(e) => setEditBankHasPos(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span>دارای کارتخوان (POS)</span>
                </label>
                <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editBankHasCheque}
                    onChange={(e) => setEditBankHasCheque(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-600"
                  />
                  <span>دارای دسته چک</span>
                </label>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Save size={15} />
                  <span>ذخیره تغییرات بانک</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingBank(null)}
                  className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: QUICK EDIT EXPENSE / BANK VOUCHER */}
      {editingVoucher && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">
                ویرایش سند #{editingVoucher.voucherNumber}
              </h3>
              <button
                type="button"
                onClick={() => setEditingVoucher(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveVoucherQuickEdit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  مبلغ تراکنش / هزینه ({currencyLabel})
                </label>
                <FormattedNumberInput
                  required
                  value={editVoucherAmount || ''}
                  onValueChange={(val) => setEditVoucherAmount(val)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold text-left"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">شرح تراکنش / هزینه</label>
                <input
                  type="text"
                  required
                  value={editVoucherDesc}
                  onChange={(e) => setEditVoucherDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Save size={15} />
                  <span>ذخیره تغییرات و اصلاح موجودی</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingVoucher(null)}
                  className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

