@echo off
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

:: Auto open browser after 2 seconds in background
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: Start production server
echo [*] در حال راه‌اندازی سرور مرکزی روی پورت ۳۰۰۰...
echo [*] برای بستن سرور، پنجره را نبندید یا کلید Ctrl+C را بزنید.
echo.
node server.cjs

pause
