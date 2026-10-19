@echo off
chcp 65001 >nul
title پاکسازی کامل نسخه‌های قدیمی تائوری و کش WebView2 - Arka Clean Uninstaller
color 0C
cls

echo ======================================================================
echo    سامانه فروش و صندوقداری آرکا - ابزار هوشمند پاکسازی نسخه قدیمی
echo ======================================================================
echo.
echo این اسکریپت تمام آثار، فایل‌های کش قدیمی، تنظیمات ذخیره‌شده مرورگر WebView2
echo و نسخه‌های قبلی تائوری (Tauri) را از روی ویندوز شما کاملاً پاک می‌کند
echo تا نسخه جدید بدون هیچ تداخلی نصب و اجرا شود.
echo.
echo ----------------------------------------------------------------------
echo.

set /p userConfirm="آیا برای پاکسازی نسخه قدیمی و کش اطمینان دارید؟ (Y/N): "
if /i not "%userConfirm%"=="Y" (
    echo.
    echo [!] عملیات لغو شد.
    pause
    exit /b
)

echo.
echo [*] ۱. بستن تمام پروسه‌های در حال اجرای برنامه...
taskkill /F /IM arka-pos.exe >nul 2>&1
taskkill /F /IM Arka-POS.exe >nul 2>&1
taskkill /F /IM tauri-app.exe >nul 2>&1
taskkill /F /IM tauri.exe >nul 2>&1
echo [✔] پروسه‌های فعال بسته شدند.

echo.
echo [*] ۲. اجرای آن‌اینستالر نسخه قبلی در صورت وجود...
if exist "%ProgramFiles%\Arka-POS\uninstall.exe" (
    echo [i] اجرای آن‌اینستالر در Program Files...
    "%ProgramFiles%\Arka-POS\uninstall.exe" /S
)
if exist "%ProgramFiles(x86)%\Arka-POS\uninstall.exe" (
    echo [i] اجرای آن‌اینستالر در Program Files x86...
    "%ProgramFiles(x86)%\Arka-POS\uninstall.exe" /S
)
if exist "%LOCALAPPDATA%\Programs\Arka-POS\uninstall.exe" (
    echo [i] اجرای آن‌اینستالر در AppData Local Programs...
    "%LOCALAPPDATA%\Programs\Arka-POS\uninstall.exe" /S
)

echo.
echo [*] ۳. پاکسازی کامل پوشه‌های AppData و کش WebView2...
rmdir /S /Q "%LOCALAPPDATA%\com.tauri.dev" >nul 2>&1
rmdir /S /Q "%LOCALAPPDATA%\com.arkasystem.pos" >nul 2>&1
rmdir /S /Q "%LOCALAPPDATA%\Arka-POS" >nul 2>&1
rmdir /S /Q "%LOCALAPPDATA%\tauri-app" >nul 2>&1

rmdir /S /Q "%APPDATA%\com.tauri.dev" >nul 2>&1
rmdir /S /Q "%APPDATA%\com.arkasystem.pos" >nul 2>&1
rmdir /S /Q "%APPDATA%\Arka-POS" >nul 2>&1
rmdir /S /Q "%APPDATA%\tauri-app" >nul 2>&1

rmdir /S /Q "%ProgramFiles%\Arka-POS" >nul 2>&1
rmdir /S /Q "%ProgramFiles(x86)%\Arka-POS" >nul 2>&1
rmdir /S /Q "%LOCALAPPDATA%\Programs\Arka-POS" >nul 2>&1

echo [✔] پوشه‌های کش و برنامه‌های قدیمی حذف شدند.

echo.
echo [*] ۴. پاکسازی کلیدهای رجیستری ویندوز...
reg delete "HKCU\Software\Arka-POS" /f >nul 2>&1
reg delete "HKLM\Software\Arka-POS" /f >nul 2>&1
reg delete "HKCU\Software\com.tauri.dev" /f >nul 2>&1
reg delete "HKCU\Software\com.arkasystem.pos" /f >nul 2>&1
echo [✔] کلیدهای رجیستری پاکسازی شدند.

echo.
echo ======================================================================
echo    [✔] پاکسازی با موفقیت انجام شد!
echo    اکنون می‌توانید فایل نصب جدید تائوری (Arka-POS Setup) را با خیال راحت
echo    نصب کنید. هیچ اثر و کشی از نسخه قدیمی باقی نمانده است.
echo ======================================================================
echo.
pause
