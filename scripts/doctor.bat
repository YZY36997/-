@echo off
chcp 65001 >nul
title 灵墨小说工坊 - 环境诊断
echo ============================================
echo   灵墨小说工坊 - 环境诊断
echo ============================================
echo.

cd /d "%~dp0"
cd ..

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请安装 Node.js 16+
    echo 下载: https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js 版本:
node -v
echo.

node scripts\doctor.js

echo.
pause
