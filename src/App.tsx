/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Store,
  UtensilsCrossed,
  BarChart3,
  Settings,
  Users,
  Landmark,
  ChefHat,
  Lock,
  LogOut,
  ShieldCheck,
  KeyRound,
  Delete,
  AlertCircle,
  Radio,
  RefreshCw,
  Server,
  Wifi,
  WifiOff,
  CheckCircle2,
  HardDriveDownload,
  X,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import POSScreen from './components/POS/POSScreen';
import KitchenProductionScreen from './components/Kitchen/KitchenProductionScreen';
import MenuManagerScreen from './components/MenuManager/MenuManagerScreen';
import ReportsScreen from './components/Reports/ReportsScreen';
import SettingsScreen from './components/Settings/SettingsScreen';
import CustomersScreen from './components/Customers/CustomersScreen';
import AccountingScreen from './components/Accounting/AccountingScreen';
import FirstTimeAdminSetup from './components/Common/FirstTimeAdminSetup';
import { PWAInstallButton } from './components/Common/PWAInstallButton';
import {
  db,
  initializeDefaultDatabase,
  AppUser,
  PermissionKey,
  ALL_PERMISSIONS,
} from './lib/db';
import { sendBackupToMessengers, syncBackupToServer } from './lib/utils';
import {
  initNetworkSync,
  subscribeSyncState,
  pullFromCentralServer,
  pushToCentralServer,
  clearCacheAndHardReload,
  SyncState,
} from './lib/networkSync';

export type TabType =
  | 'pos'
  | 'kitchen'
  | 'accounting'
  | 'menu'
  | 'reports'
  | 'customers'
  | 'settings';

