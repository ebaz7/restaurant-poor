@echo off
chcp 65001 >nul
title آماده‌سازی پکیج سرور ویندوزی - Arka Server Packager
color 0A
cls
echo ======================================================================
echo          آماده‌سازی پکیج سرور ویندوزی (بدون نیاز به دانلود پکیج در سرور)
echo          ARKA RESTAURANT WINDOWS SERVER STANDALONE PACKAGER
echo ======================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [خطا] Node.js روی این سیستم پیدا نشد!
    pause
    exit /b 1
)

echo [1/2] کامپایل پروژه فرانت‌اند (npm run build)...
call npm run build
if %errorlevel% neq 0 (
    color 0C
    echo [خطا] کامپایل پروژه با خطا روبرو شد.
    pause
    exit /b 1
)

echo.
echo [2/2] بسته‌بندی پکیج پرتابل سرور ویندوز...
node package-server-windows.cjs

if %errorlevel% equ 0 (
    color 0A
    echo.
    echo ======================================================================
    echo [✔] پکیج آماده شد! پوشه زیر را می‌توانید به هر کامپیوتر یا سرور ویندوزی منتقل کنید:
    echo     پوشه: dist-windows-server
    echo.
    echo در سرور ویندوز مقصد:
    echo  ۱. نیازی به اجرای npm install یا دانلود هیچ پکیجی ندارید!
    echo  ۲. فقط کافیست run-server.bat را اجرا کنید تا در شبکه محلی شیر شود.
    echo ======================================================================
) else (
    color 0C
    echo [-] خطا در بسته‌بندی سرور.
)

pause
