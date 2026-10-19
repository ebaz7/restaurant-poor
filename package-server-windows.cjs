const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, 'dist-windows-server');
const DIST_DIR = path.join(ROOT, 'dist');

console.log('[*] Preparing Arka Windows Server standalone package...');

// Ensure output directories
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

// 1. Copy dist/
function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

if (fs.existsSync(DIST_DIR)) {
  console.log('[+] Copying frontend build (dist)...');
  copyRecursiveSync(DIST_DIR, path.join(OUT_DIR, 'dist'));
} else {
  console.warn('[-] Warning: dist/ does not exist. Please run "npm run build" first!');
}

// 2. Copy server.cjs
console.log('[+] Copying zero-dependency server.cjs...');
fs.copyFileSync(path.join(ROOT, 'server.cjs'), path.join(OUT_DIR, 'server.cjs'));

// 3. Copy data directory with seed backup
console.log('[+] Copying data directory...');
const dataOut = path.join(OUT_DIR, 'data');
if (!fs.existsSync(dataOut)) fs.mkdirSync(dataOut, { recursive: true });
const seedBackup = path.join(ROOT, 'data', 'latest_db_backup.json');
if (fs.existsSync(seedBackup)) {
  fs.copyFileSync(seedBackup, path.join(dataOut, 'latest_db_backup.json'));
}

// 4. Create run-server.bat
const runServerBat = `@echo off
chcp 65001 >nul
title سرور مرکزی رستوران آرکا - Arka Central Server
color 0A
cls
echo ======================================================================
echo          سامانه مدیریت، فروش و صندوقداری رستوران آرکا
echo              ARKA RESTAURANT CENTRAL SERVER (WINDOWS)
echo ======================================================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [خطا] نرم‌افزار Node.js روی این ویندوز پیدا نشد!
    echo لطفاً Node.js را از آدرس https://nodejs.org دانلود و نصب فرمایید.
    echo (نصب Node.js کمتر از ۱ دقیقه زمان می‌برد و نیاز به هیچ پکیج دیگری ندارد)
    echo.
    pause
    exit /b 1
)

:: Auto open browser after 2 seconds with silent kiosk-printing enabled for thermal receipt printers
start "" /b cmd /c "timeout /t 2 /nobreak >nul && (where chrome >nul 2>nul && start chrome --kiosk-printing http://localhost:3000 || (where msedge >nul 2>nul && start msedge --kiosk-printing http://localhost:3000 || start http://localhost:3000))"

:: Start production server
echo [*] در حال راه‌اندازی سرور مرکزی روی پورت ۳۰۰۰...
echo [*] برای بستن سرور، پنجره را نبندید یا کلید Ctrl+C را بزنید.
echo.
node server.cjs

pause
`;
fs.writeFileSync(path.join(OUT_DIR, 'run-server.bat'), runServerBat, 'utf8');

// 5. Create setup-firewall.bat
const setupFirewallBat = `@echo off
chcp 65001 >nul
title باز کردن پورت فایروال ویندوز - Arka Firewall Setup
color 0B
cls
echo ======================================================================
echo          تنظیم فایروال ویندوز برای دسترسی موبایل و شبکه محلی
echo ======================================================================
echo.
echo در حال بررسی دسترسی ادمین (Administrator)...

net session >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [هشدار] برای باز کردن پورت در فایروال، باید این فایل را با کلیک راست
    echo و انتخاب "Run as administrator" اجرا نمایید!
    echo.
    pause
    exit /b 1
)

echo [+] در حال باز کردن پورت 3000 در فایروال ویندوز (TCP Inbound)...
netsh advfirewall firewall delete rule name="Arka Restaurant Server" >nul 2>&1
netsh advfirewall firewall add rule name="Arka Restaurant Server" dir=in action=allow protocol=TCP localport=3000 profile=any >nul

if %errorlevel% equ 0 (
    color 0A
    echo.
    echo [✔] پورت 3000 با موفقیت در فایروال ویندوز باز شد!
    echo [✔] اکنون تمام گوشی‌ها، تبلت‌ها و صندوق‌های دیگر در شبکه Wi-Fi/LAN
    echo     می‌توانند به این سرور ویندوزی متصل شوند.
) else (
    color 0C
    echo [-] خطا در تنظیم فایروال. لطفاً به صورت دستی پورت 3000 را باز کنید.
)

echo.
pause
`;
fs.writeFileSync(path.join(OUT_DIR, 'setup-firewall.bat'), setupFirewallBat, 'utf8');

// 6. Create install-startup.bat (Runs on Windows startup)
const installStartupBat = `@echo off
chcp 65001 >nul
title افزودن سرور به استارت‌آپ ویندوز
color 0E
cls
echo ======================================================================
echo      اجرای خودکار سرور مرکزی آرکا با روشن شدن ویندوز (Startup)
echo ======================================================================
echo.

set SCRIPT_DIR=%~dp0
set VBS_FILE=%SCRIPT_DIR%start_silent.vbs
set STARTUP_DIR=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup

echo Set WshShell = CreateObject("WScript.Shell") > "%VBS_FILE%"
echo WshShell.CurrentDirectory = "%SCRIPT_DIR%" >> "%VBS_FILE%"
echo WshShell.Run "node server.cjs", 0, False >> "%VBS_FILE%"

copy /y "%VBS_FILE%" "%STARTUP_DIR%\\Arka_Server.vbs" >nul

echo [✔] سرور مرکزی آرکا به استارت‌آپ ویندوز اضافه شد!
echo هر بار که ویندوز روشن شود، سرور به طور خودکار در پس‌زمینه اجرا خواهد شد.
echo.
pause
`;
fs.writeFileSync(path.join(OUT_DIR, 'install-startup.bat'), installStartupBat, 'utf8');

