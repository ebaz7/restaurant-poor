@echo off
chcp 65001 >nul
title رفع خطای آیکون تائوری - Fix Tauri Icons (Windows 3.00 Format)
color 0A
cls
echo ======================================================================
echo    سامانه فروش و صندوقداری آرکا - بازتولید آیکون استاندارد ویندوز
echo       Fixing RC2175: resource file icon.ico is not in 3.00 format
echo ======================================================================
echo.
echo در حال بازتولید فایل‌های icon.ico و PNG با ساختار استاندارد Windows 3.00 DIB...
echo.

node fix-tauri-icons.cjs

if %errorlevel% equ 0 (
    echo.
    echo ======================================================================
    echo [✔] فایل‌های آیکون با موفقیت بازتولید و اصلاح شدند!
    echo اکنون می‌توانید دستور ساخت بیلد را دوباره اجرا کنید:
    echo.
    echo    npm run tauri:build
    echo.
    echo ======================================================================
) else (
    color 0C
    echo [-] خطا در اجرای اسکریپت Node.js.
)

pause
