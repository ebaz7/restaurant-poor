@echo off
chcp 65001 >nul
title ساخت خروجی سبک تائوری ویندوز - Build Tauri Windows
color 0B
cls

echo ======================================================================
echo              ساخت خروجی دسکتاپ فشرده تائوری (Tauri Windows)
echo ======================================================================
echo.
echo این اسکریپت خروجی دسکتاپ آرکا پوز را با جدیدترین نسخه تائوری می‌سازد
echo و فایل پاکسازی نسخه‌های قدیمی را نیز همراه آن ارائه می‌کند.
echo.

REM 1. پاکسازی خودکار نسخه قبلی در صورت تایید کاربر
echo [*] بررسی نسخه‌های قدیمی تائوری روی سیستم...
if exist "cleanup-old-tauri-installation.bat" (
    echo [i] در صورت داشتن نسخه قدیمی، می‌توانید ابتدا اسکریپت cleanup-old-tauri-installation.bat را اجرا کنید.
)

echo.
echo [*] ۱. ساخت وب‌اپلیکیشن (Vite Frontend Build)...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [!] خطا در ساخت فرانت‌اند. لطفاً خطاها را بررسی کنید.
    pause
    exit /b %errorlevel%
)

echo.
echo [*] ۲. بررسی و ساخت فایل اجرایی تائوری (Tauri Build)...
where cargo >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [!] سیستم‌عامل شما ابزار Rust/Cargo را ندارد.
    echo [i] برای ساخت خروجی exe تائوری، ابتدا Rust را از https://rustup.rs نصب کنید.
    echo.
    echo [i] در غیر این صورت، می‌توانید از پکیج سرور ویندوز (build-windows-package.bat) استفاده نمایید
    echo     که بدون نیاز به Rust روی هر سیستمی اجرا می‌شود!
    pause
    exit /b 1
)

echo.
echo [*] ۳. کمپایل پروژه با Tauri CLI...
call npx tauri build
if %errorlevel% neq 0 (
    echo.
    echo [!] خطا در کمپایل تائوری.
    pause
    exit /b %errorlevel%
)

echo.
echo ======================================================================
echo    [✔] خروجی تائوری با موفقیت ساخته شد!
echo    فایل نصب در مسیر زیر قرار گرفت:
echo    src-tauri\target\release\bundle\nsis\Arka-POS_1.2.0_x64-setup.exe
echo ======================================================================
echo.
pause
