@echo off
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
