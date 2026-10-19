@echo off
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
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup

echo Set WshShell = CreateObject("WScript.Shell") > "%VBS_FILE%"
echo WshShell.CurrentDirectory = "%SCRIPT_DIR%" >> "%VBS_FILE%"
echo WshShell.Run "node server.cjs", 0, False >> "%VBS_FILE%"

copy /y "%VBS_FILE%" "%STARTUP_DIR%\Arka_Server.vbs" >nul

echo [✔] سرور مرکزی آرکا به استارت‌آپ ویندوز اضافه شد!
echo هر بار که ویندوز روشن شود، سرور به طور خودکار در پس‌زمینه اجرا خواهد شد.
echo.
pause