// 7. Create stop-server.bat
const stopServerBat = `@echo off
chcp 65001 >nul
title متوقف کردن سرور مرکزی آرکا
color 0C
cls
echo ======================================================================
echo                  متوقف کردن سرور مرکزی آرکا
echo ======================================================================
echo.

for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    echo [+] سرور فعال روی پورت 3000 متوقف شد (PID: %%a)
)

echo.
echo [✔] سرور متوقف شد.
pause
`;
fs.writeFileSync(path.join(OUT_DIR, 'stop-server.bat'), stopServerBat, 'utf8');

// Copy cleanup script if exists
if (fs.existsSync(path.join(ROOT, 'cleanup-old-tauri-installation.bat'))) {
  fs.copyFileSync(
    path.join(ROOT, 'cleanup-old-tauri-installation.bat'),
    path.join(OUT_DIR, 'cleanup-old-tauri-installation.bat')
  );
  const publicDir = path.join(ROOT, 'public');
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  fs.copyFileSync(
    path.join(ROOT, 'cleanup-old-tauri-installation.bat'),
    path.join(publicDir, 'cleanup-old-tauri-installation.bat')
  );
}

// 8. Create README_راهنما.txt
const readmeTxt = `======================================================================
               سامانه جامع فروش، صندوقداری و مدیریت رستوران آرکا
                       پکیج استقرار سرور ویندوزی (Windows Server)
======================================================================

ویژگی‌های این پکیج:
۱. بدون نیاز به دانلود پکیج (Zero NPM Download):
   تمام کدهای فرانت‌اند قبلاً کامپایل شده‌اند و سرور با هسته درونی Node.js
   بدون نیاز به حتی یک کیلوبایت پکیج خارجی (بدون npm install) اجرا می‌شود!

۲. شیر خودکار در شبکه محلی (Automatic LAN & Wi-Fi Sharing):
   به محض اجرا، سرور آی‌پی محلی ویندوز (مثلاً 192.168.1.50) را شناسایی کرده
   و برنامه را روی تمام دستگاه‌های متصل به مودم به اشتراک می‌گذارد.

۳. دیتابیس مرکزی و همگام‌سازی زنده (Central Live Sync):
   اطلاعات در فایل data/central_db.json ذخیره می‌شود و همه تبلت‌های گارسون،
   صندوق‌ها، آشپزخانه و وب‌اپ موبایل همزمان با این سرور همگام هستند.

----------------------------------------------------------------------
نحوه نصب و راه‌اندازی سریع (در ۳ مرحله ساده):
----------------------------------------------------------------------

مرحله ۱: باز کردن پورت در فایروال ویندوز (فقط یک بار)
  - روی فایل setup-firewall.bat کلیک راست کرده و گزینه
    "Run as administrator" (اجرا به عنوان مدیر) را بزنید.
  - این کار پورت ۳۰۰۰ را باز می‌کند تا موبایل‌ها بتوانند متصل شوند.

مرحله ۲: اجرای سرور
  - روی فایل run-server.bat دوبار کلیک کنید.
  - یک پنجره مشکی باز می‌شود که آدرس سرور را نمایش می‌دهد و مرورگر شما
    به صورت خودکار با آدرس http://localhost:3000 باز خواهد شد.

مرحله ۳: اتصال گوشی‌ها و تبلت‌ها
  - در پنجره سرور، آدرس شبکه محلی نوشته شده است (مثلاً http://192.168.1.100:3000).
  - کافیست این آدرس را در مرورگر کروم گوشی یا تبلت وارد کرده و سپس در منوی
    ۳ نقطه مرورگر، گزینه "نصب اپلیکیشن" (Install app) یا "افزودن به صفحه اصلی" را بزنید.

----------------------------------------------------------------------
اجرای خودکار هنگام روشن شدن ویندوز (اختیاری):
----------------------------------------------------------------------
اگر می‌خواهید هر بار که کامپیوتر یا سرور ویندوز روشن می‌شود، سرور خودکار بالا بیاید:
- روی فایل install-startup.bat دوبار کلیک کنید.

----------------------------------------------------------------------
پشتیبان‌گیری از داده‌ها:
----------------------------------------------------------------------
پوشه data/ حاوی فایل دیتابیس central_db.json و بکاپ‌های خودکار در backups/ است.
با کپی کردن این پوشه، از کل اطلاعات رستوران بکاپ دارید.
======================================================================
`;
fs.writeFileSync(path.join(OUT_DIR, 'README_راهنما.txt'), readmeTxt, 'utf8');

// 9. Try creating a downloadable ZIP archive
try {
  const { execSync } = require('child_process');
  const publicDir = path.join(ROOT, 'public');
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  
  if (process.platform === 'win32') {
    execSync(`powershell -command "Compress-Archive -Path '${OUT_DIR}\\*' -DestinationPath '${path.join(publicDir, 'Arka-Windows-Server.zip')}' -Force"`, { stdio: 'ignore' });
  } else {
    execSync(`python3 -c "import shutil; shutil.make_archive('${path.join(publicDir, 'Arka-Windows-Server')}', 'zip', '${OUT_DIR}')"`, { stdio: 'ignore' });
  }
  console.log('[✔] Created downloadable ZIP: public/Arka-Windows-Server.zip');
} catch (e) {
  // ignore zip error if tool missing
}

console.log('[✔] Arka Windows Server package generated successfully at: dist-windows-server/');
