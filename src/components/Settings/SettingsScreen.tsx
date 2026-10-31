import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  AppSettings,
  AppUser,
  PermissionKey,
  ALL_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  resetDatabaseToRaw,
  convertDatabaseCurrencyUnit,
  getDefaultQuickBeverages,
  QuickBeverageOption,
} from '../../lib/db';
import {
  exportDB,
  importDB,
  sendBackupToMessengers,
  syncBackupToServer,
  setGlobalCurrencyUnit,
  getCurrencyLabel,
  optimizeDatabaseStorage,
} from '../../lib/utils';
import {
  notifyRawResetToCentralServer,
  pushToCentralServer,
  pullFromCentralServer,
  getNodeRole,
  setNodeRole,
  setServerUrl,
  fetchServerNetworkInfo,
  updateServerPort,
  updateServerDomain,
  saveServerLanIpPreference,
  testServerConnection,
} from '../../lib/networkSync';
import FormattedNumberInput from '../Common/FormattedNumberInput';
import { PWAInstallButton } from '../Common/PWAInstallButton';
import {
  Save,
  Download,
  Upload,
  Check,
  AlertTriangle,
  RotateCcw,
  Bot,
  Send,
  UserPlus,
  Edit3,
  Trash2,
  Lock,
  KeyRound,
  ShieldCheck,
  Clock,
  Coins,
  Receipt,
  Eye,
  EyeOff,
  Sparkles,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  Users,
  Smartphone,
  Store,
  Shield,
  Printer,
  Server,
  Radio,
  Wifi,
  ArrowRightLeft,
  Globe,
  Activity,
  Copy,
  Settings2,
  RefreshCw,
  ArrowLeft,
  Plus,
  Coffee,
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { NodeRoleManagerModal } from '../Network/NodeRoleManagerModal';

const ROLE_PRESETS: Array<{
  label: string;
  isAdmin: boolean;
  permissions: PermissionKey[];
}> = [
  {
    label: 'مدیر کل',
    isAdmin: true,
    permissions: [...ALL_PERMISSIONS],
  },
  {
    label: 'صندوق‌دار',
    isAdmin: false,
    permissions: ['pos'],
  },
  {
    label: 'صندوق‌دار ارشد',
    isAdmin: false,
    permissions: ['pos', 'pos_discount', 'pos_cancel', 'customers', 'reports'],
  },
  {
    label: 'سرآشپز / مسئول تولید',
    isAdmin: false,
    permissions: ['kitchen', 'menu'],
  },
  {
    label: 'حسابدار و انباردار',
    isAdmin: false,
    permissions: ['accounting', 'reports', 'pos', 'pos_cancel'],
  },
];

export default function SettingsScreen() {
  const { isInstalled, isTauri } = usePWAInstall();
  const settings = useLiveQuery(() => db.settings.toCollection().first());
  const appUsers = useLiveQuery(() => db.appUsers.toArray()) || [];

  const [activeTab, setActiveTab] = useState<'network' | 'general' | 'users' | 'backup'>('network');
  const [formData, setFormData] = useState<Partial<AppSettings>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingBot, setIsSendingBot] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

  // Network Engine & Printer Intelligence State
  const [showNodeRoleModal, setShowNodeRoleModal] = useState(false);
  const [nodeRole, setNodeRoleState] = useState<'server' | 'client'>(getNodeRole());
  const [detectedPrinters, setDetectedPrinters] = useState<string[]>([]);
  const [isDetectingPrinters, setIsDetectingPrinters] = useState(false);

  const [networkInfo, setNetworkInfo] = useState<{
    hostname?: string;
    platform?: string;
    isLinuxServer?: boolean;
    isTauriApp?: boolean;
    port?: number;
    localIps?: string[];
    primaryUrl?: string;
    customDomain?: string;
    domainUrl?: string;
    isServerRunning?: boolean;
    rev?: number;
  }>({});
  const [serverCustomPort, setServerCustomPort] = useState<number | string>(4040);
  const [isSavingPort, setIsSavingPort] = useState(false);
  const [portNotice, setPortNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Real Windows LAN IP & Manual Selection State
  const [manualLanIpInput, setManualLanIpInput] = useState('');
  const [isRefreshingNetInfo, setIsRefreshingNetInfo] = useState(false);

  // Custom Domain & Internet Sharing State
  const [serverDomainInput, setServerDomainInput] = useState(() => {
    try {
      return window.localStorage.getItem('arka_server_domain') || '';
    } catch {
      return '';
    }
  });
  const [serverDomainProtocol, setServerDomainProtocol] = useState<'https://' | 'http://'>('https://');
  const [isSavingDomain, setIsSavingDomain] = useState(false);
  const [domainNotice, setDomainNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Client Connection Config State
  const [hostType, setHostType] = useState<'ip' | 'domain'>('ip');
  const [clientHostInput, setClientHostInput] = useState('192.168.1.100');
  const [clientPortInput, setClientPortInput] = useState('4040');
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [testConnResult, setTestConnResult] = useState<{ ok: boolean; message: string; pingMs?: number } | null>(null);

  const loadNetworkInfo = async () => {
    setIsRefreshingNetInfo(true);
    try {
      const res = await fetchServerNetworkInfo();
      setNetworkInfo(res);
      if (res.port) {
        setServerCustomPort(res.port);
        setClientPortInput(String(res.port));
      }
      if (res.customDomain) {
        setServerDomainInput(res.customDomain.replace(/^https?:\/\//i, ''));
        if (res.customDomain.startsWith('http://')) {
          setServerDomainProtocol('http://');
        } else {
          setServerDomainProtocol('https://');
        }
      }
      if (res.localIps && res.localIps.length > 0) {
        setClientHostInput(res.localIps[0]);
        if (!manualLanIpInput) {
          setManualLanIpInput(res.localIps[0]);
        }
      }
    } finally {
      setIsRefreshingNetInfo(false);
    }
  };

  useEffect(() => {
    loadNetworkInfo();
  }, []);

  const handleCopyText = (text: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {}
  };

  const handleSaveCustomPort = async () => {
    const portNum = Number(serverCustomPort);
    if (!portNum || (portNum !== 80 && portNum !== 443 && (portNum < 1024 || portNum > 65535))) {
      setPortNotice({ type: 'error', text: 'لطفاً شماره پورت معتبر (۸۰، ۴۴۳ یا بین ۱۰۲۴ تا ۶۵۵۳۵) وارد فرمایید.' });
      return;
    }

    setIsSavingPort(true);
    setPortNotice(null);
    try {
      const res = await updateServerPort(portNum);
      if (res.ok) {
        const portSuffix = portNum === 80 || portNum === 443 ? '' : `:${portNum}`;
        setPortNotice({ type: 'success', text: `پورت سرور با موفقیت روی ${portNum} تنظیم گردید.` });
        setNetworkInfo((prev) => ({
          ...prev,
          port: portNum,
          primaryUrl:
            prev.localIps && prev.localIps.length > 0
              ? `http://${prev.localIps[0]}${portSuffix}`
              : `http://localhost${portSuffix}`,
        }));
      } else {
        setPortNotice({ type: 'error', text: res.error || 'خطا در ثبت پورت سرور.' });
      }
    } catch (e: any) {
      setPortNotice({ type: 'error', text: e?.message || 'خطا در ذخیره پورت.' });
    } finally {
      setIsSavingPort(false);
    }
  };

  const handleSelectPrimaryIp = (ip: string) => {
    saveServerLanIpPreference(ip);
    const port = Number(serverCustomPort) || networkInfo.port || 4040;
    const portSuffix = port === 80 || port === 443 ? '' : `:${port}`;
    const fullUrl = `http://${ip}${portSuffix}`;
    setNetworkInfo((prev) => ({
      ...prev,
      primaryUrl: fullUrl,
    }));
    handleCopyText(fullUrl);
    showNotice('success', `آدرس اصلی سرور روی ${fullUrl} تنظیم شد و در کلیپ‌بورد کپی گردید.`);
  };

  const handleSaveManualLanIp = () => {
    const cleanIp = manualLanIpInput.trim();
    if (!cleanIp) {
      showNotice('error', 'لطفاً یک آدرس آی‌پی معتبر وارد فرمایید.');
      return;
    }
    saveServerLanIpPreference(cleanIp);
    const port = Number(serverCustomPort) || networkInfo.port || 4040;
    const portSuffix = port === 80 || port === 443 ? '' : `:${port}`;
    const newIps = Array.from(new Set([cleanIp, ...(networkInfo.localIps || [])]));
    setNetworkInfo((prev) => ({
      ...prev,
      localIps: newIps,
      primaryUrl: `http://${cleanIp}${portSuffix}`,
    }));
    showNotice('success', `آی‌پی سرور روی ${cleanIp} با موفقیت ثبت شد.`);
  };

  const handleSaveServerDomain = async () => {
    const cleanDomain = serverDomainInput.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    setIsSavingDomain(true);
    setDomainNotice(null);
    try {
      const fullDomain = cleanDomain ? `${serverDomainProtocol}${cleanDomain}` : '';
      const res = await updateServerDomain(fullDomain);
      if (res.ok) {
        setDomainNotice({ type: 'success', text: cleanDomain ? 'دامنه اختصاصی با موفقیت ثبت شد.' : 'تنظیمات دامنه پاکسازی گردید.' });
        setNetworkInfo((prev) => ({
          ...prev,
          customDomain: fullDomain,
          domainUrl: fullDomain,
        }));
      } else {
        setDomainNotice({ type: 'error', text: res.error || 'خطا در ذخیره دامنه سرور.' });
      }
    } catch (e: any) {
      setDomainNotice({ type: 'error', text: e?.message || 'خطا در ذخیره دامنه.' });
    } finally {
      setIsSavingDomain(false);
    }
  };

  const handleTestClientConnection = async () => {
    let cleanHost = clientHostInput.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const cleanPort = clientPortInput.trim();
    if (!cleanHost) {
      setTestConnResult({ ok: false, message: 'لطفاً آدرس آی‌پی یا نام دامنه سرور را وارد فرمایید.' });
      return;
    }

    const constructedUrl = cleanPort ? `http://${cleanHost}:${cleanPort}` : `http://${cleanHost}`;
    setIsTestingConn(true);
    setTestConnResult(null);

    const startTime = performance.now();
    try {
      const res = await testServerConnection(constructedUrl);
      const duration = Math.round(performance.now() - startTime);

      if (res.ok) {
        setTestConnResult({
          ok: true,
          message: `ارتباط موفقیت‌آمیز با سرور برقرار شد (ویرایش دیتابیس: ${res.rev || 1})`,
          pingMs: duration,
        });
      } else {
        setTestConnResult({
          ok: false,
          message: res.error || 'عدم امکان برقراری ارتباط با سرور مقصد.',
        });
      }
    } catch (e: any) {
      setTestConnResult({
        ok: false,
        message: e?.message || 'خطا در شبکه یا پاسخ ندادن سرور.',
      });
    } finally {
      setIsTestingConn(false);
    }
  };

  const handleApplyClientServerUrl = async () => {
    let cleanHost = clientHostInput.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const cleanPort = clientPortInput.trim();
    if (!cleanHost) {
      showNotice('error', 'لطفاً ابتدا آدرس آی‌پی یا نام دامنه سرور را وارد فرمایید.');
      return;
    }
    const constructedUrl = cleanPort ? `http://${cleanHost}:${cleanPort}` : `http://${cleanHost}`;
    setServerUrl(constructedUrl);
    setNodeRole('client');
    setNodeRoleState('client');
    showNotice('success', `این دستگاه به عنوان کلاینت با موفقیت به سرور مرکزی (${constructedUrl}) متصل شد.`);
    await pullFromCentralServer(false);
  };

  const handleOptimizeDatabase = async () => {
    setIsOptimizing(true);
    try {
      const res = await optimizeDatabaseStorage();
      const freedKB = Math.round(res.freedBytesEstimate / 1024);
      showNotice(
        'success',
        `بهینه‌سازی و سبک‌سازی دیتابیس انجام شد: ${res.optimizedItems} تصویر فشرده گردید و ${res.cleanedVouchers} رکورد خالی پاکسازی شد (${freedKB} کیلوبایت فضای حافظه آزادسازی گردید).`
      );
    } catch {
      showNotice('error', 'خطا در بهینه‌سازی دیتابیس.');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleDetectPrinters = async () => {
    setIsDetectingPrinters(true);
    try {
      // 1. Try real Windows printers query API endpoint
      try {
        const res = await fetch('/api/printers/list');
        if (res.ok) {
          const data = await res.json();
          if (data.ok && Array.isArray(data.printers) && data.printers.length > 0) {
            setDetectedPrinters(data.printers);
            if (data.printers[0]) {
              setFormData((prev) => ({ ...prev, printerName: data.printers[0] }));
              try {
                window.localStorage.setItem('arka_terminal_printer', data.printers[0]);
              } catch {}
            }
            showNotice('success', `${data.printers.length} پرینتر واقعی نصب‌شده روی ویندوز شناسایی گردید.`);
            return;
          }
        }
      } catch {
        // ignore
      }

      // 2. Try Web Query API
      if (typeof window !== 'undefined' && 'queryLocalPrinters' in window) {
        const printers = await (window as any).queryLocalPrinters();
        if (Array.isArray(printers) && printers.length > 0) {
          const names = printers.map((p: any) => p.name || p);
          setDetectedPrinters(names);
          if (names[0]) {
            setFormData((prev) => ({ ...prev, printerName: names[0] }));
            try {
              window.localStorage.setItem('arka_terminal_printer', names[0]);
            } catch {}
          }
          showNotice('success', `${names.length} پرینتر نصب شده روی سیستم شناسایی شد.`);
          return;
        }
      }
      // 3. Fallback common thermal models
      const common = ['XP-80C', 'POS-80', 'POS-58', 'EPSON TM-T20', 'BIXOLON SRP-330', 'Rongta RP80'];
      setDetectedPrinters(common);
      showNotice(
        'success',
        'مدل‌های متداول پرینتر حرارتی لود شدند. می‌توانید مدل پرینتر خود را انتخاب یا در کادر زیر وارد کنید.'
      );
    } catch {
      setDetectedPrinters(['XP-80C', 'POS-80', 'POS-58', 'EPSON TM-T20', 'BIXOLON SRP-330']);
    } finally {
      setIsDetectingPrinters(false);
    }
  };

  const handleDownloadSilentPrintBat = () => {
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4040';
    const pName = (formData.printerName || '').trim();
    const batContent = `@echo off
chcp 65001 >nul
title Arka POS - Intelligent Silent Kiosk Printing & Thermal Printer Setup
color 0B
cls
echo =================================================================
echo   آرکا سیستم - راه اندازی خودکار چاپ درجا و تنظیم پرینتر پیش‌فرض
echo =================================================================
echo.
set TARGET_URL=${currentOrigin}
set PRINTER_NAME=${pName}

echo [1/3] بررسی و استعلام پرینترهای متصل به ویندوز...
powershell -NoProfile -Command "Get-CimInstance Win32_Printer | Select-Object Name, Default"

if not "%PRINTER_NAME%"=="" (
    echo.
    echo [2/3] در حال تنظیم پرینتر پیش فرض ویندوز روی: %PRINTER_NAME%
    powershell -NoProfile -Command "(New-Object -ComObject WScript.Network).SetDefaultPrinter('%PRINTER_NAME%')" 2>nul
    rundll32 printui.dll,PrintUIEntry /y /n "%PRINTER_NAME%" 2>nul
) else (
    echo.
    echo [2/3] در حال شناسایی خودکار فیش‌پرینتر حرارتی (POS / Thermal)...
    for /f "delims=" %%p in ('powershell -NoProfile -Command "$p = (Get-CimInstance Win32_Printer | Where-Object { $_.Name -match 'POS|XP|80|58|Thermal|Receipt|Bixolon|Epson|Rongta|Sewoo' } | Select-Object -First 1).Name; if ($p) { Write-Output $p }"') do set DETECTED_PRINTER=%%p
    if not "%DETECTED_PRINTER%"=="" (
        echo [✔] پرینتر حرارتی شناسایی گردید: %DETECTED_PRINTER%
        set PRINTER_NAME=%DETECTED_PRINTER%
        powershell -NoProfile -Command "(New-Object -ComObject WScript.Network).SetDefaultPrinter('%DETECTED_PRINTER%')" 2>nul
        rundll32 printui.dll,PrintUIEntry /y /n "%DETECTED_PRINTER%" 2>nul
    )
)

echo.
echo [3/3] ساخت شورت‌کات دسکتاپ با سوئیچ چاپ درجا (--kiosk-printing)...
set FINAL_URL=%TARGET_URL%
if not "%PRINTER_NAME%"=="" (
    set FINAL_URL=%TARGET_URL%?printer=%PRINTER_NAME%
)

:: Create Desktop Shortcut pointing directly to Silent Kiosk mode
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $desktop = [System.Environment]::GetFolderPath('Desktop'); $s = $ws.CreateShortcut([System.IO.Path]::Combine($desktop, 'صندوق آرکا - چاپ درجا.lnk')); $chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'; if (-not (Test-Path $chrome)) { $chrome = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' }; if (-not (Test-Path $chrome)) { $chrome = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' }; if (-not (Test-Path $chrome)) { $chrome = 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' }; $s.TargetPath = $chrome; $s.Arguments = '--kiosk-printing --app=\"' + '%FINAL_URL%' + '\"'; $s.IconLocation = $chrome + ',0'; $s.Save()"

echo.
echo [✔] شورت‌کات «صندوق آرکا - چاپ درجا» روی دسکتاپ ویندوز قرار گرفت!
echo [✔] از این پس با باز کردن این میانبر، تمام فیش‌ها مستقیماً و بدون باز شدن دیالوگ چاپ خواهند شد.
echo.
echo در حال اجرای نرم‌افزار...

set CHROME_PATH1="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
set CHROME_PATH2="C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
set EDGE_PATH1="C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
set EDGE_PATH2="C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"

if exist %CHROME_PATH1% (
    start "" %CHROME_PATH1% --kiosk-printing --app="%FINAL_URL%"
    exit
)
if exist %CHROME_PATH2% (
    start "" %CHROME_PATH2% --kiosk-printing --app="%FINAL_URL%"
    exit
)
if exist %EDGE_PATH1% (
    start "" %EDGE_PATH1% --kiosk-printing --app="%FINAL_URL%"
    exit
)
if exist %EDGE_PATH2% (
    start "" %EDGE_PATH2% --kiosk-printing --app="%FINAL_URL%"
    exit
)

start "" "%FINAL_URL%"
exit
`;
    const blob = new Blob([batContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Arka_POS_Silent_Print_Setup.bat';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadCleanUninstallerBat = () => {
    const batContent = `@echo off
chcp 65001 >nul
title ابزار پاکسازی نسخه‌های قدیمی و جداسازی کامل نصب - Arka Clean Setup
color 0C
cls
echo ======================================================================
echo    سامانه فروش و صندوقداری آرکا - پاکسازی نسخه قدیمی و جداسازی کامل
echo ======================================================================
echo.
echo این اسکریپت تمام نسخه و آثار قبلی نرم‌افزار را از ویندوز پاک می‌کند
echo تا نسخه جدید (Arka POS Enterprise v2) در مسیر کاملاً مجزا
echo C:\\Program Files\\Arka-POS-Enterprise-v2 نصب شود.
echo.
echo ----------------------------------------------------------------------
echo.
set /p userConfirm="آیا برای پاکسازی نسخه قدیمی و جداسازی کامل اطمینان دارید؟ (Y/N): "
if /i not "%userConfirm%"=="Y" (
    echo [!] عملیات لغو شد.
    pause
    exit /b
)
echo.
echo [*] ۱. بستن پروسه‌های قدیمی...
taskkill /F /IM arka-pos.exe >nul 2>&1
taskkill /F /IM Arka-POS.exe >nul 2>&1
taskkill /F /IM tauri-app.exe >nul 2>&1
echo [✔] پروسه‌های فعال بسته شدند.

echo [*] ۲. پاکسازی پوشه‌های کش و AppData قدیمی...
rmdir /S /Q "%LOCALAPPDATA%\\com.tauri.dev" >nul 2>&1
rmdir /S /Q "%LOCALAPPDATA%\\com.arkasystem.pos" >nul 2>&1
rmdir /S /Q "%LOCALAPPDATA%\\Arka-POS" >nul 2>&1
rmdir /S /Q "%APPDATA%\\com.tauri.dev" >nul 2>&1
rmdir /S /Q "%APPDATA%\\com.arkasystem.pos" >nul 2>&1
rmdir /S /Q "%APPDATA%\\Arka-POS" >nul 2>&1
echo [✔] آثار نسخه‌های قدیمی حذف گردید.

echo ======================================================================
echo    [✔] پاکسازی انجام شد!
echo    اکنون می‌توانید فایل نصب جدید (Arka-POS-Enterprise-v2 Setup) را اجرا نمایید.
echo ======================================================================
echo.
pause
`;
    const blob = new Blob([batContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cleanup-old-arka-pos.bat';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadFirewallScript = () => {
    const targetPort = serverCustomPort || networkInfo.port || 4040;
    const batContent = `@echo off
chcp 65001 >nul
title تنظیم خودکار فایروال ویندوز - Arka POS Server Firewall Rule
color 0A
cls
echo ======================================================================
echo    سامانه فروش و صندوقداری آرکا - باز کردن پورت ${targetPort} در فایروال ویندوز
echo ======================================================================
echo.
echo این اسکریپت پورت شبکه ${targetPort} را در فایروال ویندوز (Windows Firewall) باز می‌کند
echo تا سایر صندوق‌ها، کلاینت‌ها، تبلت‌ها و گوشی‌های موجود در شبکه محلی بدون مانع متصل شوند.
echo.
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] خطا: این فایل باید به صورت Admin اجرا شود.
    echo لطفاً روی فایل راست کلیک کرده و گزینه Run as Administrator را انتخاب نمایید.
    echo.
    pause
    exit /b
)
echo [*] در حال ایجاد قانون ورودی (Inbound Rule) برای پورت TCP ${targetPort}...
netsh advfirewall firewall delete rule name="Arka POS Server Port ${targetPort}" >nul 2>&1
netsh advfirewall firewall add rule name="Arka POS Server Port ${targetPort}" dir=in action=allow protocol=TCP localport=${targetPort}
echo.
echo ======================================================================
echo    [✔] پورت ${targetPort} با موفقیت در فایروال ویندوز آزاد گردید!
echo    اکنون کلاینت‌های شبکه می‌توانند بدون مانع به این سرور متصل شوند.
echo ======================================================================
echo.
pause
`;
    const blob = new Blob([batContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `open-firewall-port-${targetPort}.bat`;
    URL.revokeObjectURL(url);
  };

  const handleDownloadAutoShareBat = () => {
    const targetPort = serverCustomPort || networkInfo.port || 4040;
    const batContent = `@echo off
chcp 65001 >nul
title سامانه اشتراک‌گذاری خودکار در شبکه محلی و اینترنت - Arka POS LAN Server
color 0A
cls

echo ======================================================================
echo       سامانه فروش، صندوقداری و مدیریت رستوران و کترینگ آرکا
echo      اسکریپت راه‌اندازی و اشتراک‌گذاری خودکار در شبکه محلی و اینترنت
echo ======================================================================
echo.

:: 1. Check Administrator Privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [*] در حال دریافت مجوز دسترسی مدیر (Administrator) جهت تنظیم فایروال و شبکه...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c \\"\\"%~f0\\"\\" admin' -Verb RunAs"
    exit /b
)

echo [✔] دسترسی Administrator تأیید شد.
echo.

:: 2. Set Network Profile to Private
echo [*] ۱. تنظیم پروفایل شبکه ویندوز روی حالت «خصوصی» (Private Network)...
powershell -NoProfile -Command "Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -ne 'DomainAuthenticated' } | Set-NetConnectionProfile -NetworkCategory Private" >nul 2>&1
echo [✔] کارت‌های شبکه روی Private تنظیم شدند تا ارتباط سایر سیستم‌ها بدون مانع برقرار شود.

:: 3. Open Port in Windows Firewall
echo [*] ۲. باز کردن پورت ${targetPort} در دیوار آتش ویندوز (Windows Defender Firewall)...
netsh advfirewall firewall delete rule name="Arka POS Server Port ${targetPort}" >nul 2>&1
netsh advfirewall firewall add rule name="Arka POS Server Port ${targetPort}" dir=in action=allow protocol=TCP localport=${targetPort} profile=any >nul 2>&1
netsh advfirewall firewall add rule name="Arka POS Server Port ${targetPort}" dir=out action=allow protocol=TCP localport=${targetPort} profile=any >nul 2>&1
echo [✔] پورت ${targetPort} در فایروال ویندوز برای تمام شبکه‌ها آزاد شد.

:: 4. Disable Standby / Sleep on AC Power
echo [*] ۳. تنظیم مدیریت انرژی ویندوز (جلوگیری از به خواب رفتن سیستم در طول ساعات کاری)...
powercfg -change -standby-timeout-ac 0 >nul 2>&1
echo [✔] حالت Sleep برای زمان اتصال به برق غیرفعال شد.

:: 5. Detect Real Windows LAN IPv4 Addresses
echo.
echo ======================================================================
echo               آدرس‌های واقعی این کامپیوتر در شبکه محلی (LAN):
powershell -NoProfile -Command "$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet|VirtualBox|VMware|Tailscale|ZeroTier' -and $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -ExpandProperty IPAddress; if ($ips) { foreach($ip in $ips) { Write-Host \"    👉 http://${'$'}{ip}:${targetPort}\" -ForegroundColor Green } } else { Write-Host '    [!] کارت شبکه فعالی متصل نیست.' -ForegroundColor Yellow }"

echo.
echo [★] سایر کامپیوترها، لپ‌تاپ‌ها، تبلت‌های گارسون و گوشی‌ها می‌توانند
echo     با وارد کردن یکی از آدرس‌های بالا در مرورگر (Chrome یا Edge) به این صندوق وصل شوند.
echo ======================================================================
echo.

:: 6. Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [خطا] موتور Node.js روی این ویندوز پیدا نشد!
    echo لطفاً Node.js را از آدرس https://nodejs.org دانلود و نصب فرمایید (نصب ۱ دقیقه‌ای).
    echo سپس این فایل را مجدداً اجرا کنید.
    echo.
    pause
    exit /b 1
)

:: 7. Create Startup shortcut
set SCRIPT_DIR=%~dp0
set STARTUP_VBS=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\Arka_POS_Server_AutoShare.vbs
if not exist "%STARTUP_VBS%" (
    echo Set WshShell = CreateObject("WScript.Shell") > "%STARTUP_VBS%"
    echo WshShell.CurrentDirectory = "%SCRIPT_DIR%" >> "%STARTUP_VBS%"
    echo WshShell.Run "node server.cjs", 0, False >> "%STARTUP_VBS%"
    echo [✔] راه‌اندازی خودکار سرور در استارت‌آپ ویندوز (Startup) ثبت شد.
)

:: 8. Start production server
echo [*] در حال راه‌اندازی سرور مرکزی روی پورت ${targetPort}...
echo [*] توجه: تا زمانی که می‌خواهید سایر سیستم‌ها به این کامپیوتر متصل باشند این پنجره را نبندید.
echo.

cd /d "%SCRIPT_DIR%"
node server.cjs

pause
`;
    const blob = new Blob([batContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Start_Arka_Server_LAN_Share.bat';
    link.click();
    URL.revokeObjectURL(url);
  };

  const [confirmRawReset, setConfirmRawReset] = useState(false);
  const [isResettingRaw, setIsResettingRaw] = useState(false);

  // User Management Form State
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [userForm, setUserForm] = useState<{
    username: string;
    fullName: string;
    pin: string;
    roleLabel: string;
    isAdmin: boolean;
    permissions: PermissionKey[];
    isActive: boolean;
  }>({
    username: '',
    fullName: '',
    pin: '',
    roleLabel: 'صندوق‌دار',
    isAdmin: false,
    permissions: ['pos'],
    isActive: true,
  });

  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) {
      const currentUnit = settings.currencyUnit || 'toman';
      const defaultBevs = getDefaultQuickBeverages(currentUnit);
      setFormData({
        ...settings,
        quickBeverages:
          settings.quickBeverages && settings.quickBeverages.length > 0
            ? settings.quickBeverages
            : defaultBevs,
      });
      if (settings.currencyUnit) {
        setGlobalCurrencyUnit(settings.currencyUnit);
      }
    }
  }, [settings]);

  const showNotice = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 6000);
  };

  const handleCurrencyChange = async (unit: 'toman' | 'rial') => {
    setGlobalCurrencyUnit(unit);
    const res = await convertDatabaseCurrencyUnit(unit);
    const updatedSettings = await db.settings.toCollection().first();
    if (updatedSettings) {
      setFormData(updatedSettings);
      await syncBackupToServer(updatedSettings);
    } else {
      setFormData({ ...formData, currencyUnit: unit });
    }
    try {
      await pushToCentralServer(false);
    } catch {
      // ignore if offline
    }
    if (res.converted) {
      showNotice(
        'success',
        unit === 'toman'
          ? 'واحد پول کل سامانه به «تومان» تغییر یافت و به‌صورت اتوماتیک یک صفر از تمامی مبالغ، قیمت‌ها، فرمول‌های تولید، انبار و ثبت‌های قبلی کم شد (تبدیل ریال به تومان).'
          : 'واحد پول کل سامانه به «ریال» تغییر یافت و به‌صورت اتوماتیک یک صفر به تمامی مبالغ، قیمت‌ها، فرمول‌های تولید، انبار و ثبت‌های قبلی اضافه شد (تبدیل تومان به ریال).'
      );
    } else {
      showNotice(
        'success',
        `واحد پول کل سامانه بر روی «${unit === 'rial' ? 'ریال' : 'تومان'}» تنظیم و در تمام بخش‌های نرم‌افزار یکپارچه است.`
      );
    }
  };

  const handleSave = async () => {
    if (!settings?.id) return;
    setIsSaving(true);
    if (formData.currencyUnit) {
      setGlobalCurrencyUnit(formData.currencyUnit);
    }

    // Auto-sync raw materials stock items for all quick beverages so warehouse deduction is 100% ready
    if (formData.quickBeverages && formData.quickBeverages.length > 0) {
      const currentMaterials = await db.rawMaterials.toArray();
      for (const bev of formData.quickBeverages) {
        if (!bev.name?.trim()) continue;
        const matName = bev.name.replace(/ اضافه$/, '').trim();
        const exists = currentMaterials.some(
          (m) => m.name.trim() === matName || m.name.trim() === bev.name.trim()
        );
        if (!exists) {
          const autoCost = Math.round((bev.price || 0) * 0.45);
          await db.rawMaterials.add({
            name: matName,
            unit: 'عدد',
            currentQty: 200,
            minQty: 15,
            avgCost: autoCost,
            lastPurchasePrice: autoCost,
            updatedAt: new Date(),
          });
        }
      }
    }

    await db.settings.update(settings.id, formData);
    await pushToCentralServer(false);
    await syncBackupToServer(formData);
    setIsSaving(false);
    showNotice(
      'success',
      'تنظیمات فروشگاه، واحد پول، دکمه‌های میانبر نوشیدنی و انبار کالا ذخیره و در سرور مرکزی همگام‌سازی شد.'
    );
  };

  const handleTestAndSendBotBackup = async (customLabel?: string) => {
    if (!settings?.id) return;
    await db.settings.update(settings.id, formData);
    await pushToCentralServer(false);
    setIsSendingBot(true);
    const res = await sendBackupToMessengers(
      formData,
      customLabel || 'تست و ارسال دستی از تنظیمات'
    );
    setIsSendingBot(false);
    showNotice(res.success ? 'success' : 'error', res.messages.join(' | '));
  };

  const handleFactoryRawReset = async () => {
    setIsResettingRaw(true);
    try {
      // If Bale or Telegram bot is configured, attempt auto backup before wiping data
      const hasBots =
        Boolean(formData.baleBotToken?.trim() && formData.baleChatId?.trim()) ||
        Boolean(formData.telegramBotToken?.trim() && formData.telegramChatId?.trim());

      if (hasBots) {
        try {
          await Promise.race([
            sendBackupToMessengers(formData, 'بکاپ خودکار قبل از خام‌سازی ۱۰۰٪ نرم‌افزار'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
          ]);
        } catch (botErr) {
          console.warn('Bot backup before reset warning:', botErr);
        }
      }

      await resetDatabaseToRaw();

      const pristineRawSettings: AppSettings = {
        restaurantName: '',
        phone: '',
        address: '',
        website: '',
        instagram: '',
        telegram: '',
        logoUrl: '',
        taxEnabled: false,
        taxPercentage: 0,
        requireCustomerPhone: false,
        currencyUnit: formData.currencyUnit || 'toman',
        selfServicePricePerPerson: 0,
        selfServiceTitle: '',
        defaultInvoiceMode: 'self_service',
        lockSelfServiceMode: false,
        autoBackupEnabled: false,
        autoBackupIntervalHours: 1,
        telegramBotToken: '',
        telegramChatId: '',
        baleBotToken: '',
        baleChatId: '',
        lastAutoBackupAt: '',
        lastAutoBackupStatus: '',
        isRawInitialized: true,
        requireLoginOnStart: false,
        autoBackupBeforeUpdate: true,
        hideCostPriceFromKitchen: false,
      };

      setFormData(pristineRawSettings);
      await notifyRawResetToCentralServer();
      await syncBackupToServer(pristineRawSettings, true);

      try {
        window.sessionStorage.clear();
        window.localStorage.removeItem('arka_active_user_id');
      } catch {
        // ignore
      }

      setConfirmRawReset(false);
      showNotice(
        'success',
        'نرم‌افزار ۱۰۰٪ خام شد! همه اطلاعات پاکسازی شده و سیستم آماده تعریف اولین کاربر مدیر کل می‌باشد.'
      );
    } catch (err: any) {
      console.error('Raw reset error:', err);
      showNotice('error', 'خطا در خام‌سازی دیتابیس.');
    } finally {
      setIsResettingRaw(false);
    }
  };

  const handleExport = async () => {
    await pushToCentralServer(false);
    await syncBackupToServer(formData);
    const json = await exportDB();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_arka_pos_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotice(
      'success',
      'فایل پشتیبان جامع کل نرم‌افزار (شامل منو، بانک‌ها، حسابداری، انبار، کاربران و رمزها، مشتریان و فاکتورها) دانلود شد.'
    );
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const jsonString = event.target?.result as string;
        await importDB(jsonString);
        const restoredOrders = await db.orders.count();
        const restoredMenu = await db.menuItems.count();
        const restoredBanks = await db.bankAccounts.count();
        const restoredVouchers = await db.journalVouchers.count();
        const restoredUsers = await db.appUsers.count();
        showNotice(
          'success',
          `بازگردانی جامع اطلاعات با موفقیت انجام و روی سرور مرکزی ثبت شد (${restoredOrders} فاکتور، ${restoredMenu} قلم منو، ${restoredBanks} حساب بانکی، ${restoredVouchers} سند حسابداری و ${restoredUsers} کاربر).`
        );
      } catch (err) {
        showNotice('error', 'خطا در بازیابی اطلاعات: فرمت فایل نامعتبر است.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'number' ? Number(value) : value,
    });
  };

  // --- User Management Handlers ---
  const handleApplyRolePreset = (preset: (typeof ROLE_PRESETS)[0]) => {
    setUserForm((prev) => ({
      ...prev,
      roleLabel: preset.label,
      isAdmin: preset.isAdmin,
      permissions: [...preset.permissions],
    }));
  };

  const handleTogglePermission = (perm: PermissionKey) => {
    setUserForm((prev) => {
      const exists = prev.permissions.includes(perm);
      const nextPerms = exists
        ? prev.permissions.filter((p) => p !== perm)
        : [...prev.permissions, perm];
      return {
        ...prev,
        isAdmin: nextPerms.length === ALL_PERMISSIONS.length,
        permissions: nextPerms,
      };
    });
  };

  const resetUserForm = () => {
    setEditingUserId(null);
    setUserForm({
      username: '',
      fullName: '',
      pin: '',
      roleLabel: 'صندوق‌دار',
      isAdmin: false,
      permissions: ['pos'],
      isActive: true,
    });
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = userForm.username.trim().toLowerCase();
    const cleanName = userForm.fullName.trim();
    const cleanPin = userForm.pin.trim();

    if (!cleanUsername || !cleanName || !cleanPin) {
      showNotice('error', 'لطفاً نام و نام خانوادگی، نام کاربری و رمز عبور (پین) را وارد کنید.');
      return;
    }

    if (userForm.permissions.length === 0 && !userForm.isAdmin) {
      showNotice('error', 'حداقل یک بخش دسترسی باید برای کاربر انتخاب شود.');
      return;
    }

    const finalPermissions: PermissionKey[] = userForm.isAdmin
      ? [...ALL_PERMISSIONS]
      : userForm.permissions;

    try {
      if (editingUserId !== null) {
        const duplicate = appUsers.find(
          (u) => u.username.toLowerCase() === cleanUsername && u.id !== editingUserId
        );
        if (duplicate) {
          showNotice('error', 'این نام کاربری قبلاً برای کاربر دیگری ثبت شده است.');
          return;
        }
        await db.appUsers.update(editingUserId, {
          username: cleanUsername,
          fullName: cleanName,
          pin: cleanPin,
          roleLabel: userForm.roleLabel || 'کاربر',
          isAdmin: userForm.isAdmin,
          permissions: finalPermissions,
          isActive: userForm.isActive,
        });
        showNotice('success', `اطلاعات و سطح دسترسی «${cleanName}» با موفقیت بروزرسانی شد.`);
      } else {
        const duplicate = appUsers.find((u) => u.username.toLowerCase() === cleanUsername);
        if (duplicate) {
          showNotice('error', 'این نام کاربری قبلاً ثبت شده است. نام کاربری دیگری انتخاب کنید.');
          return;
        }
        await db.appUsers.add({
          username: cleanUsername,
          fullName: cleanName,
          pin: cleanPin,
          roleLabel: userForm.roleLabel || 'کاربر',
          isAdmin: userForm.isAdmin,
          permissions: finalPermissions,
          isActive: userForm.isActive,
          createdAt: new Date(),
        });
        showNotice('success', `کاربر جدید «${cleanName}» با سطح دسترسی انتخاب‌شده ایجاد شد.`);
      }
      resetUserForm();
      await pushToCentralServer(false);
      await syncBackupToServer(formData);
    } catch (err) {
      showNotice('error', 'خطا در ذخیره اطلاعات کاربر.');
    }
  };

  const handleEditUser = (u: AppUser) => {
    setEditingUserId(u.id || null);
    setUserForm({
      username: u.username,
      fullName: u.fullName,
      pin: u.pin,
      roleLabel: u.roleLabel,
      isAdmin: u.isAdmin,
      permissions: [...(u.permissions || [])],
      isActive: u.isActive,
    });
  };

  const handleDeleteUser = async (u: AppUser) => {
    if (!u.id) return;
    const adminCount = appUsers.filter((item) => item.isAdmin && item.isActive).length;
    if (u.isAdmin && adminCount <= 1) {
      showNotice('error', 'امکان حذف تنها مدیر کل فعال سیستم وجود ندارد.');
      return;
    }
    await db.appUsers.delete(u.id);
    if (editingUserId === u.id) resetUserForm();
    await pushToCentralServer(false);
    await syncBackupToServer(formData);
    showNotice('success', `کاربر «${u.fullName}» حذف شد.`);
  };

  const currencyLabel = getCurrencyLabel(formData.currencyUnit || 'toman');

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Prominent Header + Full-Width 4-Column Tab Switcher */}
      <div className="bg-white border-b border-slate-200 px-3 sm:px-6 py-3 sm:py-4 shrink-0 shadow-2xs">
        <div className="max-w-5xl mx-auto flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <div>
              <h1 className="text-base sm:text-xl font-extrabold text-slate-900">
                تنظیمات سیستم، دسترسی کاربران، بکاپ و شبکه
              </h1>
              <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
                جهت جابجایی بین بخش‌های مختلف تنظیمات، یکی از ۴ کارت زیر را انتخاب نمایید:
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 w-full">
            <button
              type="button"
              onClick={() => setActiveTab('network')}
              className={`p-2.5 sm:p-3 rounded-xl border-2 text-right flex items-center gap-2.5 transition-all cursor-pointer ${
                activeTab === 'network'
                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-emerald-50/60 hover:border-emerald-300'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  activeTab === 'network'
                    ? 'bg-white/20 text-white'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                <Wifi size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm font-extrabold truncate">
                  ۱. شبکه و پرینترها
                </div>
                <div
                  className={`text-[10px] truncate mt-0.5 ${
                    activeTab === 'network' ? 'text-emerald-100' : 'text-slate-500'
                  }`}
                >
                  IP سرور، پورت و چاپگرها
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={`p-2.5 sm:p-3 rounded-xl border-2 text-right flex items-center gap-2.5 transition-all cursor-pointer ${
                activeTab === 'general'
                  ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-blue-50/60 hover:border-blue-300'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  activeTab === 'general'
                    ? 'bg-white/20 text-white'
                    : 'bg-blue-100 text-blue-700'
                }`}
              >
                <Store size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm font-extrabold truncate">
                  ۲. فروشگاه و سلف
                </div>
                <div
                  className={`text-[10px] truncate mt-0.5 ${
                    activeTab === 'general' ? 'text-blue-100' : 'text-slate-500'
                  }`}
                >
                  مشخصات، واحد پول و فیش
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`p-2.5 sm:p-3 rounded-xl border-2 text-right flex items-center gap-2.5 transition-all cursor-pointer ${
                activeTab === 'users'
                  ? 'bg-teal-600 border-teal-600 text-white shadow-md shadow-teal-600/20'
                  : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-teal-50/60 hover:border-teal-300'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  activeTab === 'users'
                    ? 'bg-white/20 text-white'
                    : 'bg-teal-100 text-teal-700'
                }`}
              >
                <Shield size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm font-extrabold truncate">
                  ۳. کاربران و دسترسی
                </div>
                <div
                  className={`text-[10px] truncate mt-0.5 ${
                    activeTab === 'users' ? 'text-teal-100' : 'text-slate-500'
                  }`}
                >
                  صندوق‌داران، رمزها و مجوزها
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('backup')}
              className={`p-2.5 sm:p-3 rounded-xl border-2 text-right flex items-center gap-2.5 transition-all cursor-pointer ${
                activeTab === 'backup'
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-indigo-50/60 hover:border-indigo-300'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  activeTab === 'backup'
                    ? 'bg-white/20 text-white'
                    : 'bg-indigo-100 text-indigo-700'
                }`}
              >
                <Bot size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm font-extrabold truncate">
                  ۴. بکاپ و بات بله/تلگرام
                </div>
                <div
                  className={`text-[10px] truncate mt-0.5 ${
                    activeTab === 'backup' ? 'text-indigo-100' : 'text-slate-500'
                  }`}
                >
                  پشتیبان‌گیری، بازیابی و خام‌سازی
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 md:p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {statusMessage && (
            <div
              className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 size={17} />
              ) : (
                <AlertCircle size={17} />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* TAB 1: NETWORK ENGINE, SERVER IP, CUSTOM PORT, CLIENT SETUP & WINDOWS PRINTERS */}
          {activeTab === 'network' && (
            <div className="space-y-4">
              {/* SERVER VS CLIENT ROLE CARD */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 space-y-4">
                <div
                  className={`p-4 rounded-2xl border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    nodeRole === 'server'
                      ? 'bg-emerald-50/80 border-emerald-300'
                      : 'bg-blue-50/80 border-blue-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        nodeRole === 'server'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-blue-600 text-white'
                      }`}
                    >
                      {nodeRole === 'server' ? <Server size={20} /> : <Radio size={20} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-slate-900 text-xs sm:text-sm">
                          نقش فعلی در شبکه:
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-white font-black text-[10.5px] ${
                            nodeRole === 'server' ? 'bg-emerald-600' : 'bg-blue-600'
                          }`}
                        >
                          {nodeRole === 'server'
                            ? networkInfo.isLinuxServer
                              ? '🐧 متصل به سرور مرکزی لینوکس (Linux Host)'
                              : '🟢 سرور مرکزی ویندوز (Master Host)'
                            : '🔵 کلاینت / صندوق فرعی'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                        {nodeRole === 'server'
                          ? networkInfo.isLinuxServer
                            ? 'این سامانه روی سرور لینوکس راه‌اندازی شده و تمام کلاینت‌ها (وب، ویندوز و موبایل) به صورت بلادرنگ با دیتابیس مرکزی این سرور همگام هستند.'
                            : 'این کامپیوتر به عنوان سرور مرکزی سیستم فعال است و تمامی صندوق‌ها، تبلت‌ها و گوشی‌های شبکه به این آی‌پی و پورت متصل می‌شوند.'
                          : 'این دستگاه به عنوان کلاینت فرعی به سرور مرکزی شبکه متصل است و اطلاعات را به صورت زنده و با تقدم و تأخر زمانی دقیق سینک می‌کند.'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowNodeRoleModal(true)}
                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer shrink-0"
                  >
                    <ArrowRightLeft size={14} />
                    <span>تنظیمات نقش سرور / کلاینت</span>
                  </button>
                </div>

                {/* IF SERVER MODE: SHOW AUTO IP DETECTION, PORT SETUP, DOMAIN & LAN SHARE URL */}
                {nodeRole === 'server' && (
                  <div className="space-y-4 pt-2">
                    {/* LAN SHARING & REAL SERVER IP CARD */}
                    <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-3.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <h3 className="font-extrabold text-emerald-950 text-xs sm:text-sm flex items-center gap-2">
                          <Radio size={18} className="animate-pulse text-emerald-600" />
                          <span>
                            {networkInfo.isLinuxServer
                              ? 'مشخصات شبکه، آی‌پی و پورت سرور لینوکس (تنظیم‌شده در محیط لینوکس)'
                              : 'آدرس‌های شناسایی‌شده سرور در شبکه محلی (LAN)'}
                          </span>
                        </h3>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[10.5px] font-bold px-2.5 py-0.5 rounded-md flex items-center gap-1 ${
                            networkInfo.isServerRunning
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              : 'bg-amber-100 text-amber-900 border border-amber-300'
                          }`}>
                            <span className={`w-2 h-2 rounded-full ${networkInfo.isServerRunning ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'}`} />
                            <span>
                              {networkInfo.isServerRunning
                                ? `سرویس مرکزی فعال (پورت ${networkInfo.port || serverCustomPort || 4040})`
                                : 'سرویس پس‌زمینه خاموش (لوکال)'}
                            </span>
                          </span>
                          <span className="text-[10.5px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-md border border-emerald-200">
                            میزبان: {networkInfo.hostname || (networkInfo.isLinuxServer ? 'سرور لینوکس' : 'رایانه ویندوز')}
                          </span>
                          <button
                            type="button"
                            onClick={loadNetworkInfo}
                            disabled={isRefreshingNetInfo}
                            className="px-2 py-0.5 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-md text-[10.5px] font-bold cursor-pointer transition flex items-center gap-1"
                            title="استعلام مجدد اطلاعات شبکه از سرور"
                          >
                            <RefreshCw size={11} className={isRefreshingNetInfo ? 'animate-spin' : ''} />
                            <span>بروزرسانی</span>
                          </button>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        {networkInfo.isLinuxServer
                          ? 'پورت و آدرس شبکه این سرور در زمان نصب در محیط لینوکس (install.sh) پیکربندی شده و به صورت خودکار شناسایی گردیده است. تمام کلاینت‌های ویندوز (Tauri)، مرورگرهای کامپیوتر و موبایل‌ها می‌توانند از آدرس زیر به این سرور متصل شوند:'
                          : 'نرم‌افزار کارت‌های شبکه ویندوز را بررسی و آی‌پی واقعی متصل به مودم/سوییچ را استخراج کرده است. تبلت‌ها، موبایل‌های گارسون، پنل آشپزخانه و سایر کامپیوترها می‌توانند از آدرس زیر متصل شوند:'}
                      </p>

                      {/* Primary URL Banner */}
                      <div className="bg-white p-3 rounded-xl border border-emerald-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
                        <div>
                          <span className="text-[10px] text-emerald-800 font-bold block mb-0.5">آدرس اصلی اتصال کلاینت‌ها به این سرور:</span>
                          <div className="font-mono text-xs sm:text-sm font-black text-emerald-950 truncate" dir="ltr">
                            {networkInfo.domainUrl || networkInfo.primaryUrl || (networkInfo.localIps?.[0] ? `http://${networkInfo.localIps[0]}:${serverCustomPort || 4040}` : `http://127.0.0.1:${serverCustomPort || 4040}`)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyText(networkInfo.domainUrl || networkInfo.primaryUrl || (networkInfo.localIps?.[0] ? `http://${networkInfo.localIps[0]}:${serverCustomPort || 4040}` : `http://127.0.0.1:${serverCustomPort || 4040}`))}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 transition cursor-pointer"
                        >
                          {copiedUrl ? <Check size={14} /> : <Copy size={14} />}
                          <span>{copiedUrl ? 'کپی شد!' : 'کپی آدرس سرور'}</span>
                        </button>
                      </div>

                      {/* Detected IP addresses list */}
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[11px] font-bold text-emerald-900 flex items-center gap-1">
                          <Wifi size={13} className="text-emerald-700" />
                          <span>لیست آی‌پی‌های شناسایی‌شده روی سرور (جهت انتخاب و کپی کلیک فرمایید):</span>
                        </span>
                        {networkInfo.localIps && networkInfo.localIps.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {networkInfo.localIps.map((ip) => {
                              const port = Number(networkInfo.port || serverCustomPort || 4040);
                              const portSuffix = port === 80 || port === 443 ? '' : `:${port}`;
                              const fullUrl = `http://${ip}${portSuffix}`;
                              const isCurrentPrimary =
                                networkInfo.primaryUrl === fullUrl ||
                                networkInfo.primaryUrl === `http://${ip}:${port}`;
                              return (
                                <button
                                  key={ip}
                                  type="button"
                                  onClick={() => handleSelectPrimaryIp(ip)}
                                  className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold cursor-pointer transition flex items-center gap-1.5 border ${
                                    isCurrentPrimary
                                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                                      : 'bg-white hover:bg-emerald-100 text-emerald-950 border-emerald-300'
                                  }`}
                                  dir="ltr"
                                  title="کلیک جهت تنظیم به عنوان آدرس اصلی و کپی"
                                >
                                  {isCurrentPrimary && <Check size={12} />}
                                  <span>{ip}</span>
                                  <span className={`text-[10px] font-sans ${isCurrentPrimary ? 'text-emerald-100' : 'text-emerald-600'}`}>
                                    ({port === 80 ? 'پورت ۸۰' : `:${port}`})
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-[10.5px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">
                            در صورت تمایل آی‌پی شبکه سرور را در کادر زیر ثبت فرمایید.
                          </p>
                        )}

                        {/* Manual LAN IP Input Override */}
                        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <div className="flex-1 flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-emerald-300">
                            <span className="text-[11px] font-bold text-slate-600 whitespace-nowrap">ثبت دستی آی‌پی سرور:</span>
                            <input
                              type="text"
                              value={manualLanIpInput}
                              onChange={(e) => setManualLanIpInput(e.target.value)}
                              placeholder="مثال: 192.168.1.15"
                              className="w-full font-mono text-xs font-bold text-slate-900 focus:outline-hidden text-left"
                              dir="ltr"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={handleSaveManualLanIp}
                            className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-bold shrink-0 cursor-pointer transition flex items-center justify-center gap-1"
                          >
                            <Check size={13} />
                            <span>ثبت این آی‌پی</span>
                          </button>
                        </div>
                      </div>

                      {/* Platform-Aware Server Port Configuration Box */}
                      <div className="p-3.5 bg-white rounded-xl border border-emerald-300 space-y-2 pt-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <label className="font-extrabold text-emerald-950 text-xs flex items-center gap-1.5">
                            <Settings2 size={16} className="text-emerald-700" />
                            <span>
                              {networkInfo.isLinuxServer
                                ? 'پورت فعال سرور لینوکس (تنظیم‌شده در محیط لینوکس):'
                                : 'تنظیم پورت دلخواه سرور ویندوز (Server Port):'}
                            </span>
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={serverCustomPort}
                              onChange={(e) => setServerCustomPort(e.target.value)}
                              placeholder="4040"
                              className="w-24 px-3 py-1.5 bg-emerald-50/50 border border-emerald-300 rounded-lg font-mono text-center font-bold text-xs text-emerald-950 focus:outline-hidden focus:border-emerald-600"
                              dir="ltr"
                            />
                            <button
                              type="button"
                              onClick={handleSaveCustomPort}
                              disabled={isSavingPort}
                              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-xs shrink-0 cursor-pointer transition flex items-center gap-1"
                            >
                              {isSavingPort ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                              <span>{networkInfo.isLinuxServer ? 'ثبت در تنظیمات' : 'ذخیره و فعال‌سازی پورت'}</span>
                            </button>
                          </div>
                        </div>
                        {portNotice && (
                          <p className={`text-[10.5px] font-bold ${portNotice.type === 'success' ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {portNotice.text}
                          </p>
                        )}
                        <span className="text-[10px] text-slate-500 block leading-relaxed">
                          {networkInfo.isLinuxServer
                            ? `در سرور لینوکس، پورت اصلی (${networkInfo.port || serverCustomPort}) و ریورس‌پروکسی Nginx در محیط لینوکس موقع نصب (install.sh) تنظیم و ست شده است.`
                            : 'در نسخه ویندوز (Tauri)، تغییر پورت از همین بخش بلافاصله سرویس سرور داخلی ویندوز را روی پورت جدید فعال می‌کند.'}
                        </span>
                      </div>
                    </div>

                    {/* DEDICATED DOMAIN & INTERNET SHARING CARD */}
                    <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-3.5">
                      <div className="flex items-center justify-between">
                        <h3 className="font-extrabold text-indigo-950 text-xs sm:text-sm flex items-center gap-2">
                          <Globe size={18} className="text-indigo-600" />
                          <span>ثبت نام دامنه اختصاصی برای اشتراک در اینترنت (Domain / SSL)</span>
                        </h3>
                        <span className="text-[10.5px] font-bold text-indigo-800 bg-indigo-100 px-2.5 py-0.5 rounded-md">
                          دسترسی از راه دور
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        جهت مشاهده گزارش‌ها، نظارت بر فروش یا اتصال کلاینت‌ها و شعبات از طریق اینترنت، نام دامنه اختصاصی سرور (مانند foodmix.ir) در این بخش نمایش داده و تنظیم می‌شود:
                      </p>

                      <div className="bg-white p-3 rounded-xl border border-indigo-200 space-y-2.5">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                          <div className="sm:col-span-1 space-y-1">
                            <label className="block text-[10.5px] font-bold text-slate-700">پروتکل:</label>
                            <select
                              value={serverDomainProtocol}
                              onChange={(e) => setServerDomainProtocol(e.target.value as any)}
                              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-hidden"
                              dir="ltr"
                            >
                              <option value="https://">https:// (امن/توصیه شده)</option>
                              <option value="http://">http://</option>
                            </select>
                          </div>
                          <div className="sm:col-span-2 space-y-1">
                            <label className="block text-[10.5px] font-bold text-slate-700">نام دامنه یا آدرس اینترنتی:</label>
                            <input
                              type="text"
                              value={serverDomainInput}
                              onChange={(e) => setServerDomainInput(e.target.value)}
                              placeholder="مثال: foodmix.ir یا pos.myrestaurant.ir"
                              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono text-left text-xs font-bold text-slate-900 focus:outline-hidden focus:border-indigo-500"
                              dir="ltr"
                            />
                          </div>
                          <div className="sm:col-span-1 flex items-end">
                            <button
                              type="button"
                              onClick={handleSaveServerDomain}
                              disabled={isSavingDomain}
                              className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs cursor-pointer transition flex items-center justify-center gap-1"
                            >
                              {isSavingDomain ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                              <span>ذخیره دامنه</span>
                            </button>
                          </div>
                        </div>

                        {domainNotice && (
                          <p className={`text-[10.5px] font-bold ${domainNotice.type === 'success' ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {domainNotice.text}
                          </p>
                        )}

                        {serverDomainInput.trim() && (
                          <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="text-[11px] text-indigo-950 font-mono" dir="ltr">
                              آدرس اینترنتی فعال: <strong>{serverDomainProtocol}{serverDomainInput.trim()}</strong>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopyText(`${serverDomainProtocol}${serverDomainInput.trim()}`)}
                              className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition shrink-0"
                            >
                              <Copy size={12} />
                              <span>کپی آدرس اینترنتی</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 1-CLICK AUTOMATED WINDOWS LAN SHARING & FIREWALL MASTER CARD (SHOWN WHEN ON WINDOWS) */}
                    {!networkInfo.isLinuxServer && (
                      <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-3.5 shadow-md">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                          <div className="space-y-0.5">
                            <h3 className="font-extrabold text-amber-400 text-xs sm:text-sm flex items-center gap-2">
                              <span>⚡ اسکریپت خودکار اشتراک‌گذاری و فایروال در ویندوز (۱ کلیک)</span>
                            </h3>
                            <p className="text-[11px] text-slate-300">
                              برای باز کردن خودکار پورت {serverCustomPort || networkInfo.port || 4040} در فایروال ویندوز جهت اتصال سایر سیستم‌ها:
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleDownloadAutoShareBat}
                            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 shrink-0 shadow-md cursor-pointer transition"
                          >
                            <Download size={15} />
                            <span>دانلود اسکریپت فایروال و شبکه ویندوز (.bat)</span>
                          </button>
                        </div>

                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-1 text-[10.5px] text-slate-400">
                          <span>
                            💡 نحوه اجرا در ویندوز سرور: فایل دانلود شده را با کلیک راست و گزینه <strong>Run as Administrator</strong> اجرا کنید تا پورت در فایروال ویندوز باز شود.
                          </span>
                          <button
                            type="button"
                            onClick={handleDownloadFirewallScript}
                            className="text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer shrink-0"
                          >
                            فقط دانلود قانون فایروال (Firewall Rule Only)
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* IF CLIENT MODE OR CLIENT CONFIG SECTION */}
                <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-3 pt-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-extrabold text-blue-950 text-xs sm:text-sm flex items-center gap-2">
                      <Wifi size={17} className="text-blue-600" />
                      <span>تنظیمات اتصال کلاینت‌ها به سرور (با آی‌پی محلی یا نام دامنه)</span>
                    </h3>
                    <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setHostType('ip')}
                        className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold cursor-pointer transition ${
                          hostType === 'ip' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        آی‌پی شبکه محلی (LAN IP)
                      </button>
                      <button
                        type="button"
                        onClick={() => setHostType('domain')}
                        className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold cursor-pointer transition ${
                          hostType === 'domain' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        نام دامنه (Domain / Internet)
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    اگر این کامپیوتر به عنوان کلاینت نصب شده است، آدرس IP سرور در شبکه محلی یا نام دامنه اینترنتی را به همراه شماره پورت وارد فرمایید:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="block text-[11px] font-bold text-slate-700">
                        {hostType === 'ip' ? 'آدرس آی‌پی سرور (IP Address):' : 'نام دامنه سرور (Domain Name):'}
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={clientHostInput}
                          onChange={(e) => setClientHostInput(e.target.value)}
                          placeholder={hostType === 'ip' ? '192.168.1.50' : 'pos.myrestaurant.local یا server.foodmix.ir'}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-left text-xs font-bold text-slate-900 focus:outline-hidden focus:border-blue-500"
                          dir="ltr"
                        />
                        {hostType === 'domain' && (
                          <Globe size={14} className="absolute right-3 top-2.5 text-slate-400" />
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-slate-700">
                        پورت سرور (Port):
                      </label>
                      <input
                        type="text"
                        value={clientPortInput}
                        onChange={(e) => setClientPortInput(e.target.value)}
                        placeholder="4040"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-center text-xs font-bold text-slate-900 focus:outline-hidden focus:border-blue-500"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleTestClientConnection}
                        disabled={isTestingConn}
                        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                      >
                        {isTestingConn ? <RefreshCw size={13} className="animate-spin" /> : <Activity size={13} />}
                        <span>تست اتصال و سنجش پینگ سرور</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleApplyClientServerUrl}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                      >
                        <Check size={14} />
                        <span>ذخیره و اتصال این کلاینت به سرور فوق</span>
                      </button>
                    </div>

                    <div className="text-[11px] text-slate-600 font-mono" dir="ltr">
                      آدرس کامل: <strong className="text-blue-900">http://{clientHostInput.trim()}:{clientPortInput.trim()}</strong>
                    </div>
                  </div>

                  {testConnResult && (
                    <div
                      className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                        testConnResult.ok
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-rose-50 border-rose-200 text-rose-800'
                      }`}
                    >
                      {testConnResult.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                      <span>{testConnResult.message}</span>
                      {testConnResult.pingMs !== undefined && (
                        <span className="font-mono text-[10px] bg-white px-2 py-0.5 rounded border border-emerald-300 text-emerald-950 mr-auto">
                          پینگ: {testConnResult.pingMs}ms
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* WINDOWS REAL PRINTERS DETECTION & DIRECT PRINTING CARD */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 space-y-3.5">
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-slate-900 text-xs sm:text-sm flex items-center gap-2">
                    <Printer size={18} className="text-blue-600" />
                    <span>🖨️ شناسایی خودکار پرینترهای ویندوز و تنظیم چاپ درجا (Silent Kiosk Printing)</span>
                  </h3>
                  <button
                    type="button"
                    onClick={handleDetectPrinters}
                    disabled={isDetectingPrinters}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    {isDetectingPrinters ? <RefreshCw size={13} className="animate-spin" /> : <Printer size={13} />}
                    <span>{isDetectingPrinters ? 'در حال استعلام...' : 'استعلام پرینترهای واقعی ویندوز'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="space-y-2">
                    <label className="block font-bold text-slate-800">
                      نام پرینتر حرارتی در ویندوز:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        name="printerName"
                        value={formData.printerName || ''}
                        onChange={(e) => {
                          handleChange(e);
                          try {
                            window.localStorage.setItem('arka_terminal_printer', e.target.value);
                          } catch {}
                        }}
                        placeholder="مثلاً: XP-80C یا POS-80 یا TM-T20"
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-300 font-mono text-left font-bold text-xs bg-white focus:outline-hidden focus:border-blue-500"
                        dir="ltr"
                      />
                    </div>

                    {/* Detected Windows printers pills */}
                    {detectedPrinters.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[10.5px] text-slate-500 font-bold block w-full">پرینترهای شناسا‌یی‌شده روی ویندوز:</span>
                        {detectedPrinters.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => {
                              setFormData((prev) => ({ ...prev, printerName: p }));
                              try {
                                window.localStorage.setItem('arka_terminal_printer', p);
                              } catch {}
                            }}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 font-mono text-xs font-bold cursor-pointer transition"
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="block font-bold text-slate-800">
                      عناوین شورت‌کات و تنظیمات چاپ درجا:
                    </label>
                    <button
                      type="button"
                      onClick={handleDownloadSilentPrintBat}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 shadow-xs cursor-pointer transition"
                    >
                      <Download size={14} />
                      <span>دانلود شورت‌کات چاپ درجا (BAT) بدون دیالوگ پرینت</span>
                    </button>
                    <span className="text-[10.5px] text-slate-500 block leading-relaxed">
                      با اجرای این شورت‌کات، مرورگر با سوئیچ <code className="font-mono font-bold bg-slate-100 px-1 rounded">--kiosk-printing</code> اجرا شده و تمام فیش‌ها مستقیماً و بدون باز شدن پنجره پرینت پیش‌نمایش چاپ می‌شوند.
                    </span>
                  </div>
                </div>
              </div>

              {/* INDEPENDENT INSTALLATION & ISOLATION CARD */}
              <div className="p-4 bg-purple-50/80 rounded-2xl border border-purple-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck size={20} className="text-purple-700 shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-purple-950 text-xs sm:text-sm">
                        📦 نسخه ۲.۰.۰ اختصاصی و ایزوله سیستم (Arka POS Enterprise v2)
                      </span>
                      <span className="px-2.5 py-0.5 bg-purple-600 text-white font-bold text-[10px] rounded-full">
                        ایزوله ۱۰۰٪
                      </span>
                    </div>
                    <p className="text-[11px] text-purple-900 leading-relaxed mt-1">
                      این نسخه از نرم‌افزار در مسیر اختصاصی <code className="font-mono bg-purple-100 px-1 font-bold">C:\Program Files\Arka-POS-Enterprise-v2</code> و دیتابیس مجزای <code className="font-mono bg-purple-100 px-1 font-bold">Arka_Enterprise_POS_DB_v2</code> اجرا می‌شود تا با هیچ نسخه قدیمی قاطی نشود.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadCleanUninstallerBat}
                  className="px-3.5 py-2.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-extrabold shrink-0 flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition"
                >
                  <Download size={14} />
                  <span>دانلود اسکریپت پاکسازی نسخه قدیمی (BAT)</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: GENERAL & 100% RAW RESET */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              {/* Quick Network Settings Callout Banner */}
              <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-800 text-white rounded-2xl p-3.5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0 font-bold">
                    <Wifi size={18} className="text-white" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-xs sm:text-sm">
                      تنظیمات اشتراک‌گذاری در شبکه، IP سرور، پورت و پرینترها
                    </h4>
                    <p className="text-[11px] text-emerald-100 mt-0.5">
                      جهت تعیین نقش سیستم (سرور/کلاینت)، آی‌پی محلی، پورت و شناسایی پرینترهای ویندوز به تب ۱ شبکه بروید.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('network')}
                  className="px-3.5 py-2 bg-white hover:bg-emerald-50 text-emerald-950 rounded-xl font-extrabold text-xs shadow-xs transition cursor-pointer shrink-0 flex items-center gap-1.5"
                >
                  <span>ورود به تنظیمات شبکه و IP سرور</span>
                  <ArrowLeft size={14} />
                </button>
              </div>

              {/* Currency Unit (Toman vs Rial) + PWA Install Card */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs md:text-sm font-extrabold text-slate-900">
                    <Coins size={18} className="text-blue-600" />
                    <span>واحد پول سامانه (تومان یا ریال) و جداکننده ۳ رقمی</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    تمامی مبالغ هنگام تایپ و پس از ثبت به‌صورت ۳ رقم ۳ رقم جدا می‌شوند. واحد نمایشی را انتخاب کنید:
                  </p>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => handleCurrencyChange('toman')}
                      className={`py-2 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                        (formData.currencyUnit || 'toman') === 'toman'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-white/60'
                      }`}
                    >
                      تومان (Toman)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCurrencyChange('rial')}
                      className={`py-2 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                        formData.currencyUnit === 'rial'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-white/60'
                      }`}
                    >
                      ریال (Rial)
                    </button>
                  </div>
                </div>

                {/* PWA Install & Mobile Ergonomics Card / Desktop Status */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs md:text-sm font-extrabold text-slate-900">
                        <Smartphone size={18} className="text-emerald-600" />
                        <span>نصب وب‌اپلیکیشن (PWA) و وضعیت نسخه</span>
                      </div>
                      {!isTauri && !isInstalled && <PWAInstallButton compact />}
                    </div>
                    {isTauri || isInstalled ? (
                      <div className="mt-2.5 p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-2 text-emerald-900">
                        <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                        <span className="text-[11px] font-bold">
                          نرم‌افزار به‌صورت بومی و نصب‌شده (Arka POS Enterprise v2) روی این دستگاه در حال اجرا است.
                        </span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                        با نصب نسخه PWA، نرم‌افزار آرکا مانند یک اپلیکیشن بومی روی صفحه اصلی گوشی موبایل و دسکتاپ شما نصب شده و به‌صورت تمام‌صفحه و آفلاین اجرا می‌شود.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Restaurant Info & Self-Service Mode Settings */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      نام فروشگاه / رستوران
                    </label>
                    <input
                      name="restaurantName"
                      value={formData.restaurantName || ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                      placeholder="مثال: رستوران و سلف سرویس آرکا"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">شماره تماس</label>
                    <input
                      name="phone"
                      value={formData.phone || ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-left"
                      placeholder="021-88776655"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">آدرس</label>
                    <input
                      name="address"
                      value={formData.address || ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300"
                      placeholder="آدرس رستوران جهت درج در فیش"
                    />
                  </div>
                </div>

                {/* Self-Service (Mode 2) Default Pricing & Mode Lock Settings */}
                <div className="border-t border-slate-200 pt-4 space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <h3 className="text-xs md:text-sm font-extrabold text-teal-800 flex items-center gap-2">
                      <Users size={17} />
                      <span>تعیین حالت پیش‌فرض و قفل صندوق فروش روی سلف سرویس</span>
                    </h3>
                    <div className="bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg text-[11px] font-bold text-teal-800">
                      {(formData.defaultInvoiceMode || 'self_service') === 'self_service'
                        ? '🛡️ پیش‌فرض: سلف سرویس'
                        : '🛒 پیش‌فرض: منوی عادی'}
                    </div>
                  </div>

                  {/* Mode Selector & Lock Checkbox */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div>
                      <label className="block font-bold text-slate-800 mb-1.5">
                        حالت عملکرد اصلی صندوق فروش:
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              defaultInvoiceMode: 'self_service',
                            })
                          }
                          className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                            (formData.defaultInvoiceMode || 'self_service') === 'self_service'
                              ? 'bg-teal-600 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-200'
                          }`}
                        >
                          <Users size={14} />
                          <span>۱. سلف سرویس (پیش‌فرض)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              defaultInvoiceMode: 'standard',
                            })
                          }
                          className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                            formData.defaultInvoiceMode === 'standard'
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-200'
                          }`}
                        >
                          <Store size={14} />
                          <span>۲. منوی عادی</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center">
                      <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 p-2 bg-white rounded-lg border border-slate-200 w-full">
                        <input
                          type="checkbox"
                          checked={formData.lockSelfServiceMode ?? true}
                          onChange={(e) =>
                            setFormData({ ...formData, lockSelfServiceMode: e.target.checked })
                          }
                          className="w-4 h-4 accent-teal-600"
                        />
                        <div className="flex flex-col">
                          <span className="text-teal-900 font-extrabold">
                            🔒 قفل کردن صندوق بر روی حالت سلف سرویس
                          </span>
                          <span className="text-[10px] text-slate-500 font-normal">
                            جلوگیری از تغییر حالت صندوق به فاکتور عادی توسط صندوق‌دار
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        قیمت پیش‌فرض سلف سرویس + نوشابه به ازای هر نفر ({currencyLabel})
                      </label>
                      <FormattedNumberInput
                        value={formData.selfServicePricePerPerson ?? 0}
                        onValueChange={(val) =>
                          setFormData({ ...formData, selfServicePricePerPerson: val })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-left"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        عنوان چاپی روی فیش سلف سرویس
                      </label>
                      <input
                        type="text"
                        name="selfServiceTitle"
                        value={formData.selfServiceTitle || ''}
                        onChange={handleChange}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300"
                        placeholder="مثال: ورودی بار سلف سرویس + نوشابه"
                      />
                    </div>
                  </div>

                  {/* Dynamic Quick Beverage Options Manager */}
                  <div className="border-t border-slate-200 pt-4 space-y-3">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="text-xs md:text-sm font-extrabold text-slate-900 flex items-center gap-2">
                          <Coffee size={17} className="text-amber-600" />
                          <span>مدیریت دکمه‌های نوشیدنی و نوشابه اضافه دستی ({currencyLabel})</span>
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          شما می‌توانید انواع نوشیدنی‌ها را اضافه یا حذف کرده و قیمت یا نام آن‌ها را تغییر دهید. با ثبت فاکتور، تمام این نوشیدنی‌ها از انبار کالا کسر می‌گردند.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const currentList =
                            formData.quickBeverages && formData.quickBeverages.length > 0
                              ? formData.quickBeverages
                              : getDefaultQuickBeverages(formData.currencyUnit || 'toman');
                          const newBev: QuickBeverageOption = {
                            id: `bev_${Date.now()}`,
                            name: 'نوشیدنی جدید',
                            price: formData.currencyUnit === 'rial' ? 150000 : 15000,
                            color: 'amber',
                            isActive: true,
                          };
                          setFormData({ ...formData, quickBeverages: [...currentList, newBev] });
                        }}
                        className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-xs transition cursor-pointer shrink-0"
                      >
                        <Plus size={14} />
                        <span>افزودن نوشیدنی جدید</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                      {((formData.quickBeverages && formData.quickBeverages.length > 0)
                        ? formData.quickBeverages
                        : getDefaultQuickBeverages(formData.currencyUnit || 'toman')
                      ).map((bev, idx) => (
                        <div
                          key={bev.id || idx}
                          className="p-3 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-2 shadow-2xs relative"
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <input
                              type="text"
                              value={bev.name}
                              onChange={(e) => {
                                const val = e.target.value;
                                const currentList = [
                                  ...((formData.quickBeverages && formData.quickBeverages.length > 0)
                                    ? formData.quickBeverages
                                    : getDefaultQuickBeverages(formData.currencyUnit || 'toman')),
                                ];
                                currentList[idx] = { ...currentList[idx], name: val };
                                setFormData({ ...formData, quickBeverages: currentList });
                              }}
                              className="px-2.5 py-1 bg-white border border-slate-300 rounded-xl text-xs font-extrabold text-slate-900 w-full focus:outline-hidden focus:border-blue-500"
                              placeholder="نام نوشیدنی (مثلاً نوشابه)"
                            />

                            <button
                              type="button"
                              onClick={() => {
                                const currentList = [
                                  ...((formData.quickBeverages && formData.quickBeverages.length > 0)
                                    ? formData.quickBeverages
                                    : getDefaultQuickBeverages(formData.currencyUnit || 'toman')),
                                ];
                                currentList.splice(idx, 1);
                                setFormData({ ...formData, quickBeverages: currentList });
                              }}
                              className="p-1.5 rounded-xl text-rose-500 hover:bg-rose-100 hover:text-rose-700 transition cursor-pointer shrink-0"
                              title="حذف این نوشیدنی"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                قیمت ({currencyLabel}):
                              </label>
                              <FormattedNumberInput
                                value={bev.price}
                                onValueChange={(val) => {
                                  const currentList = [
                                    ...((formData.quickBeverages && formData.quickBeverages.length > 0)
                                      ? formData.quickBeverages
                                      : getDefaultQuickBeverages(formData.currencyUnit || 'toman')),
                                  ];
                                  currentList[idx] = { ...currentList[idx], price: val };
                                  setFormData({ ...formData, quickBeverages: currentList });
                                }}
                                className="w-full px-2 py-1 rounded-xl border border-slate-300 font-mono text-xs font-bold text-left bg-white"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                رنگ دکمه:
                              </label>
                              <select
                                value={bev.color || 'amber'}
                                onChange={(e) => {
                                  const val = e.target.value as any;
                                  const currentList = [
                                    ...((formData.quickBeverages && formData.quickBeverages.length > 0)
                                      ? formData.quickBeverages
                                      : getDefaultQuickBeverages(formData.currencyUnit || 'toman')),
                                  ];
                                  currentList[idx] = { ...currentList[idx], color: val };
                                  setFormData({ ...formData, quickBeverages: currentList });
                                }}
                                className="w-full px-2 py-1 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                              >
                                <option value="amber">زرد / نارنجی</option>
                                <option value="emerald">سبز</option>
                                <option value="blue">آبی</option>
                                <option value="purple">بنفش</option>
                                <option value="rose">قرمز</option>
                                <option value="teal">فیروزه‌ای</option>
                                <option value="indigo">نیلی</option>
                                <option value="slate">خاکستری</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Tax & Customer Phone toggles */}
                <div className="border-t border-slate-200 pt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={formData.taxEnabled || false}
                        onChange={(e) =>
                          setFormData({ ...formData, taxEnabled: e.target.checked })
                        }
                        className="w-4 h-4 accent-blue-600"
                      />
                      <span>اعمال مالیات پیش‌فرض روی فاکتور</span>
                    </label>
                    <div className="flex items-center gap-1">
                      <FormattedNumberInput
                        value={formData.taxPercentage ?? 9}
                        onValueChange={(val) =>
                          setFormData({ ...formData, taxPercentage: val })
                        }
                        className="w-14 px-2 py-1 border border-slate-300 rounded-lg font-mono text-center bg-white"
                      />
                      <span>%</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={formData.requireCustomerPhone || false}
                        onChange={(e) =>
                          setFormData({ ...formData, requireCustomerPhone: e.target.checked })
                        }
                        className="w-4 h-4 accent-blue-600"
                      />
                      <span>اجباری بودن شماره موبایل مشتری</span>
                    </label>
                  </div>
                </div>

                {/* Network Node Role Card (سرور مرکزی یا کلاینت) */}
                <div className="border-t border-slate-200 pt-3">
                  <div
                    className={`p-4 rounded-2xl border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      nodeRole === 'server'
                        ? 'bg-emerald-50/70 border-emerald-300'
                        : 'bg-blue-50/70 border-blue-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          nodeRole === 'server'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-blue-600 text-white'
                        }`}
                      >
                        {nodeRole === 'server' ? <Server size={20} /> : <Radio size={20} />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900 text-xs sm:text-sm">
                            نقش این سیستم در شبکه:
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-white font-black text-[10.5px] ${
                              nodeRole === 'server' ? 'bg-emerald-600' : 'bg-blue-600'
                            }`}
                          >
                            {nodeRole === 'server' ? '🟢 سرور مرکزی (Host)' : '🔵 کلاینت / صندوق فرعی'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                          {nodeRole === 'server'
                            ? 'این دستگاه به عنوان سرور اصلی شبکه فعال است و تمامی صندوق‌ها و تبلت‌ها به این سیستم متصل می‌شوند.'
                            : 'این دستگاه به عنوان کلاینت به سرور مرکزی شبکه متصل است و اطلاعات را سینک می‌کند.'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowNodeRoleModal(true)}
                      className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer shrink-0"
                    >
                      <ArrowRightLeft size={14} />
                      <span>تغییر نقش سیستم (فقط مدیر)</span>
                    </button>
                  </div>
                </div>

                {/* Independent App Installation & Isolation Setup */}
                <div className="border-t border-slate-200 pt-3">
                  <div className="p-3.5 bg-purple-50/80 rounded-xl border border-purple-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <ShieldCheck size={20} className="text-purple-700 shrink-0 mt-0.5" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-purple-950 text-xs">
                            📦 نصب کاملاً مجزا و بدون تداخل با نسخه‌های قبلی سیستم (Arka POS Enterprise v2.0.0)
                          </span>
                          <span className="px-2 py-0.5 bg-purple-600 text-white font-bold text-[10px] rounded-full">
                            ایزوله ۱۰۰٪
                          </span>
                        </div>
                        <p className="text-[11px] text-purple-900 leading-relaxed mt-1">
                          این نسخه از نرم‌افزار به صورت کاملاً مستقل و در مسیر مجزای <code className="font-mono bg-purple-100 px-1 font-bold">C:\Program Files\Arka-POS-Enterprise-v2</code> و با دیتابیس اختصاصی <code className="font-mono bg-purple-100 px-1 font-bold">Arka_Enterprise_POS_DB_v2</code> نصب می‌گردد و با هیچ یک از نسخه‌های قدیمی و قبلی سیستم شما قاطی نخواهد شد.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleDownloadCleanUninstallerBat}
                      className="px-3 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-extrabold shrink-0 flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                    >
                      <Download size={14} />
                      <span>دانلود اسکریپت پاکسازی نسخه قدیمی (BAT)</span>
                    </button>
                  </div>
                </div>

                {/* Silent Direct Printing Setup & Kiosk Shortcut */}
                <div className="border-t border-slate-200 pt-3">
                  <div className="p-3.5 bg-blue-50/80 rounded-xl border border-blue-200 flex flex-col gap-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <Printer size={20} className="text-blue-700 shrink-0 mt-0.5" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-blue-950 text-xs">
                              🖨️ تنظیم چاپ آنی درجا و حذف پنجره انتخاب پرینتر (Silent Kiosk Printing)
                            </span>
                            <span className="px-2 py-0.5 bg-blue-600 text-white font-bold text-[10px] rounded-full">
                              توصیه شده صندوق
                            </span>
                          </div>
                          <p className="text-[11px] text-blue-900 leading-relaxed mt-1">
                            برای اینکه پس از زدن دکمه «ثبت و صدور فیش»، فیش به‌صورت مستقیم و درجا روی پرینتر حرارتی چاپ شود و پنجره انتخاب پرینتر مرورگر (<code className="font-mono font-bold bg-blue-100 px-1 rounded">Print Preview</code>) اصلاً باز نشود، کافیست فایل شورت‌کات میانبر زیر را روی سیستم صندوق‌دار دانلود و اجرا نمایید.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleDownloadSilentPrintBat}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold shrink-0 flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                      >
                        <Download size={14} />
                        <span>دانلود شورت‌کات چاپ درجا (BAT)</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2.5 border-t border-blue-200/60 text-xs">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block font-bold text-blue-950">
                            نام دقیق فیش‌پرینتر در ویندوز/سیستم:
                          </label>
                          <button
                            type="button"
                            onClick={handleDetectPrinters}
                            disabled={isDetectingPrinters}
                            className="text-[10px] text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1 underline cursor-pointer"
                          >
                            {isDetectingPrinters ? 'در حال بررسی...' : 'استعلام پرینترهای ویندوز'}
                          </button>
                        </div>

                        <div className="flex gap-2">
                          <input
                            type="text"
                            name="printerName"
                            value={formData.printerName || ''}
                            onChange={(e) => {
                              handleChange(e);
                              try {
                                window.localStorage.setItem('arka_terminal_printer', e.target.value);
                              } catch {}
                            }}
                            placeholder="مثلاً: XP-80C یا POS-80 یا TM-T20"
                            className="flex-1 px-3 py-2 rounded-xl border border-blue-300 bg-white font-mono text-left font-bold text-xs focus:outline-hidden focus:border-blue-500"
                            dir="ltr"
                          />
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                setFormData((prev) => ({ ...prev, printerName: e.target.value }));
                                try {
                                  window.localStorage.setItem('arka_terminal_printer', e.target.value);
                                } catch {}
                              }
                            }}
                            className="px-2 py-2 rounded-xl border border-blue-300 bg-white text-xs font-bold text-blue-900"
                            defaultValue=""
                          >
                            <option value="" disabled>مدل‌های آماده...</option>
                            <option value="XP-80C">XP-80C (Xprinter)</option>
                            <option value="POS-80">POS-80 (General)</option>
                            <option value="POS-58">POS-58 (Small 58mm)</option>
                            <option value="EPSON TM-T20">Epson TM-T20</option>
                            <option value="EPSON TM-T88">Epson TM-T88</option>
                            <option value="BIXOLON SRP-330">Bixolon SRP-330</option>
                            <option value="Rongta RP80">Rongta RP80</option>
                            <option value="Sewoo LK-T210">Sewoo LK-T210</option>
                          </select>
                        </div>

                        {detectedPrinters.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 mt-1.5">
                            <span className="text-[10px] text-blue-800 font-bold">پرینترهای یافت شده:</span>
                            {detectedPrinters.map((p) => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => {
                                  setFormData((prev) => ({ ...prev, printerName: p }));
                                  try {
                                    window.localStorage.setItem('arka_terminal_printer', p);
                                  } catch {}
                                }}
                                className="px-2 py-0.5 rounded bg-blue-100 hover:bg-blue-200 text-blue-900 font-mono text-[10px] cursor-pointer"
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                        )}

                        <span className="text-[10px] text-blue-800 block mt-1">
                          با انتخاب نام پرینتر و دانلود شورت‌کات، این پرینتر به‌صورت خودکار به‌عنوان پیش‌فرض ویندوز تنظیم می‌شود.
                        </span>
                      </div>

                      <div>
                        <label className="block font-bold text-blue-950 mb-1">
                          عرض رول کاغذ فیش‌پرینتر:
                        </label>
                        <select
                          name="printerPaperWidth"
                          value={formData.printerPaperWidth || '80mm'}
                          onChange={handleChange}
                          className="w-full px-3 py-2 rounded-xl border border-blue-300 bg-white font-bold text-xs focus:outline-hidden focus:border-blue-500"
                        >
                          <option value="80mm">۸۰ میلی‌متر (رول استاندارد ۸ سانتی‌متری)</option>
                          <option value="58mm">۵۸ میلی‌متر (رول کوچک ۵.۸ سانتی‌متری)</option>
                        </select>
                        <span className="text-[10px] text-blue-800 block mt-1">
                          قالب‌بندی و سایز فونت فیش دقیقا طبق عرض کاغذ انتخابی بهینه‌سازی می‌شود.
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-blue-200/60 text-xs">
                      <label className="flex items-center gap-2 cursor-pointer font-bold text-blue-950">
                        <input
                          type="checkbox"
                          checked={formData.autoPrintReceipt !== false}
                          onChange={(e) =>
                            setFormData({ ...formData, autoPrintReceipt: e.target.checked })
                          }
                          className="w-4 h-4 accent-blue-600 rounded"
                        />
                        <span>چاپ خودکار فیش بلافاصله بعد از ثبت فاکتور</span>
                      </label>
                      <span className="text-[10px] text-blue-800 font-medium">
                        نکته: با اجرای شورت‌کات فوق، مرورگر با سوئیچ <code className="font-mono bg-blue-100 px-1 font-bold">--kiosk-printing</code> اجرا شده و تمام فیش‌ها را بدون پرسش و درجا چاپ می‌کند.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Kitchen Privacy: Hide COGS from Chef */}
                <div className="border-t border-slate-200 pt-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-amber-50/80 rounded-xl border border-amber-200">
                    <div className="flex items-start gap-2.5">
                      <EyeOff size={18} className="text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <label className="cursor-pointer font-extrabold text-amber-950 text-xs block">
                          مخفی‌سازی بهای تمام شده غذاها برای آشپز و پرسنل پخت
                        </label>
                        <span className="text-[11px] text-amber-800 leading-relaxed block mt-0.5">
                          با فعال بودن این گزینه، ارقام ریالی، مبالغ خرید مواد اولیه، دستمزد، سربار و بهای تمام شده در بخش آشپزخانه و پخت برای آشپز مخفی می‌گردد و سرآشپز فقط مقادیر مصرف مواد (کیلوگرم/گرم) و تعداد پرس را مشاهده می‌کند.
                        </span>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={formData.hideCostPriceFromKitchen || false}
                        onChange={(e) =>
                          setFormData({ ...formData, hideCostPriceFromKitchen: e.target.checked })
                        }
                        className="w-5 h-5 accent-amber-600 rounded cursor-pointer"
                      />
                    </label>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-xs transition cursor-pointer"
                  >
                    <Save size={16} />
                    <span>{isSaving ? 'در حال ذخیره...' : 'ذخیره تنظیمات'}</span>
                  </button>
                </div>
              </div>

              {/* 100% Factory Raw Reset Card */}
              <div className="bg-rose-50/70 rounded-2xl border-2 border-rose-200 p-4 md:p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-rose-900 flex items-center gap-2">
                      <RotateCcw size={18} className="text-rose-600" />
                      <span>خام‌سازی ۱۰۰٪ نرم‌افزار (حذف تمام اطلاعات پیش‌فرض و شروع از صفر)</span>
                    </h3>
                    <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                      با زدن این گزینه، تمامی فاکتورها، منوهای نمونه، مواد اولیه انبار، حساب‌های بانکی، چک‌ها، اشخاص و اسناد حسابداری به صورت کامل پاک شده و نرم‌افزار ۱۰۰٪ خام تحویل شما می‌شود (اطلاعات نمونه دیگر در رفرش‌های بعدی برنمی‌گردد).
                    </p>
                  </div>

                  {!confirmRawReset ? (
                    <button
                      type="button"
                      onClick={() => setConfirmRawReset(true)}
                      className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-extrabold text-xs flex items-center gap-1.5 shrink-0 shadow-xs transition cursor-pointer"
                    >
                      <RotateCcw size={15} />
                      <span>خام کردن ۱۰۰٪ کل نرم‌افزار</span>
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 shrink-0 bg-white p-2 rounded-xl border border-rose-300">
                      <span className="text-xs font-extrabold text-rose-800 px-1">
                        آیا از صفر کردن کل اطلاعات مطمئن هستید؟
                      </span>
                      <button
                        type="button"
                        onClick={handleFactoryRawReset}
                        disabled={isResettingRaw}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-extrabold cursor-pointer"
                      >
                        {isResettingRaw ? 'در حال خام‌سازی...' : 'بله، ۱۰۰٪ خام شود'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRawReset(false)}
                        className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold cursor-pointer"
                      >
                        انصراف
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: USERS & ROLE-BASED ACCESS CONTROL */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              {/* Require Login on Start Toggle */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <Lock size={18} className="text-teal-600" />
                    <span>تنظیمات امنیتی ورود کاربران و سطح‌بندی دسترسی‌ها</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    می‌توانید برای هر کارمند (صندوق‌دار، سرآشپز، حسابدار و...) حساب کاربری جداگانه تعریف کنید و مشخص نمایید دقیقاً به کدام بخش‌ها دسترسی داشته باشد.
                  </p>
                </div>

                <label className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-teal-50 border border-teal-200 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={formData.requireLoginOnStart || false}
                    onChange={async (e) => {
                      const checked = e.target.checked;
                      setFormData({ ...formData, requireLoginOnStart: checked });
                      if (settings?.id) {
                        await db.settings.update(settings.id, { requireLoginOnStart: checked });
                      }
                      showNotice(
                        'success',
                        checked
                          ? 'قفل ورود در ابتدای باز شدن برنامه فعال شد.'
                          : 'قفل ورود ابتدای برنامه غیرفعال شد (امکان تغییر کاربر از منوی کناری فعال است).'
                      );
                    }}
                    className="w-4 h-4 accent-teal-600"
                  />
                  <span className="text-xs font-extrabold text-teal-900">
                    الزام رمز عبور در ابتدای باز شدن نرم‌افزار
                  </span>
                </label>
              </div>

              {/* Add / Edit User Form */}
              <form
                onSubmit={handleSaveUser}
                className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <UserPlus size={18} className="text-blue-600" />
                    <span>
                      {editingUserId !== null ? 'ویرایش کاربر و سطح دسترسی' : 'تعریف کاربر جدید و تعیین سطح دسترسی'}
                    </span>
                  </h3>

                  {/* Quick Role Presets */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-500">قالب آماده نقش:</span>
                    {ROLE_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => handleApplyRolePreset(preset)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                          userForm.roleLabel === preset.label
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      نام و نام خانوادگی کاربر
                    </label>
                    <input
                      type="text"
                      value={userForm.fullName}
                      onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
                      placeholder="مثال: علی محمدی"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      نام کاربری (جهت ورود)
                    </label>
                    <input
                      type="text"
                      value={userForm.username}
                      onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                      placeholder="مثال: cashier1"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-left"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      رمز عبور / کد پین (PIN)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={userForm.pin}
                        onChange={(e) => setUserForm({ ...userForm, pin: e.target.value })}
                        placeholder="مثال: 1234"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-left"
                        dir="ltr"
                      />
                      <KeyRound
                        size={14}
                        className="absolute right-3 top-2.5 text-slate-400 pointer-events-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">عنوان سمت / نقش</label>
                    <input
                      type="text"
                      value={userForm.roleLabel}
                      onChange={(e) => setUserForm({ ...userForm, roleLabel: e.target.value })}
                      placeholder="مثال: صندوق‌دار شیفت صبح"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                    />
                  </div>
                </div>

                {/* Granular Permission Checkboxes */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-extrabold text-slate-800">
                      انتخاب دقیق بخش‌های مجاز برای این کاربر:
                    </label>
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() =>
                          setUserForm({
                            ...userForm,
                            isAdmin: true,
                            permissions: [...ALL_PERMISSIONS],
                          })
                        }
                        className="text-teal-700 font-bold hover:underline cursor-pointer"
                      >
                        انتخاب همه بخش‌ها
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() =>
                          setUserForm({
                            ...userForm,
                            isAdmin: false,
                            permissions: ['pos'],
                          })
                        }
                        className="text-slate-600 font-bold hover:underline cursor-pointer"
                      >
                        فقط صندوق فروش
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {PERMISSION_DEFINITIONS.map((perm) => {
                      const isChecked =
                        userForm.isAdmin || userForm.permissions.includes(perm.key);
                      return (
                        <label
                          key={perm.key}
                          onClick={() => handleTogglePermission(perm.key)}
                          className={`p-3 rounded-xl border text-xs cursor-pointer transition flex items-start gap-2.5 select-none ${
                            isChecked
                              ? 'bg-teal-50/70 border-teal-500 text-teal-950'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-md mt-0.5 flex items-center justify-center shrink-0 border ${
                              isChecked
                                ? 'bg-teal-600 border-teal-600 text-white'
                                : 'bg-white border-slate-300'
                            }`}
                          >
                            {isChecked && <Check size={12} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-extrabold flex items-center gap-1.5">
                              <span>{perm.title}</span>
                              {perm.category === 'action' && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold">
                                  عملیاتی
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                              {perm.description}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  {editingUserId !== null && (
                    <button
                      type="button"
                      onClick={resetUserForm}
                      className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
                    >
                      انصراف از ویرایش
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                  >
                    <Save size={15} />
                    <span>
                      {editingUserId !== null ? 'ذخیره تغییرات کاربر' : 'افزودن کاربر جدید'}
                    </span>
                  </button>
                </div>
              </form>

              {/* Users List Table / Cards */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 space-y-3">
                <h3 className="text-sm font-extrabold text-slate-900">
                  لیست کاربران سیستم ({appUsers.length} کاربر)
                </h3>

                <div className="space-y-2.5">
                  {appUsers.map((u) => (
                    <div
                      key={u.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-extrabold text-slate-900">
                            {u.fullName}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[11px] font-bold">
                            {u.roleLabel}
                          </span>
                          <span
                            className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 text-[11px] font-mono"
                            dir="ltr"
                          >
                            @{u.username} | PIN: {u.pin}
                          </span>
                          {u.isAdmin && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                              دسترسی کامل (مدیر کل)
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1 pt-1">
                          {PERMISSION_DEFINITIONS.filter(
                            (p) => u.isAdmin || (u.permissions || []).includes(p.key)
                          ).map((p) => (
                            <span
                              key={p.key}
                              className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-bold text-slate-700"
                            >
                              ✓ {p.title}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleEditUser(u)}
                          className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 size={13} />
                          <span>ویرایش دسترسی</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u)}
                          className="px-2.5 py-1.5 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 size={13} />
                          <span>حذف</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BALE & TELEGRAM BOT BACKUP & PRE-UPDATE SYNC */}
          {activeTab === 'backup' && (
            <div className="space-y-4">
              {/* Hourly + Pre-Update Auto-Backup via Bale & Telegram Bots */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-200">
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                      <Bot className="text-indigo-600" size={19} />
                      <span>ارسال اتوماتیک بکاپ به بات بله (Bale) و تلگرام (ساعتی و قبل از آپدیت)</span>
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      در صورت تنظیم بودن توکن بات بله یا تلگرام، هم در بازه زمانی انتخابی و هم به صورت اتوماتیک قبل از هر بار آپدیت سرور (`install.sh`)، فایل بکاپ به بله و تلگرام ارسال می‌شود.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.autoBackupEnabled || false}
                        onChange={(e) =>
                          setFormData({ ...formData, autoBackupEnabled: e.target.checked })
                        }
                        className="w-4 h-4 accent-indigo-600"
                      />
                      <span className="text-xs font-extrabold text-indigo-900">
                        بکاپ خودکار ساعتی
                      </span>
                    </label>

                    <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.autoBackupBeforeUpdate ?? true}
                        onChange={(e) =>
                          setFormData({ ...formData, autoBackupBeforeUpdate: e.target.checked })
                        }
                        className="w-4 h-4 accent-emerald-600"
                      />
                      <span className="text-xs font-extrabold text-emerald-900">
                        ارسال خودکار بکاپ قبل از آپدیت
                      </span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* Bale Bot Config */}
                  <div className="p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-200 space-y-2.5">
                    <div className="font-extrabold text-emerald-900 text-xs flex items-center gap-1.5">
                      <span>🟢 تنظیمات ربات پیام‌رسان بله (Bale Bot)</span>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        توکن بات بله (Bot Token)
                      </label>
                      <input
                        type="text"
                        name="baleBotToken"
                        placeholder="مثال: 192837465:AAH..."
                        value={formData.baleBotToken || ''}
                        onChange={handleChange}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-left"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        شناسه چت یا کانال بله (Chat ID)
                      </label>
                      <input
                        type="text"
                        name="baleChatId"
                        placeholder="مثال: 123456789 یا @channel"
                        value={formData.baleChatId || ''}
                        onChange={handleChange}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-left"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  {/* Telegram Bot Config */}
                  <div className="p-3.5 rounded-xl bg-sky-50/50 border border-sky-200 space-y-2.5">
                    <div className="font-extrabold text-sky-900 text-xs flex items-center gap-1.5">
                      <span>🔵 تنظیمات ربات تلگرام (Telegram Bot)</span>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        توکن بات تلگرام (Bot Token)
                      </label>
                      <input
                        type="text"
                        name="telegramBotToken"
                        placeholder="مثال: 712345678:AAF..."
                        value={formData.telegramBotToken || ''}
                        onChange={handleChange}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-left"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        شناسه چت یا ادمین تلگرام (Chat ID)
                      </label>
                      <input
                        type="text"
                        name="telegramChatId"
                        placeholder="مثال: 987654321"
                        value={formData.telegramChatId || ''}
                        onChange={handleChange}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-left"
                        dir="ltr"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-2">
                    <Clock size={15} className="text-slate-500" />
                    <span className="font-bold text-slate-700">فاصله زمانی ارسال خودکار:</span>
                    <select
                      name="autoBackupIntervalHours"
                      value={formData.autoBackupIntervalHours || 1}
                      onChange={handleChange}
                      className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-bold"
                    >
                      <option value={1}>هر ۱ ساعت یک‌بار (پیشنهادی)</option>
                      <option value={2}>هر ۲ ساعت یک‌بار</option>
                      <option value={4}>هر ۴ ساعت یک‌بار</option>
                      <option value={12}>هر ۱۲ ساعت یک‌بار</option>
                      <option value={24}>روزانه (هر ۲۴ ساعت)</option>
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleTestAndSendBotBackup('تست و ارسال فوری بکاپ (همگام با آپدیت سرور)')}
                      disabled={isSendingBot}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Send size={14} />
                      <span>
                        {isSendingBot ? 'در حال ارسال...' : 'تست و ارسال فوری بکاپ به بله و تلگرام'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Save size={14} />
                      <span>ذخیره و سینک با سرور</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Database Storage Optimization & Lightweight Management */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <HardDrive size={18} className="text-teal-600" />
                    <span>بهینه‌سازی، فشرده‌سازی و سبک‌سازی دیتابیس</span>
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    فشرده‌سازی تصاویر سنگین غذاها، پاکسازی لوگ‌ها و کدهای نامعتبر برای کاهش حجم حافظه و افزایش سرعت نرم‌افزار
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleOptimizeDatabase}
                  disabled={isOptimizing}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <Sparkles size={15} className={isOptimizing ? 'animate-spin' : ''} />
                  <span>{isOptimizing ? 'در حال سبک‌سازی...' : 'شروع بهینه‌سازی و سبک‌سازی دیتابیس'}</span>
                </button>
              </div>

              {/* Local File Backup & Restore */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">
                    پشتیبان‌گیری و بازیابی فایل روی دستگاه
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    دانلود مستقیم کل دیتابیس (فروش، آشپزخانه، انبار، کاربران و حسابداری) یا بازگردانی از فایل JSON
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleExport}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download size={15} />
                    <span>دانلود فایل پشتیبان (Export)</span>
                  </button>

                  <input
                    type="file"
                    accept=".json"
                    ref={fileInputRef}
                    onChange={handleImport}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload size={15} />
                    <span>بازیابی اطلاعات (Import)</span>
                  </button>
                </div>
              </div>

              {/* 100% Factory Raw Reset in Backup Tab as well */}
              <div className="bg-rose-50/70 rounded-2xl border-2 border-rose-200 p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-extrabold text-rose-900 flex items-center gap-2">
                    <RotateCcw size={17} className="text-rose-600" />
                    <span>خام‌سازی ۱۰۰٪ کل نرم‌افزار (حذف تمام داده‌های نمونه و شروع از صفر)</span>
                  </h2>
                  <p className="text-[11px] text-rose-700 mt-0.5">
                    در صورت تنظیم بودن بات بله یا تلگرام، قبل از خام‌سازی یک نسخه بکاپ به بات ارسال شده و سپس تمام جداول فروش، منو، انبار، بانک، چک و اسناد حسابداری ۱۰۰٪ خام می‌شوند.
                  </p>
                </div>

                {!confirmRawReset ? (
                  <button
                    type="button"
                    onClick={() => setConfirmRawReset(true)}
                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-extrabold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <RotateCcw size={15} />
                    <span>خام کردن ۱۰۰٪ نرم‌افزار</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 shrink-0 bg-white p-2 rounded-xl border border-rose-300">
                    <button
                      type="button"
                      onClick={handleFactoryRawReset}
                      disabled={isResettingRaw}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-extrabold cursor-pointer"
                    >
                      {isResettingRaw ? 'در حال خام‌سازی...' : 'تأیید خام‌سازی ۱۰۰٪'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRawReset(false)}
                      className="px-3 py-1.5 bg-slate-200 text-slate-800 rounded-lg text-xs font-bold cursor-pointer"
                    >
                      انصراف
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Node Role Manager Modal (Server vs Client with Database Protection) */}
      <NodeRoleManagerModal
        isOpen={showNodeRoleModal}
        onClose={() => setShowNodeRoleModal(false)}
        isAdmin={true}
        onRoleChanged={(newRole) => {
          setNodeRoleState(newRole);
          setFormData((prev) => ({ ...prev, terminalRole: newRole }));
        }}
      />
    </div>
  );
}
