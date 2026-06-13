@echo off
chcp 65001 >nul
title 灵墨小说工坊 - 环境诊断
echo ============================================
echo   灵墨小说工坊 - 环境诊断
echo ============================================
echo.

cd /d "%~dp0"
cd ..

node scripts\doctor.js
echo.
pause
