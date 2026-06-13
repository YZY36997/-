@echo off
chcp 65001 >nul
title 灵墨小说工坊 - 项目清理
echo ============================================
echo   灵墨小说工坊 - 项目清理
echo ============================================
echo.

cd /d "%~dp0"
cd ..

echo 清理模式:
echo   1. 标准清理 (构建产物 dist/release)
echo   2. 深度清理 (包含 node_modules/package-lock)
echo.
set /p choice="请选择模式 (1/2，默认 1): "
if "%choice%"=="" set choice=1

if %choice%==2 (
    echo.
    echo 开始深度清理...
    echo 警告: 将删除 node_modules，之后需要重新安装依赖
    echo.
    node scripts\clean.js --deep
) else (
    echo.
    echo 开始标准清理...
    node scripts\clean.js
)

echo.
echo 清理完成。
echo.
if %choice%==2 (
    echo 如需重新安装依赖，请运行: scripts\install.bat
    echo.
)
pause
