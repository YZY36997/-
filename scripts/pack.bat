@echo off
chcp 65001 >nul
title 灵墨小说工坊 - EXE 打包
echo ============================================
echo   灵墨小说工坊 - Windows EXE 打包
echo ============================================
echo.
echo   注意: 本脚本需要在 Windows 环境运行
echo   首次运行可能需要下载 Electron (约 150MB)
echo.

cd /d "%~dp0"
cd ..

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 16+
    pause
    exit /b 1
)

REM 设置 Electron 国内镜像
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_CACHE=%USERPROFILE%\.electron-builder-cache

if not exist node_modules (
    echo [1/3] 首次运行，安装依赖...
    call npm install
    if errorlevel 1 (
        echo   [错误] 依赖安装失败
        pause
        exit /b 1
    )
)

echo.
echo [2/3] 构建前端...
call npm run build
if errorlevel 1 (
    echo   [错误] 前端构建失败
    pause
    exit /b 1
)

echo.
echo [3/3] 打包为 Windows EXE (安装版 + 便携版)...
echo   这可能需要 5-15 分钟...
echo.
call npm run build:electron
if errorlevel 1 (
    echo.
    echo   [警告] 如遇到 Electron 下载失败，请手动运行:
    echo     set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
    echo     npm run build:electron
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   ✓ 打包完成！
echo   输出目录: release\
echo ============================================
echo.
echo 包含:
echo   - 安装版 (Setup *.exe) - 双击安装
echo   - 便携版 (*-portable.exe) - 免安装
echo.
pause
