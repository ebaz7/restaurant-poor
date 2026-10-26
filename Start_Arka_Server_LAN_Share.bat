@echo off
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
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\" admin' -Verb RunAs"
    exit /b
)

echo [✔] دسترسی Administrator تأیید شد.
echo.

:: 2. Set Network Profile to Private (Required for Windows LAN sharing)
echo [*] ۱. تنظیم پروفایل شبکه ویندوز روی حالت «خصوصی» (Private Network)...
powershell -NoProfile -Command "Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -ne 'DomainAuthenticated' } | Set-NetConnectionProfile -NetworkCategory Private" >nul 2>&1
echo [✔] کارت‌های شبکه روی Private تنظیم شدند تا ارتباط سایر سیستم‌ها بدون مانع برقرار شود.

:: 3. Open Port 4040 in Windows Firewall
echo [*] ۲. باز کردن پورت 4040 در دیوار آتش ویندوز (Windows Defender Firewall)...
netsh advfirewall firewall delete rule name="Arka POS Server Port 4040" >nul 2>&1
netsh advfirewall firewall add rule name="Arka POS Server Port 4040" dir=in action=allow protocol=TCP localport=4040 profile=any >nul 2>&1
netsh advfirewall firewall add rule name="Arka POS Server Port 4040" dir=out action=allow protocol=TCP localport=4040 profile=any >nul 2>&1
echo [✔] پورت 4040 در فایروال ویندوز برای تمام شبکه‌ها آزاد شد.

:: 4. Disable Standby / Sleep on AC Power
echo [*] ۳. تنظیم مدیریت انرژی ویندوز (جلوگیری از به خواب رفتن سیستم در طول ساعات کاری)...
powercfg -change -standby-timeout-ac 0 >nul 2>&1
echo [✔] حالت Sleep برای زمان اتصال به برق غیرفعال شد.

:: 5. Detect Real Windows LAN IPv4 Addresses
echo.
echo ======================================================================
echo               آدرس‌های واقعی این کامپیوتر در شبکه محلی (LAN):
echo ======================================================================
powershell -NoProfile -Command "$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet|VirtualBox|VMware|Tailscale|ZeroTier' -and $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -ExpandProperty IPAddress; if ($ips) { foreach($ip in $ips) { Write-Host \"    👉 http://${ip}:4040\" -ForegroundColor Green } } else { Write-Host '    [!] کارت شبکه فعالی متصل نیست.' -ForegroundColor Yellow }"

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

:: 7. Create Startup shortcut if user wants
set SCRIPT_DIR=%~dp0
set STARTUP_VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Arka_POS_Server_AutoShare.vbs
if not exist "%STARTUP_VBS%" (
    echo Set WshShell = CreateObject("WScript.Shell") > "%STARTUP_VBS%"
    echo WshShell.CurrentDirectory = "%SCRIPT_DIR%" >> "%STARTUP_VBS%"
    echo WshShell.Run "node server.cjs", 0, False >> "%STARTUP_VBS%"
    echo [✔] راه‌اندازی خودکار سرور در استارت‌آپ ویندوز (Startup) ثبت شد.
)

:: 8. Start production server
echo [*] در حال راه‌اندازی سرور مرکزی روی پورت 4040...
echo [*] توجه: تا زمانی که می‌خواهید سایر سیستم‌ها به این کامپیوتر متصل باشند این پنجره را نبندید.
echo.

cd /d "%SCRIPT_DIR%"
node server.cjs

pause
