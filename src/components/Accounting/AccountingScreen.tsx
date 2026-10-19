import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, syncStaffMonthlySalaries } from '../../lib/db';
import { classifyChequeDueStatus } from '../../lib/accountingEngine';
import PnLAndOverviewTab from './PnLAndOverviewTab';
import CostingAndBOMTab from './CostingAndBOMTab';
import InventoryAndKardexTab from './InventoryAndKardexTab';
import ExpensesAndBankPayTab from './ExpensesAndBankPayTab';
import PersonsAndChequesTab from './PersonsAndChequesTab';
import ChartAndJournalTab from './ChartAndJournalTab';
import {
  PieChart,
  Calculator,
  Package,
  Wallet,
  Users,
  BookOpen,
} from 'lucide-react';

export type AccountingSubTab =
  | 'overview_pnl'
  | 'costing_bom'
  | 'inventory'
  | 'expenses_bank'
  | 'persons_cheques'
  | 'chart_journal';

export default function AccountingScreen() {
  const [activeSubTab, setActiveSubTab] = useState<AccountingSubTab>('overview_pnl');

  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const vouchers = useLiveQuery(() => db.journalVouchers.toArray()) || [];
  const cheques = useLiveQuery(() => db.cheques.toArray()) || [];
  const banks = useLiveQuery(() => db.bankAccounts.toArray()) || [];
  const persons = useLiveQuery(() => db.persons.toArray()) || [];
  const materials = useLiveQuery(() => db.rawMaterials.toArray()) || [];
  const transactions = useLiveQuery(() => db.inventoryTransactions.toArray()) || [];
  const menuItems = useLiveQuery(() => db.menuItems.toArray()) || [];
  const recipes = useLiveQuery(() => db.productionRecipes.toArray()) || [];

  useEffect(() => {
    syncStaffMonthlySalaries();
  }, [persons.length]);

  const urgentChequeCount = useMemo(() => {
    const now = new Date();
    return cheques.filter((c) => {
      const { urgency } = classifyChequeDueStatus(c, now);
      return urgency === 'overdue' || urgency === 'due_today' || urgency === 'upcoming';
    }).length;
  }, [cheques]);

  const navItems: Array<{
    id: AccountingSubTab;
    label: string;
    icon: any;
    badge?: number;
  }> = [
    { id: 'overview_pnl', label: 'سود و زیان و داشبورد مالی', icon: PieChart },
    { id: 'costing_bom', label: 'فرمول تولید و قیمت تمام شده', icon: Calculator },
    { id: 'inventory', label: 'انبار، خرید مواد و کاردکس', icon: Package },
    { id: 'expenses_bank', label: 'ثبت هزینه و پرداخت از بانک', icon: Wallet },
    {
      id: 'persons_cheques',
      label: 'اشخاص، صورتحساب و دفتر چک',
      icon: Users,
      badge: urgentChequeCount,
    },
    { id: 'chart_journal', label: 'کدینگ و سند دوبل حسابداری', icon: BookOpen },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Top Accounting Hood Navigation Bar */}
      <div className="bg-white border-b border-slate-200 px-3 py-2 sm:px-6 sm:py-3.5 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col gap-1.5 sm:gap-3">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-sm sm:text-xl font-extrabold text-slate-900 leading-tight">
                واحد حسابداری و انبارداری آرکا
              </h1>
              <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
                طراحی شده به زبان ساده و روان همراه با صدور اتوماتیک اسناد حسابداری دوبل، کاردکس انبار و محاسبه دقیق بهای تمام شده
              </p>
            </div>
          </div>

          {/* Mobile Dropdown Menu for Sub-Tabs */}
          <div className="sm:hidden block w-full">
            <select
              value={activeSubTab}
              onChange={(e) => setActiveSubTab(e.target.value as AccountingSubTab)}
              className="w-full bg-slate-100 border border-slate-300 text-slate-900 rounded-xl px-3 py-2 text-xs font-extrabold focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {navItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} {item.badge && item.badge > 0 ? `(${item.badge} چک معوق)` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Desktop & Scrollable Sub-Tabs Bar */}
          <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto no-scrollbar scrollbar-none pb-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSubTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSubTab(item.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 border ${
                    isActive
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-black ${
                        isActive ? 'bg-white text-blue-700' : 'bg-amber-500 text-white'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-2.5 sm:p-6">
        <div className="max-w-7xl mx-auto">
          {activeSubTab === 'overview_pnl' && (
            <PnLAndOverviewTab
              accounts={accounts}
              vouchers={vouchers}
              cheques={cheques}
              banks={banks}
              materials={materials}
              onNavigateSubTab={(t) => setActiveSubTab(t as AccountingSubTab)}
            />
          )}

          {activeSubTab === 'costing_bom' && (
            <CostingAndBOMTab
              menuItems={menuItems}
              materials={materials}
              recipes={recipes}
            />
          )}

          {activeSubTab === 'inventory' && (
            <InventoryAndKardexTab
              materials={materials}
              transactions={transactions}
              persons={persons}
              banks={banks}
            />
          )}

          {activeSubTab === 'expenses_bank' && (
            <ExpensesAndBankPayTab
              accounts={accounts}
              banks={banks}
              persons={persons}
              vouchers={vouchers}
            />
          )}

          {activeSubTab === 'persons_cheques' && (
            <PersonsAndChequesTab
              persons={persons}
              cheques={cheques}
              banks={banks}
              vouchers={vouchers}
            />
          )}

          {activeSubTab === 'chart_journal' && (
            <ChartAndJournalTab
              accounts={accounts}
              persons={persons}
              vouchers={vouchers}
            />
          )}
        </div>
      </div>
    </div>
  );
}
