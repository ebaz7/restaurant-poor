@echo off
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