const ALL_TABS_ORDER: TabType[] = [
  'pos',
  'kitchen',
  'accounting',
  'menu',
  'reports',
  'customers',
  'settings',
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('pos');
  const settings = useLiveQuery(() => db.settings.toCollection().first());
  const appUsers = useLiveQuery(() => db.appUsers.toArray()) || [];

  const [currentUserId, setCurrentUserId] = useState<number | null>(() => {
    try {
      const saved = window.sessionStorage.getItem('arka_active_user_id');
      return saved ? Number(saved) : null;
    } catch {
      return null;
    }
  });
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [hasCheckedStartLock, setHasCheckedStartLock] = useState<boolean>(false);

  // Network Sync State
  const [syncState, setSyncState] = useState<SyncState>({
    isOnline: true,
    isSyncing: false,
    serverUrl: typeof window !== 'undefined' ? window.location.origin : '',
    lastSyncTime: null,
    serverRevision: 0,
    localRevision: 0,
    lastError: null,
  });
  const [showNetworkModal, setShowNetworkModal] = useState<boolean>(false);
  const [manualSyncMessage, setManualSyncMessage] = useState<string | null>(null);

  // Login Modal State
  const [selectedLoginUser, setSelectedLoginUser] = useState<AppUser | null>(null);
  const [pinInput, setPinInput] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');

  // Initialize central network synchronization and database on startup
  useEffect(() => {
    initializeDefaultDatabase();
    initNetworkSync();
    const unsubscribe = subscribeSyncState((st) => setSyncState(st));
    return () => unsubscribe();
  }, []);

  // Check if requireLoginOnStart is enabled when settings load
  useEffect(() => {
    if (settings && !hasCheckedStartLock) {
      setHasCheckedStartLock(true);
      const savedSession = window.sessionStorage.getItem('arka_active_user_id');
      if (settings.requireLoginOnStart && !savedSession) {
        setIsLocked(true);
      }
    }
  }, [settings, hasCheckedStartLock]);

  const activeUsers = useMemo(
    () => appUsers.filter((u) => u.isActive !== false),
    [appUsers]
  );

  const currentUser: AppUser | undefined = useMemo(() => {
    if (activeUsers.length === 0) return undefined;
    if (currentUserId !== null) {
      const found = activeUsers.find((u) => u.id === currentUserId);
      if (found) return found;
    }
    return activeUsers.find((u) => u.isAdmin) || activeUsers[0];
  }, [activeUsers, currentUserId]);

  const hasPermission = (perm: PermissionKey): boolean => {
    if (!currentUser) return true;
    if (currentUser.isAdmin) return true;
    return (currentUser.permissions || []).includes(perm);
  };

  const allowedTabs = useMemo(() => {
    return ALL_TABS_ORDER.filter((t) => hasPermission(t));
  }, [currentUser]);

  // Redirect activeTab if currentUser does not have permission for it
  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.includes(activeTab)) {
      setActiveTab(allowedTabs[0]);
    }
  }, [allowedTabs, activeTab]);

  // Hourly Auto-Backup Scheduler for Bale & Telegram Bots + Server Sync
  useEffect(() => {
    if (!settings) return;
    syncBackupToServer(settings);

    if (!settings.autoBackupEnabled) return;
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

  const handleOpenSwitchUser = () => {
    setSelectedLoginUser(currentUser || activeUsers[0] || null);
    setPinInput('');
    setLoginError('');
    setIsLocked(true);
  };

  const handleLoginSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetUser = selectedLoginUser || activeUsers[0];
    if (!targetUser) return;

    if (pinInput.trim() === targetUser.pin.trim()) {
      setCurrentUserId(targetUser.id || null);
      try {
        if (targetUser.id) {
          window.sessionStorage.setItem('arka_active_user_id', String(targetUser.id));
        }
      } catch {
        // ignore storage error
      }
      setIsLocked(false);
      setPinInput('');
      setLoginError('');

      // Switch to first allowed tab for this user
      const userTabs = ALL_TABS_ORDER.filter(
        (t) => targetUser.isAdmin || (targetUser.permissions || []).includes(t)
      );
      if (userTabs.length > 0 && !userTabs.includes(activeTab)) {
        setActiveTab(userTabs[0]);
      }
    } else {
      setLoginError('رمز عبور / کد پین وارد شده صحیح نیست.');
    }
  };

  const handleForceManualSync = async () => {
    setManualSyncMessage('در حال اتصال و همگام‌سازی با سرور مرکزی...');
    const ok = await pullFromCentralServer(false);
    if (ok) {
      setManualSyncMessage('✅ اطلاعات با سرور مرکزی با موفقیت همگام شد!');
    } else {
      const pushOk = await pushToCentralServer(false);
      if (pushOk) {
        setManualSyncMessage('✅ داده‌های محلی با موفقیت روی سرور مرکزی ذخیره و همگام شد!');
      } else {
        setManualSyncMessage('⚠️ امکان برقراری ارتباط با سرور مرکزی وجود ندارد. لطفاً شبکه را بررسی کنید.');
      }
    }
    setTimeout(() => setManualSyncMessage(null), 5000);
  };

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
  }) => {
    if (!hasPermission(tab)) return null;

    return (
      <button
        type="button"
        onClick={() => setActiveTab(tab)}
        className={`flex flex-col items-center justify-center transition-all duration-150 relative cursor-pointer ${
          mobile
            ? `flex-1 py-1 h-full ${
                activeTab === tab ? 'text-teal-600 font-bold' : 'text-slate-500'
              }`
            : `p-2 rounded-xl w-22 h-15 ${
                activeTab === tab
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
        }`}
      >
        <Icon size={mobile ? 18 : 20} className={mobile ? 'mb-0.5' : 'mb-1'} />
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
  };

  const isSelfServiceLocked = settings?.lockSelfServiceMode ?? true;

  // 100% Raw Factory State Setup: Require defining the first administrator user
  if (appUsers.length === 0) {
    return (
      <FirstTimeAdminSetup
        settings={settings}
        onCompleted={(newAdminId) => {
          setCurrentUserId(newAdminId);
          setIsLocked(false);
          setActiveTab('pos');
        }}
      />
    );
  }

  // Full-Screen Login / User Switcher Overlay
  if (isLocked && activeUsers.length > 0) {
    const activeTarget = selectedLoginUser || activeUsers[0];
    return (
      <div
        className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        dir="rtl"
      >
        <div className="bg-white rounded-3xl max-w-md w-full p-5 md:p-6 shadow-2xl border border-slate-200 space-y-5">
          <div className="text-center space-y-1">
            <div className="w-14 h-14 rounded-2xl bg-teal-600 text-white flex items-center justify-center mx-auto shadow-md mb-2">
              <ShieldCheck size={30} />
            </div>
            <h1 className="text-lg font-extrabold text-slate-900">
              {settings?.restaurantName || 'سیستم رستورانی و حسابداری آرکا'}
            </h1>
            <p className="text-xs text-slate-500">
              حساب کاربری خود را انتخاب کرده و رمز عبور (پین) را وارد نمایید
            </p>
          </div>

          {/* User Selection List */}
          <div className="space-y-1.5">
            <label className="block text-xs font-extrabold text-slate-700">
              ۱. انتخاب کاربر سیستم:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-0.5">
              {activeUsers.map((u) => {
                const isSelected = activeTarget?.id === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedLoginUser(u);
                      setPinInput('');
                      setLoginError('');
                    }}
                    className={`p-2.5 rounded-xl border text-right transition flex items-center justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-teal-50 border-teal-600 text-teal-950 ring-2 ring-teal-500/20'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold truncate">{u.fullName}</div>
                      <div className="text-[10px] text-slate-500 font-bold">{u.roleLabel}</div>
                    </div>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                        isSelected ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-700'
                      }`}
                      dir="ltr"
                    >
                      @{u.username}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* PIN / Password Form + Touch Keypad */}
          <form onSubmit={handleLoginSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                ۲. رمز عبور / کد پین «{activeTarget?.fullName}»:
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={pinInput}
                  onChange={(e) => {
                    setPinInput(e.target.value);
                    setLoginError('');
                  }}
                  placeholder="••••"
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 focus:border-teal-600 focus:outline-none text-center font-mono text-lg font-extrabold tracking-widest"
                  dir="ltr"
                />
                <KeyRound
                  size={18}
                  className="absolute left-3.5 top-3.5 text-slate-400 pointer-events-none"
                />
              </div>
            </div>

            {loginError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-1.5">
                <AlertCircle size={15} />
                <span>{loginError}</span>
              </div>
            )}

            {/* Touch Numeric Keypad for POS & Mobile */}
            <div className="grid grid-cols-3 gap-2 pt-1" dir="ltr">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => {
                    setPinInput((p) => p + digit);
                    setLoginError('');
                  }}
                  className="py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 font-mono text-base font-extrabold transition cursor-pointer"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPinInput('')}
                className="py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-extrabold transition cursor-pointer"
              >
                پاک کردن
              </button>
              <button
                type="button"
                onClick={() => {
                  setPinInput((p) => p + '0');
                  setLoginError('');
                }}
                className="py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 font-mono text-base font-extrabold transition cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setPinInput((p) => p.slice(0, -1))}
                className="py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition cursor-pointer"
              >
                <Delete size={18} />
              </button>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-extrabold text-sm shadow-md transition cursor-pointer"
            >
              ورود به سیستم
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col md:flex-row h-screen w-screen max-w-full bg-slate-100 overflow-hidden"
      dir="rtl"
    >
      {/* Sidebar Navigation (Desktop) */}
      <aside className="hidden md:flex w-28 bg-white border-l border-slate-200 flex-col items-center py-2 justify-between z-10 shrink-0">
        <div className="flex flex-col items-center gap-1 w-full">
          <div className="mb-0.5 flex flex-col items-center gap-0.5 shrink-0">
            <div className="w-9 h-9 rounded-2xl overflow-hidden border border-slate-100 bg-white flex items-center justify-center p-0.5">
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

          {/* Central Server Live Status Indicator (Desktop) */}
          <button
            type="button"
            onClick={() => setShowNetworkModal(true)}
            title="وضعیت سینک تحت شبکه با سرور مرکزی"
            className={`w-24 px-1.5 py-1 rounded-xl text-[9px] font-extrabold flex items-center justify-center gap-1 border transition cursor-pointer ${
              syncState.isSyncing
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : syncState.isOnline
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-rose-50 border-rose-300 text-rose-800'
            }`}
          >
            {syncState.isSyncing ? (
              <>
                <RefreshCw size={10} className="animate-spin text-amber-600" />
                <span>سینک سرور...</span>
              </>
            ) : syncState.isOnline ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>سرور: متصل</span>
              </>
            ) : (
              <>
                <WifiOff size={10} className="text-rose-600" />
                <span>سرور: آفلاین</span>
              </>
            )}
          </button>

          <PWAInstallButton variant="compact" className="w-24 mt-1" />

          <div className="flex flex-col items-center gap-0.5 w-full mt-1">
            <NavButton
              tab="pos"
              icon={Store}
              label="صندوق سلف"
              badge={isSelfServiceLocked ? 'سلف' : undefined}
            />
            <NavButton tab="kitchen" icon={ChefHat} label="منو آشپزخانه" badge="تولید" />
            <NavButton tab="accounting" icon={Landmark} label="حسابداری" />
            <NavButton tab="menu" icon={UtensilsCrossed} label="مدیریت منو" />
            <NavButton tab="reports" icon={BarChart3} label="گزارشات" />
            <NavButton tab="customers" icon={Users} label="مشتریان" />
            <NavButton tab="settings" icon={Settings} label="تنظیمات" />
          </div>
        </div>

        {/* Active User & Switch User Button (Desktop Sidebar Footer) */}
        <button
          type="button"
          onClick={handleOpenSwitchUser}
          title="تغییر کاربر یا قفل صفحه"
          className="mt-1 w-24 p-1.5 rounded-xl bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 flex flex-col items-center gap-0.5 text-center transition cursor-pointer group"
        >
          <div className="flex items-center gap-1 text-[10px] font-extrabold text-slate-800 group-hover:text-rose-700 truncate max-w-full">
            <Lock size={10} />
            <span className="truncate">{currentUser?.fullName || 'مدیر سیستم'}</span>
          </div>
          <span className="text-[9px] text-teal-700 group-hover:text-rose-600 font-bold">
            {currentUser?.roleLabel || 'تغییر کاربر'}
          </span>
        </button>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 max-w-full flex flex-col h-[calc(100vh-3.5rem)] md:h-full overflow-hidden">
        {activeTab === 'pos' && hasPermission('pos') && <POSScreen />}
        {activeTab === 'kitchen' && hasPermission('kitchen') && <KitchenProductionScreen />}
        {activeTab === 'accounting' && hasPermission('accounting') && <AccountingScreen />}
        {activeTab === 'menu' && hasPermission('menu') && <MenuManagerScreen />}
        {activeTab === 'reports' && hasPermission('reports') && <ReportsScreen />}
        {activeTab === 'customers' && hasPermission('customers') && <CustomersScreen />}
        {activeTab === 'settings' && hasPermission('settings') && <SettingsScreen />}
      </main>

      {/* Bottom Navigation (Mobile) */}
      <nav className="flex md:hidden bg-white border-t border-slate-200 h-14 shrink-0 z-30 justify-around items-center px-1 w-full">
        <NavButton tab="pos" icon={Store} label="صندوق" mobile />
        <NavButton tab="kitchen" icon={ChefHat} label="آشپزخانه" mobile />
        <NavButton tab="accounting" icon={Landmark} label="حسابداری" mobile />
        <NavButton tab="menu" icon={UtensilsCrossed} label="منو" mobile />
        <NavButton tab="reports" icon={BarChart3} label="گزارش" mobile />
        <NavButton tab="settings" icon={Settings} label="تنظیمات" mobile />
        <button
          type="button"
          onClick={() => setShowNetworkModal(true)}
          className="flex flex-col items-center justify-center flex-1 py-1 h-full text-slate-500 cursor-pointer"
        >
          <Server size={17} className={syncState.isOnline ? 'text-emerald-600' : 'text-rose-600'} />
          <span className="text-[9px] font-bold whitespace-nowrap">شبکه</span>
        </button>
        <button
          type="button"
          onClick={handleOpenSwitchUser}
          className="flex flex-col items-center justify-center flex-1 py-1 h-full text-rose-600 cursor-pointer"
        >
          <LogOut size={17} className="mb-0.5" />
          <span className="text-[9px] font-bold whitespace-nowrap">کاربر</span>
        </button>
      </nav>

      {/* Network Terminal & Central Server Modal */}
      {showNetworkModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          dir="rtl"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 md:p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
                  <Server size={20} />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">
                    وضعیت سرور مرکزی و شبکه کلاینت‌ها (LAN / WAN)
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    همگام‌سازی لحظه‌ای تمامی صندوق‌ها، تبلت آشپزخانه و گوشی‌ها با سرور اصلی
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNetworkModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">آدرس سرور مرکزی:</span>
                  <span className="font-mono font-extrabold text-slate-900" dir="ltr">
                    {syncState.serverUrl || window.location.origin}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">وضعیت اتصال:</span>
                  <span
                    className={`font-extrabold px-2 py-0.5 rounded-md ${
                      syncState.isOnline
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {syncState.isOnline ? '🟢 متصل به سرور مرکزی' : '🔴 قطع ارتباط با سرور'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">نسخه دیتابیس همگام:</span>
                  <span className="font-mono font-bold text-slate-700">
                    Rev #{syncState.localRevision} (سرور: #{syncState.serverRevision})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">آخرین همگام‌سازی:</span>
                  <span className="text-slate-700 font-bold">
                    {syncState.lastSyncTime
                      ? syncState.lastSyncTime.toLocaleTimeString('fa-IR')
                      : 'به‌تازگی'}
                  </span>
                </div>
              </div>

              {manualSyncMessage && (
                <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-bold">
                  {manualSyncMessage}
                </div>
              )}

              <p className="text-[11px] text-slate-600 leading-relaxed bg-blue-50/70 p-3 rounded-xl border border-blue-100">
                💡 تمام صندوق‌ها، تبلت آشپزخانه و گوشی‌های سالن‌دار که آدرس سرور (مثلاً{' '}
                <span className="font-mono text-blue-800 font-bold" dir="ltr">
                  {window.location.host}
                </span>
                ) را باز کنند، مستقیماً به همین دیتابیس مرکزی متصل شده و تمامی فاکتورها، انبار و گزارش‌ها در لحظه بین همه همگام می‌شود.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleForceManualSync}
                  className="py-2.5 px-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <RefreshCw size={14} className={syncState.isSyncing ? 'animate-spin' : ''} />
                  <span>همگام‌سازی فوری با سرور</span>
                </button>

                <button
                  type="button"
                  onClick={clearCacheAndHardReload}
                  className="py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <HardDriveDownload size={14} />
                  <span>پاکسازی کش و بارگذاری نسخه جدید</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
