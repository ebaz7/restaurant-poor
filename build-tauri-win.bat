@echo off
chcp 65001 >nul
title ساخت خروجی سبک تائوری ویندوز - Build Tauri Windows
color 0B
cls
echo ======================================================================
echo              ساخت خروجی دسکتاپ فوق‌سبک به سبک تائوری (Tauri)
echo               ARKA RESTAURANT TAURI LIGHTWEIGHT BUILD
echo ======================================================================
echo.

echo [1/3] بررسی ابزارهای لازم روی ویندوز...
where cargo >nul 2>nul
if %errorlevel% neq 0 (
    color 0E
    echo [نکته] برای کامپایل تائوری، کامپایلر Rust مورد نیاز است.
    echo اگر Rust را نصب ندارید، می‌توانید با دستور زیر در پاورشل یا دانلود از rustup.rs نصب کنید:
    echo     winget install Rustlang.Rustup
    echo.
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [خطا] Node.js یافت نشد. لطفاً Node.js را نصب کنید.
    pause
    exit /b 1
)

echo.
echo [2/3] کامپایل بهینه فرانت‌اند پروژه (Vite Build)...
call npm run build
if %errorlevel% neq 0 (
    color 0C
    echo [خطا] کامپایل فرانت‌اند با خطا مواجه شد.
    pause
    exit /b 1
)

echo.
echo [3/3] ساخت فایل اجرایی سبک تائوری (Tauri Build)...
call npx @tauri-apps/cli build

if %errorlevel% equ 0 (
    color 0A
    echo.
    echo ======================================================================
    echo [✔] ساخت نسخه سبک تائوری با موفقیت به پایان رسید!
    echo ======================================================================
    echo فایل اجرایی پرتابل:
    echo   src-tauri\\target\\release\\Arka-POS.exe  (حجم تقریبی: فقط ۵ تا ۸ مگابایت!)
    echo.
    echo فایل نصبی ویندوز:
    echo   src-tauri\\target\\release\\bundle\\msi\\Arka-POS_x64_en-US.msi
    echo.
) else (
    color 0C
    echo.
    echo [-] خطا در کامپایل تائوری.
    echo اطمینان حاصل فرمایید Rust و Visual Studio C++ Build Tools نصب باشند.
)

pause
