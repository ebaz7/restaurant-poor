/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import {
  Store,
  UtensilsCrossed,
  BarChart3,
  Settings,
  Users,
  Landmark,
  ChefHat,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import POSScreen from './components/POS/POSScreen';
import KitchenProductionScreen from './components/Kitchen/KitchenProductionScreen';
import MenuManagerScreen from './components/MenuManager/MenuManagerScreen';
import ReportsScreen from './components/Reports/ReportsScreen';
import SettingsScreen from './components/Settings/SettingsScreen';
import CustomersScreen from './components/Customers/CustomersScreen';
import AccountingScreen from './components/Accounting/AccountingScreen';
import { db, initializeDefaultDatabase } from './lib/db';
import { sendBackupToMessengers } from './lib/utils';

export type TabType =
  | 'pos'
  | 'kitchen'
  | 'accounting'
  | 'menu'
  | 'reports'
  | 'customers'
  | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('pos');
  const settings = useLiveQuery(() => db.settings.toCollection().first());

  // Initialize default settings, chart of accounts, raw materials, BOM recipes, and banks on first load
  useEffect(() => {
    initializeDefaultDatabase();
  }, []);

  // Hourly Auto-Backup Scheduler for Bale & Telegram Bots
  useEffect(() => {
    if (!settings?.autoBackupEnabled) return;
    const intervalHours = Math.max(1, Number(settings.autoBackupIntervalHours) || 1);
    const intervalMs = intervalHours * 3600 * 1000;

    const timer = setInterval(() => {
      sendBackupToMessengers(settings, `ارسال خودکار (${intervalHours} ساعته)`);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [
    settings?.autoBackupEnabled,
    settings?.autoBackupIntervalHours,
    settings?.baleBotToken,
    settings?.baleChatId,
    settings?.telegramBotToken,
    settings?.telegramChatId,
  ]);

  const NavButton = ({
    tab,
    icon: Icon,
    label,
    mobile,
    badge,
  }: {
    tab: TabType;
    icon: any;
    label: string;
    mobile?: boolean;
    badge?: string;
  }) => (
    <button
      type="button"
      onClick={() => setActiveTab(tab)}
      className={`flex flex-col items-center justify-center transition-all duration-150 relative ${
        mobile
          ? `flex-1 py-1 h-full ${
              activeTab === tab ? 'text-teal-600 font-bold' : 'text-slate-500'
            }`
          : `p-2 rounded-xl w-22 h-17 ${
              activeTab === tab
                ? 'bg-teal-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`
      }`}
    >
      <Icon size={mobile ? 18 : 22} className={mobile ? 'mb-0.5' : 'mb-1'} />
      <span className={`${mobile ? 'text-[9px]' : 'text-[11px] font-bold'} whitespace-nowrap`}>
        {label}
      </span>
      {badge && !mobile && (
        <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[9px] px-1 rounded-full font-bold shadow-2xs">
          {badge}
        </span>
      )}
    </button>
  );

  const isSelfServiceLocked = settings?.lockSelfServiceMode ?? true;

  return (
    <div
      className="flex flex-col md:flex-row h-screen w-screen max-w-full bg-slate-100 overflow-hidden"
      dir="rtl"
    >
      {/* Sidebar Navigation (Desktop) */}
      <aside className="hidden md:flex w-28 bg-white border-l border-slate-200 flex-col items-center py-3 gap-1.5 z-10 shrink-0">
        <div className="mb-2 flex flex-col items-center gap-1 shrink-0">
          <div className="w-11 h-11 rounded-2xl overflow-hidden border border-slate-100 bg-white flex items-center justify-center p-0.5">
            <svg
              viewBox="0 0 100 100"
              className="w-full h-full"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#2563eb" />
                  <stop offset="100%" stopColor="#0d9488" />
                </linearGradient>
              </defs>
              <rect width="100" height="100" rx="20" fill="url(#logo-grad)" />
              <path d="M50 28 L68 68 H58 L50 48 L42 68 H32 L50 28 Z" fill="white" />
              <path d="M45 58 H55" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-[10px] font-extrabold text-teal-700">آرکا سیستم</span>
        </div>

        <NavButton tab="pos" icon={Store} label="صندوق سلف" badge={isSelfServiceLocked ? 'سلف' : undefined} />
        <NavButton tab="kitchen" icon={ChefHat} label="منو آشپزخانه" badge="تولید" />
        <NavButton tab="accounting" icon={Landmark} label="حسابداری" />
        <NavButton tab="menu" icon={UtensilsCrossed} label="مدیریت منو" />
        <NavButton tab="reports" icon={BarChart3} label="گزارشات" />
        <NavButton tab="customers" icon={Users} label="مشتریان" />
        <NavButton tab="settings" icon={Settings} label="تنظیمات" />
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 max-w-full flex flex-col h-[calc(100vh-3.5rem)] md:h-full overflow-hidden">
        {activeTab === 'pos' && <POSScreen />}
        {activeTab === 'kitchen' && <KitchenProductionScreen />}
        {activeTab === 'accounting' && <AccountingScreen />}
        {activeTab === 'menu' && <MenuManagerScreen />}
        {activeTab === 'reports' && <ReportsScreen />}
        {activeTab === 'customers' && <CustomersScreen />}
        {activeTab === 'settings' && <SettingsScreen />}
      </main>

      {/* Bottom Navigation (Mobile) */}
      <nav className="flex md:hidden bg-white border-t border-slate-200 h-14 shrink-0 z-30 justify-around items-center px-1 w-full">
        <NavButton tab="pos" icon={Store} label="صندوق" mobile />
        <NavButton tab="kitchen" icon={ChefHat} label="آشپزخانه" mobile />
        <NavButton tab="accounting" icon={Landmark} label="حسابداری" mobile />
        <NavButton tab="menu" icon={UtensilsCrossed} label="منو" mobile />
        <NavButton tab="reports" icon={BarChart3} label="گزارش" mobile />
        <NavButton tab="settings" icon={Settings} label="تنظیمات" mobile />
      </nav>
    </div>
  );
}
